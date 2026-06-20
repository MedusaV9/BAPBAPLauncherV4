import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InstalledInstance } from "../../shared/manifest";
import type { BundleUpdateState, BundleUpdateStatus } from "../../shared/ipc";
import {
    BUNDLE_HASH_MISMATCH_CODE,
    BUNDLE_LOCAL_MANIFEST_FILE,
    BUNDLE_STATE_CHANGED_EVENT,
    BundleUpdateService,
    MockManifestFetcher,
    type BundleChannelIndex,
    type BundleLocalManifest,
    type BundleRemoteManifest,
} from "./bundle-update.service";

const tempDirs: string[] = [];

afterEach(async () => {
    await Promise.all(
        tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
    );
});

async function makeInstanceTempDir(prefix = "bundle-update-test-"): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempDirs.push(root);
    return root;
}

function makeFakeInstance(instanceId: string, instancePath: string): InstalledInstance {
    return {
        id: instanceId,
        profileName: "Bundle Profile",
        versionId: "bundle-1.0.0",
        gameVersion: "build-test",
        name: "Bundle Profile",
        version: "1.0.0",
        track: "bapbap",
        path: instancePath,
        officialManaged: true,
        instanceSource: "official-managed",
        lastUpdatedUtc: new Date(0).toISOString(),
        instanceType: "bundle",
        bundleId: "test-bundle",
        bundleChannel: "release",
    };
}

function makeIndex(buildNumber: number, version: string, manifestUrl = "https://example.test/bundle/1/manifest.json"): BundleChannelIndex {
    return {
        schemaVersion: 1,
        channel: "release",
        current: {
            bundleId: "test-bundle",
            version,
            buildNumber,
            channel: "release",
            manifestUrl,
            sizeBytes: 12345,
        },
    };
}

function makeRemoteManifest(buildNumber: number, version: string): BundleRemoteManifest {
    return {
        schemaVersion: 1,
        id: "test-bundle",
        name: "Test Bundle",
        channel: "release",
        version,
        buildNumber,
        publishedAtUtc: "2026-05-26T18:00:00Z",
        sourceUrl: {
            manifest: "https://example.test/bundle/1/manifest.json",
            archive: {
                url: "https://example.test/bundle/1/bundle.zip",
                sha256: "deadbeef".repeat(8),
                sizeBytes: 12345,
                fileName: "bundle.zip",
            },
        },
    };
}

async function writeLocalManifest(instancePath: string, manifest: BundleLocalManifest): Promise<void> {
    await fs.writeFile(
        path.join(instancePath, BUNDLE_LOCAL_MANIFEST_FILE),
        JSON.stringify(manifest, null, 2),
        "utf8",
    );
}

function makeService(instancePath: string, fetcher: MockManifestFetcher) {
    const fakeInstance = makeFakeInstance("inst-1", instancePath);
    const instanceServiceStub = {
        getById: async (id: string) => {
            if (id !== fakeInstance.id) {
                throw new Error(`Instance '${id}' not found.`);
            }
            return fakeInstance;
        },
        list: async () => [fakeInstance],
    };
    const settingsStub = { getInstancesRoot: () => path.dirname(instancePath) };
    const archiveStub = {};

    return new BundleUpdateService(
        settingsStub as never,
        archiveStub as never,
        instanceServiceStub as never,
        fetcher,
    );
}

describe("BundleUpdateService.checkForUpdate", () => {
    it("returns up-to-date when local.buildNumber >= remote.buildNumber", async () => {
        const instancePath = await makeInstanceTempDir();
        await writeLocalManifest(instancePath, {
            schemaVersion: 1,
            id: "test-bundle",
            channel: "release",
            version: "1.4.2",
            buildNumber: 142,
        });

        const fetcher = new MockManifestFetcher();
        fetcher.setChannelIndex(makeIndex(142, "1.4.2"));

        const service = makeService(instancePath, fetcher);
        const state = await service.checkForUpdate("inst-1");

        expect(state.status).toBe<BundleUpdateStatus>("up-to-date");
        expect(state.localBuildNumber).toBe(142);
        expect(state.remoteBuildNumber).toBe(142);
        expect(state.completedAtUtc).toBeDefined();
    });

    it("returns up-to-date when local is strictly ahead of remote (downgrade-protection)", async () => {
        const instancePath = await makeInstanceTempDir();
        await writeLocalManifest(instancePath, {
            schemaVersion: 1,
            id: "test-bundle",
            channel: "release",
            version: "1.5.0",
            buildNumber: 150,
        });

        const fetcher = new MockManifestFetcher();
        fetcher.setChannelIndex(makeIndex(142, "1.4.2"));

        const service = makeService(instancePath, fetcher);
        const state = await service.checkForUpdate("inst-1");

        expect(state.status).toBe<BundleUpdateStatus>("up-to-date");
        expect(state.localBuildNumber).toBe(150);
    });

    it("returns update-available when remote.buildNumber > local.buildNumber", async () => {
        const instancePath = await makeInstanceTempDir();
        await writeLocalManifest(instancePath, {
            schemaVersion: 1,
            id: "test-bundle",
            channel: "release",
            version: "1.4.2",
            buildNumber: 142,
        });

        const fetcher = new MockManifestFetcher();
        fetcher.setChannelIndex(makeIndex(143, "1.4.3"));

        const service = makeService(instancePath, fetcher);
        const state = await service.checkForUpdate("inst-1");

        expect(state.status).toBe<BundleUpdateStatus>("update-available");
        expect(state.localBuildNumber).toBe(142);
        expect(state.remoteBuildNumber).toBe(143);
        expect(state.remoteVersion).toBe("1.4.3");
    });

    it("treats a missing local manifest as buildNumber=0 (always update-available)", async () => {
        const instancePath = await makeInstanceTempDir();
        // No local manifest written.
        const fetcher = new MockManifestFetcher();
        fetcher.setChannelIndex(makeIndex(1, "1.0.0"));

        const service = makeService(instancePath, fetcher);
        const state = await service.checkForUpdate("inst-1");

        expect(state.status).toBe<BundleUpdateStatus>("update-available");
        expect(state.localBuildNumber).toBeUndefined();
        expect(state.remoteBuildNumber).toBe(1);
    });

    it("emits state-changed for the checking → up-to-date transition", async () => {
        const instancePath = await makeInstanceTempDir();
        await writeLocalManifest(instancePath, {
            schemaVersion: 1,
            id: "test-bundle",
            channel: "release",
            version: "1.0.0",
            buildNumber: 5,
        });

        const fetcher = new MockManifestFetcher();
        fetcher.setChannelIndex(makeIndex(5, "1.0.0"));

        const service = makeService(instancePath, fetcher);
        const events: BundleUpdateStatus[] = [];
        service.on(BUNDLE_STATE_CHANGED_EVENT, (state: BundleUpdateState) => {
            events.push(state.status);
        });

        await service.checkForUpdate("inst-1");

        expect(events).toEqual<BundleUpdateStatus[]>(["checking", "up-to-date"]);
    });
});

describe("BundleUpdateService.applyUpdate", () => {
    it("transitions through downloading → verifying → applying → done on the happy path", async () => {
        const instancePath = await makeInstanceTempDir();
        await writeLocalManifest(instancePath, {
            schemaVersion: 1,
            id: "test-bundle",
            channel: "release",
            version: "1.4.1",
            buildNumber: 141,
        });

        const manifestUrl = "https://example.test/bundle/v1.4.2/manifest.json";
        const fetcher = new MockManifestFetcher();
        fetcher.setChannelIndex(makeIndex(142, "1.4.2", manifestUrl));
        fetcher.setManifest(manifestUrl, makeRemoteManifest(142, "1.4.2"));

        const service = makeService(instancePath, fetcher);

        const events: BundleUpdateStatus[] = [];
        service.on(BUNDLE_STATE_CHANGED_EVENT, (state: BundleUpdateState) => {
            events.push(state.status);
        });

        const finalState = await service.applyUpdate("inst-1");

        // The applyUpdate path runs an internal check first, so the full
        // event sequence includes the check transitions before the apply.
        expect(events).toContain<BundleUpdateStatus>("checking");
        expect(events).toContain<BundleUpdateStatus>("update-available");
        expect(events).toContain<BundleUpdateStatus>("downloading");
        expect(events).toContain<BundleUpdateStatus>("verifying");
        expect(events).toContain<BundleUpdateStatus>("applying");
        expect(events).toContain<BundleUpdateStatus>("done");

        // Apply-only sequence is in-order, with no failure states. The
        // download stage may emit MULTIPLE "downloading" events: one
        // pre-download placeholder + one or more progress ticks the
        // manifest fetcher forwards via onProgress. The remaining stages
        // each emit exactly once and must follow the last "downloading".
        const applySequence = events.filter(status =>
            status === "downloading" || status === "verifying" || status === "applying" || status === "done",
        );
        expect(applySequence.filter(s => s === "downloading").length).toBeGreaterThanOrEqual(1);
        const lastDownloadingIndex = applySequence.lastIndexOf("downloading");
        expect(applySequence.slice(lastDownloadingIndex + 1)).toEqual<BundleUpdateStatus[]>([
            "verifying",
            "applying",
            "done",
        ]);

        expect(finalState.status).toBe<BundleUpdateStatus>("done");
        expect(finalState.localBuildNumber).toBe(142);
        expect(finalState.localVersion).toBe("1.4.2");

        // The local manifest was rewritten with the applied version.
        const onDisk = JSON.parse(
            await fs.readFile(path.join(instancePath, BUNDLE_LOCAL_MANIFEST_FILE), "utf8"),
        ) as BundleLocalManifest;
        expect(onDisk.buildNumber).toBe(142);
        expect(onDisk.version).toBe("1.4.2");
        expect(onDisk.appliedAtUtc).toBeDefined();
    });

    it("rolls back the staging directory and emits signature-mismatch on hash mismatch", async () => {
        const instancePath = await makeInstanceTempDir();
        await writeLocalManifest(instancePath, {
            schemaVersion: 1,
            id: "test-bundle",
            channel: "release",
            version: "1.4.1",
            buildNumber: 141,
        });

        const manifestUrl = "https://example.test/bundle/v1.4.2/manifest.json";
        const fetcher = new MockManifestFetcher();
        fetcher.setChannelIndex(makeIndex(142, "1.4.2", manifestUrl));
        fetcher.setManifest(manifestUrl, makeRemoteManifest(142, "1.4.2"));
        fetcher.setVerifyHook(async () => {
            const error = new Error("Bundle archive SHA-256 does not match manifest.") as Error & { code?: string };
            error.code = BUNDLE_HASH_MISMATCH_CODE;
            throw error;
        });

        const service = makeService(instancePath, fetcher);

        const events: BundleUpdateStatus[] = [];
        service.on(BUNDLE_STATE_CHANGED_EVENT, (state: BundleUpdateState) => {
            events.push(state.status);
        });

        const finalState = await service.applyUpdate("inst-1");

        expect(finalState.status).toBe<BundleUpdateStatus>("signature-mismatch");
        expect(finalState.errorCode).toBe(BUNDLE_HASH_MISMATCH_CODE);
        expect(finalState.errorMessage).toMatch(/SHA-256/);

        // No staging dir survived the rollback.
        const parent = path.dirname(instancePath);
        const baseName = path.basename(instancePath);
        const siblings = await fs.readdir(parent);
        const stagingSiblings = siblings.filter(name => name !== baseName && name.startsWith(`${baseName}.bundle-staging`));
        expect(stagingSiblings).toEqual([]);

        // Local manifest was NOT advanced past the original buildNumber.
        const onDisk = JSON.parse(
            await fs.readFile(path.join(instancePath, BUNDLE_LOCAL_MANIFEST_FILE), "utf8"),
        ) as BundleLocalManifest;
        expect(onDisk.buildNumber).toBe(141);

        // The terminal apply state is signature-mismatch (not "done").
        expect(events[events.length - 1]).toBe<BundleUpdateStatus>("signature-mismatch");
    });

    it("emits state events in the correct order for the apply pipeline", async () => {
        const instancePath = await makeInstanceTempDir();
        await writeLocalManifest(instancePath, {
            schemaVersion: 1,
            id: "test-bundle",
            channel: "release",
            version: "1.0.0",
            buildNumber: 1,
        });

        const manifestUrl = "https://example.test/bundle/v2/manifest.json";
        const fetcher = new MockManifestFetcher();
        fetcher.setChannelIndex(makeIndex(2, "1.0.1", manifestUrl));
        fetcher.setManifest(manifestUrl, makeRemoteManifest(2, "1.0.1"));

        const service = makeService(instancePath, fetcher);

        const events: BundleUpdateStatus[] = [];
        service.on(BUNDLE_STATE_CHANGED_EVENT, (state: BundleUpdateState) => {
            events.push(state.status);
        });

        await service.applyUpdate("inst-1");

        // The apply-only sub-sequence (excluding the leading check) must
        // be downloading (one or more, due to progress ticks) followed by
        // verifying → applying → done in that exact order.
        const applyStart = events.indexOf("downloading");
        expect(applyStart).toBeGreaterThanOrEqual(0);
        const tail = events.slice(applyStart);
        const lastDownloadingIndex = tail.lastIndexOf("downloading");
        expect(tail.slice(0, lastDownloadingIndex + 1).every(s => s === "downloading")).toBe(true);
        expect(tail.slice(lastDownloadingIndex + 1)).toEqual<BundleUpdateStatus[]>([
            "verifying",
            "applying",
            "done",
        ]);
    });

    it("emits progress state with bytesDownloaded and progressPercent during download", async () => {
        const instancePath = await makeInstanceTempDir();
        await writeLocalManifest(instancePath, {
            schemaVersion: 1,
            id: "test-bundle",
            channel: "release",
            version: "1.4.1",
            buildNumber: 141,
        });

        const manifestUrl = "https://example.test/bundle/v1.4.2/manifest.json";
        const fetcher = new MockManifestFetcher();
        fetcher.setChannelIndex(makeIndex(142, "1.4.2", manifestUrl));
        fetcher.setManifest(manifestUrl, makeRemoteManifest(142, "1.4.2"));

        // Override the download hook to invoke onProgress with a deterministic
        // ramp (0% → 50% → 100%) and then write the empty bundle.zip the
        // apply pipeline expects. The cast routes through `input.onProgress`
        // because MockManifestFetcher's hook signature does not yet declare
        // it (track-fetcher-progress only updated the BundleManifestFetcher
        // interface, not the mock's hook signature).
        fetcher.setDownloadHook(async input => {
            const onProgress = (input as unknown as {
                onProgress?: (p: { downloadedBytes: number; totalBytes?: number; progressPercent?: number }) => void;
            }).onProgress;
            onProgress?.({ downloadedBytes: 0, totalBytes: 1000, progressPercent: 0 });
            onProgress?.({ downloadedBytes: 500, totalBytes: 1000, progressPercent: 50 });
            onProgress?.({ downloadedBytes: 1000, totalBytes: 1000, progressPercent: 100 });
            await fs.mkdir(input.stagingDir, { recursive: true });
            const zipBuffer = await new JSZip().generateAsync({ type: "nodebuffer" });
            await fs.writeFile(path.join(input.stagingDir, "bundle.zip"), zipBuffer);
        });

        const service = makeService(instancePath, fetcher);

        const downloadingStates: BundleUpdateState[] = [];
        service.on(BUNDLE_STATE_CHANGED_EVENT, (state: BundleUpdateState) => {
            if (state.status === "downloading") {
                downloadingStates.push({ ...state });
            }
        });

        await service.applyUpdate("inst-1");

        // The leading "downloading" placeholder (emitted before the first
        // onProgress call) has no byte counts. Filter it out and assert the
        // throttled progress emissions carry both fields the renderer needs.
        const progressEvents = downloadingStates.filter(s => typeof s.bytesDownloaded === "number");
        expect(progressEvents.length).toBeGreaterThan(0);

        const fiftyPercent = progressEvents.find(s => s.progressPercent === 50);
        expect(fiftyPercent).toBeDefined();
        expect(fiftyPercent!.bytesDownloaded).toBe(500);
        expect(fiftyPercent!.sizeBytes).toBe(1000);

        // The 100% terminal tick is always allowed through by the gate
        // so the renderer never gets stuck below "complete".
        const hundredPercent = progressEvents.find(s => s.progressPercent === 100);
        expect(hundredPercent).toBeDefined();
        expect(hundredPercent!.bytesDownloaded).toBe(1000);
    });

    it("respects throttle: emits at most ~5 progress events for a download with 100 progress callbacks", async () => {
        const instancePath = await makeInstanceTempDir();
        await writeLocalManifest(instancePath, {
            schemaVersion: 1,
            id: "test-bundle",
            channel: "release",
            version: "1.4.1",
            buildNumber: 141,
        });

        const manifestUrl = "https://example.test/bundle/v1.4.2/manifest.json";
        const fetcher = new MockManifestFetcher();
        fetcher.setChannelIndex(makeIndex(142, "1.4.2", manifestUrl));
        fetcher.setManifest(manifestUrl, makeRemoteManifest(142, "1.4.2"));

        // Send 100 progress callbacks all reporting the SAME integer percent
        // (50%) but with monotonically increasing bytes. With percent
        // unchanged, only the 200ms time gate can trigger an emission, so
        // 100 callbacks spread over ~600ms collapse to ~3-4 emissions plus
        // the initial "-1 → 50" tick. This isolates and exercises the
        // time-throttle path end-to-end.
        fetcher.setDownloadHook(async input => {
            const onProgress = (input as unknown as {
                onProgress?: (p: { downloadedBytes: number; totalBytes?: number; progressPercent?: number }) => void;
            }).onProgress;
            for (let i = 0; i < 100; i++) {
                onProgress?.({ downloadedBytes: i * 10, totalBytes: 1000, progressPercent: 50 });
                await new Promise<void>(resolve => setTimeout(resolve, 6));
            }
            await fs.mkdir(input.stagingDir, { recursive: true });
            const zipBuffer = await new JSZip().generateAsync({ type: "nodebuffer" });
            await fs.writeFile(path.join(input.stagingDir, "bundle.zip"), zipBuffer);
        });

        const service = makeService(instancePath, fetcher);

        const progressEmissions: number[] = [];
        service.on(BUNDLE_STATE_CHANGED_EVENT, (state: BundleUpdateState) => {
            if (state.status === "downloading" && typeof state.bytesDownloaded === "number") {
                progressEmissions.push(state.bytesDownloaded);
            }
        });

        const startedAt = Date.now();
        await service.applyUpdate("inst-1");
        const elapsedMs = Date.now() - startedAt;

        // Percent is pinned at 50, so only the 200ms time-gate (plus the
        // single initial percent-change tick) can drive emissions. Bound the
        // count by the ACTUAL elapsed wall-clock rather than assuming a fixed
        // ~600ms window — under full-suite CPU load the per-callback sleeps
        // stretch and fire more gates, which previously made a hardcoded
        // ceiling flaky. What we PROVE is that 100 callbacks DO NOT translate
        // to 100 IPC emissions (the unthrottled behaviour the launcher saw).
        const maxExpected = Math.ceil(elapsedMs / 200) + 3;
        expect(progressEmissions.length).toBeGreaterThanOrEqual(1);
        expect(progressEmissions.length).toBeLessThanOrEqual(maxExpected);
    });
});

describe("BundleUpdateService.getUpdateState", () => {
    it("returns idle for an instance never seen before", async () => {
        const instancePath = await makeInstanceTempDir();
        const fetcher = new MockManifestFetcher();
        const service = makeService(instancePath, fetcher);

        const state = service.getUpdateState("never-seen");

        expect(state).toEqual<BundleUpdateState>({
            instanceId: "never-seen",
            status: "idle",
        });
    });

    it("returns the latest known state after a check", async () => {
        const instancePath = await makeInstanceTempDir();
        await writeLocalManifest(instancePath, {
            schemaVersion: 1,
            id: "test-bundle",
            channel: "release",
            version: "1.0.0",
            buildNumber: 1,
        });

        const fetcher = new MockManifestFetcher();
        fetcher.setChannelIndex(makeIndex(1, "1.0.0"));

        const service = makeService(instancePath, fetcher);
        await service.checkForUpdate("inst-1");

        const state = service.getUpdateState("inst-1");
        expect(state.status).toBe<BundleUpdateStatus>("up-to-date");
    });
});

describe("BundleUpdateService.boot", () => {
    let parentDir: string;
    let instancePath: string;

    beforeEach(async () => {
        parentDir = await makeInstanceTempDir("bundle-update-boot-");
        instancePath = path.join(parentDir, "bundle-instance");
        await fs.mkdir(instancePath, { recursive: true });
    });

    it("removes orphan staging and backup directories that match the instance basename", async () => {
        const orphanStaging = `${instancePath}.bundle-staging-1700000000000`;
        const orphanBackup = `${instancePath}.bundle-backup-1700000000000`;
        const unrelated = path.join(parentDir, "unrelated-folder");
        await fs.mkdir(orphanStaging, { recursive: true });
        await fs.mkdir(orphanBackup, { recursive: true });
        await fs.mkdir(unrelated, { recursive: true });

        const fetcher = new MockManifestFetcher();
        const fakeInstance = makeFakeInstance("inst-boot", instancePath);
        const instanceService = {
            getById: async () => fakeInstance,
            list: async () => [fakeInstance],
        };
        const service = new BundleUpdateService(
            { getInstancesRoot: () => parentDir } as never,
            {} as never,
            instanceService as never,
            fetcher,
        );

        await service.boot();

        const remaining = await fs.readdir(parentDir);
        expect(remaining).toContain("bundle-instance");
        expect(remaining).toContain("unrelated-folder");
        expect(remaining).not.toContain(path.basename(orphanStaging));
        expect(remaining).not.toContain(path.basename(orphanBackup));
    });
});
