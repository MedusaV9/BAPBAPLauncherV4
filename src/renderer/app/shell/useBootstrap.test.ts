import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stateful fake backend so the real useBootstrap state machine
// (splash → bootstrap → ready | fatal) runs against controllable IPC.
const back = vi.hoisted(() => ({
    buildInfo: { appVersion: "4.0.0" } as unknown,
    failBuildInfo: false,
    failIndex: false,
    failPersona: false,
    fatalReports: [] as Array<{ code: string; message: string }>,
}));

vi.mock("../../api", () => ({
    api: {
        diagnostics: {
            getBuildInfo: async () => {
                if (back.failBuildInfo) throw new Error("build info failed");
                return back.buildInfo;
            },
            reportStartupFatal: async (input: { code: string; message: string }) => {
                back.fatalReports.push(input);
                return undefined;
            },
        },
        settings: { getAll: async () => ({}) },
        manifest: {
            getIndex: async () => {
                if (back.failIndex) throw new Error("offline");
                return { channels: [] };
            },
        },
        instances: {
            getSteamPersonaName: async () => {
                if (back.failPersona) throw new Error("no steam");
                return "Tester";
            },
        },
    },
}));

import { useBootstrap } from "./useBootstrap";
import { useShellStore } from "../stores/useShellStore";

beforeEach(() => {
    back.failBuildInfo = false;
    back.failIndex = false;
    back.failPersona = false;
    back.fatalReports = [];
    useShellStore.setState({ startupPhase: "splash", fatalMessage: null });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe("useBootstrap (SHE-01 / SHE-03)", () => {
    it("reaches the ready phase after prefetching build info + settings", async () => {
        const { result } = renderHook(() => useBootstrap());
        await waitFor(() => expect(result.current).toBe("ready"));
        expect(useShellStore.getState().fatalMessage).toBeNull();
    });

    it("still reaches ready when the manifest and persona fetches fail (offline-tolerant)", async () => {
        back.failIndex = true;
        back.failPersona = true;
        const { result } = renderHook(() => useBootstrap());
        await waitFor(() => expect(result.current).toBe("ready"));
    });

    it("goes fatal and reports the startup error when a required prefetch throws (SHE-03)", async () => {
        back.failBuildInfo = true;
        const { result } = renderHook(() => useBootstrap());

        await waitFor(() => expect(result.current).toBe("fatal"));
        expect(useShellStore.getState().fatalMessage).toBe("build info failed");
        expect(back.fatalReports).toHaveLength(1);
        expect(back.fatalReports[0].code).toBe("V4_BOOTSTRAP_FAILED");
        expect(back.fatalReports[0].message).toBe("build info failed");
    });
});
