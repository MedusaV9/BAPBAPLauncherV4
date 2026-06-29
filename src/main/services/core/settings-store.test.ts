import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORE = vi.hoisted(() => ({ data: new Map<string, unknown>() }));

vi.mock("electron", () => {
    const app = { getPath: () => "/tmp/bapbap-settings-test" };
    return { default: { app }, app };
});

// In-memory electron-store replacement honoring defaults + get/set.
vi.mock("electron-store", () => {
    class FakeStore {
        private defaults: Record<string, unknown>;
        constructor(opts: { defaults?: Record<string, unknown> }) {
            this.defaults = opts.defaults ?? {};
            for (const [key, value] of Object.entries(this.defaults)) {
                if (!STORE.data.has(key)) STORE.data.set(key, value);
            }
        }
        get(key: string) {
            return STORE.data.has(key) ? STORE.data.get(key) : this.defaults[key];
        }
        set(key: string, value: unknown) {
            STORE.data.set(key, value);
        }
    }
    return { default: FakeStore };
});

import { SettingsStoreService } from "./settings-store";
import { CURRENT_SETUP_VERSION } from "../../../shared/setup";
import { LOCKED_FX_SETTINGS } from "../../../shared/fx-settings";

beforeEach(() => {
    STORE.data.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("SettingsStoreService", () => {
    it("exposes sane defaults through getAll", () => {
        const service = new SettingsStoreService();
        const settings = service.getAll();
        expect(settings.launcherAutoUpdate).toBe(true);
        expect(settings.toolsUnlocked).toBe(false);
        expect(settings.modsUnlockedSecretIds).toEqual([]);
        expect(settings.radioVolume).toBeCloseTo(0.72);
        // Rift intro and close-to-tray default on.
        expect(settings.riftIntroEnabled).toBe(true);
        expect(settings.closeToTrayEnabled).toBe(true);
        // Language defaults to English.
        expect(settings.language).toBe("en");
    });

    it("exposes rift/tray getters that honor stored values", () => {
        const service = new SettingsStoreService();
        expect(service.getRiftIntroEnabled()).toBe(true);
        expect(service.getCloseToTrayEnabled()).toBe(true);

        service.set("riftIntroEnabled", false);
        service.set("closeToTrayEnabled", false);
        expect(service.getRiftIntroEnabled()).toBe(false);
        expect(service.getCloseToTrayEnabled()).toBe(false);
    });

    it("forces locked FX settings to their canonical values, ignoring writes", () => {
        const service = new SettingsStoreService();
        // uiMotionProfile is a locked FX key — attempts to change it are ignored.
        service.set("uiMotionProfile", "minimal" as never);
        expect(service.getAll().uiMotionProfile).toBe(LOCKED_FX_SETTINGS.uiMotionProfile);
    });

    it("keeps setupVersionCompleted and uiOnboardingCompleted in sync", () => {
        const service = new SettingsStoreService();

        service.set("setupVersionCompleted", CURRENT_SETUP_VERSION);
        expect(service.getAll().uiOnboardingCompleted).toBe(true);

        service.set("uiOnboardingCompleted", false);
        expect(service.getAll().setupVersionCompleted).toBe(0);

        // A stale, lower completed-version must not count as onboarded.
        service.set("setupVersionCompleted", CURRENT_SETUP_VERSION - 1);
        expect(service.getAll().uiOnboardingCompleted).toBe(false);
    });

    it("derives modsSecretUnlocked from the unlocked-id list", () => {
        const service = new SettingsStoreService();

        service.set("modsUnlockedSecretIds", ["Alpha", "alpha", " beta "] as never);
        const settings = service.getAll();
        // Normalized: trimmed, lowercased, de-duped.
        expect(settings.modsUnlockedSecretIds).toEqual(["alpha", "beta"]);
        expect(settings.modsSecretUnlocked).toBe(true);

        // Clearing the flag also clears the id list.
        service.set("modsSecretUnlocked", false);
        const cleared = service.getAll();
        expect(cleared.modsSecretUnlocked).toBe(false);
        expect(cleared.modsUnlockedSecretIds).toEqual([]);
    });

    it("unlockSecretMods adds a normalized id and sets the flag", () => {
        const service = new SettingsStoreService();

        expect(service.unlockSecretMods("  Secret-One  ")).toBe(true);
        expect(service.unlockSecretMods("")).toBe(false);

        const settings = service.getAll();
        expect(settings.modsUnlockedSecretIds).toEqual(["secret-one"]);
        expect(settings.modsSecretUnlocked).toBe(true);
    });

    it("unlockToolsTab and revealBundles flip their flags", () => {
        const service = new SettingsStoreService();
        expect(service.getAll().toolsUnlocked).toBe(false);
        expect(service.unlockToolsTab()).toBe(true);
        expect(service.getAll().toolsUnlocked).toBe(true);

        // bundlesRevealed is permanently true — no code gate needed.
        expect(service.getBundlesRevealed()).toBe(true);
        expect(service.revealBundles()).toBe(true);
        expect(service.getBundlesRevealed()).toBe(true);
    });

    it("falls back to the default instances root when set to an empty value", () => {
        const service = new SettingsStoreService();
        const original = service.getInstancesRoot();
        service.set("instancesRoot", "" as never);
        // Empty input normalizes back to the default, not a blank path.
        expect(service.getInstancesRoot()).toBe(original);
    });

    it("heals secret-mods consistency during a legacy setup-version upgrade", () => {
        // Legacy state: onboarding done at version 0 (triggers the version
        // migration branch) AND the secret flag set with an empty id list.
        // The consistency block must still run in the same pass, not be skipped
        // by an early return after the version migration.
        STORE.data.set("uiOnboardingCompleted", true);
        STORE.data.set("setupVersionCompleted", 0);
        STORE.data.set("modsSecretUnlocked", true);
        STORE.data.set("modsUnlockedSecretIds", []);

        const service = new SettingsStoreService();
        const settings = service.getAll();
        expect(settings.setupVersionCompleted).toBe(CURRENT_SETUP_VERSION);
        expect(settings.modsUnlockedSecretIds).toEqual(["default"]);
        expect(settings.modsSecretUnlocked).toBe(true);
    });
});
