import fs from "node:fs";
import path from "node:path";
import electron from "electron";
import Store from "electron-store";
import type { AppSettings } from "../../../shared/ipc";
import { applyLockedFxSettings, isLockedFxSettingKey, LOCKED_FX_SETTINGS } from "../../../shared/fx-settings";
import { normalizeInstancesRootPath } from "../../../shared/instances-root";
import { CURRENT_SETUP_VERSION } from "../../../shared/setup";

const { app } = electron;

type StoreSchema = AppSettings;

const DEFAULT_MANIFEST_URL = "https://raw.githubusercontent.com/Sonic0810/BAPBAPLauncher/main/manifest/index.json";
export class SettingsStoreService {
    private readonly store: Store<StoreSchema>;

    constructor() {
        const defaultInstancesRoot = path.join(app.getPath("userData"), "instances");
        sanitizeStoreJsonFile(path.join(app.getPath("userData"), "bapbap-launcher-v2.json"));
        this.store = new Store<StoreSchema>({
            name: "bapbap-launcher-v2",
            defaults: {
                manifestUrl: DEFAULT_MANIFEST_URL,
                launcherAutoUpdate: true,
                launcherAutoDownloadUpdates: true,
                launcherAutoInstallOnNextStart: true,
                toolsUnlocked: false,
                bundlesRevealed: true,
                modsSecretUnlocked: false,
                modsUnlockedSecretIds: [],
                launchShowMelonConsole: true,
                launchHideMelonLoaderStartupWarning: false,
                launchDefaultProfileId: null,
                launchAutoplayVideos: true,
                leftRailCollapsed: false,
                leftRailAutoHover: true,
                instancesViewMode: "tiles",
                contentViewMode: "tiles",
                uiMotionProfile: LOCKED_FX_SETTINGS.uiMotionProfile,
                uiMotionTier: LOCKED_FX_SETTINGS.uiMotionTier,
                uiMotionMaximalFx: LOCKED_FX_SETTINGS.uiMotionMaximalFx,
                uiMotionEnabled: true,
                uiMotionAdaptive: LOCKED_FX_SETTINGS.uiMotionAdaptive,
                uiMotionSpeed: LOCKED_FX_SETTINGS.uiMotionSpeed,
                uiOnboardingCompleted: false,
                setupVersionCompleted: 0,
                debugShowEffectLab: false,
                radioVolume: 0.72,
                radioMuted: false,
                radioCrossfadeMs: 2200,
                radioAutoplayOnLaunch: false,
                radioRememberPlaybackState: true,
                uiScale: 1,
                instancesRoot: defaultInstancesRoot,
            },
        });
        this.normalizeStoredInstancesRoot(defaultInstancesRoot);
        this.ensureLockedFxSettings();
        this.migrateLegacySetupState();
    }

    getAll(): AppSettings {
        const defaultInstancesRoot = path.join(app.getPath("userData"), "instances");
        return applyLockedFxSettings({
            manifestUrl: this.store.get("manifestUrl"),
            launcherAutoUpdate: this.store.get("launcherAutoUpdate"),
            launcherAutoDownloadUpdates: this.store.get("launcherAutoDownloadUpdates"),
            launcherAutoInstallOnNextStart: this.store.get("launcherAutoInstallOnNextStart"),
            toolsUnlocked: this.store.get("toolsUnlocked"),
            bundlesRevealed: true,
            modsSecretUnlocked: this.store.get("modsSecretUnlocked"),
            modsUnlockedSecretIds: normalizeUnlockedSecretIds(this.store.get("modsUnlockedSecretIds")),
            launchShowMelonConsole: this.store.get("launchShowMelonConsole"),
            launchHideMelonLoaderStartupWarning: this.store.get("launchHideMelonLoaderStartupWarning"),
            launchDefaultProfileId: this.store.get("launchDefaultProfileId"),
            launchAutoplayVideos: this.store.get("launchAutoplayVideos"),
            instancesRoot: normalizeInstancesRootPath(this.store.get("instancesRoot"), defaultInstancesRoot),
            leftRailCollapsed: this.store.get("leftRailCollapsed"),
            leftRailAutoHover: this.store.get("leftRailAutoHover"),
            instancesViewMode: this.store.get("instancesViewMode"),
            contentViewMode: this.store.get("contentViewMode"),
            uiMotionProfile: this.store.get("uiMotionProfile"),
            uiMotionTier: this.store.get("uiMotionTier"),
            uiMotionMaximalFx: this.store.get("uiMotionMaximalFx"),
            uiMotionEnabled: this.store.get("uiMotionEnabled"),
            uiMotionAdaptive: this.store.get("uiMotionAdaptive"),
            uiMotionSpeed: this.store.get("uiMotionSpeed"),
            uiOnboardingCompleted: this.store.get("uiOnboardingCompleted"),
            setupVersionCompleted: this.store.get("setupVersionCompleted"),
            debugShowEffectLab: this.store.get("debugShowEffectLab"),
            radioVolume: this.store.get("radioVolume"),
            radioMuted: this.store.get("radioMuted"),
            radioCrossfadeMs: this.store.get("radioCrossfadeMs"),
            radioAutoplayOnLaunch: this.store.get("radioAutoplayOnLaunch"),
            radioRememberPlaybackState: this.store.get("radioRememberPlaybackState"),
            uiScale: this.store.get("uiScale"),
        });
    }

    set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
        if (isLockedFxSettingKey(key)) {
            this.store.set(key, LOCKED_FX_SETTINGS[key] as never);
            return;
        }
        if (key === "instancesRoot") {
            const defaultInstancesRoot = path.join(app.getPath("userData"), "instances");
            this.store.set("instancesRoot", normalizeInstancesRootPath(String(value ?? ""), defaultInstancesRoot) as never);
            return;
        }
        if (key === "setupVersionCompleted") {
            const completedVersion = Number(value) || 0;
            this.store.set("setupVersionCompleted", completedVersion as never);
            this.store.set("uiOnboardingCompleted", (completedVersion >= CURRENT_SETUP_VERSION) as never);
            return;
        }
        if (key === "uiOnboardingCompleted") {
            const completed = Boolean(value);
            this.store.set("uiOnboardingCompleted", completed as never);
            this.store.set("setupVersionCompleted", (completed ? CURRENT_SETUP_VERSION : 0) as never);
            return;
        }
        if (key === "modsUnlockedSecretIds") {
            const normalized = normalizeUnlockedSecretIds(value);
            this.store.set("modsUnlockedSecretIds", normalized as never);
            this.store.set("modsSecretUnlocked", (normalized.length > 0) as never);
            return;
        }
        if (key === "toolsUnlocked") {
            this.store.set("toolsUnlocked", Boolean(value) as never);
            return;
        }
        if (key === "bundlesRevealed") {
            // Always true — bundles are permanently unlocked.
            return;
        }
        if (key === "modsSecretUnlocked") {
            const enabled = Boolean(value);
            this.store.set("modsSecretUnlocked", enabled as never);
            if (!enabled) {
                this.store.set("modsUnlockedSecretIds", [] as never);
            }
            return;
        }
        this.store.set(key, value as never);
    }

    getManifestUrl(): string {
        return this.store.get("manifestUrl");
    }

    getInstancesRoot(): string {
        const defaultInstancesRoot = path.join(app.getPath("userData"), "instances");
        return normalizeInstancesRootPath(this.store.get("instancesRoot"), defaultInstancesRoot);
    }

    unlockToolsTab(): boolean {
        this.store.set("toolsUnlocked", true as never);
        return true;
    }

    revealBundles(): boolean {
        return true;
    }

    getBundlesRevealed(): boolean {
        return true;
    }

    getUiScale(): number {
        const value = Number(this.store.get("uiScale"));
        return Number.isFinite(value) ? Math.min(1.5, Math.max(0.8, value)) : 1;
    }

    unlockSecretMods(secretUnlockId: string): boolean {
        const normalized = `${secretUnlockId || ""}`.trim().toLowerCase();
        if (!normalized) {
            return false;
        }
        const unlocked = new Set(normalizeUnlockedSecretIds(this.store.get("modsUnlockedSecretIds")));
        unlocked.add(normalized);
        this.store.set("modsUnlockedSecretIds", Array.from(unlocked) as never);
        this.store.set("modsSecretUnlocked", true);
        return true;
    }

    private ensureLockedFxSettings(): void {
        for (const [key, value] of Object.entries(LOCKED_FX_SETTINGS) as Array<[keyof typeof LOCKED_FX_SETTINGS, (typeof LOCKED_FX_SETTINGS)[keyof typeof LOCKED_FX_SETTINGS]]>) {
            if (this.store.get(key) !== value) {
                this.store.set(key, value as never);
            }
        }
    }

    private migrateLegacySetupState(): void {
        const legacyCompleted = Boolean(this.store.get("uiOnboardingCompleted"));
        const rawVersion = Number(this.store.get("setupVersionCompleted") ?? 0);
        const normalizedVersion = Number.isFinite(rawVersion) ? Math.max(0, rawVersion) : 0;

        if (normalizedVersion <= 0 && legacyCompleted) {
            this.store.set("setupVersionCompleted", CURRENT_SETUP_VERSION);
        } else if (normalizedVersion >= CURRENT_SETUP_VERSION && !legacyCompleted) {
            this.store.set("uiOnboardingCompleted", true);
        }

        // Secret-mods consistency must run regardless of which setup-version
        // branch fired above, otherwise a legacy upgrade leaves the flag and the
        // id list out of sync until the next restart.
        const unlockedSecretIds = normalizeUnlockedSecretIds(this.store.get("modsUnlockedSecretIds"));
        const legacySecretUnlocked = Boolean(this.store.get("modsSecretUnlocked"));
        if (legacySecretUnlocked && unlockedSecretIds.length === 0) {
            this.store.set("modsUnlockedSecretIds", ["default"] as never);
        } else if (!legacySecretUnlocked && unlockedSecretIds.length > 0) {
            this.store.set("modsSecretUnlocked", true as never);
        }
    }

    private normalizeStoredInstancesRoot(defaultInstancesRoot: string): void {
        const current = this.store.get("instancesRoot");
        const normalized = normalizeInstancesRootPath(current, defaultInstancesRoot);
        if (current !== normalized) {
            this.store.set("instancesRoot", normalized);
        }
    }
}

function normalizeUnlockedSecretIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return Array.from(
        new Set(
            value
                .map(item => `${item || ""}`.trim().toLowerCase())
                .filter(Boolean)
        )
    );
}

function sanitizeStoreJsonFile(filePath: string): void {
    if (!fs.existsSync(filePath)) {
        return;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const sanitized = raw.replace(/^\uFEFF/, "");
    if (sanitized !== raw) {
        fs.writeFileSync(filePath, sanitized, "utf8");
    }
}
