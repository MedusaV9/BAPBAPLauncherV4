import type { AppSettings } from "./ipc";

export const LOCKED_FX_SETTINGS = {
    uiMotionProfile: "showcase",
    uiMotionTier: "showcase",
    uiMotionMaximalFx: true,
    uiMotionAdaptive: false,
    uiMotionSpeed: 1,
} as const satisfies Pick<AppSettings, "uiMotionProfile" | "uiMotionTier" | "uiMotionMaximalFx" | "uiMotionAdaptive" | "uiMotionSpeed">;

export function applyLockedFxSettings(settings: AppSettings): AppSettings {
    return {
        ...settings,
        ...LOCKED_FX_SETTINGS,
    };
}

export function isLockedFxSettingKey(key: keyof AppSettings): key is keyof typeof LOCKED_FX_SETTINGS {
    return key in LOCKED_FX_SETTINGS;
}
