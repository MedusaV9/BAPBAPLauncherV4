import type { WorkspaceId } from "../app/types/workspaces";
import type { V2HarnessState } from "./types";

const VALID_WORKSPACES = new Set<WorkspaceId>(["instances", "launch", "mods", "tools", "radio", "settings"]);

export function resolveHarnessState(search: string): V2HarnessState {
    const params = new URLSearchParams(search);
    const presetParam = params.get("preset");
    if (presetParam === "effect-lab") {
        return {
            enabled: true,
            workspace: "settings",
            panel: "effect-lab",
            preset: "default",
        };
    }
    const preset =
        presetParam === "messy-real"
            ? "messy-real"
            : presetParam === "ribbon-demo"
                ? "ribbon-demo"
                : "default";
    const workspaceParam = params.get("workspace");
    const panelParam = params.get("panel");
    const workspace = workspaceParam && VALID_WORKSPACES.has(workspaceParam as WorkspaceId) ? (workspaceParam as WorkspaceId) : "instances";
    const panel = panelParam === "effect-lab" ? "effect-lab" : "none";

    return {
        enabled: true,
        workspace,
        panel,
        preset,
    };
}

export function readHarnessState(): V2HarnessState | null {
    if (typeof window === "undefined" || !window.__V2_HARNESS__) {
        return null;
    }
    return window.__V2_HARNESS_STATE__ ?? resolveHarnessState(window.location.search);
}
