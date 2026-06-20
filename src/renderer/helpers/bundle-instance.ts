/**
 * Bundle Instance helpers.
 *
 * The Bundle Instance is a third instance type alongside the historical
 * "Standard" and "Creator Kit". On a Bundle Instance, the user can ONLY
 * Launch the game and (when an update is available) Update — no Tools,
 * no Mods, no Rebalance Studio. Updates are shipped via GitHub Releases.
 *
 * See docs/bundle-instance/BUNDLE_INSTANCE_MASTER_SPEC.md for the full design.
 */

import type { InstalledInstance, InstanceType } from "../../shared/manifest";

/**
 * The set of nav-rail entries the user can reach. All entries except the
 * always-visible "instances" / "launch" / "settings" are conditionally
 * suppressed for Bundle Instances. Mirrors the WorkspaceId union exactly.
 */
export type RailNavId =
    | "instances"
    | "launch"
    | "mods"
    | "tools"
    | "radio"
    | "settings";

/**
 * Returns true when an instance is a managed Bundle. Treats undefined
 * instanceType as "standard" so existing on-disk metadata keeps working
 * without migration.
 */
export function isBundleInstance(instance: InstalledInstance | null | undefined): boolean {
    return instance?.instanceType === "bundle";
}

/**
 * Returns true when the InstancesWorkspace should reveal the Bundle hero
 * tile and any already-installed Bundle Instances.
 *
 * The decision is gated by the `bundlesRevealed` flag the secret-code track
 * stores on `AppSettings`. The flag stays false by default so a fresh user
 * never sees the Bundle surface area (or any pre-existing Bundle Instance
 * left on disk by an older build) until they enter the reveal code in
 * Settings. See docs/bundle-instance/BUNDLE_INSTANCE_MASTER_SPEC.md.
 */
export function bundlesVisibleForUser(input: { bundlesRevealed: boolean }): boolean {
    return input.bundlesRevealed;
}

/**
 * Best-effort resolver for a given instance type. Defaults to "standard"
 * for anything legacy / unknown.
 */
export function resolveInstanceType(instance: InstalledInstance | null | undefined): InstanceType {
    return (instance?.instanceType as InstanceType | undefined) ?? "standard";
}

/**
 * Decide which nav-rail items should be visible given the currently selected
 * instance and the existing Tools-unlock toggle.
 *
 * Rules:
 *   - Bundle instance: only Instances, Launch, Radio, Settings. NO Mods,
 *     NO Tools, NO Rebalance.
 *   - Other instances: existing rules apply (Tools is gated by toolsUnlocked).
 *   - No instance selected (initial state): show all the user has unlocked.
 */
export function visibleRailNavItems(input: {
    selectedInstance: InstalledInstance | null | undefined;
    toolsUnlocked: boolean;
}): RailNavId[] {
    const { selectedInstance, toolsUnlocked } = input;

    const isBundle = isBundleInstance(selectedInstance);

    const items: RailNavId[] = ["instances", "launch"];

    if (!isBundle) {
        items.push("mods");
        if (toolsUnlocked) {
            items.push("tools");
        }
    }

    items.push("radio", "settings");
    return items;
}

/**
 * If the currently active workspace becomes hidden because the user just
 * selected a Bundle Instance, choose a safe replacement workspace. Returns
 * null when the active workspace is still visible.
 */
export function fallbackWorkspaceWhenHidden(input: {
    activeWorkspace: RailNavId;
    selectedInstance: InstalledInstance | null | undefined;
    toolsUnlocked: boolean;
}): RailNavId | null {
    const { activeWorkspace, selectedInstance, toolsUnlocked } = input;
    const visible = visibleRailNavItems({ selectedInstance, toolsUnlocked });
    if (visible.includes(activeWorkspace)) {
        return null;
    }
    // Prefer Launch when available (the user just clicked a Bundle, the
    // common intent is to launch it). Fall back to Instances otherwise.
    if (visible.includes("launch")) {
        return "launch";
    }
    return "instances";
}
