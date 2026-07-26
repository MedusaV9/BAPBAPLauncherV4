import { EventEmitter } from "node:events";
import path from "node:path";
import { spawn } from "node:child_process";
import electron from "electron";
import fsExtra from "fs-extra";
import type { LauncherUpdateAsset, LauncherUpdateRelease, LauncherUpdatesManifest } from "../../../shared/manifest";
import type {
    LauncherInstallUpdateResult,
    LauncherUpdateCheckResult,
    LauncherUpdaterState,
    LauncherUpdaterStatus,
} from "../../../shared/ipc";
import type { DownloadFileProgress } from "../vendored/archive-download.service";
import { ArchiveDownloadService } from "../vendored/archive-download.service";
import { ManifestClient } from "../vendored/manifest-client";
import { SettingsStoreService } from "./settings-store";
import { verifySha256 } from "../../utils/file-hash";

const { app } = electron;
const { ensureDir, pathExists, readJson, remove, writeJson } = fsExtra;

const READY_INSTALLER_FILE = "launcher-update-ready.json";

type ReadyInstaller = {
    version: string;
    filePath: string;
    expectedSha256: string;
    sourceUrl: string;
    downloadedAtUtc: string;
};

export class LauncherUpdaterService {
    private readonly manifests: ManifestClient;
    private readonly downloader: ArchiveDownloadService;
    private readonly settings: SettingsStoreService;
    private readonly emitter = new EventEmitter();
    private readonly readyInstallerStatePath: string;
    private state: LauncherUpdaterState;
    private activeMutation: Promise<unknown> | null = null;
    private readyInstaller: ReadyInstaller | null = null;
    private lastCheckResult: LauncherUpdateCheckResult | null = null;

    constructor(manifests: ManifestClient, downloader: ArchiveDownloadService, settings: SettingsStoreService) {
        this.manifests = manifests;
        this.downloader = downloader;
        this.settings = settings;
        this.readyInstallerStatePath = path.join(app.getPath("userData"), READY_INSTALLER_FILE);
        this.state = createInitialState(app.getVersion());
    }

    async initialize(): Promise<LauncherInstallUpdateResult | null> {
        await this.restoreReadyInstaller();
        if (!this.readyInstaller) {
            return null;
        }

        const pendingVersion = this.readyInstaller.version;
        if (compareVersions(pendingVersion, app.getVersion()) <= 0) {
            await this.clearReadyInstaller(true);
            return null;
        }

        this.applyReadyInstallerState(pendingVersion);
        if (!this.settings.getAll().launcherAutoInstallOnNextStart) {
            return null;
        }

        try {
            return await this.installReadyInstaller(pendingVersion);
        } catch (error) {
            const message = toErrorMessage(error);
            this.updateState({
                ...this.state,
                status: "error",
                currentVersion: app.getVersion(),
                latestVersion: pendingVersion,
                updateAvailable: true,
                error: message,
                reason: "Downloaded update could not be started automatically. You can try again from Settings.",
            });
            return null;
        }
    }

    getState(): LauncherUpdaterState {
        return { ...this.state };
    }

    onStateChanged(listener: (state: LauncherUpdaterState) => void): () => void {
        this.emitter.on("state", listener);
        return () => {
            this.emitter.off("state", listener);
        };
    }

    async check(force = false, options: { suppressAutoDownload?: boolean } = {}): Promise<LauncherUpdateCheckResult> {
        if (this.isMutationBusy()) {
            return this.lastCheckResult ?? this.stateToCheckResult();
        }

        const currentVersion = app.getVersion();
        this.updateState({
            ...this.state,
            status: "checking",
            currentVersion,
            error: undefined,
        });

        try {
            const checkedAtUtc = new Date().toISOString();
            const updatesManifest = await this.manifests.getLauncherUpdates(force);
            if (!updatesManifest) {
                const result: LauncherUpdateCheckResult = {
                    configured: false,
                    currentVersion,
                    updateAvailable: false,
                    reason: "Manifest index does not define launcher updates path.",
                    checkedAtUtc,
                };
                this.lastCheckResult = result;
                this.updateState({
                    ...createStateFromCheck(result),
                    status: "error",
                    error: result.reason,
                });
                await this.invalidateReadyInstallerIfStale(null);
                return result;
            }

            if (process.platform !== "win32") {
                // Linux support (AppImage / .deb) — fully cross-platform now
                // Windows-only parts (NSIS, rcedit, taskkill spawn) are skipped here
                const result: LauncherUpdateCheckResult = {
                    configured: true,
                    currentVersion,
                    updateAvailable: false,
                    channel: (updatesManifest.channel || "stable").toLowerCase(),
                    reason: "Launcher updater supports Windows + Linux (AppImage). Windows only for now.",
                    checkedAtUtc,
                };
                this.lastCheckResult = result;
                this.updateState({
                    ...createStateFromCheck(result),
                    status: "upToDate",
                    error: result.reason,
                });
                await this.invalidateReadyInstallerIfStale(null);
                return result;
            }

            const channel = (updatesManifest.channel || "stable").toLowerCase();
            const releases = (updatesManifest.releases || [])
                .filter(release => {
                    const releaseChannel = (release.channel || channel).toLowerCase();
                    return releaseChannel === channel;
                })
                .sort((a, b) => compareVersionsDescending(a.version, b.version));

            let nextRelease: LauncherUpdateRelease | null = null;
            for (const release of releases) {
                if (!resolveWindowsAsset(release)) {
                    continue;
                }
                if (compareVersions(release.version, currentVersion) > 0) {
                    nextRelease = release;
                    break;
                }
            }

            const result: LauncherUpdateCheckResult = nextRelease
                ? {
                      configured: true,
                      currentVersion,
                      updateAvailable: true,
                      latestVersion: nextRelease.version,
                      notes: nextRelease.notes,
                      publishedAtUtc: nextRelease.publishedAtUtc,
                      channel,
                      checkedAtUtc,
                  }
                : {
                      configured: true,
                      currentVersion,
                      updateAvailable: false,
                      channel,
                      reason: "Launcher is up to date.",
                      checkedAtUtc,
                  };

            this.lastCheckResult = result;
            await this.invalidateReadyInstallerIfStale(result.latestVersion ?? null);
            const preservedStatus = await this.resolvePreservedStatus(result.latestVersion);
            this.updateState({
                ...createStateFromCheck(result),
                status: preservedStatus ?? (result.updateAvailable ? "available" : "upToDate"),
                progressPercent: preservedStatus === "readyToInstall" ? 100 : undefined,
                error: undefined,
            });
            if (!options.suppressAutoDownload) {
                this.maybeStartAutoDownload(result, force);
            }
            return result;
        } catch (error) {
            const message = toErrorMessage(error);
            this.updateState({
                ...this.state,
                status: "error",
                currentVersion,
                checkedAtUtc: new Date().toISOString(),
                error: message,
                reason: message,
            });
            throw error;
        }
    }

    async downloadAndInstall(force = false): Promise<LauncherInstallUpdateResult> {
        return this.startMutation(() => this.performDownloadAndInstall(force));
    }

    private async performDownloadAndInstall(force: boolean): Promise<LauncherInstallUpdateResult> {
        const downloaded = await this.downloadLatestUpdate(force);
        return this.installReadyInstaller(downloaded.version);
    }

    private async installReadyInstaller(version: string): Promise<LauncherInstallUpdateResult> {
        if (!this.readyInstaller || this.readyInstaller.version !== version) {
            throw this.failWithState(`Downloaded installer for '${version}' is no longer available.`);
        }
        const installerFilePath = this.readyInstaller.filePath;
        if (!(await pathExists(installerFilePath))) {
            await this.clearReadyInstaller(false);
            throw this.failWithState(`Downloaded installer for '${version}' was not found on disk.`);
        }

        // SHA-256 integrity verification before execution
        const expectedHash = this.readyInstaller.expectedSha256;
        if (expectedHash) {
            const hashValid = await verifySha256(installerFilePath, expectedHash);
            if (!hashValid) {
                await fsExtra.unlink(installerFilePath).catch(() => {});
                await this.clearReadyInstaller(false);
                throw this.failWithState(
                    `Installer integrity check failed for '${version}': SHA-256 mismatch. The file has been deleted.`
                );
            }
        }

        this.updateState({
            ...this.state,
            status: "installing",
            latestVersion: version,
            progressPercent: 100,
            error: undefined,
            reason: "Starting installer...",
        });

        try {
            const child = spawn(installerFilePath, [], {
                detached: true,
                stdio: "ignore",
            });
            child.unref();
        } catch (error) {
            throw this.failWithState(`Installer could not be started: ${toErrorMessage(error)}`);
        }

        await this.clearReadyInstaller(false);

        const result: LauncherInstallUpdateResult = {
            started: true,
            version,
            filePath: installerFilePath,
        };

        setTimeout(() => {
            app.quit();
        }, 120);

        return result;
    }

    private async resolveReleaseAsset(version: string): Promise<{
        manifest: LauncherUpdatesManifest;
        release: LauncherUpdateRelease;
        asset: LauncherUpdateAsset | null;
    }> {
        const updatesManifest = await this.manifests.getLauncherUpdates(true);
        if (!updatesManifest) {
            throw this.failWithState("Launcher updates manifest could not be loaded.");
        }

        const channel = (updatesManifest.channel || "stable").toLowerCase();
        const targetRelease = (updatesManifest.releases || []).find(
            release => release.version === version && (release.channel || channel).toLowerCase() === channel
        );
        if (!targetRelease) {
            throw this.failWithState(`Release '${version}' not found in launcher updates manifest.`);
        }

        return {
            manifest: updatesManifest,
            release: targetRelease,
            asset: resolveWindowsAsset(targetRelease),
        };
    }

    private handleDownloadProgress(progress: DownloadFileProgress, gate: { lastPercent: number; lastEmitAt: number }): void {
        const now = Date.now();
        const nextPercent = typeof progress.progressPercent === "number" ? clampPercent(progress.progressPercent) : undefined;
        const shouldEmit =
            nextPercent === undefined ||
            nextPercent >= 100 ||
            nextPercent !== gate.lastPercent ||
            now - gate.lastEmitAt >= 140;
        if (!shouldEmit) {
            return;
        }

        gate.lastEmitAt = now;
        if (typeof nextPercent === "number") {
            gate.lastPercent = nextPercent;
        }

        this.updateState({
            ...this.state,
            status: "downloading",
            progressPercent: nextPercent,
            downloadedBytes: progress.downloadedBytes,
            totalBytes: progress.totalBytes,
            error: undefined,
        });
    }

    private async resolvePreservedStatus(latestVersion: string | undefined): Promise<LauncherUpdaterStatus | null> {
        if (!latestVersion) {
            return null;
        }
        if (!(await this.hasReadyInstaller(latestVersion))) {
            return null;
        }
        return this.state.status === "installing" ? "installing" : "readyToInstall";
    }

    private async hasReadyInstaller(version: string): Promise<boolean> {
        if (!this.readyInstaller || this.readyInstaller.version !== version) {
            return false;
        }
        if (!(await pathExists(this.readyInstaller.filePath))) {
            await this.clearReadyInstaller(false);
            return false;
        }
        return true;
    }

    private async invalidateReadyInstallerIfStale(latestVersion: string | null): Promise<void> {
        if (!this.readyInstaller) {
            return;
        }
        if (latestVersion && this.readyInstaller.version === latestVersion) {
            return;
        }
        await this.clearReadyInstaller(true);
    }

    private stateToCheckResult(): LauncherUpdateCheckResult {
        return {
            configured: this.state.configured,
            currentVersion: this.state.currentVersion,
            updateAvailable: this.state.updateAvailable,
            latestVersion: this.state.latestVersion,
            notes: this.state.notes,
            publishedAtUtc: this.state.publishedAtUtc,
            channel: this.state.channel,
            reason: this.state.reason,
            checkedAtUtc: this.state.checkedAtUtc || new Date().toISOString(),
        };
    }

    private failWithState(message: string): Error {
        this.updateState({
            ...this.state,
            status: "error",
            error: message,
            reason: message,
        });
        return new Error(message);
    }

    private isMutationBusy(): boolean {
        return this.state.status === "downloading" || this.state.status === "readyToInstall" || this.state.status === "installing";
    }

    private updateState(nextState: LauncherUpdaterState): void {
        this.state = {
            ...nextState,
            currentVersion: nextState.currentVersion || app.getVersion(),
        };
        this.emitter.emit("state", { ...this.state });
    }

    private startMutation<T>(action: () => Promise<T>): Promise<T> {
        if (this.activeMutation) {
            throw new Error("Launcher updater is already processing another action.");
        }
        const task = action().finally(() => {
            this.activeMutation = null;
        });
        this.activeMutation = task;
        return task;
    }

    private async downloadLatestUpdate(force: boolean, presetCheck?: LauncherUpdateCheckResult): Promise<LauncherInstallUpdateResult> {
        const check = presetCheck ?? await this.check(force, { suppressAutoDownload: true });
        if (!check.configured) {
            throw this.failWithState(check.reason || "Launcher updater is not configured in manifest.");
        }
        if (!check.updateAvailable || !check.latestVersion) {
            throw this.failWithState("No launcher update available.");
        }
        if (process.platform !== "win32") {
            throw this.failWithState("Launcher update installation is currently available on Windows only.");
        }

        if (await this.hasReadyInstaller(check.latestVersion)) {
            this.applyReadyInstallerState(check.latestVersion);
            return {
                started: false,
                version: check.latestVersion,
                filePath: this.readyInstaller?.filePath || "",
            };
        }

        const { manifest, release, asset } = await this.resolveReleaseAsset(check.latestVersion);
        if (!asset?.url) {
            throw this.failWithState(`Release '${release.version}' has no Windows installer asset.`);
        }

        if (!asset.sha256) {
            console.warn("[LauncherUpdater] Rejecting update: manifest entry missing SHA-256 hash");
            throw this.failWithState(`Release '${release.version}' is missing SHA-256 integrity hash. Update rejected.`);
        }

        const tempRoot = path.join(app.getPath("temp"), "bapbap-launcher-v2-updater");
        const fileName = sanitizeFileName(asset.fileName || `BAPBAP-Launcher-V2-Setup-${release.version}.exe`);
        const filePath = path.join(tempRoot, fileName);

        this.updateState({
            ...this.state,
            ...createStateFromCheck({
                ...check,
                notes: release.notes,
                publishedAtUtc: release.publishedAtUtc,
                channel: check.channel || (manifest.channel || "stable").toLowerCase(),
            }),
            status: "downloading",
            progressPercent: 0,
            downloadedBytes: 0,
            totalBytes: undefined,
            error: undefined,
            reason: "Downloading launcher update in the background...",
        });

        const progressGate = { lastPercent: -1, lastEmitAt: 0 };
        try {
            await this.downloader.downloadFile({
                url: asset.url,
                outputPath: filePath,
                sha256: asset.sha256,
                onProgress: progress => this.handleDownloadProgress(progress, progressGate),
            });
        } catch (error) {
            throw this.failWithState(toErrorMessage(error));
        }

        this.readyInstaller = {
            version: release.version,
            filePath,
            expectedSha256: asset.sha256 || "",
            sourceUrl: asset.url,
            downloadedAtUtc: new Date().toISOString(),
        };
        await this.persistReadyInstaller();
        this.applyReadyInstallerState(release.version);

        return {
            started: false,
            version: release.version,
            filePath,
        };
    }

    private maybeStartAutoDownload(check: LauncherUpdateCheckResult, force: boolean): void {
        if (!check.updateAvailable || !check.latestVersion || !this.settings.getAll().launcherAutoDownloadUpdates) {
            return;
        }
        if (this.activeMutation || this.readyInstaller?.version === check.latestVersion || this.state.status === "downloading") {
            return;
        }

        void this.startMutation(() => this.downloadLatestUpdate(force, check)).catch(error => {
            console.warn("[launcher-updater] auto-download failed", error);
        });
    }

    private applyReadyInstallerState(version: string): void {
        this.updateState({
            ...this.state,
            status: "readyToInstall",
            currentVersion: app.getVersion(),
            updateAvailable: true,
            latestVersion: version,
            progressPercent: 100,
            error: undefined,
            reason: this.settings.getAll().launcherAutoInstallOnNextStart
                ? "Update downloaded. It will install the next time you start the launcher."
                : "Update downloaded and ready to install.",
        });
    }

    private async restoreReadyInstaller(): Promise<void> {
        if (!(await pathExists(this.readyInstallerStatePath))) {
            return;
        }

        const persisted = await readJson(this.readyInstallerStatePath).catch(() => null) as ReadyInstaller | null;
        if (!persisted?.version || !persisted.filePath) {
            await this.clearReadyInstaller(false);
            return;
        }
        if (!(await pathExists(persisted.filePath))) {
            await this.clearReadyInstaller(false);
            return;
        }

        this.readyInstaller = {
            version: persisted.version,
            filePath: persisted.filePath,
            expectedSha256: persisted.expectedSha256 || "",
            sourceUrl: persisted.sourceUrl || "",
            downloadedAtUtc: persisted.downloadedAtUtc || "",
        };
    }

    private async persistReadyInstaller(): Promise<void> {
        if (!this.readyInstaller) {
            return;
        }
        await ensureDir(path.dirname(this.readyInstallerStatePath));
        await writeJson(this.readyInstallerStatePath, this.readyInstaller, { spaces: 2 });
    }

    private async clearReadyInstaller(removeInstallerFile: boolean): Promise<void> {
        const stalePath = this.readyInstaller?.filePath;
        this.readyInstaller = null;
        await remove(this.readyInstallerStatePath).catch(() => {});
        if (removeInstallerFile && stalePath) {
            await remove(stalePath).catch(() => {});
        }
    }
}

function createInitialState(currentVersion: string): LauncherUpdaterState {
    return {
        status: "idle",
        configured: true,
        currentVersion,
        updateAvailable: false,
    };
}

function createStateFromCheck(check: LauncherUpdateCheckResult): LauncherUpdaterState {
    return {
        status: check.updateAvailable ? "available" : check.configured ? "upToDate" : "error",
        configured: check.configured,
        currentVersion: check.currentVersion,
        updateAvailable: check.updateAvailable,
        latestVersion: check.latestVersion,
        notes: check.notes,
        publishedAtUtc: check.publishedAtUtc,
        channel: check.channel,
        reason: check.reason,
        checkedAtUtc: check.checkedAtUtc,
    };
}

function resolveWindowsAsset(release: LauncherUpdateRelease): LauncherUpdateAsset | null {
    const windows = release.windows;
    if (!windows) {
        return null;
    }
    if (process.arch === "arm64" && windows.arm64?.url) {
        return windows.arm64;
    }
    return windows.x64 || windows.default || null;
}

function compareVersionsDescending(a: string, b: string): number {
    return compareVersions(b, a);
}

function compareVersions(a: string, b: string): number {
    const left = parseSemver(a);
    const right = parseSemver(b);
    const maxCoreLength = Math.max(left.core.length, right.core.length);
    for (let i = 0; i < maxCoreLength; i += 1) {
        const l = left.core[i] ?? 0;
        const r = right.core[i] ?? 0;
        if (l !== r) {
            return l > r ? 1 : -1;
        }
    }

    const leftHasPre = left.prerelease.length > 0;
    const rightHasPre = right.prerelease.length > 0;
    if (!leftHasPre && rightHasPre) {
        return 1;
    }
    if (leftHasPre && !rightHasPre) {
        return -1;
    }

    const maxPreLength = Math.max(left.prerelease.length, right.prerelease.length);
    for (let i = 0; i < maxPreLength; i += 1) {
        const l = left.prerelease[i];
        const r = right.prerelease[i];
        if (l === undefined && r !== undefined) {
            return -1;
        }
        if (l !== undefined && r === undefined) {
            return 1;
        }
        if (l === undefined && r === undefined) {
            return 0;
        }

        const leftNum = Number(l);
        const rightNum = Number(r);
        const leftNumeric = Number.isFinite(leftNum) && l === String(leftNum);
        const rightNumeric = Number.isFinite(rightNum) && r === String(rightNum);

        if (leftNumeric && rightNumeric) {
            if (leftNum !== rightNum) {
                return leftNum > rightNum ? 1 : -1;
            }
            continue;
        }

        if (leftNumeric && !rightNumeric) {
            return -1;
        }
        if (!leftNumeric && rightNumeric) {
            return 1;
        }

        if (l !== r) {
            return l > r ? 1 : -1;
        }
    }
    return 0;
}

function parseSemver(version: string): { core: number[]; prerelease: string[] } {
    const normalized = String(version || "")
        .trim()
        .replace(/^v/i, "");
    const [baseAndPre] = normalized.split("+");
    const [corePart, prePart] = baseAndPre.split("-", 2);
    const core = (corePart || "0")
        .split(".")
        .map(item => Number.parseInt(item, 10))
        .map(item => (Number.isFinite(item) ? item : 0));
    const prerelease = prePart ? prePart.split(".").filter(Boolean) : [];
    return { core, prerelease };
}

function sanitizeFileName(fileName: string): string {
    return fileName.replace(/[<>:"/\\|?*]+/g, "_");
}

function clampPercent(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(value)));
}

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
