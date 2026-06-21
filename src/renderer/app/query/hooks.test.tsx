import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../../../shared/ipc";
import { useSettings, useSetSetting, useBuildInfo } from "./hooks";

// Hooks only touch the bridge methods each test provides, so partial mocks are
// fine — relax v2Api to unknown rather than the full V2Api the global declares.
type MutableWindow = Omit<typeof window, "v2Api"> & { v2Api?: unknown; __V2_HARNESS__?: boolean };

function makeWrapper() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children);
    return { client, wrapper };
}

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
    return { manifestUrl: "https://example.test/index.json", uiMotionEnabled: true, ...overrides } as AppSettings;
}

const win = window as MutableWindow;

beforeEach(() => {
    win.__V2_HARNESS__ = false;
    win.v2Api = undefined;
});

afterEach(() => {
    win.v2Api = undefined;
    vi.restoreAllMocks();
});

describe("query hooks against a mocked window bridge", () => {
    it("useSettings reads through window.v2Api.settings.getAll", async () => {
        const getAll = vi.fn().mockResolvedValue(settings({ manifestUrl: "https://mocked/idx.json" }));
        win.v2Api = { settings: { getAll } };
        const { wrapper } = makeWrapper();

        const { result } = renderHook(() => useSettings(), { wrapper });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data?.manifestUrl).toBe("https://mocked/idx.json");
        expect(getAll).toHaveBeenCalledOnce();
    });

    it("useSetSetting optimistically updates the settings cache before the bridge resolves", async () => {
        let resolveSet: () => void = () => {};
        const set = vi.fn().mockImplementation(() => new Promise<void>(r => { resolveSet = r; }));
        const getAll = vi.fn().mockResolvedValue(settings({ uiMotionEnabled: true }));
        win.v2Api = { settings: { getAll, set } };
        const { client, wrapper } = makeWrapper();

        // Seed the cache via the query hook first.
        const { result: query } = renderHook(() => useSettings(), { wrapper });
        await waitFor(() => expect(query.current.isSuccess).toBe(true));

        const { result: mutation } = renderHook(() => useSetSetting(), { wrapper });
        act(() => {
            mutation.current.mutate({ key: "uiMotionEnabled", value: false });
        });

        // Optimistic onMutate writes the new value immediately, before set() resolves.
        await waitFor(() => {
            expect(client.getQueryData<AppSettings>(["settings"])?.uiMotionEnabled).toBe(false);
        });
        expect(set).toHaveBeenCalledWith("uiMotionEnabled", false);

        resolveSet();
        await waitFor(() => expect(mutation.current.isSuccess).toBe(true));
    });

    it("useSetSetting rolls back the optimistic value when the bridge rejects", async () => {
        const set = vi.fn().mockRejectedValue(new Error("ipc boom"));
        const getAll = vi.fn().mockResolvedValue(settings({ uiMotionEnabled: true }));
        win.v2Api = { settings: { getAll, set } };
        const { client, wrapper } = makeWrapper();

        const { result: query } = renderHook(() => useSettings(), { wrapper });
        await waitFor(() => expect(query.current.isSuccess).toBe(true));

        const { result: mutation } = renderHook(() => useSetSetting(), { wrapper });
        act(() => {
            mutation.current.mutate({ key: "uiMotionEnabled", value: false });
        });

        await waitFor(() => expect(mutation.current.isError).toBe(true));
        // onError restores the pre-mutation snapshot.
        expect(client.getQueryData<AppSettings>(["settings"])?.uiMotionEnabled).toBe(true);
    });

    it("a query hook surfaces an error when the bridge method rejects", async () => {
        const getBuildInfo = vi.fn().mockRejectedValue(new Error("no build info"));
        win.v2Api = { diagnostics: { getBuildInfo } };
        const { wrapper } = makeWrapper();

        const { result } = renderHook(() => useBuildInfo(), { wrapper });

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.error).toBeInstanceOf(Error);
    });
});
