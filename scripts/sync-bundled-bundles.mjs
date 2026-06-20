import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";

/**
 * sync-bundled-bundles.mjs
 *
 * For every bundle directory under
 *   apps/bapbap-launcher/src/main/bundles/<id>/
 * walk <id>/files/ recursively, compute SHA-256 + sizeBytes per file, and
 * rewrite <id>/manifest.json's `files[]` array WITHOUT touching any other
 * top-level field (id, name, channel, version, buildNumber, publishedAtUtc,
 * compatibility, sourceUrl, changelog, signature, extra ...).
 *
 * After updating each manifest the script also copies src/main/bundles/ →
 * dist/main/bundles/ so the launcher EXE ships the bundle alongside the
 * compiled main process. Mirror of sync-rebalance-vendor.mjs's pattern.
 *
 * Bundles are NOT rebalance-vendor / studio workspace data — they are
 * launcher-managed game profile content. See docs/bundle-instance/
 * BUNDLE_INSTANCE_MASTER_SPEC.md.
 *
 * Output mirrors sync-bundled-workspace / sync-bundled-previews:
 *   sync-bundled-bundles: OK (N files, bundle <id> v<version>)
 *
 * Conforms to the Track 5 BundleManifest schema documented at
 *   docs/bundle-instance/track-5-manifest-schema.md
 */

const appDir = path.resolve(import.meta.dirname, "..");
const bundlesRoot = path.join(
  appDir,
  "src",
  "main",
  "bundles",
);
const distBundlesRoot = path.join(
  appDir,
  "dist",
  "main",
  "bundles",
);

async function main() {
  if (!(await pathExists(bundlesRoot))) {
    console.log("sync-bundled-bundles: OK (no bundles directory, nothing to do)");
    return;
  }

  const entries = await readdir(bundlesRoot, { withFileTypes: true });
  const bundleDirs = entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right));

  if (bundleDirs.length === 0) {
    console.log("sync-bundled-bundles: OK (0 bundles found)");
    return;
  }

  for (const bundleId of bundleDirs) {
    await syncBundle(bundleId);
  }
  // The dist/main/bundles copy is handled by sync-rebalance-vendor.mjs
  // post-electron-vite, since electron-vite resets dist/main on every build.
}

async function syncBundle(bundleId) {
  const bundleDir = path.join(bundlesRoot, bundleId);
  const manifestPath = path.join(bundleDir, "manifest.json");
  const filesDir = path.join(bundleDir, "files");

  if (!(await pathExists(manifestPath))) {
    throw new Error(
      `sync-bundled-bundles: bundle "${bundleId}" is missing manifest.json at ${manifestPath}`,
    );
  }

  const manifestRaw = stripBom(await readFile(manifestPath, "utf8"));
  let manifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `sync-bundled-bundles: cannot parse ${manifestPath} as JSON (${detail})`,
    );
  }

  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    throw new Error(
      `sync-bundled-bundles: ${manifestPath} must be a JSON object at the top level`,
    );
  }

  if (typeof manifest.id !== "string" || manifest.id.length === 0) {
    throw new Error(
      `sync-bundled-bundles: ${manifestPath} is missing required string field "id"`,
    );
  }

  if (manifest.id !== bundleId) {
    throw new Error(
      `sync-bundled-bundles: bundle directory "${bundleId}" does not match manifest.id "${manifest.id}" — keep them in lockstep`,
    );
  }

  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new Error(
      `sync-bundled-bundles: ${manifestPath} is missing required string field "version"`,
    );
  }

  const fileEntries = [];
  if (await pathExists(filesDir)) {
    await collectBundleFiles(filesDir, filesDir, fileEntries);
  }

  fileEntries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  const nextManifest = { ...manifest, files: fileEntries };

  await writeJson(manifestPath, nextManifest);

  console.log(
    `sync-bundled-bundles: OK (${fileEntries.length} files, bundle ${bundleId} v${manifest.version})`,
  );
}

async function collectBundleFiles(rootPath, currentPath, out) {
  const entries = await readdir(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      await collectBundleFiles(rootPath, absolute, out);
      continue;
    }
    if (!entry.isFile()) {
      // skip symlinks / sockets / fifos — bundles are content-only
      continue;
    }
    if (entry.name === "README.md" && path.dirname(absolute) === rootPath) {
      // The placeholder explainer at the root of files/ is documentation, not
      // shipped payload. Real bundles would override this by adding sibling
      // payload files, in which case the README is still recorded too if
      // anyone wants to ship it; only the top-level placeholder is skipped to
      // keep manifest.files empty for the placeholder build.
      continue;
    }
    const fileStats = await stat(absolute);
    const sha256 = await hashFile(absolute);
    const relativePath = path.relative(rootPath, absolute).replace(/\\/g, "/");
    out.push({
      relativePath,
      sha256,
      sizeBytes: fileStats.size,
      contentRole: inferContentRole(relativePath),
    });
  }
}

function inferContentRole(relativePath) {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith(".dll") || lower.endsWith(".exe")) {
    return "core";
  }
  if (lower.endsWith(".json") || lower.endsWith(".cfg") || lower.endsWith(".yml") || lower.endsWith(".yaml")) {
    return "data";
  }
  if (lower.endsWith(".md") || lower.endsWith(".txt")) {
    return "doc";
  }
  return "asset";
}

async function hashFile(absolutePath) {
  const buffer = await readFile(absolutePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function stripBom(value) {
  return typeof value === "string" ? value.replace(/^\uFEFF/, "") : value;
}

main().catch(error => {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`sync-bundled-bundles: FAILED -> ${detail}`);
  process.exit(1);
});
