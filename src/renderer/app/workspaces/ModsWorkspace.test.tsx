import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stateful fake content/instances/manifest backend so the real ModsWorkspace
// (search, status filters, bulk-select bar) round-trips through its hooks.
const back = vi.hoisted(() => ({
    packages: [] as Array<Record<string, unknown>>,
    instances: [] as Array<Record<string, unknown>>,
    states: {} as Record<string, { status: string; version?: string }>,
    bulkCalls: [] as Array<{ action: string; packageIds: string[] }>,
}));

vi.mock("../../api", () => ({
    api: {
        instances: {
            list: async () => structuredClone(back.instances),
        },
        manifest: {
            getIndex: async () => ({ channels: [{ id: "release", enabled: true }] }),
        },
        content: {
            listPackages: async () => structuredClone(back.packages),
            listStates: async () => structuredClone(back.states),
            getModSets: async () => ({ sets: [], activeModSetId: "" }),
            bulkApply: async (input: { action: string; packageIds: string[] }) => {
                back.bulkCalls.push({ action: input.action, packageIds: input.packageIds });
                return { applied: input.packageIds.length, failed: 0 };
            },
            install: async () => undefined,
            uninstall: async () => undefined,
            setEnabled: async () => undefined,
        },
    },
}));

import { ModsWorkspace } from "./ModsWorkspace";

function pkg(id: string, name: string, extra: Record<string, unknown> = {}) {
    return { id, name, summary: `${name} summary`, tags: [], latestVersion: "1.0.0", ...extra };
}

function renderMods() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(createElement(QueryClientProvider, { client }, createElement(ModsWorkspace)));
}

// Count rendered mod cards via their per-card select checkbox.
function cardCount(): number {
    return screen.queryAllByLabelText("Select mod").length + screen.queryAllByLabelText("Deselect mod").length;
}

beforeEach(() => {
    // beta is installed+enabled; alpha/gamma are available-only.
    back.packages = [
        pkg("alpha", "Alpha Mod"),
        pkg("beta", "Beta Tool", { visual: { ribbonTags: ["editor"] } }),
        pkg("gamma", "Gamma Pack"),
    ];
    back.states = { "release::beta": { status: "installed-enabled" } };
    back.instances = [{ id: "inst-1", profileName: "Default" }];
    back.bulkCalls = [];
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("ModsWorkspace", () => {
    it("narrows the grid as the user types in search (MOD-03)", async () => {
        renderMods();
        await waitFor(() => expect(cardCount()).toBe(3));

        fireEvent.change(screen.getByLabelText("Search mods"), { target: { value: "gamma" } });
        await waitFor(() => expect(cardCount()).toBe(1));
        expect(screen.getByText("Gamma Pack")).toBeTruthy();
    });

    it("shows the empty state + Clear filters when search matches nothing, and resets (MOD-03)", async () => {
        renderMods();
        await waitFor(() => expect(cardCount()).toBe(3));

        fireEvent.change(screen.getByLabelText("Search mods"), { target: { value: "zzz-nomatch" } });
        await waitFor(() => expect(screen.getByText("No mods match")).toBeTruthy());

        fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));
        await waitFor(() => expect(cardCount()).toBe(3));
    });

    it("filters the grid by install status using channel-qualified backend state keys (MOD-04)", async () => {
        renderMods();
        // Wait for the profile to auto-select so useContentStates loads.
        await waitFor(() => expect((screen.getByLabelText("Profile") as HTMLSelectElement).value).toBe("inst-1"));
        await waitFor(() => expect(cardCount()).toBe(3));

        // "Installed" → only beta (installed-enabled). The real backend stores
        // states as release::package-id, so the UI must resolve that key shape.
        fireEvent.click(screen.getByRole("button", { name: "Installed" }));
        await waitFor(() => expect(cardCount()).toBe(1));
        expect(screen.getByText("Beta Tool")).toBeTruthy();

        // "Available" → alpha + gamma (not installed).
        fireEvent.click(screen.getByRole("button", { name: "Available" }));
        await waitFor(() => expect(cardCount()).toBe(2));
        expect(screen.queryByText("Beta Tool")).toBeNull();
    });

    it("reveals the bulk action bar with a count when a mod is selected (MOD-09)", async () => {
        renderMods();
        await waitFor(() => expect(cardCount()).toBe(3));

        // One deterministic state transition: selecting a single card must reveal
        // the bulk bar. (A two-click chain flaked under full-suite CPU load because
        // the intermediate re-render didn't always settle within the ceiling.)
        fireEvent.click(screen.getAllByLabelText("Select mod")[0]);

        await waitFor(
            () =>
                expect(
                    screen.getByText(
                        (_t, el) =>
                            el?.tagName === "SPAN" &&
                            (el.textContent ?? "").replace(/\s+/g, " ").trim() === "1 selected"
                    )
                ).toBeTruthy(),
            { timeout: 5000 }
        );
    });

    it("hides a secret/hidden mod from the grid and does not render a featured recommendation (MOD-05)", async () => {
        // A secret mod sorted first carrying a ribbon tag must NOT appear in the
        // catalog grid. The real manifest does NOT set the `visibility` field — it
        // signals secret via tags / visual.ribbonTags, so this uses exactly that.
        back.packages = [
            pkg("secret", "Secret Mod", { tags: ["secret"], visual: { ribbonTags: ["secret"] } }),
            pkg("public", "Public Mod", { visual: { ribbonTags: ["editor"] } }),
        ];
        back.states = {};

        renderMods();
        await waitFor(() => expect(cardCount()).toBe(1));
        expect(screen.queryAllByText("Secret Mod").length).toBe(0);
        expect(screen.getAllByText("Public Mod").length).toBe(1);
        expect(screen.queryByText(/editor's pick/i)).toBeNull();
    });

    it("filters bundle profiles out of the install target selector (MOD-02/MOD-06)", async () => {
        back.instances = [
            { id: "bundle-1", profileName: "Battle Royale", instanceType: "bundle" },
            { id: "std-1", profileName: "Standard" },
        ];

        renderMods();

        const selector = (await screen.findByLabelText("Profile")) as HTMLSelectElement;
        await waitFor(() => expect(selector.value).toBe("std-1"));
        expect(selector.querySelector("option[value='std-1']")).toBeTruthy();
        expect(selector.querySelector("option[value='bundle-1']")).toBeNull();
    });

    it("disables Install when no eligible profile exists, instead of a silent no-op (MOD-06)", async () => {
        // Only a mod-locked bundle profile exists → modTargets is empty and
        // instanceId stays null. The catalog still renders, but Install must be
        // disabled rather than silently no-op'ing on click (a dead click).
        back.instances = [{ id: "bundle-1", profileName: "Battle Royale", instanceType: "bundle" }];
        back.packages = [pkg("alpha", "Alpha Mod")];
        back.states = {};

        renderMods();
        await waitFor(() => expect(cardCount()).toBe(1));
        expect(screen.getByText(/mod-locked/i)).toBeTruthy();

        const installBtn = screen.getByRole("button", { name: "Install" }) as HTMLButtonElement;
        expect(installBtn.disabled).toBe(true);
    });

    it("shows Update for an installed mod when the catalog latest version is newer (MOD-06)", async () => {
        back.packages = [pkg("alpha", "Alpha Mod", { latestVersion: "2.0.0" })];
        back.states = { "release::alpha": { status: "installed-enabled", version: "1.0.0" } };

        renderMods();
        await waitFor(() => expect(cardCount()).toBe(1));
        await waitFor(() => expect(screen.getByRole("button", { name: /update/i })).toBeTruthy());
        const actionButtons = screen.getAllByRole("button", { name: /update|enabled/i });
        expect(actionButtons.some(button => (button.textContent ?? "").includes("Update"))).toBe(true);
    });
});
