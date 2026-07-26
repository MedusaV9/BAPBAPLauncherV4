import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import electron from "electron";
import fsExtra from "fs-extra";
import { AsyncMutex } from "../../utils/async-mutex";
import { ArchiveDownloadService } from "../vendored/archive-download.service";
import { ManifestClient } from "../vendored/manifest-client";
import { MelonLoaderService } from "../vendored/melonloader.service";
import { SettingsStoreService } from "./settings-store";
import { InstallOfficialInput, InstalledInstance, InstanceType } from "../../../shared/manifest";
import type { ContentModSet, ContentModSetPackageState, ContentModSetState, CustomModInstallResult, InstanceInstallState } from "../../../shared/ipc";
import { resolveUnlockStatus } from "../../../shared/unlock-time";
import { TrustedTimeService } from "../vendored/trusted-time.service";

const { ensureDir, pathExists, readJson, remove, writeJson } = fsExtra;

// Write JSON via a temp file + atomic rename so a crash mid-write can never
// truncate the live state file (which readContentState would then swallow as
// "no mods installed", silently orphaning the user's managed files).
async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
    const tmpPath = `${filePath}.tmp-${randomUUID()}`;
    await writeJson(tmpPath, data, { spaces: 2 });
    await fs.promises.rename(tmpPath, filePath);
}
const { app } = electron;
const execFileAsync = promisify(execFile);

type InstanceMetadata = InstalledInstance & {
    source: "official-manifest";
    contentStatePath: string;
};

const INSTANCE_META_FILE = ".bapbap-instance.json";
const CONTENT_STATE_FILE = ".baphub-content-state.json";
const MOD_SET_STATE_FILE = ".baphub-mod-sets.json";
const INSTALL_STATE_EVENT = "install-state";
const DEFAULT_MOD_SET_ID = "default";
const DEFAULT_MOD_SET_NAME = "Main set";
const STEAM_COMPATIBILITY_WARNING = "Steam installs are detected automatically. Launching and basic mod support should work, but some launcher-only features may not behave exactly like an official managed profile.";

export class InstanceService {
    private readonly settings: SettingsStoreService;
    private readonly manifests: ManifestClient;
    private readonly downloader: ArchiveDownloadService;
    private readonly trustedTime: TrustedTimeService;
    private readonly melonLoader: MelonLoaderService;
    private readonly installEvents = new EventEmitter();
    private readonly installMutex = new AsyncMutex();
    private installState: InstanceInstallState = { status: "idle" };
    private steamRootCache: { value: string | null; expiresAt: number } | null = null;
    private static readonly STEAM_ROOT_CACHE_MS = 60_000;

    constructor(settings: SettingsStoreService, manifests: ManifestClient, downloader: ArchiveDownloadService, trustedTime: TrustedTimeService, melonLoader: MelonLoaderService) {
        this.settings = settings;
        this.manifests = manifests;
        this.downloader = downloader;
        this.trustedTime = trustedTime;
        this.melonLoader = melonLoader;
    }

    async list(): Promise<InstalledInstance[]> {
        const root = this.settings.getInstancesRoot();
        try {
            if (!(await pathExists(root))) {
                await ensureDir(root);
            }
        } catch (error) {
            console.warn(`[instances] could not access instances root '${root}'`, error);
            return [];
        }

        const entries = await fs.promises.readdir(root, { withFileTypes: true }).catch(() => []);
        const instancesById = new Map<string, InstalledInstance>();
        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }
            const folder = path.join(root, entry.name);
            const metaPath = path.join(folder, INSTANCE_META_FILE);
            if (!(await pathExists(metaPath))) {
                continue;
            }
            try {
                const meta = (await readJson(metaPath)) as Partial<InstanceMetadata>;
                const resolvedPath = meta.path || folder;
                if (!(await this.isValidGameFolder(resolvedPath))) {
                    continue;
                }
                const profileName = `${meta.profileName || meta.name || entry.name}`.trim();
                const gameVersion = `${meta.gameVersion || meta.version || ""}`.trim() || `${meta.versionId || meta.id || "unknown"}`;
                const instance: InstalledInstance = {
                    id: `${meta.id || entry.name}`,
                    profileName,
                    versionId: `${meta.versionId || meta.id || gameVersion}`,
                    gameVersion,
                    name: profileName,
                    version: gameVersion,
                    track: `${meta.track || meta.officialTrack || "bapbap"}`,
                    path: resolvedPath,
                    imageUrl: meta.imageUrl,
                    officialManaged: !!meta.officialManaged,
                    officialTrack: meta.officialTrack,
                    lastUpdatedUtc: meta.lastUpdatedUtc || new Date(0).toISOString(),
                    melonLoaderFirstRunPending: meta.melonLoaderFirstRunPending === true,
                    instanceSource: meta.instanceSource || "official-managed",
                    compatibilityWarning: meta.compatibilityWarning,
                    instanceType: normalizeInstanceType(meta.instanceType),
                    bundleId: normalizeOptionalString(meta.bundleId),
                    bundleChannel: normalizeOptionalString(meta.bundleChannel),
                    bundleVersion: normalizeOptionalString(meta.bundleVersion),
                    bundleBuildNumber: normalizePositiveInteger(meta.bundleBuildNumber),
                    bundleLastCheckUtc: normalizeIsoTimestamp(meta.bundleLastCheckUtc),
                    bundleLastApplyUtc: normalizeIsoTimestamp(meta.bundleLastApplyUtc),
                };
                const key = `${instance.id}`.toLowerCase();
                const existing = instancesById.get(key);
                if (!existing) {
                    instancesById.set(key, instance);
                    continue;
                }
                instancesById.set(key, pickPreferredInstance(existing, instance));
            } catch {
                // Ignore broken instance metadata.
            }
        }

        for (const steamInstance of await this.detectSteamInstances()) {
            const key = `${steamInstance.id}`.toLowerCase();
            const existing = instancesById.get(key);
            if (!existing) {
                instancesById.set(key, steamInstance);
                continue;
            }
            instancesById.set(key, pickPreferredInstance(existing, steamInstance));
        }

        return Array.from(instancesById.values()).sort((a, b) => `${a.profileName || a.name}`.localeCompare(`${b.profileName || b.name}`));
    }

    getInstallState(): InstanceInstallState {
        return this.installState;
    }

    onInstallStateChanged(listener: (state: InstanceInstallState) => void): () => void {
        this.installEvents.on(INSTALL_STATE_EVENT, listener);
        return () => {
            this.installEvents.off(INSTALL_STATE_EVENT, listener);
        };
    }

    async installOfficial(input: InstallOfficialInput): Promise<InstalledInstance> {
        const release = await this.installMutex.acquire();
        try {
        if (this.installState.status !== "idle" && this.installState.status !== "done" && this.installState.status !== "error") {
            throw new Error("Another official instance install is already running.");
        }

        const gameVersions = await this.manifests.getGameVersions(true);
        const target = (gameVersions.versions || []).find(item => item.id === input.versionId);
        if (!target) {
            throw new Error(`Official version '${input.versionId}' not found in game-versions manifest.`);
        }

        const profileName = normalizeProfileName(input.profileName);
        if (!profileName) {
            throw new Error("Profile name is required.");
        }

        const trustedNow = await this.trustedTime.getTrustedNow(false);
        const unlockStatus = resolveUnlockStatus(target.unlockAtUtc, trustedNow.trustedNowMs, trustedNow.available);
        if (unlockStatus.locked) {
            throw buildUnlockError(target.displayName || target.id, unlockStatus);
        }

        const downloadUrl = `${target.directDownloadUrl || ""}`.trim();
        if (!downloadUrl) {
            throw new Error(`Version '${target.id}' does not provide directDownloadUrl. Manifest-only mode requires it.`);
        }

        const instancesRoot = `${input.installPath ?? ""}`.trim() || this.settings.getInstancesRoot();
        await ensureDir(instancesRoot);
        const destination = await this.allocateProfileDestination(instancesRoot, profileName);
        const profileId = randomUUID();
        const tempRoot = path.join(app.getPath("userData"), "tmp", "official-downloads");
        this.setInstallState({
            status: "preparing",
            versionId: target.id,
            profileName,
            targetPath: destination,
            progressPercent: 0,
            downloadedBytes: 0,
        });

        try {
            await ensureDir(destination);
            await this.downloader.downloadAndExtractZip({
                url: downloadUrl,
                destination,
                sha256: target.directDownloadSha256,
                tmpRoot: tempRoot,
                onStageChange: stage => {
                    if (stage === "downloading") {
                        this.setInstallState({
                            status: "downloading",
                            versionId: target.id,
                            profileName,
                            targetPath: destination,
                            progressPercent: 0,
                        });
                        return;
                    }
                    this.setInstallState({
                        status: "extracting",
                        versionId: target.id,
                        profileName,
                        targetPath: destination,
                        progressPercent: 100,
                    });
                },
                onProgress: progress => {
                    this.setInstallState({
                        status: "downloading",
                        versionId: target.id,
                        profileName,
                        targetPath: destination,
                        progressPercent: progress.progressPercent,
                        downloadedBytes: progress.downloadedBytes,
                        totalBytes: progress.totalBytes,
                    });
                },
            });

            if (!(await this.isValidGameFolder(destination))) {
                throw new Error(`Downloaded archive for '${target.id}' does not contain a valid BAPBAP root.`);
            }

            this.setInstallState({
                status: "writingMetadata",
                versionId: target.id,
                profileName,
                targetPath: destination,
                progressPercent: 100,
            });

            await this.melonLoader.ensureInstalled(destination);

            const manifestBase = this.settings.getManifestUrl();
            const imageUrl = target.imagePath ? this.manifests.resolveManifestPath(target.imagePath, manifestBase) : undefined;
            const now = new Date().toISOString();
            const instance: InstalledInstance = {
                id: profileId,
                profileName,
                versionId: target.id,
                gameVersion: target.gameVersion || target.id,
                name: profileName,
                version: target.gameVersion || target.id,
                track: target.track || "bapbap",
                path: destination,
                imageUrl,
                officialManaged: true,
                officialTrack: target.track || "bapbap",
                lastUpdatedUtc: now,
                melonLoaderFirstRunPending: true,
                instanceSource: "official-managed",
            };

            const instanceMeta: InstanceMetadata = {
                ...instance,
                source: "official-manifest",
                contentStatePath: path.join(destination, CONTENT_STATE_FILE),
            };
            await writeJson(path.join(destination, INSTANCE_META_FILE), instanceMeta, { spaces: 2 });
            await this.ensureContentState(destination);

            this.setInstallState({
                status: "done",
                versionId: target.id,
                profileName,
                targetPath: destination,
                progressPercent: 100,
            });

            return instance;
        } catch (error) {
            await remove(destination).catch(() => {});
            this.setInstallState({
                status: "error",
                versionId: target.id,
                profileName,
                targetPath: destination,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
        } finally {
            release();
        }
    }

    async verify(instanceId: string): Promise<boolean> {
        const list = await this.list();
        const instance = list.find(item => item.id === instanceId);
        if (!instance) {
            return false;
        }
        return this.isValidGameFolder(instance.path);
    }

    async hasRelativeFile(instanceId: string, relativePath: string): Promise<boolean> {
        const normalizedRelativePath = String(relativePath || "")
            .trim()
            .replace(/[\\/]+/g, path.sep);
        const safeRelativePath = path.normalize(normalizedRelativePath);
        if (!safeRelativePath || path.isAbsolute(safeRelativePath)) {
            return false;
        }
        if (safeRelativePath.startsWith("..") || safeRelativePath.includes(`..${path.sep}`)) {
            return false;
        }

        const instance = await this.getById(instanceId).catch(() => null);
        if (!instance) {
            return false;
        }

        const absoluteTarget = path.join(instance.path, safeRelativePath);
        return pathExists(absoluteTarget);
    }

    async installCustomMod(instanceId: string, sourceFilePath: string, overwrite = false): Promise<CustomModInstallResult> {
        const instance = await this.getById(instanceId);
        await this.assertMutable(instance);
        const normalizedSourcePath = path.resolve(String(sourceFilePath || ""));
        const sourceExtension = path.extname(normalizedSourcePath).toLowerCase();
        if (sourceExtension !== ".dll") {
            throw new Error("Only .dll files can be installed as custom mods.");
        }
        if (!(await pathExists(normalizedSourcePath))) {
            throw new Error("The selected DLL does not exist anymore.");
        }

        const modsDirectory = path.join(instance.path, "Mods");
        const destinationPath = path.join(modsDirectory, path.basename(normalizedSourcePath));
        const destinationExists = await pathExists(destinationPath);
        if (destinationExists && !overwrite) {
            throw new Error("A mod with the same file name already exists in this profile.");
        }

        await ensureDir(modsDirectory);
        await fs.promises.copyFile(normalizedSourcePath, destinationPath);

        return {
            status: "installed",
            fileName: path.basename(destinationPath),
            destinationPath,
            overwritten: destinationExists,
        };
    }

    async remove(instanceId: string, options: { bypassOfficialManagedCheck?: boolean } = {}): Promise<void> {
        const list = await this.list();
        const instance = list.find(item => item.id === instanceId);
        if (!instance) {
            return;
        }
        if (!options.bypassOfficialManagedCheck) {
            if (!instance.officialManaged || instance.instanceSource !== "official-managed") {
                throw new Error("Only launcher-managed installs can be deleted from the launcher.");
            }
        }
        if (!this.isManagedInstancePath(instance.path)) {
            throw new Error("Refusing to delete an install outside the managed instances folder.");
        }
        await remove(instance.path);
        if (this.settings.getAll().launchDefaultProfileId === instanceId) {
            this.settings.set("launchDefaultProfileId", null);
        }
    }

    async getById(instanceId: string): Promise<InstalledInstance> {
        const list = await this.list();
        const instance = list.find(item => item.id === instanceId);
        if (!instance) {
            throw new Error(`Instance '${instanceId}' not found.`);
        }
        return instance;
    }

    async markMelonLoaderFirstRunCompleted(instanceId: string): Promise<void> {
        const instance = await this.getById(instanceId).catch(() => null);
        if (!instance) {
            return;
        }
        const metaPath = path.join(instance.path, INSTANCE_META_FILE);
        if (!(await pathExists(metaPath))) {
            return;
        }
        const meta = ((await readJson(metaPath).catch(() => null)) as Partial<InstanceMetadata> | null);
        if (!meta || meta.melonLoaderFirstRunPending !== true) {
            return;
        }
        await writeJson(
            metaPath,
            {
                ...meta,
                melonLoaderFirstRunPending: false,
            },
            { spaces: 2 }
        );
    }

    async getContentStatePath(instancePath: string): Promise<string> {
        await this.ensureContentState(instancePath);
        return path.join(instancePath, CONTENT_STATE_FILE);
    }

    async rename(instanceId: string, name: string): Promise<void> {
        const instance = await this.getById(instanceId);
        const nextName = normalizeProfileName(name);
        if (!nextName) {
            throw new Error("Profile name is required.");
        }
        const metaPath = path.join(instance.path, INSTANCE_META_FILE);
        if (!(await pathExists(metaPath))) {
            throw new Error("This instance has no editable metadata.");
        }
        const meta = (await readJson(metaPath).catch(() => null)) as Partial<InstanceMetadata> | null;
        if (!meta) {
            throw new Error("Could not read instance metadata.");
        }
        // Folder stays put — renaming only the display name avoids the breakage
        // of moving a live install path that other state may reference.
        await writeJson(metaPath, { ...meta, profileName: nextName, name: nextName }, { spaces: 2 });
    }

    async readContentState(instancePath: string): Promise<Record<string, any>> {
        const statePath = await this.getContentStatePath(instancePath);
        try {
            return (await readJson(statePath)) as Record<string, any>;
        } catch {
            return {};
        }
    }

    async writeContentState(instancePath: string, state: Record<string, any>): Promise<void> {
        const statePath = await this.getContentStatePath(instancePath);
        await writeJsonAtomic(statePath, state);
    }

    async getModSetStatePath(instancePath: string): Promise<string> {
        await this.ensureModSetState(instancePath);
        return path.join(instancePath, MOD_SET_STATE_FILE);
    }

    async readModSetState(instancePath: string): Promise<ContentModSetState> {
        const statePath = await this.getModSetStatePath(instancePath);
        try {
            const raw = (await readJson(statePath)) as Partial<ContentModSetState>;
            return normalizeModSetState(raw, await this.readContentState(instancePath));
        } catch {
            // Never overwrite on a failed read: a transient lock or partial
            // file would otherwise wipe the user's mod sets to default.
            return createDefaultModSetState(await this.readContentState(instancePath));
        }
    }

    async writeModSetState(instancePath: string, state: ContentModSetState): Promise<void> {
        const statePath = await this.getModSetStatePath(instancePath);
        await writeJsonAtomic(statePath, normalizeModSetState(state, await this.readContentState(instancePath)));
    }

    private async ensureContentState(instancePath: string): Promise<void> {
        const statePath = path.join(instancePath, CONTENT_STATE_FILE);
        if (!(await pathExists(statePath))) {
            await writeJson(statePath, {}, { spaces: 2 });
        }
    }

    private async ensureModSetState(instancePath: string): Promise<void> {
        const statePath = path.join(instancePath, MOD_SET_STATE_FILE);
        if (await pathExists(statePath)) {
            return;
        }
        await writeJson(statePath, createDefaultModSetState(await this.readContentState(instancePath)), { spaces: 2 });
    }

    private async isValidGameFolder(folder: string): Promise<boolean> {
        const index = await this.manifests.getIndex().catch(() => null);
        const exeName = index?.game?.executable || "bapbap.exe";
        const dataFolder = index?.game?.dataFolder || "BAPBAP_Data";
        return (await pathExists(path.join(folder, exeName))) && (await pathExists(path.join(folder, dataFolder)));
    }

    private async allocateProfileDestination(instancesRoot: string, profileName: string): Promise<string> {
        const baseFolderName = sanitizeFolderName(profileName) || "profile";
        let attempt = 1;
        while (true) {
            const folderName = attempt === 1 ? baseFolderName : `${baseFolderName}-${attempt}`;
            const destination = path.join(instancesRoot, folderName);
            if (!(await pathExists(destination))) {
                return destination;
            }
            attempt += 1;
        }
    }

    private isManagedInstancePath(instancePath: string): boolean {
        const instancesRoot = path.resolve(this.settings.getInstancesRoot());
        const candidatePath = path.resolve(instancePath);
        const relativePath = path.relative(instancesRoot, candidatePath);
        return relativePath.length > 0 && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
    }

    /**
     * Refuse mod-mutating operations on Bundle Instances. Bundle Instances are
     * launcher-managed, auto-updating, and locked — see
     * docs/bundle-instance/BUNDLE_INSTANCE_MASTER_SPEC.md.
     *
     * Throws an Error with `.code = "BUNDLE_INSTANCE_LOCKED"` so callers and
     * IPC error wrappers can branch on the code rather than the string.
     *
     * Used by installCustomMod and (via the future ContentService /
     * ConfigEditorService refactor) any other path that would write into a
     * Bundle's mod / config tree.
     *
     * Note: `remove()` deliberately does NOT call this — uninstalling a Bundle
     * is the documented recovery path.
     */
    async assertMutable(instance: InstalledInstance | null | undefined): Promise<void> {
        if (instance?.instanceType === "bundle") {
            const error = new Error(
                `Cannot modify mods on a Bundle Instance ("${instance.profileName ?? instance.id}"). ` +
                "Bundle Instances are managed by the launcher and update automatically.",
            );
            (error as Error & { code?: string }).code = "BUNDLE_INSTANCE_LOCKED";
            throw error;
        }
    }

    private setInstallState(state: InstanceInstallState): void {
        this.installState = state;
        this.installEvents.emit(INSTALL_STATE_EVENT, state);
    }

    /**
     * Import instances from a V3/BAPBAPLauncher instances root directory.
     * Scans sourceDir for folders containing .bapbap-instance.json and copies
     * them into V4's instances root. Already-existing folders are skipped.
     */
    async migrateFromV3(sourceDir: string): Promise<{ imported: number; skipped: number; errors: string[] }> {
        const result = { imported: 0, skipped: 0, errors: [] as string[] };
        const targetRoot = this.settings.getInstancesRoot();
        if (!sourceDir || !(await pathExists(sourceDir))) {
            result.errors.push(`Source directory does not exist: ${sourceDir}`);
            return result;
        }
        const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const sourceFolder = path.join(sourceDir, entry.name);
            const metaPath = path.join(sourceFolder, INSTANCE_META_FILE);
            if (!(await pathExists(metaPath))) continue;
            try {
                const meta = (await readJson(metaPath)) as Partial<InstanceMetadata>;
                const profileName = `${meta.profileName || meta.name || entry.name}`.trim();
                const destination = await this.allocateProfileDestination(targetRoot, profileName);
                if (destination === sourceFolder) {
                    result.skipped++;
                    continue;
                }
                await fs.promises.cp(sourceFolder, destination, { recursive: true, force: false });
                result.imported++;
            } catch (error) {
                result.errors.push(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return result;
    }

    private async detectSteamInstances(): Promise<InstalledInstance[]> {
        const [index, gameVersions] = await Promise.all([
            this.manifests.getIndex().catch(() => null),
            this.manifests.getGameVersions().catch(() => null),
        ]);
        const steamAppId = `${index?.game?.steam?.appId || gameVersions?.steamAppId || ""}`.trim();
        if (!steamAppId) {
            return [];
        }

        const steamLibraries = await this.resolveSteamLibraryPaths();
        if (!steamLibraries.length) {
            return [];
        }

        const instances: InstalledInstance[] = [];
        const seenPaths = new Set<string>();

        for (const libraryPath of steamLibraries) {
            const appManifestPath = path.join(libraryPath, "steamapps", `appmanifest_${steamAppId}.acf`);
            if (!(await pathExists(appManifestPath))) {
                continue;
            }

            const appManifestText = await fs.promises.readFile(appManifestPath, "utf8").catch(() => "");
            if (!appManifestText) {
                continue;
            }

            const installDir = parseQuotedValue(appManifestText, "installdir");
            if (!installDir) {
                continue;
            }
            const buildId = parseQuotedValue(appManifestText, "buildid");
            const candidatePath = path.join(libraryPath, "steamapps", "common", installDir);
            const normalizedKey = candidatePath.toLowerCase();
            if (seenPaths.has(normalizedKey) || !(await this.isValidGameFolder(candidatePath))) {
                continue;
            }
            seenPaths.add(normalizedKey);

            const profileName = sanitizeSteamProfileName(installDir);
            instances.push({
                id: `steam:${normalizedKey}`,
                profileName,
                versionId: "steam-library",
                gameVersion: buildId ? `Steam build ${buildId}` : "Steam library",
                name: profileName,
                version: buildId ? `Steam build ${buildId}` : "Steam library",
                track: "steam",
                path: candidatePath,
                officialManaged: false,
                officialTrack: undefined,
                lastUpdatedUtc: new Date(0).toISOString(),
                melonLoaderFirstRunPending: false,
                instanceSource: "steam-library",
                compatibilityWarning: STEAM_COMPATIBILITY_WARNING,
            });
        }

        return instances;
    }

    private async resolveSteamLibraryPaths(): Promise<string[]> {
        const results = new Set<string>();
        const steamRoot = await this.resolveSteamRootPath();
        if (!steamRoot) {
            return [];
        }
        results.add(path.normalize(steamRoot));

        const libraryFoldersPath = path.join(steamRoot, "steamapps", "libraryfolders.vdf");
        if (await pathExists(libraryFoldersPath)) {
            const raw = await fs.promises.readFile(libraryFoldersPath, "utf8").catch(() => "");
            for (const libraryPath of parseSteamLibraryPaths(raw)) {
                results.add(path.normalize(libraryPath));
            }
        }

        return Array.from(results);
    }

    async getSteamPersonaName(): Promise<string | null> {
        const steamRoot = await this.resolveSteamRootPath();
        if (!steamRoot) {
            return null;
        }
        const loginUsersPath = path.join(steamRoot, "config", "loginusers.vdf");
        if (!(await pathExists(loginUsersPath))) {
            return null;
        }
        const raw = await fs.promises.readFile(loginUsersPath, "utf8").catch(() => "");
        return parseSteamPersonaName(raw);
    }

    private async resolveSteamRootPath(): Promise<string | null> {
        const now = Date.now();
        if (this.steamRootCache && now < this.steamRootCache.expiresAt) {
            return this.steamRootCache.value;
        }

        const registryLookups = [
            { key: "HKCU\\Software\\Valve\\Steam", value: "SteamPath" },
            { key: "HKLM\\Software\\WOW6432Node\\Valve\\Steam", value: "InstallPath" },
            { key: "HKLM\\Software\\Valve\\Steam", value: "InstallPath" },
        ];

        for (const lookup of registryLookups) {
            const value = await readRegistryValue(lookup.key, lookup.value);
            if (value && await pathExists(value)) {
                this.steamRootCache = {
                    value,
                    expiresAt: now + InstanceService.STEAM_ROOT_CACHE_MS,
                };
                return value;
            }
        }

        const fallbacks = [
            "C:\\Program Files (x86)\\Steam",
            "C:\\Program Files\\Steam",
        ];
        for (const fallback of fallbacks) {
            if (await pathExists(fallback)) {
                this.steamRootCache = {
                    value: fallback,
                    expiresAt: now + InstanceService.STEAM_ROOT_CACHE_MS,
                };
                return fallback;
            }
        }

        this.steamRootCache = {
            value: null,
            expiresAt: now + InstanceService.STEAM_ROOT_CACHE_MS,
        };
        return null;
    }
}

function buildUnlockError(label: string, unlockStatus: ReturnType<typeof resolveUnlockStatus>): Error {
    if (unlockStatus.reason === "waiting-time-source") {
        return new Error(`'${label}' is still locked. Waiting for trusted time source.`);
    }
    return new Error(`'${label}' is locked until ${unlockStatus.unlockAtUtc}.`);
}

function normalizeProfileName(value: string): string {
    return `${value || ""}`.trim().replace(/\s+/g, " ");
}

function sanitizeFolderName(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function pickPreferredInstance(a: InstalledInstance, b: InstalledInstance): InstalledInstance {
    if (a.officialManaged !== b.officialManaged) {
        return b.officialManaged ? b : a;
    }
    const aTs = Date.parse(a.lastUpdatedUtc || "");
    const bTs = Date.parse(b.lastUpdatedUtc || "");
    if (Number.isFinite(aTs) && Number.isFinite(bTs) && aTs !== bTs) {
        return bTs > aTs ? b : a;
    }
    return a.path.length <= b.path.length ? a : b;
}

function createDefaultModSetState(contentState: Record<string, any>): ContentModSetState {
    const now = new Date().toISOString();
    return {
        activeModSetId: DEFAULT_MOD_SET_ID,
        sets: [
            {
                id: DEFAULT_MOD_SET_ID,
                name: DEFAULT_MOD_SET_NAME,
                updatedAtUtc: now,
                packageStates: toModSetPackageStates(contentState),
            },
        ],
    };
}

function normalizeModSetState(raw: Partial<ContentModSetState> | null | undefined, contentState: Record<string, any>): ContentModSetState {
    const fallback = createDefaultModSetState(contentState);
    const sets = (raw?.sets || [])
        .map(set => normalizeModSet(set))
        .filter(Boolean) as ContentModSet[];
    if (!sets.length) {
        return fallback;
    }

    const activeModSetId = `${raw?.activeModSetId || ""}`.trim();
    if (!sets.some(set => set.id === activeModSetId)) {
        return {
            activeModSetId: sets[0].id,
            sets,
        };
    }

    return {
        activeModSetId,
        sets,
    };
}

function normalizeModSet(input: Partial<ContentModSet> | null | undefined): ContentModSet | null {
    if (!input?.id) {
        return null;
    }
    const packageStates: Record<string, ContentModSetPackageState> = {};
    for (const [key, value] of Object.entries(input.packageStates || {})) {
        const typed = value as Partial<ContentModSetPackageState> | undefined;
        const channelId = `${typed?.channelId || key.split("::")[0] || "release"}`.trim() || "release";
        const packageId = `${typed?.packageId || key.split("::")[1] || key}`.trim();
        if (!packageId) {
            continue;
        }
        packageStates[`${channelId.toLowerCase()}::${packageId.toLowerCase()}`] = {
            channelId,
            packageId,
            version: typed?.version?.trim(),
            enabled: typed?.enabled !== false,
        };
    }
    return {
        id: `${input.id}`.trim(),
        name: sanitizeModSetName(input.name),
        updatedAtUtc: `${input.updatedAtUtc || new Date().toISOString()}`,
        packageStates,
    };
}

function toModSetPackageStates(contentState: Record<string, any>): Record<string, ContentModSetPackageState> {
    const snapshot: Record<string, ContentModSetPackageState> = {};
    for (const [key, value] of Object.entries(contentState || {})) {
        const typed = value as Partial<{ channelId: string; packageId: string; version?: string; enabled: boolean }>;
        const channelId = `${typed.channelId || key.split("::")[0] || "release"}`.trim() || "release";
        const packageId = `${typed.packageId || key.split("::")[1] || key}`.trim();
        if (!packageId) {
            continue;
        }
        snapshot[`${channelId.toLowerCase()}::${packageId.toLowerCase()}`] = {
            channelId,
            packageId,
            version: typed.version?.trim(),
            enabled: typed.enabled !== false,
        };
    }
    return snapshot;
}

function sanitizeModSetName(value: string | null | undefined): string {
    const trimmed = `${value || ""}`.trim().replace(/\s+/g, " ");
    return trimmed || DEFAULT_MOD_SET_NAME;
}

function sanitizeSteamProfileName(value: string): string {
    const trimmed = `${value || ""}`.trim();
    if (!trimmed) {
        return "Steam install";
    }
    return trimmed.toLowerCase().includes("steam") ? trimmed : `${trimmed} (Steam)`;
}

function parseQuotedValue(source: string, key: string): string | null {
    const match = source.match(new RegExp(`"${escapeRegExp(key)}"\\s+"([^"]+)"`, "i"));
    return match?.[1] ? match[1].replaceAll("\\\\", "\\") : null;
}

function parseSteamLibraryPaths(source: string): string[] {
    const matches = source.matchAll(/"path"\s+"([^"]+)"/gi);
    const values = new Set<string>();
    for (const match of matches) {
        const resolved = match[1]?.replaceAll("\\\\", "\\");
        if (resolved) {
            values.add(resolved);
        }
    }
    return Array.from(values);
}

// loginusers.vdf holds one flat block per Steam account keyed by 17-digit
// SteamID64. Prefer the account flagged MostRecent (the one that's actually
// signed in), then fall back to the newest Timestamp, then the first entry.
function parseSteamPersonaName(source: string): string | null {
    let firstPersona: string | null = null;
    let mostRecentPersona: string | null = null;
    let newestPersona: string | null = null;
    let newestTimestamp = -1;

    for (const match of source.matchAll(/"\d{17}"\s*\{([^}]*)\}/g)) {
        const body = match[1] ?? "";
        const persona = parseQuotedValue(body, "PersonaName");
        if (!persona) {
            continue;
        }
        if (firstPersona === null) {
            firstPersona = persona;
        }
        if (parseQuotedValue(body, "MostRecent") === "1") {
            mostRecentPersona = persona;
        }
        const timestamp = Number(parseQuotedValue(body, "Timestamp") ?? "0");
        if (Number.isFinite(timestamp) && timestamp > newestTimestamp) {
            newestTimestamp = timestamp;
            newestPersona = persona;
        }
    }

    return mostRecentPersona ?? newestPersona ?? firstPersona;
}

async function readRegistryValue(key: string, valueName: string): Promise<string | null> {
    try {
        const { stdout } = await execFileAsync("reg", ["query", key, "/v", valueName], { windowsHide: true });
        const match = stdout.match(new RegExp(`${escapeRegExp(valueName)}\\s+REG_\\w+\\s+(.+)$`, "im"));
        return match?.[1]?.trim() || null;
    } catch {
        return null;
    }
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const VALID_INSTANCE_TYPES: ReadonlyArray<InstanceType> = ["standard", "creator-kit", "bundle"];

/**
 * Reject unknown instanceType values from on-disk metadata. Older
 * .bapbap-instance.json files predate the field entirely, so undefined is
 * the documented default (treated as "standard" by callers — see
 * docs/bundle-instance/BUNDLE_INSTANCE_MASTER_SPEC.md §3.1).
 */
function normalizeInstanceType(value: unknown): InstanceType | undefined {
    if (typeof value !== "string") {
        return undefined;
    }
    return (VALID_INSTANCE_TYPES as ReadonlyArray<string>).includes(value)
        ? (value as InstanceType)
        : undefined;
}

function normalizeOptionalString(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
}

function normalizePositiveInteger(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
        return undefined;
    }
    return value;
}

function normalizeIsoTimestamp(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
        return undefined;
    }
    return value;
}
