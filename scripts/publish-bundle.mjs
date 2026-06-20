/**
 * publish-bundle.mjs
 *
 * Operator-side CLI that turns a curated source-tree bundle
 * (apps/bapbap-launcher/src/main/bundles/<bundleId>/) into the four release
 * artifacts the launcher's Track-2 update path expects:
 *
 *   <outDir>/manifest.json
 *   <outDir>/bundle.zip
 *   <outDir>/bundle.zip.sha256       (single line, lowercase hex)
 *   <outDir>/RELEASE_NOTES.md
 *
 * The script is the local half of the operator publish pipeline; the GitHub
 * Action `.github/workflows/publish-bundle.yml` invokes it in CI to produce
 * the same artifacts and then uploads them to a `bundle-v<version>` release
 * and updates the mutable channel index at `manifest/bundles.json` on `main`.
 *
 * Usage
 * -----
 *   node apps/bapbap-launcher/scripts/publish-bundle.mjs \
 *       --bundle-id boss-rush \
 *       --version 0.1.0 \
 *       [--channel stable|beta] \
 *       [--out-dir release-out]
 *
 * Args
 * ----
 *   --bundle-id <id>     (required) Reverse-DNS / kebab id matching the
 *                        directory name under src/main/bundles/.
 *   --version <semver>   (required) Must equal manifest.version on disk.
 *                        Forces the operator to bump the manifest before
 *                        publishing — catches the "forgot to bump" footgun.
 *   --channel <stable|beta>   (optional) Overrides manifest.channel; if
 *                        omitted, the existing manifest.channel is preserved.
 *   --out-dir <path>     (optional, default: release-out)  Destination
 *                        directory for the four artifacts. Cleared on each
 *                        run.
 *
 * Side effects
 * ------------
 *   1. Bumps manifest.buildNumber by +1 atomically (write to .tmp + rename)
 *      in the SOURCE-TREE manifest at
 *      apps/bapbap-launcher/src/main/bundles/<id>/manifest.json.
 *      CI commits this bump back to `main` after the release succeeds.
 *   2. Re-runs sync-bundled-bundles.mjs to refresh the manifest's `files[]`
 *      array against the actual contents of src/main/bundles/<id>/files/.
 *      sync-bundled-bundles preserves every other top-level field (id, name,
 *      channel, version, buildNumber, publishedAtUtc, compatibility,
 *      sourceUrl, changelog, signature, extra) so the buildNumber bump and
 *      channel override survive intact.
 *   3. Writes the four artifacts to <outDir>/.
 *   4. Prints a machine-parseable result block to stdout that the GitHub
 *      Action consumes via grep / shell substitution.
 *
 * Output format
 * -------------
 * Last lines of stdout (parsed by CI):
 *
 *   ::publish-bundle::manifestPath=<abs path>
 *   ::publish-bundle::archivePath=<abs path>
 *   ::publish-bundle::sha256Path=<abs path>
 *   ::publish-bundle::releaseNotesPath=<abs path>
 *   ::publish-bundle::bundleId=<id>
 *   ::publish-bundle::version=<semver>
 *   ::publish-bundle::buildNumber=<int>
 *   ::publish-bundle::archiveSha256=<lowercase hex>
 *
 * Wiring into manifest/index.json (one-time, by hand)
 * ---------------------------------------------------
 * The launcher's bundle-update poller reads the channel index at
 * `manifest/bundles.json` on `main`. For the launcher's manifest discovery
 * code to find that index automatically, the repo-root `manifest/index.json`
 * must reference it via a top-level key:
 *
 *   "bundlesManifestPath": "bundles.json"
 *
 * This script does NOT touch manifest/index.json — that's a one-time edit
 * the operator does by hand the first time the bundle channel is wired up.
 * Once added, this script + the workflow can publish forever without ever
 * needing to touch manifest/index.json again.
 *
 * Conforms to
 * -----------
 *   docs/bundle-instance/track-5-manifest-schema.md (BundleManifest schema)
 *   docs/bundle-instance/track-6-source-distribution.md (release layout)
 */

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import {
  createReadStream,
  createWriteStream,
} from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import archiver from "archiver";

const SCRIPT_DIR = import.meta.dirname;
const APP_DIR = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(APP_DIR, "..", "..");
const BUNDLES_ROOT = path.join(APP_DIR, "src", "main", "bundles");
const SYNC_SCRIPT = path.join(SCRIPT_DIR, "sync-bundled-bundles.mjs");

const ALLOWED_CHANNELS = new Set(["stable", "beta"]);
const SEMVER_RE = /^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/;

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.bundleId) {
    fail("--bundle-id <id> is required");
  }
  if (!args.version) {
    fail("--version <semver> is required");
  }
  if (!SEMVER_RE.test(args.version)) {
    fail(
      `--version must be a valid semver (X.Y.Z[-prerelease]); got "${args.version}"`,
    );
  }
  if (args.channel && !ALLOWED_CHANNELS.has(args.channel)) {
    fail(
      `--channel must be one of ${[...ALLOWED_CHANNELS].join(", ")}; got "${args.channel}"`,
    );
  }

  const outDir = path.resolve(REPO_ROOT, args.outDir ?? "release-out");
  const bundleDir = path.join(BUNDLES_ROOT, args.bundleId);
  const manifestPath = path.join(bundleDir, "manifest.json");
  const filesDir = path.join(bundleDir, "files");

  if (!(await pathExists(bundleDir))) {
    fail(
      `bundle directory not found: ${bundleDir}\n` +
        `Expected layout: apps/bapbap-launcher/src/main/bundles/${args.bundleId}/`,
    );
  }
  if (!(await pathExists(manifestPath))) {
    fail(`manifest.json not found at ${manifestPath}`);
  }

  // Step 1: read source-tree manifest, validate version match,
  // bump buildNumber, optionally override channel, write back atomically.
  const initialManifest = await readJson(manifestPath);
  validateManifest(initialManifest, manifestPath);

  if (initialManifest.id !== args.bundleId) {
    fail(
      `manifest.id "${initialManifest.id}" does not match --bundle-id "${args.bundleId}"; ` +
        `the directory name and manifest.id must stay in lockstep`,
    );
  }

  if (initialManifest.version !== args.version) {
    fail(
      `manifest.version is "${initialManifest.version}" but --version is "${args.version}".\n` +
        `Did you forget to bump src/main/bundles/${args.bundleId}/manifest.json before publishing?\n` +
        `Refusing to publish a stale version.`,
    );
  }

  const previousBuildNumber =
    typeof initialManifest.buildNumber === "number" &&
    Number.isInteger(initialManifest.buildNumber) &&
    initialManifest.buildNumber >= 0
      ? initialManifest.buildNumber
      : 0;
  const nextBuildNumber = previousBuildNumber + 1;

  const bumpedManifest = {
    ...initialManifest,
    buildNumber: nextBuildNumber,
    channel: args.channel ?? initialManifest.channel,
    publishedAtUtc: nowIsoUtc(),
  };
  await writeJsonAtomic(manifestPath, bumpedManifest);
  console.log(
    `publish-bundle: bumped buildNumber ${previousBuildNumber} -> ${nextBuildNumber} (${manifestPath})`,
  );

  // Step 2: re-run sync-bundled-bundles.mjs so the manifest's files[] array
  // reflects the actual on-disk payload (per-file SHA-256 + sizeBytes).
  // The sync script preserves all other top-level fields, so the buildNumber
  // bump and channel override above survive.
  console.log(
    `publish-bundle: running sync-bundled-bundles.mjs to refresh files[] for "${args.bundleId}"`,
  );
  try {
    execFileSync(process.execPath, [SYNC_SCRIPT], { stdio: "inherit" });
  } catch (error) {
    fail(
      `sync-bundled-bundles.mjs failed; aborting publish before producing artifacts.\n${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  // Step 3: re-read the manifest now that sync has updated files[].
  const finalManifest = await readJson(manifestPath);
  if (finalManifest.buildNumber !== nextBuildNumber) {
    fail(
      `internal error: sync-bundled-bundles overwrote buildNumber ` +
        `(expected ${nextBuildNumber}, got ${finalManifest.buildNumber})`,
    );
  }

  // Step 4: prepare a clean out-dir.
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const outManifestPath = path.join(outDir, "manifest.json");
  const outArchivePath = path.join(outDir, "bundle.zip");
  const outSha256Path = path.join(outDir, "bundle.zip.sha256");
  const outReleaseNotesPath = path.join(outDir, "RELEASE_NOTES.md");

  // Copy the bumped manifest into the out-dir (this is the artifact uploaded
  // to the GitHub Release; the source-tree copy is committed back to main by
  // CI separately).
  await copyFile(manifestPath, outManifestPath);

  // Step 5: build bundle.zip from files/ via streaming archiver.
  // Empty files/ is allowed — produces a zero-entry zip; this is the
  // placeholder behaviour and matches sync-bundled-bundles printing
  // "0 files" in CI.
  if (await pathExists(filesDir)) {
    await buildArchive(filesDir, outArchivePath);
  } else {
    console.warn(
      `publish-bundle: ${filesDir} does not exist; producing an empty bundle.zip`,
    );
    await buildEmptyArchive(outArchivePath);
  }

  // Step 6: compute bundle.zip SHA-256 and persist as a single hex line.
  const archiveSha256 = await sha256OfFile(outArchivePath);
  await writeFile(outSha256Path, `${archiveSha256}\n`, "utf8");

  // Step 7: render RELEASE_NOTES.md.
  const releaseNotes = renderReleaseNotes(finalManifest, archiveSha256);
  await writeFile(outReleaseNotesPath, releaseNotes, "utf8");

  // Step 8: print machine-readable result block consumed by the GitHub Action.
  const archiveSize = (await stat(outArchivePath)).size;
  console.log(
    `publish-bundle: archive ${outArchivePath} ` +
      `(${formatBytes(archiveSize)}, sha256=${archiveSha256.slice(0, 12)}…)`,
  );

  console.log("");
  console.log(`::publish-bundle::manifestPath=${outManifestPath}`);
  console.log(`::publish-bundle::archivePath=${outArchivePath}`);
  console.log(`::publish-bundle::sha256Path=${outSha256Path}`);
  console.log(`::publish-bundle::releaseNotesPath=${outReleaseNotesPath}`);
  console.log(`::publish-bundle::bundleId=${args.bundleId}`);
  console.log(`::publish-bundle::version=${args.version}`);
  console.log(`::publish-bundle::buildNumber=${nextBuildNumber}`);
  console.log(`::publish-bundle::archiveSha256=${archiveSha256}`);
}

// ---------- helpers ----------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--bundle-id":
        out.bundleId = next;
        i += 1;
        break;
      case "--version":
        out.version = next;
        i += 1;
        break;
      case "--channel":
        out.channel = next;
        i += 1;
        break;
      case "--out-dir":
        out.outDir = next;
        i += 1;
        break;
      case "-h":
      case "--help":
        printUsageAndExit(0);
        break;
      default:
        fail(`unknown argument: ${arg}`);
    }
  }
  return out;
}

function validateManifest(manifest, manifestPath) {
  if (
    typeof manifest !== "object" ||
    manifest === null ||
    Array.isArray(manifest)
  ) {
    fail(`${manifestPath} must be a JSON object at the top level`);
  }
  if (typeof manifest.id !== "string" || manifest.id.length === 0) {
    fail(`${manifestPath} is missing required string field "id"`);
  }
  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    fail(`${manifestPath} is missing required string field "version"`);
  }
  if (typeof manifest.name !== "string" || manifest.name.length === 0) {
    fail(`${manifestPath} is missing required string field "name"`);
  }
  if (
    typeof manifest.changelog !== "object" ||
    manifest.changelog === null ||
    typeof manifest.changelog.notes !== "string"
  ) {
    fail(`${manifestPath} is missing required object field "changelog.notes"`);
  }
}

async function buildArchive(sourceDir, outPath) {
  await new Promise((resolve, reject) => {
    const output = createWriteStream(outPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    let settled = false;
    const settle = (err) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve();
    };
    output.on("close", () => settle());
    output.on("error", settle);
    archive.on("warning", (warn) => {
      // ENOENT etc. while reading optional files — surface as warnings, but
      // hard-fail anything else.
      if (warn?.code === "ENOENT") {
        console.warn(`publish-bundle: archive warning: ${warn.message}`);
      } else {
        settle(warn);
      }
    });
    archive.on("error", settle);
    archive.pipe(output);
    // glob from sourceDir; relative paths preserved with POSIX slashes by
    // archiver. cwd is sourceDir so files land at bundle.zip root.
    archive.glob("**/*", {
      cwd: sourceDir,
      dot: true,
      nodir: true,
    });
    archive.finalize().catch(settle);
  });
}

async function buildEmptyArchive(outPath) {
  await new Promise((resolve, reject) => {
    const output = createWriteStream(outPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);
    archive.finalize().catch(reject);
  });
}

async function sha256OfFile(absolutePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(absolutePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function renderReleaseNotes(manifest, archiveSha256) {
  const lines = [];
  lines.push(`# ${manifest.name} v${manifest.version}`);
  lines.push("");
  lines.push(`- Bundle id: \`${manifest.id}\``);
  lines.push(`- Build number: \`${manifest.buildNumber}\``);
  lines.push(`- Channel: \`${manifest.channel ?? "stable"}\``);
  lines.push(`- Published: \`${manifest.publishedAtUtc}\``);
  lines.push(
    `- Files in payload: \`${Array.isArray(manifest.files) ? manifest.files.length : 0}\``,
  );
  lines.push("");
  lines.push("## Changelog");
  lines.push("");
  lines.push(manifest.changelog.notes.trim());
  lines.push("");

  const highlights = manifest.changelog.highlights;
  if (Array.isArray(highlights) && highlights.length > 0) {
    lines.push("### Highlights");
    lines.push("");
    for (const item of highlights) {
      lines.push(`- ${String(item).trim()}`);
    }
    lines.push("");
  }

  if (
    manifest.changelog.url &&
    typeof manifest.changelog.url === "string"
  ) {
    lines.push(`Full changelog: ${manifest.changelog.url}`);
    lines.push("");
  }

  lines.push("## Verification");
  lines.push("");
  lines.push("```");
  lines.push(`bundle.zip  sha256 = ${archiveSha256}`);
  lines.push("```");
  lines.push("");
  lines.push(
    "The launcher verifies this hash before applying the bundle; do not edit it by hand.",
  );
  lines.push("");

  return lines.join("\n");
}

async function readJson(filePath) {
  const raw = (await readFile(filePath, "utf8")).replace(/^\uFEFF/, "");
  try {
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`cannot parse ${filePath} as JSON (${detail})`);
    return undefined;
  }
}

async function writeJsonAtomic(filePath, value) {
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(tmpPath, body, "utf8");
  await rename(tmpPath, filePath);
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function nowIsoUtc() {
  // 2026-05-26T18:07:58Z (no fractional seconds, ends in Z), matching the
  // Track-5 schema example.
  return new Date().toISOString().replace(/\.[0-9]+Z$/, "Z");
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

function fail(message) {
  console.error(`publish-bundle: ERROR — ${message}`);
  process.exit(1);
}

function printUsageAndExit(code) {
  console.log(
    [
      "publish-bundle.mjs — build a publishable bundle archive locally",
      "",
      "Usage:",
      "  node apps/bapbap-launcher/scripts/publish-bundle.mjs \\",
      "      --bundle-id <id> \\",
      "      --version <semver> \\",
      "      [--channel stable|beta] \\",
      "      [--out-dir <path>]",
      "",
      "Outputs (under --out-dir, default release-out/):",
      "  manifest.json",
      "  bundle.zip",
      "  bundle.zip.sha256",
      "  RELEASE_NOTES.md",
    ].join("\n"),
  );
  process.exit(code);
}

main().catch((error) => {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`publish-bundle: FATAL — ${detail}`);
  process.exit(1);
});
