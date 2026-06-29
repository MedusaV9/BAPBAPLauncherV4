import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stateful fake backend so the real LaunchWorkspace round-trips its profile
// selection, launch start, and set-default mutations through the query hooks.
const back = vi.hoisted(() => ({
    instances: [] as Array<Record<string, unknown>>,
    settings: {} as Record<string, unknown>,
    runtime: { status: "idle" } as Record<string, unknown>,
    startCalls: [] as Array<{ instanceId: string; showMelonConsole: boolean }>,
    setCalls: [] as Array<{ key: string; value: unknown }>,
}));

vi.mock("../../api", () => ({
    api: {
        instances: { list: async () => structuredClone(back.instances) },
        launch: {
            getRuntimeState: async () => structuredClone(back.runtime),
            start: async (input: { instanceId: string; showMelonConsole: boolean }) => {
                back.startCalls.push(input);
                return undefined;
            },
            stop: async () => undefined,
        },
        settings: {
            getAll: async () => structuredClone(back.settings),
            set: async (key: string, value: unknown) => {
                back.setCalls.push({ key, value });
                back.settings[key] = value;
                return structuredClone(back.settings);
            },
        },
    },
}));

import { LaunchWorkspace } from "./LaunchWorkspace";

function renderLaunch() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(createElement(QueryClientProvider, { client }, createElement(LaunchWorkspace)));
}

beforeEach(() => {
    back.instances = [
        { id: "inst-1", profileName: "BapBap Main", versionId: "1.0.0", melonLoaderFirstRunPending: true },
        { id: "inst-2", profileName: "Boss Rush", versionId: "1.1.0" },
    ];
    back.settings = { launchShowMelonConsole: true, launchDefaultProfileId: null };
    back.runtime = { status: "idle" };
    back.startCalls = [];
    back.setCalls = [];
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("LaunchWorkspace", () => {
    it("lists profiles and launches the selected one with the console setting (LAU-01)", async () => {
        renderLaunch();
        await screen.findByText("BapBap Main");

        // Profiles are chosen via the switch-instance modal now.
        fireEvent.click(screen.getByRole("button", { name: /switch instance/i }));
        fireEvent.click(await screen.findByText("Boss Rush"));
        fireEvent.click(screen.getByRole("button", { name: /launch/i }));

        await waitFor(() =>
            expect(back.startCalls).toContainEqual({ instanceId: "inst-2", showMelonConsole: true })
        );
    });

    it("persists the selected profile as default when 'Set as default' is clicked (LAU-02)", async () => {
        renderLaunch();
        await screen.findByText("BapBap Main");

        // Default seeds to instances[0]; selecting a different one reveals the action.
        fireEvent.click(screen.getByRole("button", { name: /switch instance/i }));
        fireEvent.click(await screen.findByText("Boss Rush"));
        const setDefault = await screen.findByText("Set as default profile");
        fireEvent.click(setDefault);

        await waitFor(() =>
            expect(back.setCalls).toContainEqual({ key: "launchDefaultProfileId", value: "inst-2" })
        );
    });

    it("shows the empty state with a Go to Instances action when there are no profiles (LAU-03)", async () => {
        back.instances = [];
        renderLaunch();

        expect(await screen.findByText("No profiles yet")).toBeTruthy();
        expect(screen.getByRole("button", { name: /go to instances/i })).toBeTruthy();
    });

    it("warns when the selected profile still has first-run MelonLoader setup pending (LAU-05)", async () => {
        renderLaunch();
        // Wait for the profile list to render (instances loaded + settings resolved),
        // THEN check for the warning — it only appears once a profile is auto-selected.
        await screen.findByText("BapBap Main");
        await waitFor(() =>
            expect(screen.getByText("First launch can take longer while MelonLoader finishes setup.")).toBeTruthy()
        );

        fireEvent.click(screen.getByRole("button", { name: /switch instance/i }));
        fireEvent.click(await screen.findByText("Boss Rush"));
        await waitFor(() =>
            expect(screen.queryByText("First launch can take longer while MelonLoader finishes setup.")).toBeNull()
        );
    });
});
