import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../../../shared/ipc";

// Stateful fake backend so the real SettingsWorkspace round-trips set() calls
// and the folder-picker dialog through its hooks.
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
        diagnostics: { getBuildInfo: async () => ({ appVersion: "4.0.0" }) },
        instances: {
            list: async () => [],
            getSteamPersonaName: async () => "Tester",
        },
        dialog: {
            chooseDirectory: async () => back.chooseDirResult,
        },
    },
}));

import { SettingsWorkspace } from "./SettingsWorkspace";

function defaultSettings(): Partial<AppSettings> {
    return {
        launcherAutoUpdate: true,
        launcherAutoDownloadUpdates: true,
        launchShowMelonConsole: true,
        instancesRoot: "C:/old/instances",
        manifestUrl: "https://example.test/index.json",
        uiMotionEnabled: true,
    };
}

function renderSettings() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(createElement(QueryClientProvider, { client }, createElement(SettingsWorkspace)));
}

beforeEach(() => {
    back.settings = defaultSettings() as Record<string, unknown>;
    back.setCalls = [];
    back.chooseDirResult = null;
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("SettingsWorkspace", () => {
    it("saves the chosen instances folder when the picker returns a directory (SET-08)", async () => {
        back.chooseDirResult = "D:/new/instances";
        renderSettings();

        const btn = await screen.findByLabelText("Choose instances folder");
        fireEvent.click(btn);

        await waitFor(() =>
            expect(back.setCalls).toContainEqual({ key: "instancesRoot", value: "D:/new/instances" })
        );
    });

    it("does not save the instances folder when the picker is cancelled (SET-08)", async () => {
        back.chooseDirResult = null;
        renderSettings();

        const btn = await screen.findByLabelText("Choose instances folder");
        fireEvent.click(btn);

        // Give any stray mutation a chance to fire, then assert none did.
        await new Promise(r => setTimeout(r, 30));
        expect(back.setCalls.some(c => c.key === "instancesRoot")).toBe(false);
    });

    it("saves the manifest URL on blur only when trimmed-nonempty and changed (SET-09)", async () => {
        renderSettings();
        await screen.findByLabelText("Choose instances folder");

        const input = screen.getByDisplayValue("https://example.test/index.json");

        // Unchanged value → no save.
        fireEvent.blur(input);
        expect(back.setCalls.some(c => c.key === "manifestUrl")).toBe(false);

        // Blank → no save.
        fireEvent.change(input, { target: { value: "   " } });
        fireEvent.blur(input);
        expect(back.setCalls.some(c => c.key === "manifestUrl")).toBe(false);

        // Changed, non-empty → saves the trimmed value.
        fireEvent.change(input, { target: { value: "  https://new.test/i.json  " } });
        fireEvent.blur(input);
        await waitFor(() =>
            expect(back.setCalls).toContainEqual({ key: "manifestUrl", value: "https://new.test/i.json" })
        );
    });
});
