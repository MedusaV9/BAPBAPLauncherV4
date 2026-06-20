import type { LaunchRuntimeState } from "../../shared/ipc";

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
