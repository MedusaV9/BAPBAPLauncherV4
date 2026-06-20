import { describe, expect, it } from "vitest";
import type { InstalledInstance } from "../../shared/manifest";
import {
    bundlesVisibleForUser,
    fallbackWorkspaceWhenHidden,
    isBundleInstance,
    resolveInstanceType,
    visibleRailNavItems,
} from "./bundle-instance";

const baseInstance: InstalledInstance = {
    id: "test-id",
    profileName: "Standard",
    versionId: "v-1",
    gameVersion: "1.0",
    name: "BAPBAP",
    version: "1.0",
    track: "bapbap",
    path: "C:/instances/Standard",
    officialManaged: true,
    lastUpdatedUtc: "2026-01-01T00:00:00Z",
    instanceSource: "official-managed",
};

const bundleInstance: InstalledInstance = {
    ...baseInstance,
    id: "bundle-id",
    profileName: "Boss Rush",
    instanceType: "bundle",
    bundleId: "boss-rush",
    bundleChannel: "stable",
    bundleVersion: "1.0.0",
    bundleBuildNumber: 1,
};

describe("isBundleInstance", () => {
    it("returns false for null", () => {
        expect(isBundleInstance(null)).toBe(false);
    });

    it("returns false for undefined", () => {
        expect(isBundleInstance(undefined)).toBe(false);
    });

    it("returns false for a standard instance with no instanceType", () => {
        expect(isBundleInstance(baseInstance)).toBe(false);
    });

    it("returns false when instanceType is 'standard'", () => {
        expect(isBundleInstance({ ...baseInstance, instanceType: "standard" })).toBe(false);
    });

    it("returns false when instanceType is 'creator-kit'", () => {
        expect(isBundleInstance({ ...baseInstance, instanceType: "creator-kit" })).toBe(false);
    });

    it("returns true when instanceType is 'bundle'", () => {
        expect(isBundleInstance(bundleInstance)).toBe(true);
    });
});

describe("bundlesVisibleForUser", () => {
    it("returns false when bundlesRevealed is false (default)", () => {
        expect(bundlesVisibleForUser({ bundlesRevealed: false })).toBe(false);
    });

    it("returns true when bundlesRevealed is true", () => {
        expect(bundlesVisibleForUser({ bundlesRevealed: true })).toBe(true);
    });

    it("strictly mirrors the bundlesRevealed input flag", () => {
        // Smoke-check: helper must be a pure pass-through so callers can rely
        // on `bundlesVisibleForUser(settings) === settings.bundlesRevealed`.
        for (const value of [true, false] as const) {
            expect(bundlesVisibleForUser({ bundlesRevealed: value })).toBe(value);
        }
    });
});

describe("resolveInstanceType", () => {
    it("defaults to 'standard' when undefined", () => {
        expect(resolveInstanceType(baseInstance)).toBe("standard");
    });

    it("defaults to 'standard' when null/undefined input", () => {
        expect(resolveInstanceType(null)).toBe("standard");
        expect(resolveInstanceType(undefined)).toBe("standard");
    });

    it("returns 'bundle' for a Bundle Instance", () => {
        expect(resolveInstanceType(bundleInstance)).toBe("bundle");
    });

    it("returns 'creator-kit' when set", () => {
        expect(resolveInstanceType({ ...baseInstance, instanceType: "creator-kit" })).toBe("creator-kit");
    });
});

describe("visibleRailNavItems", () => {
    it("shows Mods + Tools for a standard instance with toolsUnlocked", () => {
        const items = visibleRailNavItems({ selectedInstance: baseInstance, toolsUnlocked: true });
        expect(items).toContain("mods");
        expect(items).toContain("tools");
        expect(items).toEqual(["instances", "launch", "mods", "tools", "radio", "settings"]);
    });

    it("hides Tools when toolsUnlocked is false on a standard instance", () => {
        const items = visibleRailNavItems({ selectedInstance: baseInstance, toolsUnlocked: false });
        expect(items).not.toContain("tools");
        expect(items).toContain("mods");
    });

    it("hides Mods, Tools, and Rebalance for a Bundle Instance", () => {
        const items = visibleRailNavItems({ selectedInstance: bundleInstance, toolsUnlocked: true });
        expect(items).not.toContain("mods");
        expect(items).not.toContain("tools");
        expect(items).toEqual(["instances", "launch", "radio", "settings"]);
    });

    it("hides Mods and Tools even when toolsUnlocked is true for a Bundle", () => {
        const items = visibleRailNavItems({ selectedInstance: bundleInstance, toolsUnlocked: true });
        expect(items).not.toContain("tools");
        expect(items).not.toContain("mods");
    });

    it("falls back to non-bundle nav when no instance selected", () => {
        const items = visibleRailNavItems({ selectedInstance: null, toolsUnlocked: false });
        expect(items).toContain("mods"); // before any instance is selected, Mods is reachable
    });
});

describe("fallbackWorkspaceWhenHidden", () => {
    it("returns null when the active workspace is still visible", () => {
        const result = fallbackWorkspaceWhenHidden({
            activeWorkspace: "instances",
            selectedInstance: bundleInstance,
            toolsUnlocked: true,
        });
        expect(result).toBeNull();
    });

    it("returns 'launch' when active is 'mods' on a Bundle", () => {
        const result = fallbackWorkspaceWhenHidden({
            activeWorkspace: "mods",
            selectedInstance: bundleInstance,
            toolsUnlocked: true,
        });
        expect(result).toBe("launch");
    });

    it("returns 'launch' when active is 'tools' on a Bundle", () => {
        const result = fallbackWorkspaceWhenHidden({
            activeWorkspace: "tools",
            selectedInstance: bundleInstance,
            toolsUnlocked: true,
        });
        expect(result).toBe("launch");
    });

    it("returns null when active is 'launch' on a Bundle (still visible)", () => {
        const result = fallbackWorkspaceWhenHidden({
            activeWorkspace: "launch",
            selectedInstance: bundleInstance,
            toolsUnlocked: true,
        });
        expect(result).toBeNull();
    });

    it("returns null when active is 'tools' but toolsUnlocked false on a standard instance", () => {
        // active workspace is already hidden because of toolsUnlocked, not bundle
        const result = fallbackWorkspaceWhenHidden({
            activeWorkspace: "tools",
            selectedInstance: baseInstance,
            toolsUnlocked: false,
        });
        expect(result).toBe("launch");
    });
});
