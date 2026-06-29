import { describe, expect, it } from "vitest";
import type { LaunchRuntimeState } from "../../shared/ipc";
import { getLaunchRuntimeLabel, resolveModeVideoKey } from "./launch-ui";

function state(over: Partial<LaunchRuntimeState>): LaunchRuntimeState {
    return { status: "idle", recentLogs: [], ...over } as LaunchRuntimeState;
}

describe("getLaunchRuntimeLabel", () => {
    it("maps the simple statuses", () => {
        expect(getLaunchRuntimeLabel(state({ status: "launching" }))).toBe("Launching");
        expect(getLaunchRuntimeLabel(state({ status: "stopping" }))).toBe("Stopping");
        expect(getLaunchRuntimeLabel(state({ status: "running" }))).toBe("Running");
        expect(getLaunchRuntimeLabel(state({ status: "failed" }))).toBe("Failed");
        expect(getLaunchRuntimeLabel(state({ status: "idle" }))).toBe("Idle");
    });

    it("includes the exit code only when it is a number", () => {
        expect(getLaunchRuntimeLabel(state({ status: "exited", exitCode: 0 }))).toBe("Exited (0)");
        expect(getLaunchRuntimeLabel(state({ status: "exited", exitCode: 1 }))).toBe("Exited (1)");
        expect(getLaunchRuntimeLabel(state({ status: "exited" }))).toBe("Exited");
    });
});

describe("resolveModeVideoKey", () => {
    it("maps each track to its own background video", () => {
        expect(resolveModeVideoKey("boss-rush")).toBe("boss-rush");
        expect(resolveModeVideoKey("bundle")).toBe("battle-royale");
        expect(resolveModeVideoKey("bapbap")).toBe("standard");
        expect(resolveModeVideoKey("steam")).toBe("standard");
    });

    it("falls back to standard for unknown or missing tracks", () => {
        expect(resolveModeVideoKey(undefined)).toBe("standard");
        expect(resolveModeVideoKey("something-else")).toBe("standard");
    });
});
