export const CURRENT_SETUP_VERSION = 3;

export type LauncherFeelMode = "cinematic" | "reduced";

export type LauncherSetupQuickStartChoice = "standard" | "boss-rush" | "skip";

export type LauncherSetupDraft = {
    instancesRoot: string;
    launcherAutoUpdate: boolean;
    launcherFeelMode: LauncherFeelMode;
    radioVolume: number;
    radioCrossfadeMs: number;
    radioAutoplayOnLaunch: boolean;
    radioRememberPlaybackState: boolean;
    quickStartChoice: LauncherSetupQuickStartChoice;
};
