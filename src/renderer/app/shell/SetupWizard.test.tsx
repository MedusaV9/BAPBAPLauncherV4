import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_SETUP_VERSION } from "../../../shared/setup";

// Stateful fake backend so the real SetupWizard round-trips its setSetting
// mutations and the folder-picker dialog through the query hooks.
const back = vi.hoisted(() => ({
    settings: {} as Record<string, unknown>,
    setCalls: [] as Array<{ key: string; value: unknown }>,
    chooseDirResult: null as string | null,
}));

vi.mock("../../api", () => ({
    api: {
        settings: {
            getAll: async () => structuredClone(back.settings),
            set: async (key: string, value: unknown) => {
                back.setCalls.push({ key, value });
                back.settings[key] = value;
                return structuredClone(back.settings);
            },
        },
        dialog: {
            chooseDirectory: async () => back.chooseDirResult,
        },
    },
}));

import { SetupWizard } from "./SetupWizard";

function renderWizard() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(createElement(QueryClientProvider, { client }, createElement(SetupWizard)));
}

beforeEach(() => {
    back.setCalls = [];
    back.chooseDirResult = null;
    // Fresh install: onboarding not completed → wizard should show.
    back.settings = {
        uiOnboardingCompleted: false,
        setupVersionCompleted: 0,
        instancesRoot: "C:/default/instances",
    };
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("SetupWizard (SHE-04)", () => {
    it("renders only when onboarding is incomplete", async () => {
        renderWizard();
        expect(await screen.findByText("Welcome to BAPBAP")).toBeTruthy();
    });

    it("stays hidden once onboarding is complete at the current version", async () => {
        back.settings = {
            uiOnboardingCompleted: true,
            setupVersionCompleted: CURRENT_SETUP_VERSION,
            instancesRoot: "C:/default/instances",
        };
        renderWizard();
        // Give the settings query time to resolve, then assert nothing rendered.
        await new Promise(r => setTimeout(r, 30));
        expect(screen.queryByText("Welcome to BAPBAP")).toBeNull();
    });

    it("persists the four flags on Get started, and instancesRoot only when changed", async () => {
        renderWizard();
        await screen.findByText("Welcome to BAPBAP");

        fireEvent.click(screen.getByRole("button", { name: /get started/i }));

        await waitFor(() => {
            const keys = back.setCalls.map(c => c.key);
            expect(keys).toContain("launcherAutoUpdate");
            expect(keys).toContain("uiMotionEnabled");
            expect(keys).toContain("uiOnboardingCompleted");
            expect(keys).toContain("setupVersionCompleted");
        });
        // instancesRoot was never changed by the user → not written.
        expect(back.setCalls.some(c => c.key === "instancesRoot")).toBe(false);
        expect(back.setCalls).toContainEqual({ key: "uiOnboardingCompleted", value: true });
        expect(back.setCalls).toContainEqual({ key: "setupVersionCompleted", value: CURRENT_SETUP_VERSION });
    });

    it("writes instancesRoot when the user picks a new folder", async () => {
        back.chooseDirResult = "D:/picked/instances";
        renderWizard();
        await screen.findByText("Welcome to BAPBAP");

        fireEvent.click(screen.getByLabelText("Choose instances folder"));
        await waitFor(() => expect(screen.getByDisplayValue("D:/picked/instances")).toBeTruthy());

        fireEvent.click(screen.getByRole("button", { name: /get started/i }));
        await waitFor(() =>
            expect(back.setCalls).toContainEqual({ key: "instancesRoot", value: "D:/picked/instances" })
        );
    });
});
