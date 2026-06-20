/**
 * publish-bundle.test.mjs
 *
 * Regression test for `apps/bapbap-launcher/scripts/publish-bundle.mjs`.
 *
 * Runs as a Node-built-in test (`node --test`) — chosen over vitest because
 * vitest's config restricts include to `src/**` and we don't want to pollute
 * that surface, and because the script under test is itself plain Node ESM
 * with no React / DOM dependency. Vitest is already used elsewhere in this
 * package; this test file lives next to the script it verifies for locality.
 *
 * What it verifies
 * ----------------
 * 1. publish-bundle.mjs runs to completion against a "test-bundle" copied
 *    from the bundled boss-rush bundle.
 * 2. The four release artifacts (manifest.json, bundle.zip,
 *    bundle.zip.sha256, RELEASE_NOTES.md) appear in the requested out-dir.
 * 3. manifest.buildNumber is bumped from 1 to 2.
 * 4. bundle.zip.sha256 matches a fresh SHA-256 of bundle.zip recomputed
 *    inside the test (round-trip integrity).
 *
 * Cleanup
 * -------
 * The test fixture is created at
 *   apps/bapbap-launcher/src/main/bundles/test-bundle/
 * because publish-bundle.mjs hard-codes that as the bundle search root
 * (REPO_ROOT/apps/bapbap-launcher/src/main/bundles/<bundle-id>). The
 * after() hook removes it whether the test passed or failed. The release
 * artifacts go into a real OS tmpdir which is also removed.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const APP_DIR = path.resolve(import.meta.dirname, "..");
const BUNDLES_ROOT = path.join(APP_DIR, "src", "main", "bundles");
const SOURCE_BUNDLE_DIR = path.join(BUNDLES_ROOT, "boss-rush");
const TEST_BUNDLE_ID = "test-bundle";
const TEST_BUNDLE_DIR = path.join(BUNDLES_ROOT, TEST_BUNDLE_ID);
const SCRIPT_PATH = path.join(APP_DIR, "scripts", "publish-bundle.mjs");

describe("publish-bundle.mjs", () => {
    let tmpRoot;
    let outDir;

    before(async () => {
        // Real OS tmpdir for output artifacts. Input bundle still has to live
        // inside src/main/bundles/<id>/ because publish-bundle.mjs hard-codes
        // that path; placing it elsewhere would not exercise the real script.
        tmpRoot = await mkdtemp(path.join(tmpdir(), "publish-bundle-test-"));
        outDir = path.join(tmpRoot, "release-out");

        // Wipe any leftover test-bundle from a previous interrupted run.
        await rm(TEST_BUNDLE_DIR, { recursive: true, force: true });

        // Clone boss-rush as the fixture.
        await cp(SOURCE_BUNDLE_DIR, TEST_BUNDLE_DIR, { recursive: true });

        // Patch the manifest so id matches the new directory name and we have
        // a deterministic starting buildNumber to assert the bump against.
        const manifestPath = path.join(TEST_BUNDLE_DIR, "manifest.json");
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        manifest.id = TEST_BUNDLE_ID;
        manifest.version = "0.1.1";
        manifest.buildNumber = 1;
        await writeFile(
            manifestPath,
            `${JSON.stringify(manifest, null, 2)}\n`,
            "utf8",
        );
    });

    after(async () => {
        await rm(TEST_BUNDLE_DIR, { recursive: true, force: true });
        if (tmpRoot) {
            await rm(tmpRoot, { recursive: true, force: true });
        }
    });

    it(
        "produces the four artifacts, bumps buildNumber, and writes a matching sha256",
        { timeout: 60_000 },
        async () => {
            const { stdout, stderr } = await execFileAsync(
                process.execPath,
                [
                    SCRIPT_PATH,
                    "--bundle-id",
                    TEST_BUNDLE_ID,
                    "--version",
                    "0.1.1",
                    "--out-dir",
                    outDir,
                ],
                {
                    // publish-bundle.mjs spawns sync-bundled-bundles.mjs as a
                    // child; give it a generous buffer so we never truncate.
                    maxBuffer: 16 * 1024 * 1024,
                },
            );

            // Surface child output into the test runner's log so failures are
            // diagnosable from CI.
            if (stdout) process.stdout.write(`[publish-bundle stdout]\n${stdout}`);
            if (stderr) process.stderr.write(`[publish-bundle stderr]\n${stderr}`);

            // (a) Four output artifacts must exist as regular files.
            for (const fileName of [
                "manifest.json",
                "bundle.zip",
                "bundle.zip.sha256",
                "RELEASE_NOTES.md",
            ]) {
                const artifactPath = path.join(outDir, fileName);
                const stats = await stat(artifactPath);
                assert.ok(
                    stats.isFile(),
                    `${fileName} should exist as a regular file at ${artifactPath}`,
                );
                assert.ok(
                    stats.size > 0,
                    `${fileName} should not be empty (size=${stats.size})`,
                );
            }

            // (b) buildNumber must be bumped from 1 to 2 in BOTH the artifact
            //     manifest and the source-tree manifest (the script bumps the
            //     source manifest in place and copies it to outDir).
            const outManifest = JSON.parse(
                await readFile(path.join(outDir, "manifest.json"), "utf8"),
            );
            assert.equal(
                outManifest.buildNumber,
                2,
                "outDir manifest.buildNumber should be bumped from 1 to 2",
            );
            assert.equal(outManifest.id, TEST_BUNDLE_ID);
            assert.equal(outManifest.version, "0.1.1");

            const srcManifest = JSON.parse(
                await readFile(
                    path.join(TEST_BUNDLE_DIR, "manifest.json"),
                    "utf8",
                ),
            );
            assert.equal(
                srcManifest.buildNumber,
                2,
                "source-tree manifest.buildNumber should also be bumped to 2 " +
                    "(the script writes the bump back to the source tree atomically)",
            );

            // (c) bundle.zip.sha256 must match a freshly recomputed SHA-256.
            const recordedSha = (
                await readFile(
                    path.join(outDir, "bundle.zip.sha256"),
                    "utf8",
                )
            ).trim();
            assert.match(
                recordedSha,
                /^[0-9a-f]{64}$/,
                `bundle.zip.sha256 should be a single 64-char lowercase hex line; got "${recordedSha}"`,
            );

            const archiveBytes = await readFile(
                path.join(outDir, "bundle.zip"),
            );
            const recomputedSha = crypto
                .createHash("sha256")
                .update(archiveBytes)
                .digest("hex");
            assert.equal(
                recordedSha,
                recomputedSha,
                "bundle.zip.sha256 should equal a freshly computed SHA-256 of bundle.zip",
            );

            // Bonus: the script's machine-readable result block must also
            // carry the same hash, otherwise the GitHub Action would publish
            // mismatched metadata.
            const archiveLine = stdout
                .split(/\r?\n/)
                .find((line) =>
                    line.startsWith("::publish-bundle::archiveSha256="),
                );
            assert.ok(
                archiveLine,
                "stdout should include a `::publish-bundle::archiveSha256=` line",
            );
            const stdoutSha = archiveLine.split("=", 2)[1];
            assert.equal(
                stdoutSha,
                recordedSha,
                "stdout result block sha256 must agree with bundle.zip.sha256",
            );
        },
    );
});
