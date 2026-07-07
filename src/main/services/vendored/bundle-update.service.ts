import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import fsExtra from "fs-extra";
import JSZip from "jszip";
import type { BundleUpdateState, BundleUpdateStatus } from "../../../shared/ipc";
import type { InstalledInstance } from "../../../shared/manifest";
import { KeyedMutex } from "../../utils/async-mutex";
import type { ArchiveDownloadService, DownloadFileProgress } from "./archive-download.service";
import type { InstanceService } from "../core/instance.service";
import type { SettingsStoreService } from "../core/settings-store";

const { ensureDir, pathExists, readJson, remove, writeJson, move, copy, readdir } = fsExtra;

/**
 * Filename of the local manifest the launcher writes alongside an
 * installed Bundle. Mirrored against the remote channel index every check.
 *
 * See docs/bundle-instance/track-2-auto-update.md §4 / Track 5 schema.
 */
export const BUNDLE_LOCAL_MANIFEST_FILE = ".bundle-manifest.json";

/** Suffix used when staging a new bundle payload before atomic swap. */
const STAGING_SUFFIX = ".bundle-staging";

/** Suffix used when the previous live tree is moved aside during apply. */
const BACKUP_SUFFIX = ".bundle-backup";

/** Event emitted whenever any per-instance state transitions. */
export const BUNDLE_STATE_CHANGED_EVENT = "state-changed";

/**
 * Closure used to throttle the IPC emission rate during archive download.
 * Tracks the last percent (rounded to int) and the last emission timestamp
 * so handleDownloadProgress can decide whether to emit a fresh state event.
 *
 * Lives at module scope so it can be referenced from the input-builder
 * inside applyUpdateInternal without re-typing the shape.
 */
interface BundleProgressGate {
    lastPercent: number;
    lastEmitAt: number;
}

/** Error code attached to verify-stage hash mismatches so the service can
 * branch on `error.code === BUNDLE_HASH_MISMATCH_CODE` rather than parse
 * a string. Mirrors the launcher-updater convention. */
export const BUNDLE_HASH_MISMATCH_CODE = "BUNDLE_HASH_MISMATCH";

/**
 * Minimal local manifest schema persisted at
 * `<instance.path>/.bundle-manifest.json`. The full schema lives with
 * Track 5; this skeleton only consumes the fields needed for update
 * detection + apply bookkeeping.
 */
export interface BundleLocalManifest {
    schemaVersion: number;
    id: string;
    name?: string;
    channel: string;
    version: string;
    buildNumber: number;
    publishedAtUtc?: string;
    appliedAtUtc?: string;
}

/**
 * Subset of the remote manifest the BundleUpdateService consumes. The full
 * Track 5 BundleManifest is a superset of this shape — anything else is
 * forwarded verbatim through fetchManifest's return type.
 */
export interface BundleRemoteManifest {
    schemaVersion: number;
    id: string;
    name?: string;
    channel: string;
    version: string;
    buildNumber: number;
    publishedAtUtc?: string;
    sourceUrl?: {
        manifest?: string;
        archive?: { url: string; sha256: string; sizeBytes?: number; fileName?: string };
        fileBase?: string;
    };
}

/** One entry in the remote channel index (`manifest/bundle-updates.json`). */
export interface BundleChannelIndexEntry {
    bundleId: string;
    version: string;
    buildNumber: number;
    channel: string;
    publishedAtUtc?: string;
    manifestUrl: string;
    sizeBytes?: number;
    notes?: string;
}

/** The decoded remote channel index document. */
export interface BundleChannelIndex {
    schemaVersion: number;
    channel: string;
    current: BundleChannelIndexEntry;
    releases?: BundleChannelIndexEntry[];
}

/**
 * Network-layer abstraction for the BundleUpdateService.
 *
 * Track 6 ships the GitHub-backed implementation; track-update-service
 * only ships this interface plus a deterministic mock so tests run with
 * NO real network calls. Methods mutate filesystem state in real
 * implementations only — the mock writes nothing.
 */
export interface BundleManifestFetcher {
    /**
     * Fetch the channel index pointer (e.g. `bundle-updates.json`). Used
     * by `checkForUpdate` to learn the latest published `buildNumber` for
     * a given bundle.
     */
    fetchChannelIndex(bundleId: string): Promise<BundleChannelIndex>;

    /**
     * Resolve a per-version manifest URL into the parsed manifest. Used
     * by `applyUpdate` when the channel says a newer build is available.
     */
    fetchManifest(manifestUrl: string): Promise<BundleRemoteManifest>;

    /**
     * Stage 1: download archive into the staging directory. The skeleton
     * implementation is a no-op (`Promise.resolve()`); the real one will
     * call `archive-download.service.ts`.
     *
     * Implementations that perform a real HTTP transfer should invoke
     * `onProgress` (when supplied) with throttled byte counts so the
     * BundleUpdateService can surface live download metrics on the
     * `downloading` state. Mock / no-op implementations may either skip
     * `onProgress` entirely or emit a single 100% report.
     */
    downloadArchive(input: {
        archiveUrl: string;
        archiveSha256: string;
        stagingDir: string;
        onProgress?: (progress: DownloadFileProgress) => void;
    }): Promise<void>;

    /**
     * Stage 2: verify the archive content matches the manifest's hashes.
     * Throws an Error with `code === BUNDLE_HASH_MISMATCH_CODE` on hash
     * mismatch so the service can roll back the staging directory.
     */
    verifyArchive(input: {
        stagingDir: string;
        manifest: BundleRemoteManifest;
    }): Promise<void>;
}

/**
 * Deterministic in-memory implementation of the fetcher contract. Designed
 * for unit tests + harness mode. NEVER hits the network.
 */
export class MockManifestFetcher implements BundleManifestFetcher {
    private channelIndex: BundleChannelIndex | null = null;
    private readonly manifestsByUrl = new Map<string, BundleRemoteManifest>();
    private downloadHook: (input: {
        archiveUrl: string;
        archiveSha256: string;
        stagingDir: string;
        onProgress?: (progress: DownloadFileProgress) => void;
    }) => Promise<void> = async ({ stagingDir, onProgress }) => {
        // Default: write a valid (empty) ZIP archive to stagingDir/bundle.zip
        // so the apply pipeline can extract it without errors. Tests that
        // need real payload bytes call setDownloadHook with their own writer.
        await ensureDir(stagingDir);
        const emptyZipBuffer = await new JSZip().generateAsync({ type: "nodebuffer" });
        const archivePath = path.join(stagingDir, "bundle.zip");
        await fs.promises.writeFile(archivePath, emptyZipBuffer);
        // Emit a single terminal progress report so tests asserting that
        // download progress is forwarded see at least one observation.
        onProgress?.({
            downloadedBytes: emptyZipBuffer.length,
            totalBytes: emptyZipBuffer.length,
            progressPercent: 100,
        });
    };
    private verifyHook: (input: { stagingDir: string; manifest: BundleRemoteManifest }) => Promise<void> = async () => {};

    /** Programmatically set the channel index for the next `fetchChannelIndex` call. */
    setChannelIndex(index: BundleChannelIndex): void {
        this.channelIndex = index;
    }

    /** Programmatically register a per-URL manifest. */
    setManifest(url: string, manifest: BundleRemoteManifest): void {
        this.manifestsByUrl.set(url, manifest);
    }

    /** Override the no-op download stub (e.g. to throw network errors in tests). */
    setDownloadHook(hook: (input: {
        archiveUrl: string;
        archiveSha256: string;
        stagingDir: string;
        onProgress?: (progress: DownloadFileProgress) => void;
    }) => Promise<void>): void {
        this.downloadHook = hook;
    }

    /** Override the no-op verify stub (e.g. to throw a hash mismatch in tests). */
    setVerifyHook(hook: (input: { stagingDir: string; manifest: BundleRemoteManifest }) => Promise<void>): void {
        this.verifyHook = hook;
    }

    async fetchChannelIndex(_bundleId: string): Promise<BundleChannelIndex> {
        if (!this.channelIndex) {
            throw new Error("MockManifestFetcher: no channel index set. Call setChannelIndex() first.");
        }
        return this.channelIndex;
    }

    async fetchManifest(manifestUrl: string): Promise<BundleRemoteManifest> {
        const manifest = this.manifestsByUrl.get(manifestUrl);
        if (!manifest) {
            throw new Error(`MockManifestFetcher: no manifest registered for '${manifestUrl}'.`);
        }
        return manifest;
    }

    async downloadArchive(input: {
        archiveUrl: string;
        archiveSha256: string;
        stagingDir: string;
        onProgress?: (progress: DownloadFileProgress) => void;
    }): Promise<void> {
        await this.downloadHook(input);
    }

    async verifyArchive(input: { stagingDir: string; manifest: BundleRemoteManifest }): Promise<void> {
        await this.verifyHook(input);
    }
}

/**
 * Per-instance auto-update orchestrator for Bundle Instances.
 *
 * Implements the state machine in
 * docs/bundle-instance/track-2-auto-update.md §7:
 *
 *   idle → checking → up-to-date | check-failed
 *                   → update-available → downloading → verifying →
 *                       applying → done
 *                                   │           │
 *                                   ▼           ▼
 *                              signature-    failed | disk-full
 *                              mismatch
 *
 * Concurrent calls for the SAME (op, instanceId) tuple are serialized via
 * `singleFlight`. Different ops or different instances run independently.
 *
 * The actual archive download / extraction is intentionally stubbed in
 * this skeleton — Track 6 wires `ArchiveDownloadService` once the GitHub
 * channel layout is final. The atomic apply / rollback pattern (staging
 * dir → rename → drop backup) IS implemented so the rest of the launcher
 * can integrate against a real apply path immediately.
 */
export class BundleUpdateService extends EventEmitter {
    private readonly settings: SettingsStoreService;
    // archiveDownload is reserved for the real GitHub fetcher in Track 6.
    // The skeleton goes through `BundleManifestFetcher.downloadArchive`
    // instead so tests can run without a real Electron app handle.
    private readonly archiveDownload: ArchiveDownloadService;
    private readonly instanceService: InstanceService;
    private readonly manifestFetcher: BundleManifestFetcher;
    private readonly state = new Map<string, BundleUpdateState>();
    private readonly singleFlight = new KeyedMutex();

    constructor(
        settings: SettingsStoreService,
        archiveDownload: ArchiveDownloadService,
        instanceService: InstanceService,
        manifestFetcher: BundleManifestFetcher,
    ) {
        super();
        this.settings = settings;
        this.archiveDownload = archiveDownload;
        this.instanceService = instanceService;
        this.manifestFetcher = manifestFetcher;
        // Quiet the unused-property complaint until Track 6 wires the real
        // fetcher. The reference matters: keeping the field on the class
        // means Track 6 can drop in a real download path with a one-line
        // change instead of a constructor refactor.
        void this.settings;
        void this.archiveDownload;
    }

    /**
     * Snapshot of the current state for a given instance. Returns an
     * `idle` state for instances we have never seen — callers should
     * treat that as a no-op.
     */
    getUpdateState(instanceId: string): BundleUpdateState {
        const existing = this.state.get(instanceId);
        if (existing) {
            return { ...existing };
        }
        return { instanceId, status: "idle" };
    }

    /**
     * Read the local manifest from disk, fetch the remote channel index,
     * compare `buildNumber`, and emit either `up-to-date`, `update-available`,
     * or `check-failed` (on any thrown error).
     *
     * Single-flight per `check:<instanceId>` — concurrent calls collapse
     * to one network round-trip.
     */
    async checkForUpdate(instanceId: string): Promise<BundleUpdateState> {
        const release = await this.singleFlight.acquire(`check:${instanceId}`);
        try {
            return await this.checkForUpdateInternal(instanceId);
        } finally {
            release();
        }
    }

    /**
     * Stage-then-swap update apply with rollback on failure. Emits a
     * state transition at every stage:
     *
     *   downloading → verifying → applying → done
     *
     * On verifyArchive throwing with `code === BUNDLE_HASH_MISMATCH_CODE`
     * the staging dir is removed and the state becomes
     * `signature-mismatch`. Any other error becomes `failed`.
     *
     * Single-flight per `apply:<instanceId>`.
     */
    async applyUpdate(instanceId: string): Promise<BundleUpdateState> {
        const release = await this.singleFlight.acquire(`apply:${instanceId}`);
        try {
            return await this.applyUpdateInternal(instanceId);
        } finally {
            release();
        }
    }

    /**
     * Detect orphan staging / backup directories left behind by a crash
     * during the previous apply pass and clean them up so a fresh apply
     * starts from a known-good live tree. Idempotent + safe to call from
     * `app.whenReady()`.
     *
     * The cleanup walks the launcher's instance list (filtered to bundle
     * instances) and removes any `<instance.path>.bundle-staging-*` or
     * `<instance.path>.bundle-backup-*` siblings. The live tree itself is
     * never touched.
     */
    async boot(): Promise<void> {
        const instances = await this.safeListInstances();
        for (const instance of instances) {
            if (instance.instanceType !== "bundle") {
                continue;
            }
            await this.cleanOrphanStagingDirs(instance.path).catch(error => {
                console.warn(`[bundle-update] orphan-cleanup failed for ${instance.id}`, error);
            });
        }
    }

    private async checkForUpdateInternal(instanceId: string): Promise<BundleUpdateState> {
        const startedAtUtc = new Date().toISOString();
        const instance = await this.getInstanceOrFail(instanceId);

        // checking
        const checkingState: BundleUpdateState = {
            instanceId,
            status: "checking",
            startedAtUtc,
        };
        this.commitState(checkingState);

        try {
            const local = await this.readLocalManifest(instance.path);
            const remoteIndex = await this.manifestFetcher.fetchChannelIndex(local?.id ?? instance.bundleId ?? instanceId);
            const remoteEntry = remoteIndex.current;
            if (!remoteEntry) {
                throw new Error("Remote channel index has no `current` entry.");
            }

            const localBuildNumber = local?.buildNumber ?? 0;
            const isUpToDate = localBuildNumber >= remoteEntry.buildNumber;

            const nextState: BundleUpdateState = {
                instanceId,
                status: isUpToDate ? "up-to-date" : "update-available",
                localVersion: local?.version,
                localBuildNumber: local?.buildNumber,
                remoteVersion: remoteEntry.version,
                remoteBuildNumber: remoteEntry.buildNumber,
                sizeBytes: remoteEntry.sizeBytes,
                startedAtUtc,
                completedAtUtc: new Date().toISOString(),
            };
            this.commitState(nextState);
            return nextState;
        } catch (error) {
            const failed: BundleUpdateState = {
                instanceId,
                status: "check-failed",
                errorMessage: toErrorMessage(error),
                startedAtUtc,
                completedAtUtc: new Date().toISOString(),
            };
            this.commitState(failed);
            return failed;
        }
    }

    private async applyUpdateInternal(instanceId: string): Promise<BundleUpdateState> {
        const startedAtUtc = new Date().toISOString();
        const instance = await this.getInstanceOrFail(instanceId);

        // Always run a check first so applyUpdate is safe to call without
        // a prior checkForUpdate. Reuses the same single-flight key in
        // the inner call only for the check, not for apply.
        const checkRelease = await this.singleFlight.acquire(`check:${instanceId}`);
        let checkResult: BundleUpdateState;
        try {
            checkResult = await this.checkForUpdateInternal(instanceId);
        } finally {
            checkRelease();
        }

        if (checkResult.status === "up-to-date") {
            return checkResult;
        }
        if (checkResult.status !== "update-available") {
            return checkResult;
        }
        if (!checkResult.remoteBuildNumber || !checkResult.remoteVersion) {
            const failed: BundleUpdateState = {
                ...checkResult,
                status: "failed",
                errorMessage: "Remote manifest is missing version metadata.",
                completedAtUtc: new Date().toISOString(),
            };
            this.commitState(failed);
            return failed;
        }

        const local = await this.readLocalManifest(instance.path);
        const remoteIndex = await this.manifestFetcher.fetchChannelIndex(
            local?.id ?? instance.bundleId ?? instanceId,
        );
        const remoteManifest = await this.manifestFetcher.fetchManifest(
            remoteIndex.current.manifestUrl,
        );

        const stagingDir = computeStagingPath(instance.path);
        let stagingCreated = false;
        const baseState: BundleUpdateState = {
            instanceId,
            status: "downloading",
            localVersion: checkResult.localVersion,
            localBuildNumber: checkResult.localBuildNumber,
            remoteVersion: checkResult.remoteVersion,
            remoteBuildNumber: checkResult.remoteBuildNumber,
            sizeBytes: checkResult.sizeBytes,
            startedAtUtc,
        };

        try {
            // downloading
            await ensureDir(stagingDir);
            stagingCreated = true;
            this.commitState({ ...baseState, status: "downloading" });
            const archive = remoteManifest.sourceUrl?.archive;
            // Track progress emissions across the download. The gate is
            // throttled in handleDownloadProgress so 100 callbacks from the
            // fetcher don't translate to 100 IPC emissions. Mirrors the
            // pattern in launcher-updater.service.ts:306-315.
            const progressGate: BundleProgressGate = { lastEmitAt: 0, lastPercent: -1 };
            // The fetcher interface (track-fetcher-progress) is being
            // extended with an `onProgress` arg; passing it through a local
            // variable so the in-flight extra property does not trip
            // TypeScript's excess-property check on inline object literals.
            const downloadInput = {
                archiveUrl: archive?.url ?? "",
                archiveSha256: archive?.sha256 ?? "",
                stagingDir,
                onProgress: (progress: DownloadFileProgress) =>
                    this.handleDownloadProgress(progress, progressGate, baseState),
            };
            await this.manifestFetcher.downloadArchive(downloadInput);

            // verifying
            this.commitState({ ...baseState, status: "verifying" });
            await this.manifestFetcher.verifyArchive({ stagingDir, manifest: remoteManifest });

            // applying — real atomic swap
            this.commitState({ ...baseState, status: "applying" });

            const archivePath = path.join(stagingDir, "bundle.zip");
            const extractedDir = path.join(stagingDir, "files");
            await extractZipSafelyToDir(archivePath, extractedDir);

            // Backup the directories the bundle is allowed to overwrite.
            // Restricted to Mods + UserData/BalanceMod so we don't touch
            // arbitrary user files. If the operator extends the bundle
            // surface in future, add to BUNDLE_OVERRIDE_DIRS.
            const backupDir = path.join(instance.path, `.bundle-backup-${Date.now()}`);
            await ensureDir(backupDir);
            for (const subdir of BUNDLE_OVERRIDE_DIRS) {
                const livePath = path.join(instance.path, subdir);
                if (await pathExists(livePath)) {
                    await move(livePath, path.join(backupDir, subdir), { overwrite: true });
                }
            }

            // Roll forward: copy extracted files into the live tree.
            // Restricted to BUNDLE_OVERRIDE_DIRS so the apply surface matches
            // the backup/rollback surface above — copying arbitrary extracted
            // entries would overwrite live files that were never backed up,
            // leaving an unrecoverable mixed tree on the rollback path.
            // Use copy (not move) so a half-completed swap can be rolled
            // back from the staging dir if needed. The extracted tree
            // is freshly produced and verified, so a copy fault is rare
            // but recoverable.
            try {
                for (const subdir of BUNDLE_OVERRIDE_DIRS) {
                    const extractedSubdir = path.join(extractedDir, subdir);
                    if (await pathExists(extractedSubdir)) {
                        await copy(
                            extractedSubdir,
                            path.join(instance.path, subdir),
                            { overwrite: true, errorOnExist: false },
                        );
                    }
                }
            } catch (applyError) {
                // Roll back: restore backup, propagate error.
                for (const subdir of BUNDLE_OVERRIDE_DIRS) {
                    const backupSubdir = path.join(backupDir, subdir);
                    const livePath = path.join(instance.path, subdir);
                    if (await pathExists(backupSubdir)) {
                        await remove(livePath).catch(() => {});
                        await move(backupSubdir, livePath, { overwrite: true }).catch(() => {});
                    }
                }
                await remove(backupDir).catch(() => {});
                throw applyError;
            }

            await this.writeLocalManifest(instance.path, {
                schemaVersion: remoteManifest.schemaVersion,
                id: remoteManifest.id,
                name: remoteManifest.name,
                channel: remoteManifest.channel,
                version: remoteManifest.version,
                buildNumber: remoteManifest.buildNumber,
                publishedAtUtc: remoteManifest.publishedAtUtc,
                appliedAtUtc: new Date().toISOString(),
            });

            // GC: keep only the most recent backup so disk usage stays bounded.
            await garbageCollectBackups(instance.path, 1).catch(() => {});

            // Only remove staging on success. Failures keep it for
            // post-mortem and rely on `boot()` to eventually clean up.
            await remove(stagingDir).catch(() => {});

            const done: BundleUpdateState = {
                ...baseState,
                status: "done",
                localVersion: remoteManifest.version,
                localBuildNumber: remoteManifest.buildNumber,
                completedAtUtc: new Date().toISOString(),
            };
            this.commitState(done);
            return done;
        } catch (error) {
            if (stagingCreated) {
                await remove(stagingDir).catch(() => {});
            }
            const status: BundleUpdateStatus = isHashMismatch(error)
                ? "signature-mismatch"
                : isDiskFull(error)
                    ? "disk-full"
                    : "failed";
            const failed: BundleUpdateState = {
                ...baseState,
                status,
                errorMessage: toErrorMessage(error),
                errorCode: extractErrorCode(error),
                completedAtUtc: new Date().toISOString(),
            };
            this.commitState(failed);
            return failed;
        }
    }

    /**
     * Throttled progress emitter for the archive download stage.
     *
     * Mirrors the pattern in launcher-updater.service.ts:306-315. Emits a
     * fresh "downloading" state event when EITHER:
     *   - the integer-rounded progressPercent has changed since last emit, OR
     *   - 200ms have elapsed since the last emit, OR
     *   - the download has reached 100% (so the final tick is never lost).
     *
     * The fetcher may invoke onProgress dozens of times per second; the
     * gate ensures the renderer receives at most ~5 updates per second
     * (plus terminal 100% tick), keeping IPC chatter bounded while still
     * driving a smooth progress bar in the BundleUpdateGate UI.
     *
     * Note: the fetcher payload uses `downloadedBytes` (DownloadFileProgress
     * naming convention from archive-download.service); the IPC state shape
     * exposes the same value as `bytesDownloaded` (BundleUpdateState
     * naming convention from shared/ipc.ts), so this method does the
     * field-name translation in one spot.
     */
    private handleDownloadProgress(
        progress: DownloadFileProgress,
        gate: BundleProgressGate,
        baseState: BundleUpdateState,
    ): void {
        const now = Date.now();
        const totalBytes = progress.totalBytes;
        const computedPercent = progress.progressPercent
            ?? Math.round((progress.downloadedBytes / (totalBytes || 1)) * 100);
        const integerPercent = Math.round(computedPercent);

        const shouldEmit =
            integerPercent !== gate.lastPercent
            || integerPercent >= 100
            || now - gate.lastEmitAt >= 200;
        if (!shouldEmit) {
            return;
        }

        gate.lastEmitAt = now;
        gate.lastPercent = integerPercent;

        this.commitState({
            ...baseState,
            status: "downloading",
            bytesDownloaded: progress.downloadedBytes,
            sizeBytes: totalBytes ?? baseState.sizeBytes,
            progressPercent: computedPercent,
        });
    }

    private async cleanOrphanStagingDirs(instancePath: string): Promise<void> {
        const parentDir = path.dirname(instancePath);
        const baseName = path.basename(instancePath);
        const entries = await fs.promises.readdir(parentDir).catch(() => [] as string[]);
        const stagingPrefix = `${baseName}${STAGING_SUFFIX}`;
        const backupPrefix = `${baseName}${BACKUP_SUFFIX}`;
        for (const entry of entries) {
            if (entry === baseName) {
                continue;
            }
            if (entry.startsWith(stagingPrefix) || entry.startsWith(backupPrefix)) {
                const orphan = path.join(parentDir, entry);
                await remove(orphan).catch(error => {
                    console.warn(`[bundle-update] failed to remove orphan ${orphan}`, error);
                });
            }
        }
    }

    private async readLocalManifest(instancePath: string): Promise<BundleLocalManifest | null> {
        const manifestPath = path.join(instancePath, BUNDLE_LOCAL_MANIFEST_FILE);
        if (!(await pathExists(manifestPath))) {
            return null;
        }
        try {
            const raw = (await readJson(manifestPath)) as Partial<BundleLocalManifest>;
            if (!raw || typeof raw.buildNumber !== "number" || typeof raw.id !== "string") {
                return null;
            }
            return {
                schemaVersion: typeof raw.schemaVersion === "number" ? raw.schemaVersion : 1,
                id: raw.id,
                name: raw.name,
                channel: raw.channel ?? "release",
                version: raw.version ?? "0.0.0",
                buildNumber: raw.buildNumber,
                publishedAtUtc: raw.publishedAtUtc,
                appliedAtUtc: raw.appliedAtUtc,
            };
        } catch {
            return null;
        }
    }

    private async writeLocalManifest(instancePath: string, manifest: BundleLocalManifest): Promise<void> {
        await ensureDir(instancePath);
        const manifestPath = path.join(instancePath, BUNDLE_LOCAL_MANIFEST_FILE);
        await writeJson(manifestPath, manifest, { spaces: 2 });
    }

    private async getInstanceOrFail(instanceId: string): Promise<InstalledInstance> {
        return this.instanceService.getById(instanceId);
    }

    private async safeListInstances(): Promise<InstalledInstance[]> {
        try {
            return await this.instanceService.list();
        } catch (error) {
            console.warn("[bundle-update] could not list instances during boot", error);
            return [];
        }
    }

    private commitState(state: BundleUpdateState): void {
        this.state.set(state.instanceId, state);
        this.emit(BUNDLE_STATE_CHANGED_EVENT, { ...state });
    }
}

function computeStagingPath(instancePath: string): string {
    // Sibling of the instance dir so an os-level rename can stay on the
    // same filesystem (atomic-rename precondition on Windows + Linux).
    return `${instancePath}${STAGING_SUFFIX}-${Date.now()}`;
}

function isHashMismatch(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }
    const code = (error as Error & { code?: unknown }).code;
    return code === BUNDLE_HASH_MISMATCH_CODE;
}

/**
 * Subdirectories of an instance that the Bundle pipeline is allowed to
 * overwrite during applyUpdate. Files outside this list are never moved
 * to the backup dir and never overwritten by the swap, so the user keeps
 * everything they put in the instance manually (logs, screenshots,
 * MelonLoader-generated state, …).
 */
const BUNDLE_OVERRIDE_DIRS = ["Mods", path.join("UserData", "BalanceMod")];

/**
 * Extract a zip archive into a destination directory with zip-slip
 * protection. Same algorithm BundleService.install uses; duplicated here
 * to keep the two services decoupled (Track 2 spec).
 */
async function extractZipSafelyToDir(zipPath: string, destinationDir: string): Promise<void> {
    const zipData = await fs.promises.readFile(zipPath);
    const zip = await JSZip.loadAsync(zipData);
    const resolvedDest = path.resolve(destinationDir);
    await ensureDir(resolvedDest);
    for (const entry of Object.values(zip.files)) {
        const entryName = entry.name;
        if (hasBundleUpdatePathTraversal(entryName)) {
            throw new Error(`Refusing zip entry with path traversal: ${entryName}`);
        }
        if (isBundleUpdateZipDirectoryEntry(entry)) {
            const dirPath = path.resolve(destinationDir, normalizeBundleUpdateZipEntryName(entryName));
            await ensureDirSafely(dirPath, resolvedDest);
            continue;
        }
        const resolvedTarget = path.resolve(destinationDir, entryName);
        if (resolvedTarget !== resolvedDest && !resolvedTarget.startsWith(resolvedDest + path.sep)) {
            throw new Error(`Refusing zip entry with path traversal: ${entryName}`);
        }
        await ensureDirSafely(path.dirname(resolvedTarget), resolvedDest);
        const stat = await fs.promises.stat(resolvedTarget).catch(() => null);
        if (stat && stat.isDirectory()) {
            continue;
        }
        const content = await entry.async("nodebuffer");
        await fs.promises.writeFile(resolvedTarget, content);
    }
}

/**
 * True when a zip entry name contains a real path-traversal component:
 * an absolute path, or a path SEGMENT that is exactly "..". Splits on both
 * POSIX and Windows separators. Mirrors hasPathTraversalSegment() in
 * bundle.service.ts (kept duplicated to keep the two services decoupled).
 *
 * We check per-segment rather than a naive `name.includes("..")` so that
 * legitimate file names containing ".." within a segment (e.g.
 * "medusa.bundle..bak") are not falsely rejected.
 */
function hasBundleUpdatePathTraversal(entryName: string): boolean {
    if (path.isAbsolute(entryName)) {
        return true;
    }
    return entryName.split(/[\\/]/).some(segment => segment === "..");
}

function isBundleUpdateZipDirectoryEntry(entry: { dir: boolean; name: string }): boolean {
    if (entry.dir) {
        return true;
    }
    return /[\\/]+$/.test(entry.name);
}

function normalizeBundleUpdateZipEntryName(entryName: string): string {
    return entryName.replace(/[\\/]+$/, "");
}

/**
 * Ensures a directory and all its parent directories exist.
 * If a file exists at any point along the directory hierarchy, it is deleted
 * to make room for the directory.
 */
async function ensureDirSafely(dirPath: string, destinationDir: string): Promise<void> {
    const resolvedDest = path.resolve(destinationDir);
    const resolvedDir = path.resolve(dirPath);

    let current = resolvedDir;
    const pathsToCheck: string[] = [];
    while (current && current !== resolvedDest && current.startsWith(resolvedDest + path.sep)) {
        pathsToCheck.push(current);
        current = path.dirname(current);
    }

    pathsToCheck.reverse();
    for (const p of pathsToCheck) {
        const stat = await fs.promises.stat(p).catch(() => null);
        if (stat && stat.isFile()) {
            await fs.promises.unlink(p);
        }
    }

    await ensureDir(resolvedDir);
}


/**
 * Garbage-collect old `.bundle-backup-*` siblings of an instance, keeping
 * the most recent `keepLast` backups. Bounds disk usage when many updates
 * have been applied over time.
 */
async function garbageCollectBackups(instancePath: string, keepLast: number): Promise<void> {
    const parent = path.dirname(instancePath);
    const base = path.basename(instancePath);
    const backupPrefix = `${base}${BACKUP_SUFFIX}-`;
    let entries: string[];
    try {
        entries = await readdir(parent);
    } catch {
        return;
    }
    // Backups under the instance dir itself are also captured below for
    // when the swap put them inside the instance (current implementation).
    const candidates: { full: string; ts: number }[] = [];
    for (const entry of entries) {
        if (!entry.startsWith(backupPrefix)) continue;
        const tsPart = entry.slice(backupPrefix.length);
        const ts = Number.parseInt(tsPart, 10);
        if (!Number.isFinite(ts)) continue;
        candidates.push({ full: path.join(parent, entry), ts });
    }
    // Backups that landed inside instance.path (current swap logic).
    let nestedEntries: string[] = [];
    try {
        nestedEntries = await readdir(instancePath);
    } catch {
        nestedEntries = [];
    }
    for (const entry of nestedEntries) {
        if (!entry.startsWith(".bundle-backup-")) continue;
        const tsPart = entry.slice(".bundle-backup-".length);
        const ts = Number.parseInt(tsPart, 10);
        if (!Number.isFinite(ts)) continue;
        candidates.push({ full: path.join(instancePath, entry), ts });
    }
    candidates.sort((a, b) => b.ts - a.ts);
    for (const stale of candidates.slice(keepLast)) {
        await remove(stale.full).catch(() => {});
    }
}

function isDiskFull(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }
    const code = (error as Error & { code?: unknown }).code;
    return code === "ENOSPC";
}

function extractErrorCode(error: unknown): string | undefined {
    if (!(error instanceof Error)) {
        return undefined;
    }
    const code = (error as Error & { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
}

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
