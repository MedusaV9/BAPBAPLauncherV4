import {
    ChannelManifest,
    ContentInstallInput,
    ContentToggleInput,
    GameVersionsManifest,
    InstallOfficialInput,
    InstalledInstance,
    ManifestIndex,
    PackageCard,
    PackageManifest,
} from "./manifest";
import type {
    RadioPlaylist,
    RadioSetPlaybackStateInput,
    RadioState,
} from "./radio";

export type LaunchInput = {
    instanceId: string;
    showMelonConsole: boolean;
    customArgs?: string;
};

export type AppSettings = {
    manifestUrl: string;
    /**
     * Optional GitHub personal access token for private lab manifests and
     * private release assets. Empty = public-only (production default).
     * Never sent to non-GitHub hosts.
     */
    githubToken: string;
    launcherAutoUpdate: boolean;
    launcherAutoDownloadUpdates: boolean;
    launcherAutoInstallOnNextStart: boolean;
    toolsUnlocked: boolean;
    bundlesRevealed: boolean;
    modsSecretUnlocked: boolean;
    modsUnlockedSecretIds: string[];
    launchShowMelonConsole: boolean;
    launchHideMelonLoaderStartupWarning: boolean;
    launchDefaultProfileId: string | null;
    launchAutoplayVideos: boolean;
    instancesRoot: string;
    leftRailCollapsed: boolean;
    leftRailAutoHover: boolean;
    instancesViewMode: "tiles" | "list";
    contentViewMode: "tiles" | "list";
    uiMotionProfile: "showcase" | "smooth-cinematic" | "snappy" | "minimal";
    uiMotionTier: "low" | "medium" | "high" | "showcase";
    uiMotionMaximalFx: boolean;
    uiMotionEnabled: boolean;
    uiMotionAdaptive: boolean;
    uiMotionSpeed: number;
    uiOnboardingCompleted: boolean;
    setupVersionCompleted: number;
    debugShowEffectLab: boolean;
    radioVolume: number;
    radioMuted: boolean;
    radioCrossfadeMs: number;
    radioAutoplayOnLaunch: boolean;
    radioRememberPlaybackState: boolean;
    /** UI scale factor (0.8–1.5). Applied via webContents.setZoomFactor. */
    uiScale: number;
    /** Closing the window hides to the system tray instead of quitting. */
    closeToTrayEnabled: boolean;
    /** UI language code (e.g. "en", "de", "ru", "es"). */
    language: string;
    /** Stable per-install Battle Royale account id (format "custom-..."). Generated once. */
    brAccountId: string;
};

export type DirectoryDialogInput = {
    title?: string;
    defaultPath?: string;
};

export type AudioFileDialogInput = {
    title?: string;
    defaultPath?: string;
};

export type CustomModInstallResult =
    | {
          status: "cancelled";
      }
    | {
          status: "installed";
          fileName: string;
          destinationPath: string;
          overwritten: boolean;
      };

export type RebalanceInvokeArgs = Record<string, unknown> | undefined;

export type ContentInstallState = {
    status: "not-installed" | "installed-enabled" | "installed-disabled" | "partial";
    version?: string;
};

export type ContentStateMap = Record<string, ContentInstallState>;

export type ContentModSetPackageState = {
    channelId: string;
    packageId: string;
    version?: string;
    enabled: boolean;
};

export type ContentModSet = {
    id: string;
    name: string;
    updatedAtUtc: string;
    packageStates: Record<string, ContentModSetPackageState>;
};

export type ContentModSetState = {
    activeModSetId: string;
    sets: ContentModSet[];
};

export type ContentCreateModSetInput = {
    instanceId: string;
    name: string;
    cloneFromModSetId?: string | null;
};

export type ContentBulkAction = "install" | "uninstall" | "enable" | "disable";

export type ContentBulkApplyInput = {
    instanceId: string;
    channelId: string;
    packageIds: string[];
    action: ContentBulkAction;
    versionByPackage?: Record<string, string>;
};

export type ContentBulkApplyResult = {
    total: number;
    successCount: number;
    failedCount: number;
    results: Array<{
        packageId: string;
        ok: boolean;
        error?: string;
    }>;
};

export type ConfigFileSection = "UserData" | "Mods/Config";

export type ConfigFileEntry = {
    path: string;
    section: ConfigFileSection;
    size: number;
    modifiedAtUtc: string;
};

export type ConfigFileContent = {
    path: string;
    extension: string;
    content: string;
};

export type StartupFatalInput = {
    code: string;
    message: string;
    context?: Record<string, unknown>;
};

export type LauncherUpdateCheckResult = {
    configured: boolean;
    currentVersion: string;
    updateAvailable: boolean;
    latestVersion?: string;
    notes?: string;
    publishedAtUtc?: string;
    channel?: string;
    reason?: string;
    checkedAtUtc: string;
};

export type LauncherInstallUpdateResult = {
    started: boolean;
    version: string;
    filePath: string;
};

export type LauncherUpdaterStatus =
    | "idle"
    | "checking"
    | "available"
    | "upToDate"
    | "downloading"
    | "readyToInstall"
    | "installing"
    | "error";

export type LauncherUpdaterState = {
    status: LauncherUpdaterStatus;
    configured: boolean;
    currentVersion: string;
    updateAvailable: boolean;
    latestVersion?: string;
    notes?: string;
    publishedAtUtc?: string;
    channel?: string;
    reason?: string;
    checkedAtUtc?: string;
    progressPercent?: number;
    downloadedBytes?: number;
    totalBytes?: number;
    error?: string;
};

export type TrustedTimeStatus = "idle" | "syncing" | "ready" | "unavailable";

export type TrustedTimeState = {
    status: TrustedTimeStatus;
    configured: boolean;
    available: boolean;
    sourceUrl?: string;
    trustedEpochMs?: number;
    syncedAtUtc?: string;
    error?: string;
};

export type InstanceInstallStatus =
    | "idle"
    | "preparing"
    | "downloading"
    | "extracting"
    | "writingMetadata"
    | "done"
    | "error";

export type InstanceInstallState = {
    status: InstanceInstallStatus;
    versionId?: string;
    profileName?: string;
    targetPath?: string;
    progressPercent?: number;
    downloadedBytes?: number;
    totalBytes?: number;
    error?: string;
};

export type LaunchRuntimeStatus =
    | "idle"
    | "launching"
    | "stopping"
    | "running"
    | "exited"
    | "failed";

export type LaunchRuntimeLogEntry = {
    id: string;
    timestampUtc: string;
    stream: "stdout" | "stderr" | "system";
    message: string;
};

export type LaunchRuntimeState = {
    status: LaunchRuntimeStatus;
    instanceId?: string;
    profileName?: string;
    pid?: number;
    startedAtUtc?: string;
    exitedAtUtc?: string;
    exitCode?: number | null;
    error?: string;
    recentLogs?: LaunchRuntimeLogEntry[];
};

/**
 * Bundle Instance update state machine. See
 * docs/bundle-instance/track-2-auto-update.md §7.
 *
 * idle → checking → up-to-date | check-failed
 *                 → update-available → downloading → verifying → applying → done
 *                                                        │           │
 *                                                        ▼           ▼
 *                                                 signature-     failed |
 *                                                 mismatch       disk-full
 */
export type BundleUpdateStatus =
    | "idle"
    | "checking"
    | "up-to-date"
    | "update-available"
    | "downloading"
    | "verifying"
    | "applying"
    | "done"
    | "check-failed"
    | "failed"
    | "signature-mismatch"
    | "disk-full";

export interface BundleUpdateState {
    instanceId: string;
    status: BundleUpdateStatus;
    localVersion?: string;
    localBuildNumber?: number;
    remoteVersion?: string;
    remoteBuildNumber?: number;
    sizeBytes?: number;
    bytesDownloaded?: number;
    progressPercent?: number;
    errorMessage?: string;
    errorCode?: string;
    startedAtUtc?: string;
    completedAtUtc?: string;
}

/**
 * First-install progress state for a Bundle. Distinct from
 * BundleUpdateState because the install pipeline is keyed by `bundleId`
 * (no instance has been created yet at "resolving" time) and the stage
 * vocabulary differs:
 *
 *   idle → resolving → downloading → verifying → extracting → installing → done
 *                                                           │
 *                                                           ▼
 *                                                         failed
 *
 * Emitted by BundleService.install via "progress-changed" events; fanned
 * out to renderers on IPC_CHANNELS.bundleInstallProgressChanged.
 */
export interface BundleInstallProgressState {
    bundleId: string;
    status:
        | "idle"
        | "resolving"
        | "downloading"
        | "verifying"
        | "extracting"
        | "installing"
        | "done"
        | "failed";
    bytesDownloaded?: number;
    sizeBytes?: number;
    progressPercent?: number;
    errorMessage?: string;
    startedAtUtc?: string;
    completedAtUtc?: string;
}

/**
 * Renderer-side facade contract for the bundle.* auto-update IPC channels
 * exposed in track-update-service-skeleton. The methods are merged onto
 * the existing `V2Api.bundle` namespace as OPTIONAL members so that:
 *   - track 1's existing `listAvailable / install / remove` keep working,
 *   - builds that have not yet wired the BundleUpdateService surface
 *     `api.bundle.checkForUpdate === undefined`, and any caller that
 *     uses optional chaining (e.g. BundleUpdateGate) falls back cleanly.
 */
export interface BundleUpdateApi {
    checkForUpdate(instanceId: string): Promise<BundleUpdateState>;
    applyUpdate(instanceId: string): Promise<BundleUpdateState>;
    getUpdateState(instanceId: string): Promise<BundleUpdateState>;
    onUpdateStateChanged(handler: (state: BundleUpdateState) => void): () => void;
}

export interface V2Api {
    diagnostics: {
        getBuildInfo(): Promise<{ appVersion: string; environment: string; buildTimestamp: string }>;
        reportStartupFatal(input: StartupFatalInput): Promise<void>;
    };
    shell: {
        openExternal(url: string): Promise<void>;
    };
    updater: {
        check(force?: boolean): Promise<LauncherUpdateCheckResult>;
        downloadAndInstall(force?: boolean): Promise<LauncherInstallUpdateResult>;
        getState(): Promise<LauncherUpdaterState>;
        onStateChanged(listener: (state: LauncherUpdaterState) => void): () => void;
    };
    settings: {
        getAll(): Promise<AppSettings>;
        set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void>;
        unlockToolsTab(code: string): Promise<boolean>;
        unlockSecretMods(password: string): Promise<boolean>;
        revealBundles(code: string): Promise<boolean>;
    };
    dialog: {
        chooseDirectory(input?: DirectoryDialogInput): Promise<string | null>;
        chooseAudioFiles(input?: AudioFileDialogInput): Promise<string[]>;
    };
    manifest: {
        getIndex(force?: boolean): Promise<ManifestIndex>;
        getGameVersions(force?: boolean): Promise<GameVersionsManifest>;
        getChannel(channelId?: string, force?: boolean): Promise<ChannelManifest>;
        getTrustedTimeState(force?: boolean): Promise<TrustedTimeState>;
        onTrustedTimeChanged(listener: (state: TrustedTimeState) => void): () => void;
    };
    instances: {
        list(): Promise<InstalledInstance[]>;
        installOfficial(input: InstallOfficialInput): Promise<InstalledInstance>;
        getInstallState(): Promise<InstanceInstallState>;
        onInstallStateChanged(listener: (state: InstanceInstallState) => void): () => void;
        verify(instanceId: string): Promise<boolean>;
        hasRelativeFile(instanceId: string, relativePath: string): Promise<boolean>;
        installCustomMod(instanceId: string): Promise<CustomModInstallResult>;
        remove(instanceId: string): Promise<void>;
        rename(instanceId: string, name: string): Promise<void>;
        getSteamPersonaName(): Promise<string | null>;
        /** Import instances from a V3/BAPBAPLauncher instances root directory. */
        migrateFromV3(sourceDir: string): Promise<{ imported: number; skipped: number; errors: string[] }>;
    };
    launch: {
        start(input: LaunchInput): Promise<void>;
        stop(): Promise<void>;
        getRuntimeState(): Promise<LaunchRuntimeState>;
        onRuntimeStateChanged(listener: (state: LaunchRuntimeState) => void): () => void;
        onRuntimeLog(listener: (entry: LaunchRuntimeLogEntry) => void): () => void;
    };
    content: {
        listPackages(channelId?: string, force?: boolean): Promise<PackageCard[]>;
        getPackageDetail(channelId: string, packageId: string, force?: boolean): Promise<PackageManifest>;
        listStates(instanceId: string): Promise<ContentStateMap>;
        getModSets(instanceId: string): Promise<ContentModSetState>;
        createModSet(input: ContentCreateModSetInput): Promise<ContentModSetState>;
        renameModSet(instanceId: string, modSetId: string, name: string): Promise<ContentModSetState>;
        deleteModSet(instanceId: string, modSetId: string): Promise<ContentModSetState>;
        activateModSet(instanceId: string, modSetId: string): Promise<ContentModSetState>;
        install(input: ContentInstallInput): Promise<void>;
        uninstall(instanceId: string, channelId: string, packageId: string): Promise<void>;
        setEnabled(input: ContentToggleInput): Promise<void>;
        bulkApply(input: ContentBulkApplyInput): Promise<ContentBulkApplyResult>;
    };
    config: {
        list(instanceId: string): Promise<ConfigFileEntry[]>;
        read(instanceId: string, filePath: string): Promise<ConfigFileContent>;
        write(instanceId: string, filePath: string, content: string): Promise<void>;
    };
    radio: {
        getState(): Promise<RadioState>;
        sync(force?: boolean): Promise<RadioState>;
        importTracks(filePaths: string[]): Promise<RadioState>;
        createPlaylist(name: string): Promise<RadioPlaylist>;
        renamePlaylist(id: string, name: string): Promise<RadioPlaylist>;
        deletePlaylist(id: string): Promise<void>;
        setPlaylistTracks(id: string, trackIds: string[]): Promise<RadioPlaylist>;
        toggleFavorite(trackId: string): Promise<RadioState>;
        setQueue(trackIds: string[]): Promise<RadioState>;
        enqueue(trackId: string): Promise<RadioState>;
        removeFromQueue(trackId: string): Promise<RadioState>;
        clearQueue(): Promise<RadioState>;
        setPlaybackState(input: RadioSetPlaybackStateInput): Promise<RadioState>;
        onStateChanged(listener: (state: RadioState) => void): () => void;
    };
    rebalance: {
        invoke(command: string, args?: RebalanceInvokeArgs): Promise<unknown>;
        fileSrc(targetPath: string): Promise<string>;
    };
    /**
     * Bundle Instance management. The Bundle Instance is the third
     * launcher-managed instance type alongside Standard and Creator Kit
     * (see docs/bundle-instance/BUNDLE_INSTANCE_MASTER_SPEC.md).
     *
     * Track 1 ships only the listing / install / remove channels —
     * auto-update channels (checkForUpdate / applyUpdate / state events)
     * land with the BundleUpdateService in Phase D and live in a separate
     * track.
     */
    bundle: {
        listAvailable(): Promise<BundleSummary[]>;
        install(bundleId: string, profileName?: string): Promise<InstalledInstance>;
        remove(instanceId: string): Promise<void>;
        // First-install progress facade (track-install-emit). The install
        // pipeline now emits per-stage events keyed by bundleId; the
        // renderer's BundleInstallGate consumes these to drive the
        // download-progress bar on the FIRST install of a Bundle.
        getInstallProgressState(bundleId: string): Promise<BundleInstallProgressState>;
        onInstallProgressChanged(handler: (state: BundleInstallProgressState) => void): () => void;
        // Auto-update facade (track-update-service-skeleton). All members
        // are OPTIONAL: builds that have not wired the BundleUpdateService
        // expose only listAvailable/install/remove. BundleUpdateGate uses
        // optional chaining and falls back to a plain Launch button when
        // any of these is undefined.
        checkForUpdate?: BundleUpdateApi["checkForUpdate"];
        applyUpdate?: BundleUpdateApi["applyUpdate"];
        getUpdateState?: BundleUpdateApi["getUpdateState"];
        onUpdateStateChanged?: BundleUpdateApi["onUpdateStateChanged"];
    };
}

/**
 * Public summary the renderer uses for the bundle picker, status badges,
 * and the (Phase D) update gate. Mirrors BundleService.BundleSummary so
 * renderer + main share a single contract via the shared/ipc.ts surface.
 */
export type BundleSummary = {
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
    isDownloadable?: boolean;
};

export const IPC_CHANNELS = {
    diagnosticsGetBuildInfo: "v2.diagnostics.getBuildInfo",
    diagnosticsReportStartupFatal: "v2.diagnostics.reportStartupFatal",
    updaterCheck: "v2.updater.check",
    updaterDownloadAndInstall: "v2.updater.downloadAndInstall",
    updaterGetState: "v2.updater.getState",
    updaterStateChanged: "v2.updater.stateChanged",
    settingsGetAll: "v2.settings.getAll",
    settingsSet: "v2.settings.set",
    settingsUnlockToolsTab: "v2.settings.unlockToolsTab",
    settingsUnlockSecretMods: "v2.settings.unlockSecretMods",
    settingsRevealBundles: "v2.settings.revealBundles",
    dialogChooseDirectory: "v2.dialog.chooseDirectory",
    dialogChooseAudioFiles: "v2.dialog.chooseAudioFiles",
    manifestGetIndex: "v2.manifest.getIndex",
    manifestGetGameVersions: "v2.manifest.getGameVersions",
    manifestGetChannel: "v2.manifest.getChannel",
    manifestGetTrustedTimeState: "v2.manifest.getTrustedTimeState",
    manifestTrustedTimeChanged: "v2.manifest.trustedTimeChanged",
    instancesList: "v2.instances.list",
    instancesInstallOfficial: "v2.instances.installOfficial",
    instancesGetInstallState: "v2.instances.getInstallState",
    instancesInstallStateChanged: "v2.instances.installStateChanged",
    instancesVerify: "v2.instances.verify",
    instancesHasRelativeFile: "v2.instances.hasRelativeFile",
    instancesInstallCustomMod: "v2.instances.installCustomMod",
    instancesRemove: "v2.instances.remove",
    instancesRename: "v2.instances.rename",
    instancesGetSteamPersonaName: "v2.instances.getSteamPersonaName",
    launchStart: "v2.launch.start",
    launchStop: "v2.launch.stop",
    launchGetRuntimeState: "v2.launch.getRuntimeState",
    launchRuntimeStateChanged: "v2.launch.runtimeStateChanged",
    launchRuntimeLog: "v2.launch.runtimeLog",
    contentListPackages: "v2.content.listPackages",
    contentGetPackageDetail: "v2.content.getPackageDetail",
    contentListStates: "v2.content.listStates",
    contentGetModSets: "v2.content.getModSets",
    contentCreateModSet: "v2.content.createModSet",
    contentRenameModSet: "v2.content.renameModSet",
    contentDeleteModSet: "v2.content.deleteModSet",
    contentActivateModSet: "v2.content.activateModSet",
    contentInstall: "v2.content.install",
    contentUninstall: "v2.content.uninstall",
    contentSetEnabled: "v2.content.setEnabled",
    contentBulkApply: "v2.content.bulkApply",
    configList: "v2.config.list",
    configRead: "v2.config.read",
    configWrite: "v2.config.write",
    radioGetState: "v2.radio.getState",
    radioSync: "v2.radio.sync",
    radioImportTracks: "v2.radio.importTracks",
    radioCreatePlaylist: "v2.radio.createPlaylist",
    radioRenamePlaylist: "v2.radio.renamePlaylist",
    radioDeletePlaylist: "v2.radio.deletePlaylist",
    radioSetPlaylistTracks: "v2.radio.setPlaylistTracks",
    radioToggleFavorite: "v2.radio.toggleFavorite",
    radioSetQueue: "v2.radio.setQueue",
    radioEnqueue: "v2.radio.enqueue",
    radioRemoveFromQueue: "v2.radio.removeFromQueue",
    radioClearQueue: "v2.radio.clearQueue",
    radioSetPlaybackState: "v2.radio.setPlaybackState",
    radioStateChanged: "v2.radio.stateChanged",
    rebalanceInvoke: "v2.rebalance.invoke",
    rebalanceFileSrc: "v2.rebalance.fileSrc",
    bundleListAvailable: "v2.bundle.listAvailable",
    bundleInstall: "v2.bundle.install",
    bundleRemove: "v2.bundle.remove",
    bundleGetInstallProgressState: "v2.bundle.getInstallProgressState",
    bundleInstallProgressChanged: "v2.bundle.installProgressChanged",
    bundleCheckForUpdate: "v2.bundle.checkForUpdate",
    bundleApplyUpdate: "v2.bundle.applyUpdate",
    bundleGetUpdateState: "v2.bundle.getUpdateState",
    bundleUpdateStateChanged: "v2.bundle.updateStateChanged",
    shellOpenExternal: "v2.shell.openExternal",
    instancesMigrateFromV3: "v2.instances.migrateFromV3",
} as const;
