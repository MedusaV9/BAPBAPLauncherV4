import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LauncherUpdaterState } from "../../../shared/ipc";

// Stateful fake backend so the real UpdateBanner round-trips its updater state
// query + downloadAndInstall mutation through the query hooks.
const back = vi.hoisted(() => ({
    state: null as LauncherUpdaterState | null,
    installCalls: 0,
}));

vi.mock("../../api", () => ({
    api: {
        updater: {
            getState: async () => (back.state ? structuredClone(back.state) : null),
            downloadAndInstall: async () => {
                back.installCalls += 1;
                return undefined;
            },
        },
    },
}));

import { UpdateBanner } from "./UpdateBanner";
import { useShellStore } from "../stores/useShellStore";

function renderBanner() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(createElement(QueryClientProvider, { client }, createElement(UpdateBanner)));
}

beforeEach(() => {
    back.state = null;
    back.installCalls = 0;
    // Reset the module-level dismiss flag between tests.
    useShellStore.setState({ updateBannerDismissed: false });
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("UpdateBanner (SHE-08)", () => {
    it("stays hidden when there is no actionable update", async () => {
        back.state = { status: "upToDate", currentVersion: "4.0.0" } as LauncherUpdaterState;
        renderBanner();
        await new Promise(r => setTimeout(r, 30));
        expect(screen.queryByLabelText("Dismiss update banner")).toBeNull();
    });

    it("shows an available update and triggers download/install on the action button", async () => {
        back.state = {
            status: "available",
            currentVersion: "4.0.0",
            latestVersion: "4.1.0",
        } as LauncherUpdaterState;
        renderBanner();

        const action = await screen.findByRole("button", { name: /download now/i });
        fireEvent.click(action);
        await waitFor(() => expect(back.installCalls).toBe(1));
    });

    it("dismisses for the session when the X is clicked", async () => {
        back.state = {
            status: "available",
            currentVersion: "4.0.0",
            latestVersion: "4.1.0",
        } as LauncherUpdaterState;
        renderBanner();

        const dismiss = await screen.findByLabelText("Dismiss update banner");
        fireEvent.click(dismiss);

        await waitFor(() => expect(screen.queryByLabelText("Dismiss update banner")).toBeNull());
        expect(useShellStore.getState().updateBannerDismissed).toBe(true);
    });

    it("disables the action button while downloading", async () => {
        back.state = {
            status: "downloading",
            currentVersion: "4.0.0",
            latestVersion: "4.1.0",
            progressPercent: 42,
        } as LauncherUpdaterState;
        renderBanner();

        const action = (await screen.findByRole("button", { name: /downloading/i })) as HTMLButtonElement;
        expect(action.disabled).toBe(true);
    });
});
