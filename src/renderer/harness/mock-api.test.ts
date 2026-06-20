import { describe, expect, it } from "vitest";
import type { BundleInstallProgressState } from "../../shared/ipc";
import { createHarnessApi } from "./mock-api";

describe("createHarnessApi", () => {
    it("creates a new named profile on official install without overwriting the same version", async () => {
        const api = createHarnessApi();
        const before = await api.instances.list();
        const created = await api.instances.installOfficial({
            versionId: "latest",
            profileName: "Standard",
        });
        const after = await api.instances.list();

        expect(after).toHaveLength(before.length + 1);
        expect(created.profileName).toBe("Standard 2");
        expect(created.path).toContain("Standard 2");
    });

    it("mutates content states through bulk install for the chosen instance", async () => {
        const api = createHarnessApi();
        await api.content.bulkApply({
            action: "install",
            channelId: "release",
            instanceId: "profile-standard",
            packageIds: ["sonic.bapbap.arena-random-chars", "sonic.bapbap.fps-camera"],
            versionByPackage: {
                "sonic.bapbap.arena-random-chars": "1.0.0",
                "sonic.bapbap.fps-camera": "0.2.0",
            },
        });

        const states = await api.content.listStates("profile-standard");
        expect(states["release::sonic.bapbap.arena-random-chars"]?.status).toBe("installed-enabled");
        expect(states["release::sonic.bapbap.fps-camera"]?.version).toBe("0.2.0");
    });

    it("can switch into the messy-real preset fixture", async () => {
        const originalWindow = globalThis.window;
        Object.defineProperty(globalThis, "window", {
            configurable: true,
            value: {
                __V2_HARNESS_STATE__: {
                    enabled: true,
                    workspace: "mods",
                    panel: "none",
                    preset: "messy-real",
                },
            },
        });

        try {
            const api = createHarnessApi();
            const settings = await api.settings.getAll();
            const modSets = await api.content.getModSets("profile-standard");
            const states = await api.content.listStates("profile-standard");

            expect(settings.modsSecretUnlocked).toBe(true);
            expect(settings.modsUnlockedSecretIds).toContain("default");
            expect(settings.leftRailCollapsed).toBe(true);
            expect(modSets.activeModSetId).toBe("set-stream");
            expect(modSets.sets).toHaveLength(3);
            expect(states["release::sonic.bapbap.arena-random-chars"]?.status).toBe("installed-enabled");
        } finally {
            if (originalWindow === undefined) {
                delete (globalThis as { window?: Window }).window;
            } else {
                Object.defineProperty(globalThis, "window", {
                    configurable: true,
                    value: originalWindow,
                });
            }
        }
    });

    it("unlocks manifest-defined secret groups via password hash", async () => {
        const api = createHarnessApi();

        expect((await api.settings.getAll()).modsUnlockedSecretIds).toEqual([]);

        const unlocked = await api.settings.unlockSecretMods("slimeking");
        const settings = await api.settings.getAll();

        expect(unlocked).toBe(true);
        expect(settings.modsSecretUnlocked).toBe(true);
        expect(settings.modsUnlockedSecretIds).toContain("default");
    });

    it("checks rebalance DLL availability per instance instead of path-only", async () => {
        const api = createHarnessApi();

        await expect(api.instances.hasRelativeFile("profile-standard", "Mods\\BAPBAPBalanceMod.dll")).resolves.toBe(false);
        await expect(api.instances.hasRelativeFile("profile-creator-kit", "Mods\\BAPBAPBalanceMod.dll")).resolves.toBe(true);
        await expect(api.instances.hasRelativeFile("profile-boss-rush", "Mods\\BAPBAPBalanceMod.dll")).resolves.toBe(false);
    });

    it("normalizes slash direction and casing when checking rebalance DLL availability", async () => {
        const api = createHarnessApi();

        await expect(api.instances.hasRelativeFile("profile-creator-kit", "mods/bapbapbalancemod.dll")).resolves.toBe(true);
        await expect(api.instances.hasRelativeFile("steam:c:/steam/steamapps/common/bapbap", "Mods/BAPBAPBalanceMod.dll")).resolves.toBe(true);
    });

    it("walks bundle.install through the simulated progress sequence and emits at least 5 distinct statuses", async () => {
        const api = createHarnessApi();
        // The harness always wires the install-progress facade. The
        // duplicate optional/required declarations in shared/ipc.ts mean
        // TypeScript treats these methods as `?`, so capture them up
        // front and assert they exist before driving the simulation.
        const onInstallProgressChanged = api.bundle.onInstallProgressChanged;
        const getInstallProgressState = api.bundle.getInstallProgressState;
        expect(onInstallProgressChanged).toBeDefined();
        expect(getInstallProgressState).toBeDefined();

        const observed: BundleInstallProgressState["status"][] = [];
        const off = onInstallProgressChanged!(state => {
            observed.push(state.status);
        });

        try {
            await api.bundle.install("circle-test");
        } finally {
            off();
        }

        const distinct = new Set(observed);
        expect(distinct.size).toBeGreaterThanOrEqual(5);
        expect(distinct.has("resolving")).toBe(true);
        expect(distinct.has("downloading")).toBe(true);
        expect(distinct.has("verifying")).toBe(true);
        expect(distinct.has("extracting")).toBe(true);
        expect(distinct.has("installing")).toBe(true);
        expect(distinct.has("done")).toBe(true);

        // Final state survives in the install-progress map so the
        // bundle.getInstallProgressState read path stays in sync with
        // the listener stream.
        const finalState = await getInstallProgressState!("circle-test");
        expect(finalState.status).toBe("done");
        expect(finalState.progressPercent).toBe(100);
    });
});
