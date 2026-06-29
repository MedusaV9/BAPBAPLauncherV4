import { describe, expect, it } from "vitest";
import type { AppSettings } from "./ipc";
import { applyLockedFxSettings, LOCKED_FX_SETTINGS } from "./fx-settings";

function createSettings(overrides: Partial<AppSettings> = {}): AppSettings {
    return {
        manifestUrl: "https://example.test/manifest/index.json",
        launcherAutoUpdate: true,
        launcherAutoDownloadUpdates: true,
        launcherAutoInstallOnNextStart: true,
        toolsUnlocked: false,
        bundlesRevealed: false,
        modsSecretUnlocked: false,
        modsUnlockedSecretIds: [],
        launchShowMelonConsole: true,
        launchHideMelonLoaderStartupWarning: false,
        launchDefaultProfileId: null,
        launchAutoplayVideos: true,
        instancesRoot: "C:/BAPBAP/Profiles",
        leftRailCollapsed: false,
        leftRailAutoHover: true,
        instancesViewMode: "tiles",
        contentViewMode: "tiles",
        uiMotionProfile: "minimal",
        uiMotionTier: "low",
        uiMotionMaximalFx: false,
        uiMotionEnabled: true,
        uiMotionAdaptive: true,
        uiMotionSpeed: 0.87,
        uiOnboardingCompleted: true,
        setupVersionCompleted: 3,
        debugShowEffectLab: false,
        radioVolume: 0.72,
        radioMuted: false,
        radioCrossfadeMs: 2200,
        radioAutoplayOnLaunch: false,
        radioRememberPlaybackState: true,
        uiScale: 1,
        closeToTrayEnabled: true,
        language: "en",
        brAccountId: "custom-test00000000",
        ...overrides,
    };
}

describe("locked fx settings", () => {
    it("normalizes any settings object to the shared shipped preset", () => {
        const normalized = applyLockedFxSettings(createSettings());

        expect(normalized.uiMotionProfile).toBe(LOCKED_FX_SETTINGS.uiMotionProfile);
        expect(normalized.uiMotionTier).toBe(LOCKED_FX_SETTINGS.uiMotionTier);
        expect(normalized.uiMotionMaximalFx).toBe(LOCKED_FX_SETTINGS.uiMotionMaximalFx);
        expect(normalized.uiMotionAdaptive).toBe(LOCKED_FX_SETTINGS.uiMotionAdaptive);
        expect(normalized.uiMotionSpeed).toBe(LOCKED_FX_SETTINGS.uiMotionSpeed);
        expect(normalized.uiMotionEnabled).toBe(true);
    });
});
