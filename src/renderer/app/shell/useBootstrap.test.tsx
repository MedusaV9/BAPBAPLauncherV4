import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiState = vi.hoisted(() => ({
    getBuildInfo: vi.fn(),
    getAll: vi.fn(),
    getIndex: vi.fn(),
    reportStartupFatal: vi.fn(),
}));

vi.mock("../../api", () => ({
    api: {
        diagnostics: {
            getBuildInfo: (...a: unknown[]) => apiState.getBuildInfo(...a),
            reportStartupFatal: (...a: unknown[]) => apiState.reportStartupFatal(...a),
        },
        settings: { getAll: (...a: unknown[]) => apiState.getAll(...a) },
        manifest: { getIndex: (...a: unknown[]) => apiState.getIndex(...a) },
    },
}));

const setQueryData = vi.hoisted(() => vi.fn());
vi.mock("../query/queryClient", () => ({ queryClient: { setQueryData: (...a: unknown[]) => setQueryData(...a) } }));

import { useBootstrap } from "./useBootstrap";
import { useShellStore } from "../stores/useShellStore";

beforeEach(() => {
    useShellStore.setState({ startupPhase: "splash", fatalMessage: null });
    apiState.getBuildInfo.mockResolvedValue({ appVersion: "4.0.0", environment: "test", buildTimestamp: "" });
    apiState.getAll.mockResolvedValue({ manifestUrl: "https://x/i.json" });
    apiState.getIndex.mockResolvedValue({ schemaVersion: 1 });
    apiState.reportStartupFatal.mockResolvedValue(undefined);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe("useBootstrap", () => {
    it("reaches 'ready' when build info, settings, and manifest all resolve", async () => {
        const { result } = renderHook(() => useBootstrap());

        await waitFor(() => expect(result.current).toBe("ready"));
        expect(setQueryData).toHaveBeenCalledWith(expect.anything(), { appVersion: "4.0.0", environment: "test", buildTimestamp: "" });
        expect(apiState.reportStartupFatal).not.toHaveBeenCalled();
    });

    it("still reaches 'ready' when the manifest fetch fails (best-effort, offline-tolerant)", async () => {
        apiState.getIndex.mockRejectedValue(new Error("offline"));

        const { result } = renderHook(() => useBootstrap());

        await waitFor(() => expect(result.current).toBe("ready"));
        expect(apiState.reportStartupFatal).not.toHaveBeenCalled();
    });

    it("goes 'fatal' and reports when a required bootstrap call rejects", async () => {
        apiState.getBuildInfo.mockRejectedValue(new Error("ipc down"));

        const { result } = renderHook(() => useBootstrap());

        await waitFor(() => expect(result.current).toBe("fatal"));
        expect(useShellStore.getState().fatalMessage).toBe("ipc down");
        expect(apiState.reportStartupFatal).toHaveBeenCalledWith(
            expect.objectContaining({ code: "V4_BOOTSTRAP_FAILED", message: "ipc down" })
        );
    });
});
