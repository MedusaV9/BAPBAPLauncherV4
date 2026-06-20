import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";

import type { BundleUpdateState, BundleUpdateStatus } from "../../../shared/ipc";
import type { BundlesManifest, InstalledInstance } from "../../../shared/manifest";
import {
    BUNDLE_STATE_CHANGED_EVENT,
    BundleUpdateService,
    MockManifestFetcher,
} from "../bundle-update.service";
import { BundleService } from "../bundle.service";

/**
 * End-to-end smoke test for the Bundle Instance pipeline.
 *
 * Goal: prove that BundleService.install + BundleUpdateService.applyUpdate
 * cooperate correctly when wired against a single shared MockManifestFetcher
 * and a real tmpdir-backed instances root. NO real network calls — every
 * "remote" payload (channel index, per-version manifest, archive bytes) is
 * produced in-memory.
 *
 * Pipeline under test (master spec §5.1 / track-2 §7):
 *   1. ManifestClient.getBundlesManifest()  → BundlesManifest with circle-test v0.1.0
 *   2. ArchiveDownloadService.downloadFile() → writes bundle.zip (16-byte Mods/Test.dll +
 *      tiny UserData/BalanceMod/Runtime/test.json)
 *   3. BundleService.install("circle-test")  → extracts, writes .bapbap-instance.json
 *      and .bundle-manifest.json
 *   4. MockManifestFetcher channel index → bumped to v0.2.0 / buildNumber 2
 *   5. MockManifestFetcher.downloadArchive → writes new bundle.zip (32-byte
 *      Mods/Test.dll + 24-byte Mods/Newer.dll)
 *   6. BundleUpdateService.applyUpdate(installed.id) → state machine runs through
 *      downloading → verifying → applying → done; backups the old Mods/Test.dll.
 */

const tempRoots: string[] = [];

afterEach(async () => {
    await Promise.all(
        tempRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })),
    );
});

async function makeTempRoot(prefix: string): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);
    return root;
}

async function buildZip(entries: Array<{ name: string; content: Buffer | string }>): Promise<Buffer> {
    const zip = new JSZip();
    for (const entry of entries) {
        zip.file(entry.name, entry.content);
    }
    return zip.generateAsync({ type: "nodebuffer" });
}

describe("Bundle Instance pipeline (end-to-end smoke)", () => {
    it("installs circle-test v0.1.0 and applies v0.2.0 with a backup of the old bytes", async () => {
        // ---- Real tmpdir-backed roots (no fs mocks at all) ----
        const instancesRoot = await makeTempRoot("bundle-e2e-instances-");
        const tmpRoot = await makeTempRoot("bundle-e2e-tmp-");
        const bundlesRoot = await makeTempRoot("bundle-e2e-bundles-");

        // ---- Build the initial bundle.zip in memory (v0.1.0 / buildNumber 1) ----
        // Mods/Test.dll is exactly 16 bytes of fixed payload; the JSON file is tiny.
        const initialJsonContent = JSON.stringify({ test: true, version: "0.1.0" });
        const initialDllPayload = Buffer.alloc(16, 0xAA);
        let zipBuffer = await buildZip([
            { name: "Mods/Test.dll", content: initialDllPayload },
            { name: "UserData/BalanceMod/Runtime/test.json", content: initialJsonContent },
        ]);

        // ---- Single shared MockManifestFetcher for the BundleUpdateService ----
        const v1ManifestUrl = "https://example.test/circle-test/0.1.0/manifest.json";
        const fetcher = new MockManifestFetcher();
        fetcher.setChannelIndex({
            schemaVersion: 1,
            channel: "stable",
            current: {
                bundleId: "circle-test",
                version: "0.1.0",
                buildNumber: 1,
                channel: "stable",
                manifestUrl: v1ManifestUrl,
                sizeBytes: 1234,
            },
        });
        fetcher.setManifest(v1ManifestUrl, {
            schemaVersion: 1,
            id: "circle-test",
            name: "Circle Test",
            channel: "stable",
            version: "0.1.0",
            buildNumber: 1,
            publishedAtUtc: "2026-05-26T18:00:00Z",
            sourceUrl: {
                manifest: v1ManifestUrl,
                archive: {
                    url: "https://example.test/circle-test/0.1.0/bundle.zip",
                    sha256: "0".repeat(64),
                    sizeBytes: 1234,
                    fileName: "bundle.zip",
                },
            },
        });
        // The download hook writes the CURRENT zipBuffer to <stagingDir>/bundle.zip
        // exactly as the task requires. Closing over `zipBuffer` lets us swap
        // payload between v0.1.0 and v0.2.0 without re-installing the hook.
        fetcher.setDownloadHook(async ({ stagingDir }) => {
            await fs.mkdir(stagingDir, { recursive: true });
            await fs.writeFile(path.join(stagingDir, "bundle.zip"), zipBuffer);
        });

        // ---- ManifestClient stub for BundleService.install ----
        // BundleService reads the bundles manifest to learn archiveUrl + archiveSha256.
        // We mirror the channel index so the install + update views agree.
        const manifestClientStub = {
            getBundlesManifest: async (_force?: boolean): Promise<BundlesManifest | null> => ({
                schemaVersion: 1,
                channel: "stable",
                bundles: [
                    {
                        bundleId: "circle-test",
                        name: "Circle Test",
                        version: "0.1.0",
                        buildNumber: 1,
                        channel: "stable",
                        publishedAtUtc: "2026-05-26T18:00:00Z",
                        manifestUrl: v1ManifestUrl,
                        archiveUrl: "https://example.test/circle-test/0.1.0/bundle.zip",
                        archiveSha256: "0".repeat(64),
                        sizeBytes: 1234,
                    },
                ],
            }),
        };

        // ---- ArchiveDownloadService stub: write the in-memory zip to disk ----
        // Used by BundleService.install. Hash verification happens inside the
        // real ArchiveDownloadService; here we trust the stub since the goal is
        // to prove the orchestration, not the network layer.
        const archiveDownloadStub = {
            downloadFile: async (input: { url: string; outputPath: string; sha256?: string }) => {
                await fs.writeFile(input.outputPath, zipBuffer);
            },
        };

        // ---- MelonLoader stub: trivially "healthy" so install completes ----
        const melonLoaderStub = {
            ensureInstalled: async (_destination: string) => ({ healthy: true }),
        };

        // ---- InstanceService stub: returns the just-installed instance ----
        // BundleUpdateService only needs getById/list. We capture the result of
        // BundleService.install so applyUpdate sees the correct path + bundleId.
        let lastInstalled: InstalledInstance | null = null;
        const instanceServiceStub = {
            list: async () => (lastInstalled ? [lastInstalled] : []),
            getById: async (id: string) => {
                if (!lastInstalled || lastInstalled.id !== id) {
                    throw new Error(`Instance '${id}' not found.`);
                }
                return lastInstalled;
            },
            assertMutable: async () => undefined,
            remove: async () => undefined,
        };

        const settingsStub = { getInstancesRoot: () => instancesRoot };

        // ---- Build the REAL services ----
        const bundleService = new BundleService(
            settingsStub as never,
            instanceServiceStub as never,
            manifestClientStub as never,
            archiveDownloadStub as never,
            melonLoaderStub as never,
            { bundlesRoot, tmpRoot },
        );
        const updateService = new BundleUpdateService(
            settingsStub as never,
            archiveDownloadStub as never,
            instanceServiceStub as never,
            fetcher,
        );

        // =========================================================
        // Step 1: install circle-test v0.1.0
        // =========================================================
        const installed = await bundleService.install("circle-test", "Circle Test");
        lastInstalled = installed;

        // Returned InstalledInstance carries every Bundle Instance field.
        expect(installed.instanceType).toBe("bundle");
        expect(installed.bundleId).toBe("circle-test");
        expect(installed.bundleVersion).toBe("0.1.0");
        expect(installed.bundleBuildNumber).toBe(1);
        expect(installed.bundleChannel).toBe("stable");
        expect(installed.bundleLastApplyUtc).toBeDefined();
        expect(installed.officialTrack).toBe("bundle");
        expect(installed.track).toBe("bundle");
        expect(typeof installed.id).toBe("string");
        expect(installed.id.length).toBeGreaterThan(0);

        // The destination directory exists.
        const destStat = await fs.stat(installed.path);
        expect(destStat.isDirectory()).toBe(true);

        // <path>/Mods/Test.dll exists with exactly 16 bytes.
        const installedDll = await fs.readFile(path.join(installed.path, "Mods", "Test.dll"));
        expect(installedDll.length).toBe(16);

        // <path>/UserData/BalanceMod/Runtime/test.json exists with the original content.
        const installedJson = await fs.readFile(
            path.join(installed.path, "UserData", "BalanceMod", "Runtime", "test.json"),
            "utf8",
        );
        expect(installedJson).toBe(initialJsonContent);

        // <path>/.bapbap-instance.json sidecar carries the bundle metadata.
        const sidecar = JSON.parse(
            await fs.readFile(path.join(installed.path, ".bapbap-instance.json"), "utf8"),
        );
        expect(sidecar).toMatchObject({
            instanceType: "bundle",
            bundleId: "circle-test",
            bundleVersion: "0.1.0",
            bundleBuildNumber: 1,
        });

        // <path>/.bundle-manifest.json — what BundleUpdateService later compares against.
        const localManifestBefore = JSON.parse(
            await fs.readFile(path.join(installed.path, ".bundle-manifest.json"), "utf8"),
        );
        expect(localManifestBefore).toMatchObject({
            id: "circle-test",
            version: "0.1.0",
            buildNumber: 1,
            channel: "stable",
        });

        // =========================================================
        // Step 2: bump the channel index to v0.2.0 / buildNumber 2
        //         and rebuild the in-memory bundle.zip with new payload
        // =========================================================
        const updatedDllPayload = Buffer.alloc(32, 0xBB);   // 32 bytes
        const newerDllPayload = Buffer.alloc(24, 0xCC);     // 24 bytes
        zipBuffer = await buildZip([
            { name: "Mods/Test.dll", content: updatedDllPayload },
            { name: "Mods/Newer.dll", content: newerDllPayload },
        ]);

        const v2ManifestUrl = "https://example.test/circle-test/0.2.0/manifest.json";
        fetcher.setChannelIndex({
            schemaVersion: 1,
            channel: "stable",
            current: {
                bundleId: "circle-test",
                version: "0.2.0",
                buildNumber: 2,
                channel: "stable",
                manifestUrl: v2ManifestUrl,
                sizeBytes: 5678,
            },
        });
        fetcher.setManifest(v2ManifestUrl, {
            schemaVersion: 1,
            id: "circle-test",
            name: "Circle Test",
            channel: "stable",
            version: "0.2.0",
            buildNumber: 2,
            publishedAtUtc: "2026-05-27T18:00:00Z",
            sourceUrl: {
                manifest: v2ManifestUrl,
                archive: {
                    url: "https://example.test/circle-test/0.2.0/bundle.zip",
                    sha256: "1".repeat(64),
                    sizeBytes: 5678,
                    fileName: "bundle.zip",
                },
            },
        });

        // =========================================================
        // Step 3: applyUpdate transitions through all four phases
        // =========================================================
        const observedStatuses: BundleUpdateStatus[] = [];
        updateService.on(BUNDLE_STATE_CHANGED_EVENT, (state: BundleUpdateState) => {
            observedStatuses.push(state.status);
        });

        const finalState = await updateService.applyUpdate(installed.id);

        // The terminal apply state is `done` and carries the new build metadata.
        expect(finalState.status).toBe<BundleUpdateStatus>("done");
        expect(finalState.localBuildNumber).toBe(2);
        expect(finalState.localVersion).toBe("0.2.0");

        // The apply-only sub-sequence (excluding the leading check) is exactly
        // downloading → verifying → applying → done in that order.
        const applyStart = observedStatuses.indexOf("downloading");
        expect(applyStart).toBeGreaterThanOrEqual(0);
        expect(observedStatuses.slice(applyStart)).toEqual<BundleUpdateStatus[]>([
            "downloading",
            "verifying",
            "applying",
            "done",
        ]);

        // Mods/Test.dll was overwritten with the new 32-byte payload.
        const updatedDll = await fs.readFile(path.join(installed.path, "Mods", "Test.dll"));
        expect(updatedDll.length).toBe(32);

        // Mods/Newer.dll was added (24 bytes).
        const newerDll = await fs.readFile(path.join(installed.path, "Mods", "Newer.dll"));
        expect(newerDll.length).toBe(24);

        // .bundle-manifest.json now reports buildNumber 2 / version 0.2.0.
        const localManifestAfter = JSON.parse(
            await fs.readFile(path.join(installed.path, ".bundle-manifest.json"), "utf8"),
        );
        expect(localManifestAfter.buildNumber).toBe(2);
        expect(localManifestAfter.version).toBe("0.2.0");
        expect(localManifestAfter.appliedAtUtc).toBeDefined();

        // A `.bundle-backup-<ts>` directory landed inside instance.path and
        // preserves the OLD 16-byte Mods/Test.dll.
        const dirEntries = await fs.readdir(installed.path);
        const backupDir = dirEntries.find(name => name.startsWith(".bundle-backup-"));
        expect(backupDir, `expected a .bundle-backup-* directory under ${installed.path}`).toBeDefined();
        const backedUpDll = await fs.readFile(
            path.join(installed.path, backupDir!, "Mods", "Test.dll"),
        );
        expect(backedUpDll.length).toBe(16);
    });
});
