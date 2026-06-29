import type { LaunchRuntimeState } from "../../shared/ipc";

export type ModeVideoKey = "standard" | "boss-rush" | "battle-royale";

/** Maps an instance's track to its background video. boss-rush → boss-rush,
 *  bundle → battle-royale; everything else (bapbap, steam) → standard. */
export function resolveModeVideoKey(track: string | undefined): ModeVideoKey {
    if (track === "boss-rush") return "boss-rush";
    if (track === "bundle") return "battle-royale";
    return "standard";
}

export function getLaunchRuntimeLabel(state: LaunchRuntimeState): string {
    switch (state.status) {
        case "launching":
            return "Launching";
        case "stopping":
            return "Stopping";
        case "running":
            return "Running";
        case "exited":
            return typeof state.exitCode === "number" ? `Exited (${state.exitCode})` : "Exited";
        case "failed":
            return "Failed";
        default:
            return "Idle";
    }
}
