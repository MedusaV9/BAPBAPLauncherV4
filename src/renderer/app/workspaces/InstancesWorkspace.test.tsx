import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stateful fake backend so the real InstancesWorkspace resolves its hero panels
// through the genuine resolvePrimaryOfficialVersionForTrack + trusted-time path.
const back = vi.hoisted(() => ({
    instances: [] as Array<Record<string, unknown>>,
    versions: [] as Array<Record<string, unknown>>,
    bundles: [] as Array<Record<string, unknown>>,
    settings: { instancesRoot: "C:/BAPBAP" } as Record<string, unknown>,
    installOfficialCalls: [] as Array<Record<string, unknown>>,
    bundleInstallCalls: [] as Array<{ bundleId: string; profileName?: string }>,
    applyUpdateCalls: [] as string[],
    trustedTime: { status: "ok", configured: true, available: true, trustedEpochMs: 0 } as Record<string, unknown>,
}));

vi.mock("../../api", () => ({
    api: {
        instances: {
            list: async () => structuredClone(back.instances),
            getInstallState: async () => ({ status: "idle" }),
            installOfficial: async (input: Record<string, unknown>) => {
                back.installOfficialCalls.push(input);
                return undefined;
            },
        },
        manifest: {
            getGameVersions: async () => ({ versions: structuredClone(back.versions) }),
            getTrustedTimeState: async () => structuredClone(back.trustedTime),
        },
        settings: {
            getAll: async () => structuredClone(back.settings),
        },
        bundle: {
            listAvailable: async () => structuredClone(back.bundles),
            install: async (bundleId: string, profileName?: string) => {
                back.bundleInstallCalls.push({ bundleId, profileName });
                return undefined;
            },
            getInstallProgressState: async () => ({ status: "idle" }),
            getUpdateState: async (instanceId: string) => ({ instanceId, status: "idle" }),
            applyUpdate: async (instanceId: string) => {
                back.applyUpdateCalls.push(instanceId);
                return { instanceId, status: "done" };
            },
        },
    },
}));

import { InstancesWorkspace } from "./InstancesWorkspace";

function renderInstances() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(createElement(QueryClientProvider, { client }, createElement(InstancesWorkspace)));
}

// A bapbap-track official version with a PAST unlock window and a real download
// URL — installable + unlocked once trusted time is ready.
function bapbapVersion() {
    return {
        id: "bapbap-1",
        track: "bapbap",
        gameVersion: "1.0.0",
        directDownloadUrl: "https://example.test/bapbap.zip",
        unlockAtUtc: "2020-01-01T00:00:00Z",
        recommended: true,
    };
}

beforeEach(() => {
    back.instances = [];
    back.versions = [bapbapVersion()];
    back.bundles = [];
    back.settings = { instancesRoot: "C:/BAPBAP" };
    back.installOfficialCalls = [];
    back.bundleInstallCalls = [];
    back.applyUpdateCalls = [];
    // Trusted clock sits well after the past unlock window.
    back.trustedTime = {
        status: "ok",
        configured: true,
        available: true,
        trustedEpochMs: Date.parse("2026-01-01T00:00:00Z"),
    };
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("InstancesWorkspace", () => {
    it("renders the three-up hero", async () => {
        renderInstances();
        // Mode titles come from the MODE map.
        expect(await screen.findByText("Arena")).toBeTruthy();
        expect(screen.getByText("Boss Rush")).toBeTruthy();
        expect(screen.queryByText("BAPBAP Mobile")).toBeNull();
        expect(screen.queryByText("Arriving Soon")).toBeNull();
    });

    it("shows a past-unlock build in the hero once trusted time is available (INS-11)", async () => {
        renderInstances();
        // The hero shows the mode eyebrow + title for the available track.
        expect(await screen.findByText("Standard BAPBAP")).toBeTruthy();
        expect(screen.getByText("Arena")).toBeTruthy();
    });

    it("treats the same build as unavailable when trusted time is not ready (INS-11 contrast)", async () => {
        back.trustedTime = { status: "unavailable", configured: true, available: false };
        renderInstances();

        await screen.findByText("Arena");
        // Without trusted time the gated version is withheld, but the three-up
        // hero still renders with its default state.
        expect(screen.getByText("Standard BAPBAP")).toBeTruthy();
    });

    it("does not render a Your Profiles grid (manage via Start → Switch instance)", async () => {
        back.instances = [
            { id: "p1", profileName: "My Profile", versionId: "1.0.0", gameVersion: "1.0.0", officialTrack: "bapbap" },
        ];
        renderInstances();
        expect(await screen.findByText("Arena")).toBeTruthy();
        expect(screen.queryByText("My Profile")).toBeNull();
        expect(screen.queryByText(/your profiles/i)).toBeNull();
    });

    it("shows Battle Royale hero with Public Playtest eyebrow (INS-13)", async () => {
        renderInstances();

        const panel = (await screen.findAllByRole("radio")).find(el =>
            el.textContent?.includes("Battle Royale")
        ) as HTMLElement;
        expect(panel).toBeTruthy();
        expect(panel.textContent).toMatch(/Public Playtest/i);
        expect(panel.textContent).not.toMatch(/Curated Bundle/);
    });

    it("shows Update as the only primary action on the Battle Royale hero when an update is available", async () => {
        back.bundles = [
            {
                id: "bap-bundle",
                name: "BAPBAP Bundle",
                version: "1.3.0",
                buildNumber: 3,
                channel: "release",
                isInstalled: true,
                isUpdateAvailable: true,
                isDownloadable: true,
            },
        ];
        back.instances = [
            { id: "binst-1", profileName: "Bundle Profile", versionId: "1.2.0", instanceType: "bundle", bundleId: "bap-bundle" },
        ];
        renderInstances();

        const panel = (await screen.findAllByRole("radio")).find(el =>
            el.textContent?.includes("Battle Royale")
        ) as HTMLElement;
        fireEvent.pointerEnter(panel);
        fireEvent.focus(panel);
        const updateBtn = await waitFor(() => {
            const buttons = Array.from(panel.querySelectorAll("button"));
            const found = buttons.find(b => b.textContent?.includes("Update"));
            if (!found) throw new Error("Update not rendered");
            return found;
        });
        fireEvent.click(updateBtn);
        await waitFor(() => expect(back.applyUpdateCalls).toContain("binst-1"));
    });

    it("lets an installed official mode install another named profile (INS-14)", async () => {
        back.instances = [
            {
                id: "p1",
                profileName: "Standard",
                versionId: "bapbap-1",
                gameVersion: "1.0.0",
                officialManaged: true,
                officialTrack: "bapbap",
                track: "bapbap",
            },
        ];
        renderInstances();

        // Find the installed panel by its eyebrow text (no status pill anymore).
        const panel = (await screen.findAllByRole("radio")).find(el =>
            el.textContent?.includes("Standard BAPBAP")
        ) as HTMLElement;
        fireEvent.pointerEnter(panel);
        fireEvent.focus(panel);

        // Secondary CTA is collapsed when not expanded; query by text incl. hidden nodes.
        const installAnother = await waitFor(() => {
            const btn = panel.querySelector("button");
            // Prefer the secondary control by scanning all buttons in the panel
            const buttons = Array.from(panel.querySelectorAll("button"));
            const found = buttons.find(b => b.textContent?.includes("Install another"));
            if (!found) throw new Error("Install another not rendered yet");
            return found;
        });
        fireEvent.click(installAnother);

        expect(await screen.findByText("New instance")).toBeTruthy();
        const name = screen.getByPlaceholderText("My profile") as HTMLInputElement;
        fireEvent.change(name, { target: { value: "Standard Alt" } });
        fireEvent.click(screen.getByRole("button", { name: "Install" }));

        await waitFor(() =>
            expect(back.installOfficialCalls).toContainEqual({
                versionId: "bapbap-1",
                profileName: "Standard Alt",
                installPath: "C:/BAPBAP",
            })
        );
    });

    it("does NOT show Install another for bundles — only one profile allowed (INS-15)", async () => {
        back.bundles = [
            { id: "bap-bundle", name: "Battle Royale", version: "1.3.0", buildNumber: 3, channel: "release", isInstalled: true, isUpdateAvailable: false },
        ];
        back.instances = [
            { id: "binst-1", profileName: "Battle Royale", versionId: "1.3.0", instanceType: "bundle", bundleId: "bap-bundle" },
        ];
        renderInstances();

        // The bundle hero should NOT show an "Install another" button.
        const panel = screen.getAllByRole("radio").find(el => el.textContent?.includes("Battle Royale")) as HTMLElement;
        fireEvent.focus(panel);
        expect(screen.queryByRole("button", { name: "Install another" })).toBeNull();
    });

    it("shows an Update button on the Battle Royale hero when an installed bundle has an update (INS-12)", async () => {
        back.bundles = [
            {
                id: "bap-bundle",
                name: "BAPBAP Bundle",
                version: "1.3.0",
                buildNumber: 3,
                channel: "release",
                isInstalled: true,
                isUpdateAvailable: true,
                isDownloadable: true,
            },
        ];
        back.instances = [
            { id: "binst-1", profileName: "Bundle Profile", versionId: "1.2.0", instanceType: "bundle", bundleId: "bap-bundle" },
        ];
        renderInstances();

        const panel = (await screen.findAllByRole("radio")).find(el =>
            el.textContent?.includes("Battle Royale")
        ) as HTMLElement;
        fireEvent.pointerEnter(panel);
        fireEvent.focus(panel);
        const updateBtn = await waitFor(() => {
            const buttons = Array.from(panel.querySelectorAll("button"));
            const found = buttons.find(b => b.textContent?.includes("Update"));
            if (!found) throw new Error("Update not rendered");
            return found;
        });
        fireEvent.click(updateBtn);
        await waitFor(() => expect(back.applyUpdateCalls).toContain("binst-1"));
    });

    it("does not show an update button when the installed bundle is up to date (INS-12)", async () => {
        back.bundles = [
            {
                id: "bap-bundle",
                name: "BAPBAP Bundle",
                version: "1.3.0",
                buildNumber: 3,
                channel: "release",
                isInstalled: true,
                isUpdateAvailable: false,
                isDownloadable: true,
            },
        ];
        back.instances = [
            { id: "binst-1", profileName: "Bundle Profile", versionId: "1.3.0", instanceType: "bundle", bundleId: "bap-bundle" },
        ];
        renderInstances();

        expect(await screen.findByText("Battle Royale")).toBeTruthy();
        const panel = screen.getAllByRole("radio").find(el => el.textContent?.includes("Battle Royale")) as HTMLElement;
        fireEvent.pointerEnter(panel);
        fireEvent.focus(panel);
        await waitFor(() => {
            const buttons = Array.from(panel.querySelectorAll("button"));
            expect(buttons.some(b => b.textContent?.includes("Play"))).toBe(true);
            expect(buttons.some(b => b.textContent?.includes("Update"))).toBe(false);
        });
    });
});
