import type {
    AppSettings,
    BundleInstallProgressState,
    BundleUpdateState,
    ConfigFileContent,
    ConfigFileEntry,
    ContentBulkApplyInput,
    ContentBulkApplyResult,
    ContentModSetState,
    ContentStateMap,
    InstanceInstallState,
    LaunchRuntimeLogEntry,
    LaunchRuntimeState,
    LauncherInstallUpdateResult,
    LauncherUpdaterState,
    TrustedTimeState,
    V2Api,
} from "../../shared/ipc";
import type { RadioPlaylist, RadioSetPlaybackStateInput, RadioState } from "../../shared/radio";
import type {
    ChannelManifest,
    GameVersionsManifest,
    InstalledInstance,
    InstallOfficialInput,
    ManifestIndex,
    PackageCard,
    PackageManifest,
} from "../../shared/manifest";
import {
    harnessBuildInfo,
    harnessChannelManifest,
    harnessConfigContentByPath,
    harnessConfigEntriesByInstance,
    harnessContentStates,
    harnessGameVersions,
    harnessInstances,
    harnessInstallState,
    harnessRadioState,
    harnessManifestIndex,
    harnessPackageDetails,
    harnessPackages,
    harnessAudioFixture,
    harnessSettings,
    harnessTrustedTimeState,
    harnessUpdaterState,
} from "./mock-data";

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function slugProfileName(profileName: string): string {
    return (
        profileName
            .trim()
            .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
            .replace(/\s+/g, " ")
            .slice(0, 80) || "Profile"
    );
}

function emit<T>(listeners: Set<(value: T) => void>, value: T): void {
    listeners.forEach(listener => listener(clone(value)));
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => globalThis.setTimeout(resolve, ms));
}

async function computeSha256Hex(value: string): Promise<string> {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(value);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

function buildDefaultModSetState(states: ContentStateMap): ContentModSetState {
    const packageStates = Object.fromEntries(
        Object.entries(states).map(([key, value]) => {
            const [channelId, packageId] = key.split("::");
            return [
                key,
                {
                    channelId,
                    packageId,
                    version: value.version,
                    enabled: value.status === "installed-enabled",
                },
            ];
        })
    );
    return {
        activeModSetId: "default",
        sets: [
            {
                id: "default",
                name: "Main set",
                updatedAtUtc: new Date(0).toISOString(),
                packageStates,
            },
        ],
    };
}

function syncHarnessActiveModSet(modSetState: ContentModSetState, states: ContentStateMap): ContentModSetState {
    const nextState = clone(modSetState);
    const activeSet = nextState.sets.find(set => set.id === nextState.activeModSetId) || nextState.sets[0];
    if (!activeSet) {
        return buildDefaultModSetState(states);
    }
    activeSet.packageStates = buildDefaultModSetState(states).sets[0].packageStates;
    activeSet.updatedAtUtc = new Date().toISOString();
    return nextState;
}

function createContentStateKey(channelId: string, packageId: string): string {
    return `${channelId}::${packageId.toLowerCase()}`;
}

function createPackageStates(
    entries: Array<{ channelId: string; packageId: string; version: string; enabled: boolean }>
): ContentStateMap {
    return Object.fromEntries(
        entries.map(entry => [
            createContentStateKey(entry.channelId, entry.packageId),
            {
                status: entry.enabled ? "installed-enabled" : "installed-disabled",
                version: entry.version,
            },
        ])
    );
}

function normalizeRelativeHarnessPath(relativePath: string): string {
    return `${relativePath || ""}`.trim().replace(/\\/g, "/").replace(/^\/+/g, "").toLowerCase();
}

function createHarnessRelativeFileMap(entries: Record<string, string[]>): Record<string, Set<string>> {
    return Object.fromEntries(
        Object.entries(entries).map(([instanceId, relativePaths]) => [
            instanceId,
            new Set(relativePaths.map(relativePath => normalizeRelativeHarnessPath(relativePath))),
        ])
    );
}

function createModSet(
    id: string,
    name: string,
    entries: Array<{ channelId: string; packageId: string; version: string; enabled: boolean }>,
    updatedAtUtc: string
): ContentModSetState["sets"][number] {
    return {
        id,
        name,
        updatedAtUtc,
        packageStates: Object.fromEntries(
            entries.map(entry => [
                createContentStateKey(entry.channelId, entry.packageId),
                {
                    channelId: entry.channelId,
                    packageId: entry.packageId,
                    version: entry.version,
                    enabled: entry.enabled,
                },
            ])
        ),
    };
}

/**
 * Fake bundle payload size used by the simulated install/update walks
 * (see runInstallSimulation / runUpdateSimulation below). Picked as a
 * realistic CIRCLE Test Pack size so the progress bar rounding is
 * observable.
 */
const HARNESS_FAKE_BUNDLE_TOTAL_BYTES = 564 * 1024 * 1024;

/**
 * Delay between simulated progress events. 150ms is slow enough for a
 * human harness viewer to SEE the animation, fast enough for tests.
 */
const HARNESS_BUNDLE_PROGRESS_TICK_MS = 150;

export function createHarnessApi(): V2Api {
    const electronApi = typeof window !== "undefined" ? window.v2Api : undefined;
    const harnessPreset =
        typeof window !== "undefined" ? window.__V2_HARNESS_STATE__?.preset || "default" : "default";
    let settings: AppSettings = clone(harnessSettings);
    if (typeof window !== "undefined" && window.__V2_HARNESS_STATE__?.workspace === "tools") {
        settings = {
            ...settings,
            toolsUnlocked: true,
        };
    }
    if (typeof window !== "undefined" && window.__V2_HARNESS_STATE__?.panel === "effect-lab") {
        settings = {
            ...settings,
            debugShowEffectLab: true,
        };
    }
    const manifestIndex: ManifestIndex = clone(harnessManifestIndex);
    const gameVersions: GameVersionsManifest = clone(harnessGameVersions);
    const channelManifest: ChannelManifest = clone(harnessChannelManifest);
    const packages: PackageCard[] = clone(harnessPackages);
    const packageDetails: Record<string, PackageManifest> = clone(harnessPackageDetails);
    let instances: InstalledInstance[] = clone(harnessInstances);
    let contentStatesByInstance: Record<string, ContentStateMap> = clone(harnessContentStates);
    let modSetStatesByInstance: Record<string, ContentModSetState> = Object.fromEntries(
        Object.entries(contentStatesByInstance).map(([instanceId, states]) => [instanceId, buildDefaultModSetState(states)])
    );
    let configEntriesByInstance: Record<string, ConfigFileEntry[]> = clone(harnessConfigEntriesByInstance);
    const configContentByKey: Record<string, ConfigFileContent> = clone(harnessConfigContentByPath);
    const trustedTimeState: TrustedTimeState = clone(harnessTrustedTimeState);
    let updaterState: LauncherUpdaterState = clone(harnessUpdaterState);
    let installState: InstanceInstallState = clone(harnessInstallState);
    let runtimeState: LaunchRuntimeState = { status: "idle", recentLogs: [] };
    let radioState: RadioState = clone(harnessRadioState);
    const runtimeLogs: LaunchRuntimeLogEntry[] = [];
    let relativeFilesByInstance = createHarnessRelativeFileMap({
        "profile-creator-kit": ["Mods/BAPBAPBalanceMod.dll"],
        "steam:c:/steam/steamapps/common/bapbap": ["Mods/BAPBAPBalanceMod.dll"],
    });

    for (const pkg of packages) {
        pkg.latestVersion = pkg.latestVersion || packageDetails[pkg.id]?.latestVersion;
    }

    if (harnessPreset === "ribbon-demo") {
        settings = {
            ...settings,
            modsSecretUnlocked: true,
            modsUnlockedSecretIds: ["default"],
            launchDefaultProfileId: "profile-standard",
        };

        const applyRibbonTags = (packageId: string, ribbonTags: string[]) => {
            const pkg = packages.find(item => item.id === packageId);
            if (pkg) {
                pkg.visual = {
                    ...(pkg.visual || {}),
                    ribbonTags,
                };
            }
            const detail = packageDetails[packageId];
            if (detail) {
                detail.visual = {
                    ...(detail.visual || {}),
                    ribbonTags,
                };
            }
        };

        applyRibbonTags("sonic.bapbap.hidden-dev-arguments", ["secret"]);
        applyRibbonTags("sonic.bapbap.arena-random-chars", ["host-only"]);
        applyRibbonTags("sonic.bapbap.fps-camera", ["host-only"]);
        applyRibbonTags("sonic.bapbap.br-ui-old-but-gold", ["recommended"]);
        applyRibbonTags("sonic.bapbap.asset-dumper", ["featured"]);

        contentStatesByInstance = {
            "profile-standard": createPackageStates([
                { channelId: "release", packageId: "sonic.bapbap.hp-numbers", version: "1.0.0", enabled: true },
                { channelId: "release", packageId: "sonic.bapbap.pool-randomizer", version: "0.9.0", enabled: false },
                { channelId: "release", packageId: "sonic.bapbap.arena-random-chars", version: "0.9.0", enabled: true },
                { channelId: "release", packageId: "sonic.bapbap.fps-camera", version: "0.2.0", enabled: true },
            ]),
            "profile-creator-kit": createPackageStates([
                { channelId: "release", packageId: "sonic.bapbap.asset-dumper", version: "1.0.0", enabled: true },
                { channelId: "release", packageId: "sonic.bapbap.hidden-dev-arguments", version: "1.0.0", enabled: true },
            ]),
            "profile-boss-rush": createPackageStates([
                { channelId: "release", packageId: "jackmygoodman.bapbap.boss-rush-qol", version: "1.0.0", enabled: true },
            ]),
            "steam:c:/steam/steamapps/common/bapbap": createPackageStates([]),
        };

        modSetStatesByInstance = {
            "profile-standard": {
                activeModSetId: "default",
                sets: [
                    createModSet(
                        "default",
                        "Ribbon demo",
                        [
                            { channelId: "release", packageId: "sonic.bapbap.hp-numbers", version: "1.0.0", enabled: true },
                            { channelId: "release", packageId: "sonic.bapbap.pool-randomizer", version: "0.9.0", enabled: false },
                            { channelId: "release", packageId: "sonic.bapbap.arena-random-chars", version: "0.9.0", enabled: true },
                            { channelId: "release", packageId: "sonic.bapbap.fps-camera", version: "0.2.0", enabled: true },
                        ],
                        "2026-03-22T14:00:00Z"
                    ),
                ],
            },
            "profile-creator-kit": {
                activeModSetId: "default",
                sets: [
                    createModSet(
                        "default",
                        "Creator main",
                        [
                            { channelId: "release", packageId: "sonic.bapbap.asset-dumper", version: "1.0.0", enabled: true },
                            { channelId: "release", packageId: "sonic.bapbap.hidden-dev-arguments", version: "1.0.0", enabled: true },
                        ],
                        "2026-03-22T13:55:00Z"
                    ),
                ],
            },
            "profile-boss-rush": {
                activeModSetId: "default",
                sets: [
                    createModSet(
                        "default",
                        "Boss Rush main",
                        [{ channelId: "release", packageId: "jackmygoodman.bapbap.boss-rush-qol", version: "1.0.0", enabled: true }],
                        "2026-03-22T13:50:00Z"
                    ),
                ],
            },
            "steam:c:/steam/steamapps/common/bapbap": {
                activeModSetId: "default",
                sets: [createModSet("default", "Steam quick test", [], "2026-03-22T13:45:00Z")],
            },
        };
    } else if (harnessPreset === "messy-real") {
        settings = {
            ...settings,
            modsSecretUnlocked: true,
            modsUnlockedSecretIds: ["default"],
            leftRailCollapsed: true,
            instancesRoot: "C:/Users/Administrator/AppData/Roaming/bapbap-launcher-v2/instances",
            launchDefaultProfileId: "profile-standard",
            radioAutoplayOnLaunch: true,
        };
        instances = clone(harnessInstances).map(instance => {
            if (instance.id === "profile-standard") {
                return {
                    ...instance,
                    path: "C:/Users/Administrator/AppData/Roaming/bapbap-launcher-v2/instances/Standard",
                };
            }
            if (instance.id === "profile-creator-kit") {
                return {
                    ...instance,
                    profileName: "Creator Kit Tools",
                    name: "Creator Kit Tools",
                    path: "C:/Users/Administrator/AppData/Roaming/bapbap-launcher-v2/instances/Creator Kit Tools",
                };
            }
            if (instance.id === "profile-boss-rush") {
                return {
                    ...instance,
                    profileName: "Boss Rush Daily",
                    name: "Boss Rush Daily",
                    path: "C:/Users/Administrator/AppData/Roaming/bapbap-launcher-v2/instances/Boss Rush Daily",
                };
            }
            if (instance.id === "steam:c:/steam/steamapps/common/bapbap") {
                return {
                    ...instance,
                    path: "D:/SteamLibrary/steamapps/common/BAPBAP",
                };
            }
            return instance;
        });
        contentStatesByInstance = {
            "profile-standard": createPackageStates([
                { channelId: "release", packageId: "sonic.bapbap.hp-numbers", version: "1.0.1", enabled: true },
                { channelId: "release", packageId: "sonic.bapbap.arena-random-chars", version: "1.0.0", enabled: true },
                { channelId: "release", packageId: "sonic.bapbap.pool-randomizer", version: "1.0.0", enabled: false },
            ]),
            "profile-creator-kit": createPackageStates([
                { channelId: "release", packageId: "sonic.bapbap.asset-dumper", version: "1.0.0", enabled: true },
                { channelId: "release", packageId: "sonic.bapbap.hidden-dev-arguments", version: "1.0.0", enabled: true },
            ]),
            "profile-boss-rush": createPackageStates([
                { channelId: "release", packageId: "jackmygoodman.bapbap.boss-rush-qol", version: "1.0.0", enabled: true },
                { channelId: "release", packageId: "sonic.bapbap.fps-camera", version: "0.2.0", enabled: false },
            ]),
            "steam:c:/steam/steamapps/common/bapbap": createPackageStates([
                { channelId: "release", packageId: "sonic.bapbap.hp-numbers", version: "1.0.1", enabled: true },
            ]),
        };
        modSetStatesByInstance = {
            "profile-standard": {
                activeModSetId: "set-stream",
                sets: [
                    createModSet(
                        "default",
                        "Main set",
                        [
                            { channelId: "release", packageId: "sonic.bapbap.hp-numbers", version: "1.0.1", enabled: true },
                            { channelId: "release", packageId: "sonic.bapbap.hidden-dev-arguments", version: "1.0.0", enabled: true },
                            { channelId: "release", packageId: "sonic.bapbap.pool-randomizer", version: "1.0.0", enabled: false },
                        ],
                        "2026-03-20T08:10:00Z"
                    ),
                    createModSet(
                        "set-stream",
                        "Stream set",
                        [
                            { channelId: "release", packageId: "sonic.bapbap.hp-numbers", version: "1.0.1", enabled: true },
                            { channelId: "release", packageId: "sonic.bapbap.arena-random-chars", version: "1.0.0", enabled: true },
                            { channelId: "release", packageId: "sonic.bapbap.pool-randomizer", version: "1.0.0", enabled: false },
                        ],
                        "2026-03-21T18:42:00Z"
                    ),
                    createModSet(
                        "set-clean",
                        "Clean run",
                        [],
                        "2026-03-18T09:30:00Z"
                    ),
                ],
            },
            "profile-creator-kit": {
                activeModSetId: "default",
                sets: [
                    createModSet(
                        "default",
                        "Creator main",
                        [
                            { channelId: "release", packageId: "sonic.bapbap.asset-dumper", version: "1.0.0", enabled: true },
                            { channelId: "release", packageId: "sonic.bapbap.hidden-dev-arguments", version: "1.0.0", enabled: true },
                        ],
                        "2026-03-20T13:15:00Z"
                    ),
                ],
            },
            "profile-boss-rush": {
                activeModSetId: "default",
                sets: [
                    createModSet(
                        "default",
                        "Boss rush main",
                        [
                            { channelId: "release", packageId: "jackmygoodman.bapbap.boss-rush-qol", version: "1.0.0", enabled: true },
                            { channelId: "release", packageId: "sonic.bapbap.fps-camera", version: "0.2.0", enabled: false },
                        ],
                        "2026-03-19T20:40:00Z"
                    ),
                    createModSet(
                        "set-camera-practice",
                        "Camera practice",
                        [
                            { channelId: "release", packageId: "jackmygoodman.bapbap.boss-rush-qol", version: "1.0.0", enabled: true },
                            { channelId: "release", packageId: "sonic.bapbap.fps-camera", version: "0.2.0", enabled: true },
                        ],
                        "2026-03-21T07:25:00Z"
                    ),
                ],
            },
            "steam:c:/steam/steamapps/common/bapbap": {
                activeModSetId: "default",
                sets: [
                    createModSet(
                        "default",
                        "Steam quick test",
                        [{ channelId: "release", packageId: "sonic.bapbap.hp-numbers", version: "1.0.1", enabled: true }],
                        "2026-03-20T11:00:00Z"
                    ),
                ],
            },
        };
        configEntriesByInstance = {
            ...clone(harnessConfigEntriesByInstance),
            "profile-standard": [
                { path: "UserData/settings.json", section: "UserData", size: 184, modifiedAtUtc: "2026-03-21T18:42:00Z" },
                { path: "Mods/Config/BAPBAP.HPNumbers.cfg", section: "Mods/Config", size: 96, modifiedAtUtc: "2026-03-21T18:41:00Z" },
                { path: "Mods/Config/BAPBAP.PoolRandomizer.cfg", section: "Mods/Config", size: 112, modifiedAtUtc: "2026-03-21T18:40:00Z" },
            ],
            "profile-creator-kit": [
                { path: "UserData/settings.json", section: "UserData", size: 212, modifiedAtUtc: "2026-03-20T13:15:00Z" },
                { path: "Mods/Config/HiddenDevArguments.cfg", section: "Mods/Config", size: 148, modifiedAtUtc: "2026-03-20T13:12:00Z" },
            ],
        };
        configContentByKey["Mods/Config/BAPBAP.PoolRandomizer.cfg"] = {
            path: "Mods/Config/BAPBAP.PoolRandomizer.cfg",
            extension: ".cfg",
            content: "legacyPoolWeight=0.25\npreferUnlockedPools=true\n",
        };
        configContentByKey["Mods/Config/HiddenDevArguments.cfg"] = {
            path: "Mods/Config/HiddenDevArguments.cfg",
            extension: ".cfg",
            content: "showHiddenArenaOptions=true\nenableExperimentalArguments=true\n",
        };
        radioState = {
            ...radioState,
            sync: {
                ...radioState.sync,
                storagePath: "C:/Users/Administrator/AppData/Roaming/bapbap-launcher-v2/radio",
                trackCount: 15,
                availableTrackCount: 15,
            },
        };
        relativeFilesByInstance = createHarnessRelativeFileMap({
            "profile-standard": ["Mods/BAPBAPBalanceMod.dll"],
            "profile-creator-kit": ["Mods/BAPBAPBalanceMod.dll"],
            "steam:c:/steam/steamapps/common/bapbap": ["Mods/BAPBAPBalanceMod.dll"],
        });
    }

    const trustedTimeListeners = new Set<(state: TrustedTimeState) => void>();
    const updaterListeners = new Set<(state: LauncherUpdaterState) => void>();
    const installListeners = new Set<(state: InstanceInstallState) => void>();
    const runtimeStateListeners = new Set<(state: LaunchRuntimeState) => void>();
    const runtimeLogListeners = new Set<(entry: LaunchRuntimeLogEntry) => void>();
    const radioStateListeners = new Set<(state: RadioState) => void>();

    const setInstallState = (next: InstanceInstallState) => {
        installState = clone(next);
        emit(installListeners, installState);
    };

    const setUpdaterState = (next: LauncherUpdaterState) => {
        updaterState = clone(next);
        emit(updaterListeners, updaterState);
    };

    const setRuntimeState = (next: LaunchRuntimeState) => {
        runtimeState = {
            ...clone(next),
            recentLogs: clone(runtimeLogs),
        };
        emit(runtimeStateListeners, runtimeState);
    };

    const pushRuntimeLog = (entry: Omit<LaunchRuntimeLogEntry, "id" | "timestampUtc">) => {
        const value: LaunchRuntimeLogEntry = {
            id: `log-${runtimeLogs.length + 1}`,
            timestampUtc: new Date(Date.parse("2026-03-07T12:00:00Z") + runtimeLogs.length * 1000).toISOString(),
            ...entry,
        };
        runtimeLogs.push(value);
        if (runtimeLogs.length > 200) {
            runtimeLogs.shift();
        }
        runtimeState = { ...runtimeState, recentLogs: clone(runtimeLogs) };
        emit(runtimeLogListeners, value);
        emit(runtimeStateListeners, runtimeState);
    };

    const setRadioState = (next: RadioState) => {
        radioState = clone(next);
        emit(radioStateListeners, radioState);
    };

    // --- Bundle Instance progress simulation ---------------------------
    // These maps + listener sets back the harness-only install-progress
    // surface and the bundle update facade. Each simulated walk emits a
    // sequence of state snapshots through setBundleInstallProgress /
    // setBundleUpdateState so the renderer's new progress bar UI can
    // observe deterministic transitions without a real Bundle Instance
    // pipeline.
    const installProgressMap = new Map<string, BundleInstallProgressState>();
    const updateStateMap = new Map<string, BundleUpdateState>();
    const installProgressListeners = new Set<(state: BundleInstallProgressState) => void>();
    const updateStateListeners = new Set<(state: BundleUpdateState) => void>();

    const setBundleInstallProgress = (next: BundleInstallProgressState) => {
        installProgressMap.set(next.bundleId, clone(next));
        emit(installProgressListeners, next);
    };

    const setBundleUpdateState = (next: BundleUpdateState) => {
        updateStateMap.set(next.instanceId, clone(next));
        emit(updateStateListeners, next);
    };

    const runInstallSimulation = async (bundleId: string): Promise<void> => {
        const startedAtUtc = new Date().toISOString();
        const total = HARNESS_FAKE_BUNDLE_TOTAL_BYTES;

        setBundleInstallProgress({
            bundleId,
            status: "resolving",
            sizeBytes: total,
            bytesDownloaded: 0,
            progressPercent: 0,
            startedAtUtc,
        });
        await delay(HARNESS_BUNDLE_PROGRESS_TICK_MS);

        for (const fraction of [0, 0.25, 0.5, 0.75, 1.0]) {
            setBundleInstallProgress({
                bundleId,
                status: "downloading",
                sizeBytes: total,
                bytesDownloaded: Math.round(total * fraction),
                progressPercent: Math.round(fraction * 100),
                startedAtUtc,
            });
            await delay(HARNESS_BUNDLE_PROGRESS_TICK_MS);
        }

        for (const status of ["verifying", "extracting", "installing"] as const) {
            setBundleInstallProgress({
                bundleId,
                status,
                sizeBytes: total,
                bytesDownloaded: total,
                progressPercent: 100,
                startedAtUtc,
            });
            await delay(HARNESS_BUNDLE_PROGRESS_TICK_MS);
        }

        setBundleInstallProgress({
            bundleId,
            status: "done",
            sizeBytes: total,
            bytesDownloaded: total,
            progressPercent: 100,
            startedAtUtc,
            completedAtUtc: new Date().toISOString(),
        });
    };

    const runUpdateSimulation = async (instanceId: string): Promise<BundleUpdateState> => {
        const startedAtUtc = new Date().toISOString();
        const total = HARNESS_FAKE_BUNDLE_TOTAL_BYTES;
        const baseFields = {
            instanceId,
            localVersion: "1.2.3",
            localBuildNumber: 12,
            remoteVersion: "1.2.4",
            remoteBuildNumber: 13,
            sizeBytes: total,
            startedAtUtc,
        };

        for (const fraction of [0, 0.25, 0.5, 0.75, 1.0]) {
            setBundleUpdateState({
                ...baseFields,
                status: "downloading",
                bytesDownloaded: Math.round(total * fraction),
                progressPercent: Math.round(fraction * 100),
            });
            await delay(HARNESS_BUNDLE_PROGRESS_TICK_MS);
        }

        for (const status of ["verifying", "applying"] as const) {
            setBundleUpdateState({
                ...baseFields,
                status,
                bytesDownloaded: total,
                progressPercent: 100,
            });
            await delay(HARNESS_BUNDLE_PROGRESS_TICK_MS);
        }

        const finalState: BundleUpdateState = {
            ...baseFields,
            status: "done",
            localVersion: baseFields.remoteVersion,
            localBuildNumber: baseFields.remoteBuildNumber,
            bytesDownloaded: total,
            progressPercent: 100,
            completedAtUtc: new Date().toISOString(),
        };
        setBundleUpdateState(finalState);
        return clone(finalState);
    };

    return {
        diagnostics: {
            async getBuildInfo() {
                return clone(harnessBuildInfo);
            },
            async reportStartupFatal() {
                return;
            },
        },
        updater: {
            async check() {
                setUpdaterState({
                    ...updaterState,
                    status: updaterState.updateAvailable ? "available" : "upToDate",
                    checkedAtUtc: new Date().toISOString(),
                });
                return {
                    configured: true,
                    currentVersion: updaterState.currentVersion,
                    updateAvailable: updaterState.updateAvailable,
                    latestVersion: updaterState.latestVersion,
                    notes: updaterState.notes,
                    publishedAtUtc: updaterState.publishedAtUtc,
                    channel: updaterState.channel,
                    checkedAtUtc: updaterState.checkedAtUtc || new Date().toISOString(),
                };
            },
            async downloadAndInstall(): Promise<LauncherInstallUpdateResult> {
                setUpdaterState({
                    ...updaterState,
                    status: "downloading",
                    progressPercent: 30,
                    downloadedBytes: 15_000_000,
                    totalBytes: 50_000_000,
                });
                await delay(60);
                setUpdaterState({
                    ...updaterState,
                    status: "readyToInstall",
                    progressPercent: 100,
                    downloadedBytes: 50_000_000,
                    totalBytes: 50_000_000,
                });
                return {
                    started: true,
                    version: updaterState.latestVersion || "0.1.2",
                    filePath: "C:/Temp/BAPBAP Launcher V2 Setup 0.1.2.exe",
                };
            },
            async getState() {
                return clone(updaterState);
            },
            onStateChanged(listener) {
                updaterListeners.add(listener);
                return () => updaterListeners.delete(listener);
            },
        },
        settings: {
            async getAll() {
                return clone(settings);
            },
            async set(key, value) {
                settings = {
                    ...settings,
                    [key]: value,
                };
            },
            async unlockToolsTab(code) {
                const normalizedCode = `${code || ""}`.trim();
                if (normalizedCode !== "ItsAMobileGame") {
                    return false;
                }
                settings = {
                    ...settings,
                    toolsUnlocked: true,
                };
                return true;
            },
            async unlockSecretMods(password) {
                const normalizedPassword = `${password || ""}`.trim();
                if (!normalizedPassword) {
                    return false;
                }
                const passwordSha256 = await computeSha256Hex(normalizedPassword);
                const matchedUnlock = (manifestIndex.secretUnlocks || []).find(entry => entry.passwordSha256 === passwordSha256);
                if (matchedUnlock) {
                    const unlockedIds = new Set(settings.modsUnlockedSecretIds || []);
                    unlockedIds.add(matchedUnlock.id);
                    settings = {
                        ...settings,
                        modsSecretUnlocked: true,
                        modsUnlockedSecretIds: Array.from(unlockedIds),
                    };
                    return true;
                }
                return false;
            },
            async revealBundles(code) {
                const normalizedCode = `${code || ""}`.trim();
                if (normalizedCode !== "itisaCIRCLEGame") {
                    return false;
                }
                settings = {
                    ...settings,
                    bundlesRevealed: true,
                };
                return true;
            },
        },
    dialog: {
        async chooseDirectory(input) {
            return input?.defaultPath || settings.instancesRoot || "C:/BAPBAP/Profiles";
        },
        async chooseAudioFiles() {
            return [];
        },
    },
        manifest: {
            async getIndex() {
                return clone(manifestIndex);
            },
            async getGameVersions() {
                return clone(gameVersions);
            },
            async getChannel() {
                return clone(channelManifest);
            },
            async getTrustedTimeState() {
                return clone(trustedTimeState);
            },
            onTrustedTimeChanged(listener) {
                trustedTimeListeners.add(listener);
                return () => trustedTimeListeners.delete(listener);
            },
        },
        instances: {
            async list() {
                // Bundle Instances stay hidden until the user reveals them in
                // settings — mirrors the production launcher behaviour so the
                // renderer harness can exercise both states.
                const visible = instances.filter(item =>
                    item.instanceType === "bundle" ? settings.bundlesRevealed === true : true,
                );
                return clone(visible);
            },
            async installOfficial(input: InstallOfficialInput) {
                const version = gameVersions.versions.find(item => item.id === input.versionId);
                if (!version) {
                    throw new Error(`Unknown version: ${input.versionId}`);
                }
                const cleanProfileName = slugProfileName(input.profileName);
                const existingNames = new Set(instances.map(item => item.profileName.toLowerCase()));
                let finalProfileName = cleanProfileName;
                let suffix = 2;
                while (existingNames.has(finalProfileName.toLowerCase())) {
                    finalProfileName = `${cleanProfileName} ${suffix}`;
                    suffix += 1;
                }

                const targetPath = `${settings.instancesRoot || "C:/BAPBAP/Profiles"}/${finalProfileName}`;
                setInstallState({
                    status: "preparing",
                    versionId: version.id,
                    profileName: finalProfileName,
                    targetPath,
                    progressPercent: 0,
                });
                await delay(40);
                setInstallState({
                    status: "downloading",
                    versionId: version.id,
                    profileName: finalProfileName,
                    targetPath,
                    progressPercent: 46,
                    downloadedBytes: 46_000_000,
                    totalBytes: 100_000_000,
                });
                await delay(40);
                setInstallState({
                    status: "extracting",
                    versionId: version.id,
                    profileName: finalProfileName,
                    targetPath,
                    progressPercent: 80,
                });
                await delay(40);
                setInstallState({
                    status: "writingMetadata",
                    versionId: version.id,
                    profileName: finalProfileName,
                    targetPath,
                    progressPercent: 94,
                });
                await delay(40);

                const created: InstalledInstance = {
                    id: `profile-${finalProfileName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
                    profileName: finalProfileName,
                    versionId: version.id,
                    gameVersion: version.gameVersion,
                    name: finalProfileName,
                    version: version.gameVersion,
                    track: version.track,
                    path: targetPath,
                    imageUrl: version.imagePath,
                    officialManaged: true,
                    officialTrack: version.track,
                    lastUpdatedUtc: new Date().toISOString(),
                };

                instances = [...instances, created];
                contentStatesByInstance = {
                    ...contentStatesByInstance,
                    [created.id]: {},
                };
                modSetStatesByInstance = {
                    ...modSetStatesByInstance,
                    [created.id]: buildDefaultModSetState({}),
                };
                configEntriesByInstance = {
                    ...configEntriesByInstance,
                    [created.id]: [
                        {
                            path: "UserData/settings.json",
                            section: "UserData",
                            size: 126,
                            modifiedAtUtc: new Date().toISOString(),
                        },
                    ],
                };

                setInstallState({
                    status: "done",
                    versionId: version.id,
                    profileName: finalProfileName,
                    targetPath,
                    progressPercent: 100,
                });
                globalThis.setTimeout(() => setInstallState({ status: "idle" }), 120);
                return clone(created);
            },
            async getInstallState() {
                return clone(installState);
            },
            onInstallStateChanged(listener) {
                installListeners.add(listener);
                return () => installListeners.delete(listener);
            },
            async verify() {
                return true;
            },
            async hasRelativeFile(instanceId: string, relativePath: string) {
                if (electronApi?.instances?.hasRelativeFile) {
                    try {
                        const hasRealFile = await electronApi.instances.hasRelativeFile(instanceId, relativePath);
                        if (hasRealFile) {
                            return true;
                        }
                    } catch {
                        // Fall back to the deterministic harness map when the mocked id is not present in the real launcher state.
                    }
                }
                const normalizedPath = normalizeRelativeHarnessPath(relativePath);
                return relativeFilesByInstance[instanceId]?.has(normalizedPath) ?? false;
            },
            async installCustomMod(instanceId: string) {
                const instance = instances.find(item => item.id === instanceId);
                if (!instance) {
                    throw new Error(`Unknown instance: ${instanceId}`);
                }
                const fileName = "CustomHarnessMod.dll";
                const normalizedRelativePath = normalizeRelativeHarnessPath(`Mods/${fileName}`);
                const existingFiles = relativeFilesByInstance[instanceId] || new Set<string>();
                const overwritten = existingFiles.has(normalizedRelativePath);
                existingFiles.add(normalizedRelativePath);
                relativeFilesByInstance[instanceId] = existingFiles;
                return {
                    status: "installed" as const,
                    fileName,
                    overwritten,
                    destinationPath: `${instance.path}/Mods/${fileName}`,
                };
            },
            async remove(instanceId: string) {
                instances = instances.filter(item => item.id !== instanceId);
                delete contentStatesByInstance[instanceId];
                delete modSetStatesByInstance[instanceId];
                delete configEntriesByInstance[instanceId];
                delete relativeFilesByInstance[instanceId];
                if (settings.launchDefaultProfileId === instanceId) {
                    settings = { ...settings, launchDefaultProfileId: null };
                }
            },
        },
        launch: {
            async start(input) {
                const instance = instances.find(item => item.id === input.instanceId);
                if (!instance) {
                    throw new Error(`Unknown instance: ${input.instanceId}`);
                }
                runtimeLogs.length = 0;
                setRuntimeState({
                    status: "launching",
                    instanceId: instance.id,
                    profileName: instance.profileName,
                    startedAtUtc: new Date().toISOString(),
                });
                pushRuntimeLog({ stream: "system", message: `Preparing launch for ${instance.profileName}` });
                await delay(50);
                pushRuntimeLog({ stream: "stdout", message: "Loading profile config..." });
                pushRuntimeLog({ stream: "stdout", message: `Custom args: ${input.customArgs || "(none)"}` });
                setRuntimeState({
                    status: "running",
                    instanceId: instance.id,
                    profileName: instance.profileName,
                    pid: 8124,
                    startedAtUtc: new Date().toISOString(),
                });
                pushRuntimeLog({ stream: "stdout", message: "MelonLoader initialized." });
                pushRuntimeLog({ stream: "stdout", message: "Gameplay systems live." });
                instances = instances.map(item =>
                    item.id === instance.id
                        ? { ...item, melonLoaderFirstRunPending: false }
                        : item
                );
            },
            async stop() {
                if (runtimeState.status !== "running" && runtimeState.status !== "stopping") {
                    throw new Error("No launcher-managed game session is running.");
                }
                if (runtimeState.status === "stopping") {
                    return;
                }
                const startedAtUtc = runtimeState.startedAtUtc;
                const instanceId = runtimeState.instanceId;
                const profileName = runtimeState.profileName;
                const pid = runtimeState.pid;
                setRuntimeState({
                    status: "stopping",
                    instanceId,
                    profileName,
                    pid,
                    startedAtUtc,
                });
                pushRuntimeLog({ stream: "system", message: `Stopping ${profileName || "current game"}...` });
                await delay(40);
                setRuntimeState({
                    status: "exited",
                    instanceId,
                    profileName,
                    pid,
                    startedAtUtc,
                    exitedAtUtc: new Date().toISOString(),
                    exitCode: 1,
                });
                pushRuntimeLog({ stream: "system", message: "Game stopped from launcher." });
            },
            async getRuntimeState() {
                return clone(runtimeState);
            },
            onRuntimeStateChanged(listener) {
                runtimeStateListeners.add(listener);
                return () => runtimeStateListeners.delete(listener);
            },
            onRuntimeLog(listener) {
                runtimeLogListeners.add(listener);
                return () => runtimeLogListeners.delete(listener);
            },
        },
        content: {
            async listPackages() {
                return clone(packages);
            },
            async getPackageDetail(_channelId, packageId) {
                const detail = packageDetails[packageId];
                if (!detail) {
                    throw new Error(`Unknown package detail: ${packageId}`);
                }
                return clone(detail);
            },
            async listStates(instanceId) {
                return clone(contentStatesByInstance[instanceId] || {});
            },
            async getModSets(instanceId) {
                return clone(modSetStatesByInstance[instanceId] || buildDefaultModSetState(contentStatesByInstance[instanceId] || {}));
            },
            async createModSet(input) {
                const current = clone(modSetStatesByInstance[input.instanceId] || buildDefaultModSetState(contentStatesByInstance[input.instanceId] || {}));
                const sourceId = input.cloneFromModSetId || "";
                const sourceSet = sourceId ? current.sets.find(set => set.id === sourceId) || null : null;
                const nextSet = {
                    id: `set-${Date.now()}`,
                    name: input.name.trim() || `Mod set ${current.sets.length + 1}`,
                    updatedAtUtc: new Date().toISOString(),
                    packageStates: clone(sourceSet?.packageStates || {}),
                };
                const stagedState: ContentModSetState = {
                    activeModSetId: nextSet.id,
                    sets: [...current.sets, nextSet],
                };
                modSetStatesByInstance[input.instanceId] = stagedState;
                return this.activateModSet(input.instanceId, nextSet.id);
            },
            async renameModSet(instanceId, modSetId, name) {
                const current = clone(modSetStatesByInstance[instanceId] || buildDefaultModSetState(contentStatesByInstance[instanceId] || {}));
                current.sets = current.sets.map(set => set.id === modSetId ? { ...set, name: name.trim() || set.name, updatedAtUtc: new Date().toISOString() } : set);
                modSetStatesByInstance[instanceId] = current;
                return clone(current);
            },
            async deleteModSet(instanceId, modSetId) {
                const current = clone(modSetStatesByInstance[instanceId] || buildDefaultModSetState(contentStatesByInstance[instanceId] || {}));
                const nextSets = current.sets.filter(set => set.id !== modSetId);
                const nextState: ContentModSetState = {
                    activeModSetId: current.activeModSetId === modSetId ? (nextSets[0]?.id || "default") : current.activeModSetId,
                    sets: nextSets.length ? nextSets : buildDefaultModSetState(contentStatesByInstance[instanceId] || {}).sets,
                };
                modSetStatesByInstance[instanceId] = nextState;
                return clone(nextState);
            },
            async activateModSet(instanceId, modSetId) {
                const current = clone(modSetStatesByInstance[instanceId] || buildDefaultModSetState(contentStatesByInstance[instanceId] || {}));
                const targetSet = current.sets.find(set => set.id === modSetId) || current.sets[0];
                const nextStates: ContentStateMap = {};
                Object.entries(targetSet?.packageStates || {}).forEach(([key, value]) => {
                    nextStates[key] = {
                        status: value.enabled ? "installed-enabled" : "installed-disabled",
                        version: value.version,
                    };
                });
                contentStatesByInstance[instanceId] = nextStates;
                const nextState = syncHarnessActiveModSet({ ...current, activeModSetId: targetSet?.id || current.activeModSetId }, nextStates);
                modSetStatesByInstance[instanceId] = nextState;
                return clone(nextState);
            },
            async install(input) {
                const key = `release::${input.packageId.toLowerCase()}`;
                const states = clone(contentStatesByInstance[input.instanceId] || {});
                states[key] = { status: "installed-enabled", version: input.version };
                contentStatesByInstance[input.instanceId] = states;
                modSetStatesByInstance[input.instanceId] = syncHarnessActiveModSet(modSetStatesByInstance[input.instanceId] || buildDefaultModSetState(states), states);
            },
            async uninstall(instanceId, _channelId, packageId) {
                const key = `release::${packageId.toLowerCase()}`;
                const states = clone(contentStatesByInstance[instanceId] || {});
                delete states[key];
                contentStatesByInstance[instanceId] = states;
                modSetStatesByInstance[instanceId] = syncHarnessActiveModSet(modSetStatesByInstance[instanceId] || buildDefaultModSetState(states), states);
            },
            async setEnabled(input) {
                const key = `release::${input.packageId.toLowerCase()}`;
                const states = clone(contentStatesByInstance[input.instanceId] || {});
                const current = states[key];
                if (!current) {
                    return;
                }
                states[key] = {
                    ...current,
                    status: input.enabled ? "installed-enabled" : "installed-disabled",
                };
                contentStatesByInstance[input.instanceId] = states;
                modSetStatesByInstance[input.instanceId] = syncHarnessActiveModSet(modSetStatesByInstance[input.instanceId] || buildDefaultModSetState(states), states);
            },
            async bulkApply(input: ContentBulkApplyInput): Promise<ContentBulkApplyResult> {
                const states = clone(contentStatesByInstance[input.instanceId] || {});
                const results: ContentBulkApplyResult["results"] = [];
                input.packageIds.forEach(packageId => {
                    const key = `release::${packageId.toLowerCase()}`;
                    if (input.action === "install") {
                        states[key] = {
                            status: "installed-enabled",
                            version: input.versionByPackage?.[packageId] || packageDetails[packageId]?.latestVersion || "1.0.0",
                        };
                    } else if (input.action === "enable" && states[key]) {
                        states[key] = { ...states[key], status: "installed-enabled" };
                    } else if (input.action === "disable" && states[key]) {
                        states[key] = { ...states[key], status: "installed-disabled" };
                    } else if (input.action === "uninstall") {
                        delete states[key];
                    }
                    results.push({ packageId, ok: true });
                });
                contentStatesByInstance[input.instanceId] = states;
                modSetStatesByInstance[input.instanceId] = syncHarnessActiveModSet(modSetStatesByInstance[input.instanceId] || buildDefaultModSetState(states), states);
                return {
                    total: input.packageIds.length,
                    successCount: results.length,
                    failedCount: 0,
                    results,
                };
            },
        },
        config: {
            async list(instanceId) {
                return clone(configEntriesByInstance[instanceId] || []);
            },
            async read(_instanceId, filePath) {
                const content = configContentByKey[filePath];
                if (!content) {
                    throw new Error(`Unknown config file: ${filePath}`);
                }
                return clone(content);
            },
            async write(_instanceId, filePath, content) {
                configContentByKey[filePath] = {
                    path: filePath,
                    extension: filePath.endsWith(".json") ? ".json" : ".cfg",
                    content,
                };
            },
        },
        radio: {
        async getState() {
            return clone(radioState);
        },
        async sync() {
                setRadioState({
                    ...radioState,
                    sync: {
                        ...radioState.sync,
                        status: "ready",
                        lastSyncedAtUtc: new Date().toISOString(),
                },
            });
            return clone(radioState);
        },
        async importTracks(filePaths: string[]) {
            const nextTracks = filePaths
                .map((filePath, index) => {
                    const fileName = `${filePath}`.split(/[\\/]/).pop() || `Imported Track ${index + 1}`;
                    const title = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || `Imported Track ${index + 1}`;
                    return {
                        id: `import-${Date.now().toString(36)}-${index}`,
                        title,
                        artists: ["Local import"],
                        group: "Imported songs",
                        durationMs: 0,
                        playbackUrl: harnessAudioFixture,
                        audioUrl: harnessAudioFixture,
                        sha256: `import-${index}`,
                        order: radioState.tracks.length + index,
                        availableOffline: true,
                        source: "local-import" as const,
                        importedAtUtc: new Date().toISOString(),
                        localFilePath: filePath,
                    };
                })
                .filter(track => track.title);
            setRadioState({
                ...radioState,
                tracks: [...radioState.tracks, ...nextTracks],
                sync: {
                    ...radioState.sync,
                    importedTrackCount: radioState.sync.importedTrackCount + nextTracks.length,
                },
            });
            return clone(radioState);
        },
        async createPlaylist(name: string) {
                const playlist: RadioPlaylist = {
                    id: `playlist-${Date.now().toString(36)}`,
                    name: name.trim() || "New playlist",
                    trackIds: [],
                };
                setRadioState({
                    ...radioState,
                    playlists: [...radioState.playlists, playlist],
                });
                return clone(playlist);
            },
            async renamePlaylist(id: string, name: string) {
                const playlists = radioState.playlists.map(playlist =>
                    playlist.id === id
                        ? { ...playlist, name: name.trim() || playlist.name }
                        : playlist
                );
                setRadioState({
                    ...radioState,
                    playlists,
                });
                return clone(playlists.find(playlist => playlist.id === id) || { id, name, trackIds: [] });
            },
            async deletePlaylist(id: string) {
                setRadioState({
                    ...radioState,
                    playlists: radioState.playlists.filter(playlist => playlist.id !== id),
                    playback: radioState.playback.collection.kind === "playlist" && radioState.playback.collection.playlistId === id
                        ? { ...radioState.playback, collection: { kind: "all-tracks" } }
                        : radioState.playback,
                });
            },
            async setPlaylistTracks(id: string, trackIds: string[]) {
                const playlists = radioState.playlists.map(playlist =>
                    playlist.id === id
                        ? { ...playlist, trackIds: Array.from(new Set(trackIds)) }
                        : playlist
                );
                setRadioState({
                    ...radioState,
                    playlists,
                });
                return clone(playlists.find(playlist => playlist.id === id) || { id, name: "Playlist", trackIds });
            },
            async toggleFavorite(trackId: string) {
                const favorites = new Set(radioState.favoriteTrackIds);
                if (favorites.has(trackId)) {
                    favorites.delete(trackId);
                } else {
                    favorites.add(trackId);
                }
                setRadioState({
                    ...radioState,
                    favoriteTrackIds: Array.from(favorites),
                });
                return clone(radioState);
            },
            async setQueue(trackIds: string[]) {
                setRadioState({
                    ...radioState,
                    playback: {
                        ...radioState.playback,
                        queueTrackIds: trackIds,
                    },
                });
                return clone(radioState);
            },
            async enqueue(trackId: string) {
                setRadioState({
                    ...radioState,
                    playback: {
                        ...radioState.playback,
                        queueTrackIds: [...radioState.playback.queueTrackIds, trackId],
                    },
                });
                return clone(radioState);
            },
            async removeFromQueue(trackId: string) {
                setRadioState({
                    ...radioState,
                    playback: {
                        ...radioState.playback,
                        queueTrackIds: radioState.playback.queueTrackIds.filter(id => id !== trackId),
                    },
                });
                return clone(radioState);
            },
            async clearQueue() {
                setRadioState({
                    ...radioState,
                    playback: {
                        ...radioState.playback,
                        queueTrackIds: [],
                    },
                });
                return clone(radioState);
            },
            async setPlaybackState(input: RadioSetPlaybackStateInput) {
                setRadioState({
                    ...radioState,
                    playback: {
                        ...radioState.playback,
                        ...input,
                    },
                });
                return clone(radioState);
            },
            onStateChanged(listener) {
                radioStateListeners.add(listener);
                return () => radioStateListeners.delete(listener);
            },
        },
        rebalance: {
            async invoke(command: string, args?: Record<string, unknown>) {
                if (electronApi?.rebalance?.invoke) {
                    return electronApi.rebalance.invoke(command, args);
                }
                throw new Error("Rebalance tools are not available in the browser harness.");
            },
            async fileSrc(targetPath: string) {
                if (electronApi?.rebalance?.fileSrc) {
                    return electronApi.rebalance.fileSrc(targetPath);
                }
                return targetPath;
            },
        },
        bundle: {
            // The browser harness ships TWO BundleSummaries so the
            // Instances workspace can showcase the per-bundle tile layout
            // (with author-supplied display names coming from each
            // bundle's manifest.json `name` field) without a real Bundle
            // Instance pipeline. Names mirror what
            // BundleService.listAvailable() reads on the main side, so
            // the harness tile rendering matches the real launcher
            // one-to-one.
            //
            // Tests that need an empty-state fallback render
            // InstancesWorkspace directly with `bundleSummaries={[]}` —
            // see InstancesWorkspace.test.tsx.
            async listAvailable() {
                return [
                    {
                        id: "circle-test",
                        name: "CIRCLE Test Pack",
                        channel: "stable",
                        version: "0.1.0",
                        buildNumber: 1,
                        isInstalled: false,
                        isUpdateAvailable: false,
                    },
                    {
                        id: "demo-pack",
                        name: "Demo Showcase Bundle",
                        channel: "stable",
                        version: "1.2.3",
                        buildNumber: 12,
                        isInstalled: false,
                        isUpdateAvailable: false,
                    },
                ];
            },
            // Deterministic install / remove / checkForUpdate / applyUpdate
            // stubs so the renderer (notably BundleUpdateGate, see
            // docs/bundle-instance/track-4-must-update-gate.md) can drive
            // gate-state transitions in the harness without a real Bundle
            // Instance pipeline. install + applyUpdate now walk through
            // the full simulated progress sequence (see
            // runInstallSimulation / runUpdateSimulation above) so the
            // new progress bar UI animates deterministically. Each stub
            // performs no disk I/O, network calls, or extraction work.
            async install(bundleId: string, profileName?: string) {
                const fallbackName =
                    bundleId === "circle-test"
                        ? "CIRCLE Test Pack"
                        : bundleId === "demo-pack"
                            ? "Demo Showcase Bundle"
                            : bundleId;
                const finalProfileName = `${profileName || fallbackName}`.trim() || fallbackName;
                const version = bundleId === "demo-pack" ? "1.2.3" : "0.1.0";
                // Walk the simulated progress states first so harness
                // viewers can see the animation. The InstalledInstance
                // is materialised once the walk reaches "done".
                await runInstallSimulation(bundleId);
                const created: InstalledInstance = {
                    id: `bundle-${bundleId}`,
                    profileName: finalProfileName,
                    versionId: `bundle:${bundleId}`,
                    gameVersion: "bundle",
                    name: finalProfileName,
                    version,
                    track: "bundle",
                    path: `${settings.instancesRoot || "C:/BAPBAP/Profiles"}/${finalProfileName}`,
                    officialManaged: true,
                    officialTrack: "bundle",
                    lastUpdatedUtc: new Date().toISOString(),
                };
                instances = [...instances, created];
                return clone(created);
            },
            async remove(instanceId: string) {
                instances = instances.filter(item => item.id !== instanceId);
            },
            async checkForUpdate(instanceId: string) {
                return {
                    instanceId,
                    status: "up-to-date" as const,
                    localVersion: "1.2.3",
                    localBuildNumber: 12,
                    remoteVersion: "1.2.3",
                    remoteBuildNumber: 12,
                };
            },
            async applyUpdate(instanceId: string) {
                return runUpdateSimulation(instanceId);
            },
            async getUpdateState(instanceId: string) {
                return clone(
                    updateStateMap.get(instanceId) ?? { instanceId, status: "idle" },
                );
            },
            onUpdateStateChanged(listener) {
                updateStateListeners.add(listener);
                return () => {
                    updateStateListeners.delete(listener);
                };
            },
            // Harness-only install-progress surface (see HarnessBundleApi
            // in this file). Drives the new progress bar UI from the
            // renderer harness without changing the shared/ipc.ts contract.
            async getInstallProgressState(bundleId: string) {
                return clone(
                    installProgressMap.get(bundleId) ?? { bundleId, status: "idle" },
                );
            },
            onInstallProgressChanged(listener) {
                installProgressListeners.add(listener);
                return () => {
                    installProgressListeners.delete(listener);
                };
            },
        },
    };
}
