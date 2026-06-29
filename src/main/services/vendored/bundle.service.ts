import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fsExtra from "fs-extra";
import JSZip from "jszip";
import type { BundleInstallProgressState } from "../../../shared/ipc";
import type { BundleEntry, InstalledInstance } from "../../../shared/manifest";
import { ArchiveDownloadService } from "./archive-download.service";
import type { DownloadFileProgress } from "./archive-download.service";
import { InstanceService } from "../core/instance.service";
import { ManifestClient } from "./manifest-client";
import { MelonLoaderService } from "./melonloader.service";
import { SettingsStoreService } from "../core/settings-store";

const { ensureDir, pathExists, remove, writeJson } = fsExtra;

/**
 * Phase D — BundleService: the real download-and-extract install pipeline.
 *
 * A "Bundle Instance" is the launcher-managed, auto-updating, mod-locked
 * third instance type alongside Standard and Creator Kit. See
 * docs/bundle-instance/BUNDLE_INSTANCE_MASTER_SPEC.md (especially §5.1) for
 * the full design.
 *
 * This file delivers:
 *   - listAvailable(): reads the bundled fallback manifests at
 *     <main>/bundles/<id>/manifest.json so the launcher works offline on
 *     first start. Bundles are first-class main-process content; they are
 *     NOT under rebalance-vendor (which hosts the studio iframe app).
 *   - install(bundleId, profileName?): the real Phase D pipeline:
 *       1. Read the remote bundles manifest via ManifestClient.
 *       2. Locate the BundleEntry for `bundleId` (or fall back to the
 *          on-disk bundled fallback manifest for METADATA only — the
 *          fallback never carries an archive URL/hash, so a network
 *          install is still required).
 *       3. Resolve the destination directory (with sanitisation +
 *          collision suffixing).
 *       4. Download bundle.zip via ArchiveDownloadService.downloadFile
 *          (which verifies the SHA-256 and throws on mismatch).
 *       5. Extract the archive into the destination with strict
 *          path-traversal protection (zip-slip guard).
 *       6. Run MelonLoaderService.ensureInstalled in the new instance
 *          dir so the bundle launches cleanly on first run.
 *       7. Write `.bapbap-instance.json` with `instanceType: "bundle"`
 *          and the bundle metadata fields described in the master spec.
 *       8. Write `.bundle-manifest.json` so BundleUpdateService can later
 *          compare local vs remote build numbers.
 *   - remove(instanceId): stub. A bypass flag on InstanceService.remove
 *     is needed to allow Bundle Instances (which are not "officialManaged"
 *     in the user-managed sense) to be deleted from the launcher. Wired
 *     in a follow-up because it requires an instance.service.ts edit
 *     which is out of scope for this track.
 *   - assertMutable(instance): delegates to InstanceService.assertMutable
 *     so callers can keep using a single chokepoint when guarding
 *     mod-mutating operations (installCustomMod, ContentService.*,
 *     ConfigEditorService).
 */

/**
 * Strict bundle id format. Must:
 *   - start and end with a lowercase letter or digit;
 *   - contain only lowercase letters, digits, and hyphens in between;
 *   - be 1–64 characters long.
 *
 * Example valid ids: "boss-rush", "vanilla-plus", "x", "boss-rush-2".
 * Example invalid:   "Boss-Rush", "-foo", "foo-", "über".
 *
 * Mirrors the spec at docs/bundle-instance/BUNDLE_INSTANCE_MASTER_SPEC.md.
 */
const BUNDLE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/** Filename for the per-instance bundle metadata sidecar (also used by InstanceService.list). */
const INSTANCE_META_FILE = ".bapbap-instance.json";

/** Filename for the per-version bundle manifest snapshot consumed by BundleUpdateService. */
const BUNDLE_MANIFEST_FILE = ".bundle-manifest.json";


/**
 * Event emitted whenever the per-bundle install pipeline transitions to a
 * new stage or makes meaningful download progress. Mirrors the
 * BundleUpdateService.BUNDLE_STATE_CHANGED_EVENT name (`state-changed`)
 * but kept distinct so subscribers cannot conflate first-install progress
 * with update progress.
 */
export const BUNDLE_INSTALL_PROGRESS_EVENT = "progress-changed";

/**
 * Throttle for download-progress emissions. Same shape as the
 * launcher-updater's gate (see launcher-updater.service.ts:306-315):
 *   - emit at completion (>= 100%),
 *   - emit when the next 1% bucket is crossed,
 *   - otherwise emit only every PROGRESS_EMIT_THROTTLE_MS.
 *
 * Keeping this in step with the launcher updater means the renderer can
 * lean on a single mental model for both Bundle install + launcher update
 * progress bars.
 */
const PROGRESS_EMIT_THROTTLE_MS = 200;

/**
 * Public summary the renderer uses for the bundle picker, status badges,
 * and the update gate. Mirrors the master spec §5.1 BundleSummary contract.
 *
 * `isInstalled` / `isUpdateAvailable` are intentionally part of the summary
 * so a single round-trip can drive the InstancesWorkspace picker UX.
 */
export interface BundleSummary {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
    channel: string;
    version: string;
    buildNumber: number;
    sizeBytes?: number;
    isInstalled: boolean;
    isUpdateAvailable: boolean;
    /** True when the remote manifest advertises an archiveUrl — the
     *  bundle can be downloaded. False for pre-release entries that
     *  have metadata and artwork but no zip yet. */
    isDownloadable?: boolean;
}

/**
 * Subset of the on-disk bundle manifest the launcher needs at install time.
 * The full Track-5 schema (compatibility, signature, full files[]) is
 * preserved verbatim in `.bundle-manifest.json` for BundleUpdateService.
 *
 * The JSON file lives at:
 *   <main-dist>/bundles/<id>/manifest.json (built; copied by sync-rebalance-vendor)
 *   <main-source>/bundles/<id>/manifest.json (source; for tests)
 */
interface BundleManifestSummary {
    schemaVersion?: number;
    id?: string;
    name?: string;
    summary?: string;
    description?: string;
    imageUrl?: string;
    logoUrl?: string;
    channel?: string;
    version?: string;
    buildNumber?: number;
    sizeBytes?: number;
    publishedAtUtc?: string;
    extra?: {
        isPlaceholder?: boolean;
        logoUrl?: string;
    };
    /** Set to false when the remote entry has no archiveUrl (pre-release). */
    isDownloadable?: boolean;
}

export class BundleService extends EventEmitter {
    private readonly settings: SettingsStoreService;
    private readonly instanceService: InstanceService;
    private readonly manifests: ManifestClient;
    private readonly archiveDownload: ArchiveDownloadService;
    private readonly melonLoader: MelonLoaderService;

    /**
     * Allows tests / future Phase D wiring to point listAvailable() at a
     * different on-disk location. Defaults to the bundled fallback shipped
     * inside the launcher under <main>/bundles.
     */
    private readonly bundlesRoot: string;

    /**
     * Allows tests to direct the install pipeline's tmp downloads at a
     * deterministic location. Defaults to `<os.tmpdir()>/bapbap-bundles`.
     */
    private readonly tmpRoot: string;

    /**
     * Last known install-progress state per `bundleId`. Keyed by bundle
     * id (NOT instance id) because the install pipeline runs BEFORE an
     * instance has been minted — at "resolving" time there is no
     * InstalledInstance yet. Cleared only on process exit; a successful
     * install leaves the final `done` state behind so a renderer that
     * mounts late can still recover the most recent outcome.
     */
    private readonly installProgressState = new Map<string, BundleInstallProgressState>();

    constructor(
        settings: SettingsStoreService,
        instanceService: InstanceService,
        manifests: ManifestClient,
        archiveDownload: ArchiveDownloadService,
        melonLoader: MelonLoaderService,
        options: { bundlesRoot?: string; tmpRoot?: string } = {},
    ) {
        super();
        this.settings = settings;
        this.instanceService = instanceService;
        this.manifests = manifests;
        this.archiveDownload = archiveDownload;
        this.melonLoader = melonLoader;
        this.bundlesRoot = options.bundlesRoot ?? defaultBundlesRoot();
        this.tmpRoot = options.tmpRoot ?? path.join(os.tmpdir(), "bapbap-bundles");
    }

    /**
     * Walk the bundled fallback directory at startup and return a summary
     * for every bundle whose `manifest.json` is well-formed.
     *
     * Caller-side contract:
     *   - Never throws on a missing directory (returns []).
     *   - Skips entries whose manifest is missing / malformed / has an
     *     invalid id (BUNDLE_ID_PATTERN).
     *   - `isInstalled` / `isUpdateAvailable` are derived from the
     *     installed-instance list so the renderer sees a single source of
     *     truth.
     */
    async listAvailable(): Promise<BundleSummary[]> {
        const manifestsById = new Map<string, BundleManifestSummary>();
        for (const manifest of await this.readBundledManifests()) {
            const id = `${manifest.id ?? ""}`.trim();
            if (BundleService.isValidBundleId(id)) {
                manifestsById.set(id, manifest);
            }
        }

        try {
            const remote = await this.manifests.getBundlesManifest(true);
            for (const entry of remote?.bundles || []) {
                const id = `${entry.bundleId ?? ""}`.trim();
                if (!BundleService.isValidBundleId(id)) {
                    continue;
                }
                const hasArchive = `${entry.archiveUrl ?? ""}`.trim().length > 0;
                manifestsById.set(id, {
                    id,
                    name: entry.name,
                    description: entry.description ?? entry.notes,
                    imageUrl: entry.imageUrl ?? entry.logoUrl,
                    channel: entry.channel ?? remote?.channel ?? "stable",
                    version: entry.version,
                    buildNumber: entry.buildNumber,
                    sizeBytes: entry.sizeBytes,
                    publishedAtUtc: entry.publishedAtUtc,
                    isDownloadable: hasArchive,
                });
            }
        } catch (error) {
            console.warn("[bundles] could not fetch remote bundle list", error);
        }

        const manifests = Array.from(manifestsById.values());
        if (manifests.length === 0) {
            return [];
        }

        // Pull installed instances ONCE so we can compute isInstalled /
        // isUpdateAvailable per bundle without a per-iteration round-trip.
        const installed = await this.instanceService.list().catch(() => []);
        const bundleInstanceById = new Map<string, InstalledInstance>();
        for (const instance of installed) {
            if (instance.instanceType === "bundle" && instance.bundleId) {
                bundleInstanceById.set(instance.bundleId, instance);
            }
        }

        return manifests
            .map<BundleSummary | null>(manifest => {
                const id = `${manifest.id ?? ""}`.trim();
                if (!BundleService.isValidBundleId(id)) {
                    return null;
                }
                if (manifest.extra?.isPlaceholder) {
                    return null;
                }
                const channel = `${manifest.channel ?? "stable"}`.trim() || "stable";
                const version = `${manifest.version ?? "0.0.0"}`.trim() || "0.0.0";
                const buildNumber = Number.isFinite(manifest.buildNumber) ? Number(manifest.buildNumber) : 0;
                const installedInstance = bundleInstanceById.get(id);
                const installedBuild = Number(installedInstance?.bundleBuildNumber ?? 0);
                const isInstalled = !!installedInstance;
                // Only surface "update available" when we have BOTH a
                // numeric installed build AND the available build is
                // strictly greater. Equal builds == up-to-date.
                const isUpdateAvailable = isInstalled && buildNumber > installedBuild;
                return {
                    id,
                    name: `${manifest.name ?? id}`.trim() || id,
                    description: `${manifest.description ?? manifest.summary ?? ""}`.trim() || undefined,
                    imageUrl: `${manifest.imageUrl ?? manifest.logoUrl ?? manifest.extra?.logoUrl ?? ""}`.trim() || undefined,
                    channel,
                    version,
                    buildNumber,
                    sizeBytes: typeof manifest.sizeBytes === "number" ? manifest.sizeBytes : undefined,
                    isInstalled,
                    isUpdateAvailable,
                    isDownloadable: manifest.isDownloadable !== false,
                };
            })
            .filter((entry): entry is BundleSummary => entry !== null)
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Phase D — full install pipeline.
     *
     * Steps (numbered for the test plan + master spec §5.1):
     *   1. Validate the bundle id strictly.
     *   2. Resolve the BundleEntry: prefer the remote manifest, fall back
     *      to the on-disk bundled manifest for METADATA only. The remote
     *      entry is ALWAYS required for archive bytes — the bundled
     *      fallback ships with `files: []` and no archiveUrl, so we
     *      cannot install offline.
     *   3. Sanitise / collision-suffix the destination folder name.
     *   4. Download bundle.zip via ArchiveDownloadService (SHA-256
     *      verified inside the downloader, mismatch throws).
     *   5. Extract with a strict zip-slip guard (defence-in-depth even
     *      though the downloader checks the archive hash).
     *   6. Bootstrap MelonLoader inside the destination so the bundle
     *      can launch immediately.
     *   7. Persist `.bapbap-instance.json` with all bundle fields.
     *   8. Persist `.bundle-manifest.json` (the per-version snapshot
     *      BundleUpdateService.checkForUpdate compares against).
     *
     * Cleans up the destination AND the tmp archive on any failure.
     */
    async install(bundleId: string, profileName?: string): Promise<InstalledInstance> {
        const id = `${bundleId ?? ""}`.trim();
        if (!BundleService.isValidBundleId(id)) {
            throw new Error(`Invalid bundle id '${bundleId}'.`);
        }

        const startedAtUtc = new Date().toISOString();
        // (1) RESOLVING — emitted before any network call so a renderer
        // that subscribes immediately after invoking install() always
        // catches the first transition.
        this.commitInstallProgress({
            bundleId: id,
            status: "resolving",
            startedAtUtc,
        });

        try {
            return await this.installInner(id, profileName, startedAtUtc);
        } catch (error) {
            this.commitInstallProgress({
                bundleId: id,
                status: "failed",
                errorMessage: toInstallErrorMessage(error),
                startedAtUtc,
                completedAtUtc: new Date().toISOString(),
            });
            throw error;
        }
    }

    /**
     * Snapshot of the current first-install progress for `bundleId`.
     * Returns `{ bundleId, status: "idle" }` when the pipeline has never
     * run for this bundle (or the id is empty / invalid). Always returns
     * a fresh object — callers must not mutate the returned reference.
     */
    getInstallProgressState(bundleId: string): BundleInstallProgressState {
        const id = `${bundleId ?? ""}`.trim();
        const existing = this.installProgressState.get(id);
        if (existing) {
            return { ...existing };
        }
        return { bundleId: id, status: "idle" };
    }

    private async installInner(
        id: string,
        profileName: string | undefined,
        startedAtUtc: string,
    ): Promise<InstalledInstance> {
        // (2) Resolve the BundleEntry. Network errors are tolerated so we
        // can fall back to the bundled fallback manifest for METADATA.
        let remoteEntry: BundleEntry | null = null;
        try {
            const remote = await this.manifests.getBundlesManifest(true);
            if (remote) {
                remoteEntry = (remote.bundles || []).find(entry => entry.bundleId === id) ?? null;
            }
        } catch (error) {
            // We deliberately swallow network errors here so the next
            // step can attempt the bundled fallback. If that also fails
            // we throw a clear English error below.
            console.warn(`[bundles] could not fetch remote manifest for '${id}'`, error);
        }

        const fallbackManifest = await this.readBundledManifestForId(id);

        if (!remoteEntry && !fallbackManifest) {
            throw new Error(
                `Bundle '${id}' is not available. ` +
                "No remote manifest entry and no bundled fallback manifest were found.",
            );
        }

        // The fallback manifest does not carry an archive URL or hash by
        // design (the bundled fallback ships with files=[] — see the
        // boss-rush README and master spec §7). Without a remote entry we
        // cannot proceed with the actual download.
        if (!remoteEntry) {
            throw new Error(
                `Bundle '${id}' has no remote manifest entry; the bundle archive could not be downloaded. ` +
                "Make sure the launcher manifest tree advertises this bundle.",
            );
        }

        const archiveUrl = `${remoteEntry.archiveUrl ?? ""}`.trim();
        const archiveSha256 = `${remoteEntry.archiveSha256 ?? ""}`.trim();
        if (!archiveUrl) {
            throw new Error(
                `Bundle archive could not be downloaded: '${id}' has no archiveUrl in the remote manifest.`,
            );
        }
        if (!archiveSha256) {
            throw new Error(
                `Bundle archive could not be downloaded: '${id}' has no archiveSha256 in the remote manifest. ` +
                "Refusing to install an unverified archive.",
            );
        }

        // (3) Resolve the destination folder. Prefer the user-supplied
        // profile name; fall back to the bundle's authored name (remote
        // first, then fallback manifest), then the id as a last resort.
        const desiredName =
            (profileName ?? "").trim() ||
            `${remoteEntry.name ?? ""}`.trim() ||
            `${fallbackManifest?.name ?? ""}`.trim() ||
            id;
        const sanitizedName = sanitizeProfileName(desiredName);
        if (!sanitizedName) {
            throw new Error("Bundle install: profileName resolves to an empty folder name.");
        }

        const instancesRoot = this.settings.getInstancesRoot();
        await ensureDir(instancesRoot);
        const destination = await allocateDestination(instancesRoot, sanitizedName);

        await ensureDir(this.tmpRoot);
        const archivePath = path.join(this.tmpRoot, `bundle-${id}-${Date.now()}.zip`);

        // Pre-resolve the archive size from the manifest so the first
        // "downloading" emission already carries a sizeBytes value
        // (Content-Length might not arrive until the first byte).
        const advertisedSizeBytes = typeof remoteEntry.sizeBytes === "number"
            ? remoteEntry.sizeBytes
            : undefined;

        let destinationCreated = false;
        try {
            await ensureDir(destination);
            destinationCreated = true;

            // (4) Verified download. ArchiveDownloadService.downloadFile
            // throws on SHA-256 mismatch with the message
            // "SHA256 mismatch. Expected <hash>, got <hash>." We let that
            // propagate so the renderer sees the underlying cause.
            //
            // Emit "downloading" once before the download starts so a
            // renderer can flip the UI before any progress callback runs.
            this.commitInstallProgress({
                bundleId: id,
                status: "downloading",
                bytesDownloaded: 0,
                sizeBytes: advertisedSizeBytes,
                progressPercent: advertisedSizeBytes && advertisedSizeBytes > 0 ? 0 : undefined,
                startedAtUtc,
            });

            // Throttle gate mirrors launcher-updater.service.ts:306-315 —
            // emit on completion, on each new 1% bucket, or every
            // PROGRESS_EMIT_THROTTLE_MS, whichever comes first. Avoids
            // hammering the IPC bus on fast LAN downloads.
            const throttleGate = { lastPercent: -1, lastEmitAt: 0 };
            await this.archiveDownload.downloadFile({
                url: archiveUrl,
                outputPath: archivePath,
                sha256: archiveSha256,
                onProgress: (progress: DownloadFileProgress) => {
                    const now = Date.now();
                    const percent =
                        typeof progress.progressPercent === "number"
                            ? clampPercentForInstall(progress.progressPercent)
                            : undefined;
                    const shouldEmit =
                        percent === undefined ||
                        percent >= 100 ||
                        (typeof percent === "number" &&
                            (throttleGate.lastPercent < 0 ||
                                Math.abs(percent - throttleGate.lastPercent) >= 1)) ||
                        now - throttleGate.lastEmitAt >= PROGRESS_EMIT_THROTTLE_MS;
                    if (!shouldEmit) {
                        return;
                    }
                    throttleGate.lastEmitAt = now;
                    if (typeof percent === "number") {
                        throttleGate.lastPercent = percent;
                    }
                    this.commitInstallProgress({
                        bundleId: id,
                        status: "downloading",
                        bytesDownloaded: progress.downloadedBytes,
                        sizeBytes: progress.totalBytes ?? advertisedSizeBytes,
                        progressPercent: percent,
                        startedAtUtc,
                    });
                },
            });

            // (5a) VERIFYING — downloadFile already SHA-checked the archive
            // atomically. This emission is a UI hint that the integrity
            // check has just completed; subsequent extraction is local.
            this.commitInstallProgress({
                bundleId: id,
                status: "verifying",
                bytesDownloaded: advertisedSizeBytes,
                sizeBytes: advertisedSizeBytes,
                progressPercent: 100,
                startedAtUtc,
            });

            // (5b) EXTRACTING — single emission before extractZipSafely
            // runs. Spec calls for one event per stage, not progress
            // ticks, because the JSZip walk is fast enough that a percent
            // gauge would just flicker.
            this.commitInstallProgress({
                bundleId: id,
                status: "extracting",
                bytesDownloaded: advertisedSizeBytes,
                sizeBytes: advertisedSizeBytes,
                progressPercent: 100,
                startedAtUtc,
            });
            await extractZipSafely(archivePath, destination);

            // (6) MelonLoader bootstrap so the bundle launches on first
            // run without an extra round-trip. Emit "installing" before
            // ensureInstalled so the renderer sees the post-extract
            // bootstrap stage even though it's typically very fast.
            this.commitInstallProgress({
                bundleId: id,
                status: "installing",
                bytesDownloaded: advertisedSizeBytes,
                sizeBytes: advertisedSizeBytes,
                progressPercent: 100,
                startedAtUtc,
            });
            await this.melonLoader.ensureInstalled(destination);

            // (7) Sidecar metadata for InstanceService.list and the
            // (planned) BundleUpdateService consumers.
            const profileId = randomUUID();
            const nowUtc = new Date().toISOString();
            const fullVersion = `${remoteEntry.version ?? fallbackManifest?.version ?? "0.0.0"}`.trim() || "0.0.0";
            const buildNumber = Number(remoteEntry.buildNumber ?? fallbackManifest?.buildNumber ?? 0) || 0;
            const channel =
                `${remoteEntry.channel ?? fallbackManifest?.channel ?? "stable"}`.trim() || "stable";
            const displayName =
                (profileName ?? "").trim() ||
                `${remoteEntry.name ?? fallbackManifest?.name ?? sanitizedName}`.trim() ||
                sanitizedName;

            const instance: InstalledInstance = {
                id: profileId,
                profileName: displayName,
                versionId: `bundle:${id}:${fullVersion}`,
                gameVersion: fullVersion,
                name: displayName,
                version: fullVersion,
                track: "bundle",
                path: destination,
                imageUrl: `${remoteEntry.imageUrl ?? fallbackManifest?.imageUrl ?? ""}`.trim() || undefined,
                officialManaged: true,
                officialTrack: "bundle",
                lastUpdatedUtc: nowUtc,
                melonLoaderFirstRunPending: true,
                instanceSource: "official-managed",
                instanceType: "bundle",
                bundleId: id,
                bundleChannel: channel,
                bundleVersion: fullVersion,
                bundleBuildNumber: buildNumber,
                bundleLastApplyUtc: nowUtc,
            };
            await writeJson(path.join(destination, INSTANCE_META_FILE), instance, { spaces: 2 });

            // (8) Per-version manifest snapshot. Schema mirrors
            // BundleLocalManifest in bundle-update.service.ts so
            // checkForUpdate() can read it without coupling to the full
            // Track-5 schema.
            await writeJson(
                path.join(destination, BUNDLE_MANIFEST_FILE),
                {
                    schemaVersion: 1,
                    id,
                    name: displayName,
                    channel,
                    version: fullVersion,
                    buildNumber,
                    publishedAtUtc: remoteEntry.publishedAtUtc ?? fallbackManifest?.publishedAtUtc,
                    appliedAtUtc: nowUtc,
                },
                { spaces: 2 },
            );

            // DONE — final transition. Mirrors the launcher-updater's
            // terminal state so a renderer can dismiss the progress UI
            // and refresh the instance list with a single subscribe.
            this.commitInstallProgress({
                bundleId: id,
                status: "done",
                bytesDownloaded: advertisedSizeBytes,
                sizeBytes: advertisedSizeBytes,
                progressPercent: 100,
                startedAtUtc,
                completedAtUtc: nowUtc,
            });

            return instance;
        } catch (error) {
            if (destinationCreated) {
                await remove(destination).catch(() => {});
            }
            throw error;
        } finally {
            await remove(archivePath).catch(() => {});
        }
    }

    /**
     * Persist the next install-progress state for `state.bundleId` and
     * fan it out to "progress-changed" listeners. Always emits a fresh
     * shallow copy so subscribers cannot mutate the cached snapshot.
     */
    private commitInstallProgress(state: BundleInstallProgressState): void {
        const id = `${state.bundleId ?? ""}`.trim();
        const snapshot: BundleInstallProgressState = { ...state, bundleId: id };
        this.installProgressState.set(id, snapshot);
        this.emit(BUNDLE_INSTALL_PROGRESS_EVENT, { ...snapshot });
    }

    /**
     * Phase D — remove a Bundle Instance. The full implementation needs a
     * `bypassOfficialManagedCheck` flag on InstanceService.remove (Bundle
     * instances are NOT officialManaged in the user-managed sense, so the
     * existing guard would reject them). That flag is added in a separate
     * track. Until then, this remains a stub — but with a clearer message
     * than the old "pending in Phase D" placeholder.
     */
    async remove(instanceId: string): Promise<void> {
        const id = `${instanceId ?? ""}`.trim();
        if (!id) {
            throw new Error("instanceId is required.");
        }
        // Bundle instances are launcher-managed but do NOT carry the
        // historical officialManaged flag (those track the manifest's
        // game versions, not bundle releases). Bypass that check.
        await this.instanceService.remove(id, { bypassOfficialManagedCheck: true });
    }

    /**
     * Refuse mod-mutating operations on Bundle Instances. Delegates to
     * InstanceService.assertMutable so there is exactly one source of truth
     * for the lock check. The instance method already throws an Error with
     * `code = "BUNDLE_INSTANCE_LOCKED"` on bundle-typed inputs.
     */
    async assertMutable(instance: InstalledInstance | null | undefined): Promise<void> {
        await this.instanceService.assertMutable(instance);
    }

    /**
     * Exposed as a static so tests / IPC validators can use the same regex
     * without instantiating the service. Returns true iff `value` matches
     * `^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$`.
     */
    static isValidBundleId(value: string): boolean {
        return BUNDLE_ID_PATTERN.test(value);
    }

    /**
     * Read every <bundlesRoot>/<id>/manifest.json that parses as JSON. Done
     * with native fs.promises so tests can mock it via vi.mock("node:fs").
     * Failures on a single bundle are swallowed (skipped) — they should not
     * prevent listing the rest.
     */
    private async readBundledManifests(): Promise<BundleManifestSummary[]> {
        let dirEntries: fs.Dirent[];
        try {
            dirEntries = await fs.promises.readdir(this.bundlesRoot, { withFileTypes: true });
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === "ENOENT" || code === "ENOTDIR") {
                return [];
            }
            console.warn(`[bundles] could not list bundles root '${this.bundlesRoot}'`, error);
            return [];
        }

        const results: BundleManifestSummary[] = [];
        for (const entry of dirEntries) {
            if (!entry.isDirectory()) {
                continue;
            }
            // We trust BUNDLE_ID_PATTERN to reject malicious folder names
            // (e.g. ones with "..") at the filter step in listAvailable().
            const candidatePath = path.join(this.bundlesRoot, entry.name, "manifest.json");
            const parsed = await readJsonSafely(candidatePath);
            if (parsed && typeof parsed === "object") {
                results.push(parsed as BundleManifestSummary);
            }
        }
        return results;
    }

    /**
     * Targeted single-bundle lookup for install(). Returns the parsed
     * fallback manifest for the given id or null if missing / malformed.
     */
    private async readBundledManifestForId(id: string): Promise<BundleManifestSummary | null> {
        if (!BundleService.isValidBundleId(id)) {
            return null;
        }
        const candidatePath = path.join(this.bundlesRoot, id, "manifest.json");
        const parsed = await readJsonSafely(candidatePath);
        if (!parsed || typeof parsed !== "object") {
            return null;
        }
        return parsed as BundleManifestSummary;
    }
}

/**
 * Resolve the bundled fallback directory shipped with the launcher.
 *
 * Bundles ship at `<main>/bundles/<id>/` — they are first-class
 * launcher-managed game-profile content, NOT under rebalance-vendor (which
 * hosts the studio iframe app and its default-workspace).
 *
 * In a packaged launcher: __dirname is `dist/main` (services are bundled
 * into main.cjs by electron-vite) and bundles live at `dist/main/bundles/`,
 * copied there by sync-rebalance-vendor.mjs after each electron-vite build.
 *
 * In source / unit tests: __dirname is `src/main/services` and bundles
 * live at `src/main/bundles/` (one level up). The probe inside
 * defaultBundlesRoot() picks whichever exists first.
 */
function defaultBundlesRoot(): string {
    // Bundles ship under <main>/bundles/, NOT under rebalance-vendor.
    // - In a built launcher (electron-vite + sync-bundled-bundles), this
    //   resolves to <appResources>/dist/main/bundles/ because __dirname is
    //   the location of the bundled main.cjs.
    // - In source / unit-test mode, __dirname is src/main/services, so the
    //   bundles live one level up at src/main/bundles/.
    // We probe both and return the first that exists; if neither exists,
    // listAvailable() returns an empty array gracefully.
    const candidates = [
        path.resolve(__dirname, "bundles"),
        path.resolve(__dirname, "..", "bundles"),
    ];
    for (const candidate of candidates) {
        try {
            if (fs.statSync(candidate).isDirectory()) {
                return candidate;
            }
        } catch {
            // not present, try next
        }
    }
    return candidates[0]!;
}

async function readJsonSafely(filePath: string): Promise<unknown> {
    try {
        const raw = await fs.promises.readFile(filePath, "utf8");
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * Mirror of InstanceService.allocateProfileDestination (instance.service.ts:457-468).
 * Re-implemented here because that method is private and reaching across
 * services for a 12-line helper would be heavier than duplicating it. If
 * the launcher ever exposes a shared helper, both call sites should
 * collapse onto it.
 */
async function allocateDestination(instancesRoot: string, sanitizedName: string): Promise<string> {
    const baseFolderName = sanitizedName || "bundle";
    let attempt = 1;
    while (true) {
        const folderName = attempt === 1 ? baseFolderName : `${baseFolderName}-${attempt}`;
        const destination = path.join(instancesRoot, folderName);
        if (!(await pathExists(destination))) {
            return destination;
        }
        attempt += 1;
        if (attempt > 9999) {
            throw new Error(
                `Bundle install: could not allocate a free folder under '${instancesRoot}' for '${sanitizedName}'.`,
            );
        }
    }
}

/**
 * Profile name → safe folder name. Mirrors the sanitisation used by
 * InstanceService (`/[^a-zA-Z0-9._-]/g` → "-") so Bundle and Standard
 * instances live in the same flat directory without surprises.
 */
function sanitizeProfileName(name: string): string {
    return `${name ?? ""}`.trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Extract a ZIP file at `zipPath` into `destinationDir` with strict
 * zip-slip protection. We re-implement the JSZip walk here (rather than
 * reusing ArchiveDownloadService's private extractZipAsync) because:
 *   - the bundle install pipeline must NOT collapse single-folder roots
 *     the way ArchiveDownloadService.normalizeExtractedRoot does (bundle
 *     archives ship a flat Mods/ + UserData/ tree at the root, never a
 *     wrapping folder);
 *   - keeping the traversal guard in this file lets bundle.service tests
 *     prove the protection without coupling to ArchiveDownloadService.
 */
async function extractZipSafely(zipPath: string, destinationDir: string): Promise<void> {
    const zipData = await fs.promises.readFile(zipPath);
    const zip = await JSZip.loadAsync(zipData);
    const resolvedDest = path.resolve(destinationDir);
    const entries = Object.values(zip.files);

    for (const entry of entries) {
        // Reject absolute paths and anything containing "..". We also
        // resolve the target path and verify the result is inside the
        // destination — defence-in-depth against weirder traversal forms
        // (e.g. mixed separators on Windows).
        const entryName = entry.name;
        if (path.isAbsolute(entryName) || entryName.includes("..")) {
            throw new Error(`Refusing zip entry with path traversal: ${entryName}`);
        }
        const resolvedTarget = path.resolve(destinationDir, entryName);
        if (resolvedTarget !== resolvedDest && !resolvedTarget.startsWith(resolvedDest + path.sep)) {
            throw new Error(`Refusing zip entry with path traversal: ${entryName}`);
        }

        if (entry.dir) {
            await ensureDirSafely(resolvedTarget, resolvedDest);
            continue;
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
 * Clamp a download progress percent into the inclusive [0, 100] range
 * and round to the nearest integer. NaN / -Infinity / +Infinity collapse
 * to 0. Mirrors clampPercent() in launcher-updater.service.ts.
 */
function clampPercentForInstall(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Best-effort coercion of an unknown error to a user-facing English
 * message. Used for the `errorMessage` field on the "failed" install
 * progress state. Mirrors toErrorMessage() in launcher-updater.service.ts.
 */
function toInstallErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
