// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LauncherApp } from "./LauncherApp";

vi.mock("./guidedTour", () => ({
    createGuidedTour: () => ({
        start: vi.fn(),
        destroy: vi.fn(),
    }),
}));

vi.mock("./motion", () => ({
    useAttentionPulse: () => React.createRef<HTMLDivElement>(),
    useDrawerAnimation: (isOpen: boolean) => ({ shouldRender: isOpen, ref: React.createRef<HTMLElement>(), phase: isOpen ? "open" : "idle" }),
    useDrawerEntranceMotion: () => React.createRef<HTMLElement>(),
    useOverlayDrawerAnimation: (isOpen: boolean) => ({ shouldRender: isOpen, ref: React.createRef<HTMLDivElement>(), phase: isOpen ? "open" : "idle" }),
    useOverlayEntranceMotion: () => ({ ref: React.createRef<HTMLDivElement>(), mounted: true }),
    usePageEntranceMotion: () => React.createRef<HTMLDivElement>(),
    usePageTransition: () => ({ exitRef: React.createRef<HTMLDivElement>(), enterRef: React.createRef<HTMLDivElement>() }),
    useRebalanceInteractionMotion: () => React.createRef<HTMLDivElement>(),
    useSelectionChangeMotion: () => React.createRef<HTMLDivElement>(),
    useSidebarCollapseMotion: () => React.createRef<HTMLElement>(),
    useCollapsibleSection: () => React.createRef<HTMLElement>(),
    useWorkspaceTopbarMotion: () => React.createRef<HTMLDivElement>(),
    useToastStore: () => [],
    showToast: vi.fn(),
    dismissToast: vi.fn(),
    useAnimatedCounter: (v: number) => v,
    useTabTransition: () => ({ ref: React.createRef<HTMLElement>() }),
}));

const { launcherApiMock } = vi.hoisted(() => ({
    launcherApiMock: {
        bootstrap: vi.fn(async () => ({
            workspace: {
                workspaceRoot:
                    ((globalThis as typeof globalThis & { __TEST_WORKSPACE_ROOT__?: string }).__TEST_WORKSPACE_ROOT__)
                    ?? "C:/Profiles/Creator Kit/UserData/BalanceMod",
            },
            catalog: [
                {
                    key: "augments",
                    label: "Augments",
                    entries: [
                        {
                            id: "entry-firewave",
                            title: "Custom Firewave Plus",
                            subtitle: "augment",
                            absolutePath: "C:/Profiles/Creator Kit/UserData/BalanceMod/Runtime/Passives/0158_P_Firewave.json",
                        },
                    ],
                },
                {
                    key: "characters",
                    label: "Characters",
                    entries: [
                        {
                            id: "entry-character-default",
                            title: "Kiddo Default",
                            subtitle: "character ability",
                            absolutePath: "C:/Profiles/Creator Kit/UserData/BalanceMod/Runtime/Characters/Kiddo_Default.json",
                            relativePath: "Runtime/Characters/Kiddo_Default.json",
                            targetType: "CharacterAbility",
                        },
                        {
                            id: "entry-character-swap",
                            title: "Ability Swap",
                            subtitle: "character ability swap",
                            absolutePath: "C:/Profiles/Creator Kit/UserData/BalanceMod/Runtime/Characters/AbilitySwap/Kiddo_AbilitySwap.json",
                            relativePath: "Runtime/Characters/AbilitySwap/Kiddo_AbilitySwap.json",
                            targetType: "CharacterAbilitySwap",
                        },
                    ],
                },
                {
                    key: "gamemode",
                    label: "Game Mode",
                    entries: [
                        {
                            id: "entry-gamemode-default",
                            group: "gamemode",
                            title: "Arena Rules",
                            subtitle: "gamemode",
                            absolutePath: "C:/Profiles/Creator Kit/UserData/BalanceMod/NativeUI/GameMode/ArenaRules.json",
                            relativePath: "NativeUI/GameMode/ArenaRules.json",
                            targetType: "GameMode",
                            tags: [],
                            quickEditCount: 0,
                            hasQuickEdit: false,
                            updatedAtMs: 1,
                        },
                    ],
                },
                {
                    key: "custom",
                    label: "Custom",
                    entries: [
                        {
                            id: "entry-custom-default",
                            group: "custom",
                            title: "Starter Draft",
                            subtitle: "custom augment",
                            absolutePath: "C:/Profiles/Creator Kit/UserData/BalanceMod/Custom/Augments/StarterDraft.json",
                            relativePath: "Custom/Augments/StarterDraft.json",
                            targetType: "CustomAugment",
                            tags: [],
                            quickEditCount: 0,
                            hasQuickEdit: false,
                            updatedAtMs: 1,
                        },
                    ],
                },
            ],
        })),
        openDocument: vi.fn(async () => ({
            raw: {
                id: "entry-firewave",
                displayName: "Custom Firewave Plus",
                overrides: {},
                operations: { entries: [] },
                quickEdit: [],
                simpleSettings: { groups: [] },
                advanced: { fields: [] },
            },
            absolutePath: "C:/Profiles/Creator Kit/UserData/BalanceMod/Runtime/Passives/0158_P_Firewave.json",
            mtimeMs: 1,
        })),
        readOperationCapabilities: vi.fn(async () => ({ supported: [] })),
        saveDocument: vi.fn(async () => ({ savedAtUtc: new Date().toISOString(), backupPath: null })),
        listImportReceipts: vi.fn(async () => []),
        listInstalledPacks: vi.fn(async () => []),
        readGameModeIndex: vi.fn(async () => ({ sources: [] })),
        refreshGameModeProbe: vi.fn(async () => ({ sources: [] })),
        setActiveContentPack: vi.fn(async () => ({ changed: false })),
        readLibraryMetadata: vi.fn(async () => ({ entries: [] })),
        pickPackExportPath: vi.fn(async () => null),
        pickPackImportPath: vi.fn(async () => null),
        exportPackPreview: vi.fn(async () => ({ fileCount: 0, totalBytes: 0, contents: [], manifest: null })),
        exportPack: vi.fn(async () => ({ outputPath: "", manifest: null, contents: [], writtenFiles: 0, writtenBytes: 0 })),
        importPackPreview: vi.fn(async () => ({ fileCount: 0, totalBytes: 0, contents: [], manifest: null })),
        importPack: vi.fn(async () => ({ importedFiles: [], warnings: [], packPath: "", manifest: null, backupPath: null, importedAtUtc: "", receiptPath: "" })),
        dropPackToMod: vi.fn(async () => ({ outputPath: "", installedPath: "", writtenFiles: 0 })),
        createWorkspaceSnapshot: vi.fn(async () => ({ backupPath: "C:/backup.zip", createdAtUtc: new Date().toISOString() })),
        launchGame: vi.fn(async () => undefined),
        openInExplorer: vi.fn(async () => undefined),
        pickWorkspaceRoot: vi.fn(async () => null),
        saveWorkspaceRoot: vi.fn(async () => ({
            workspace: {
                workspaceRoot:
                    ((globalThis as typeof globalThis & { __TEST_WORKSPACE_ROOT__?: string }).__TEST_WORKSPACE_ROOT__)
                    ?? "C:/Profiles/Creator Kit/UserData/BalanceMod",
            },
            catalog: [],
        })),
    },
}));

vi.mock("./api", () => ({
    launcherApi: launcherApiMock,
}));

vi.mock("./DashboardPage", () => ({
    DashboardPage: ({
        onOpenChangeSomething,
        onOpenCreateSomething,
        onOpenGameMode,
        onOpenSwap,
        onOpenImportExport,
    }: {
        onOpenChangeSomething: () => void;
        onOpenCreateSomething: () => void;
        onOpenGameMode: () => void;
        onOpenSwap: () => void;
        onOpenImportExport: () => void;
    }) => (
        <div data-testid="dashboard-page">
            <button type="button" onClick={onOpenChangeSomething}>
                Open Change
            </button>
            <button type="button" onClick={onOpenCreateSomething}>
                Open Create
            </button>
            <button type="button" onClick={onOpenGameMode}>
                Open Game Mode
            </button>
            <button type="button" onClick={onOpenSwap}>
                Open Swap
            </button>
            <button type="button" onClick={onOpenImportExport}>
                Open Packs
            </button>
        </div>
    ),
}));

vi.mock("./EditorPage", () => ({
    EditorPage: ({
        entries,
        editorGroup,
        onChangeGroup,
    }: {
        entries: Array<{ id: string; title: string }>;
        editorGroup: string;
        onChangeGroup: (group: string) => void;
    }) => (
        <div data-testid="editor-page">
            <div data-testid="editor-group">{editorGroup}</div>
            <button type="button" onClick={() => onChangeGroup("characters")}>
                Open Characters Group
            </button>
            <ul>
                {entries.map((entry) => (
                    <li key={entry.id}>{entry.title}</li>
                ))}
            </ul>
        </div>
    ),
}));

vi.mock("./GameModePage", () => ({
    GameModePage: () => <div data-testid="gamemode-page">Game Mode page</div>,
}));

vi.mock("./AddLibraryPage", () => ({
    AddLibraryPage: () => <div data-testid="library-page">Library page</div>,
}));

vi.mock("./CustomBuilderPage", () => ({
    CustomBuilderPage: () => <div data-testid="custom-page">Custom page</div>,
}));

vi.mock("./PackToolsPage", () => ({
    PackToolsPage: ({ embedded }: { embedded?: boolean }) => (
        <div data-testid="packs-page">{embedded ? "embedded-packs" : "standalone-packs"}</div>
    ),
}));

vi.mock("./SettingsPage", () => ({
    SettingsPage: ({
        embedded,
        profileLabel,
        compatibilityWarning,
    }: {
        embedded?: boolean;
        profileLabel?: string | null;
        compatibilityWarning?: string | null;
    }) => (
        <div data-testid="settings-page">
            <span>{embedded ? "embedded-settings" : "standalone-settings"}</span>
            {profileLabel ? <span>{profileLabel}</span> : null}
            {compatibilityWarning ? <span>{compatibilityWarning}</span> : null}
        </div>
    ),
}));

vi.mock("./TutorialPage", () => ({
    TutorialPage: () => <div data-testid="tutorial-page">Tutorial page</div>,
}));

vi.mock("./RemoveWorkspacePanel", () => ({
    RemoveWorkspacePanel: () => <div data-testid="remove-page">Remove page</div>,
}));

vi.mock("./SwapAbilityPage", () => ({
    SwapAbilityPage: () => <div data-testid="swap-page">Swap page</div>,
}));

vi.mock("./SetupPage", () => ({
    SetupPage: () => <div data-testid="setup-page">Setup page</div>,
}));

function expectEmbeddedPage(pageKey: string) {
    expect(screen.getByTestId("rebalance-embedded-root").getAttribute("data-page")).toBe(pageKey);
}

async function openEmbeddedDrawer() {
    if (!screen.queryByTestId("rebalance-embedded-rail")) {
        fireEvent.click(screen.getByTestId("rebalance-embedded-focus-toggle"));
    }
    await waitFor(() => {
        expect(screen.getByTestId("rebalance-embedded-rail")).toBeTruthy();
    });
}

async function clickEmbeddedNav(pageKey: string) {
    await openEmbeddedDrawer();
    const prefix = pageKey === "tutorial" || pageKey === "settings" ? "rebalance-embedded-utility-nav" : "rebalance-embedded-nav";
    fireEvent.click(screen.getByTestId(`${prefix}-${pageKey}`));
}

describe("LauncherApp embedded mode", () => {
    beforeEach(() => {
        vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
        if (!Element.prototype.scrollTo) {
            Element.prototype.scrollTo = function () { /* jsdom stub */ };
        }
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
        (globalThis as typeof globalThis & { __TEST_WORKSPACE_ROOT__?: string }).__TEST_WORKSPACE_ROOT__ =
            `C:/Profiles/Creator Kit/UserData/BalanceMod-${Math.random().toString(36).slice(2, 10)}`;
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
        vi.restoreAllMocks();
        window.localStorage.clear();
        delete (globalThis as typeof globalThis & { __TEST_WORKSPACE_ROOT__?: string }).__TEST_WORKSPACE_ROOT__;
    });

    it("renders the real embedded app shell with the selected profile context and allows page navigation", async () => {
        render(
            <LauncherApp
                embedded
                profileLabel="Creator Kit / build-2025-08-19-750068"
                instanceSource="official-managed"
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId("rebalance-embedded-root")).toBeTruthy();
        });

        expect(screen.getByTestId("rebalance-embedded-shell")).toBeTruthy();
        expect(screen.queryByTestId("rebalance-embedded-rail")).toBeNull();
        expect(screen.getByTestId("rebalance-embedded-header")).toBeTruthy();
        expect(screen.getByTestId("rebalance-embedded-workspace-topbar")).toBeTruthy();
        expect(screen.getByTestId("rebalance-embedded-main")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Tools" })).toBeTruthy();
        expect(screen.getAllByText("Creator Kit / build-2025-08-19-750068").length).toBeGreaterThan(0);
        expect(screen.getByRole("button", { name: "Launch" })).toBeTruthy();

        await waitFor(() => {
            expect(screen.getByTestId("dashboard-page")).toBeTruthy();
        });

        expectEmbeddedPage("dashboard");

        fireEvent.click(screen.getByRole("button", { name: "Open Change" }));

        await waitFor(() => {
            expect(screen.getByTestId("editor-page")).toBeTruthy();
        });
        expectEmbeddedPage("editor");
        expect(screen.getByTestId("rebalance-embedded-header")).toBeTruthy();
    });

    it("shows the compatibility warning inside the always-visible embedded header", async () => {
        render(
            <LauncherApp
                embedded
                initialPage="editor"
                profileLabel="Steam / build-19658140"
                instanceSource="steam-library"
                compatibilityWarning="Steam installs can differ."
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId("rebalance-embedded-root")).toBeTruthy();
        });

        expect(screen.getByTestId("rebalance-embedded-header")).toBeTruthy();
        expect(screen.getByTestId("rebalance-embedded-compatibility-warning").textContent).toContain("Steam installs can differ.");
    });

    it("opens directly on the requested embedded editor page", async () => {
        render(
            <LauncherApp
                embedded
                initialPage="editor"
                profileLabel="Creator Kit / build-2025-08-19-750068"
                instanceSource="official-managed"
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId("editor-page")).toBeTruthy();
        });

        expect(screen.queryByTestId("dashboard-page")).toBeNull();
        expectEmbeddedPage("editor");
    });

    it("indexes Rebalance content in the global search and opens the selected result", async () => {
        render(
            <LauncherApp
                embedded
                initialPage="dashboard"
                profileLabel="Creator Kit / build-2025-08-19-750068"
                instanceSource="official-managed"
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId("dashboard-page")).toBeTruthy();
        });

        fireEvent.click(screen.getByTestId("rebalance-embedded-global-search-trigger"));

        const searchInput = await screen.findByLabelText("Search all Rebalance data");
        expect(screen.getByTestId("rebalance-embedded-global-search-overlay").querySelector("[data-motion-backdrop]")).toBeTruthy();
        expect(screen.getByTestId("rebalance-embedded-global-search-overlay").querySelector("[data-motion-dialog]")).toBeTruthy();
        fireEvent.change(searchInput, { target: { value: "Arena Rules" } });

        await waitFor(() => {
            expect(screen.getByText("Arena Rules")).toBeTruthy();
        });

        const arenaResult = screen.getByText("Arena Rules").closest("button");
        if (!arenaResult) {
            throw new Error("Expected Arena Rules search result button.");
        }
        expect(arenaResult.hasAttribute("data-motion-result")).toBe(true);
        fireEvent.click(arenaResult);

        await waitFor(() => {
            expect(screen.getByTestId("gamemode-page")).toBeTruthy();
        });

        expect(screen.queryByTestId("rebalance-embedded-global-search-overlay")).toBeNull();
        expectEmbeddedPage("gamemode");
    });

    it("opens global search from Ctrl+K without changing the active page", async () => {
        render(
            <LauncherApp
                embedded
                initialPage="editor"
                profileLabel="Creator Kit / build-2025-08-19-750068"
                instanceSource="official-managed"
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId("editor-page")).toBeTruthy();
        });

        fireEvent.keyDown(window, { key: "k", ctrlKey: true });

        await waitFor(() => {
            expect(screen.getByLabelText("Search all Rebalance data")).toBeTruthy();
        });

        expectEmbeddedPage("editor");
    });

    it("reports ready after embedded bootstrap finishes instead of staying on the sync phase", async () => {
        const onEmbeddedStatus = vi.fn();

        render(
            <LauncherApp
                embedded
                initialPage="editor"
                profileLabel="Creator Kit / build-2025-08-19-750068"
                instanceSource="official-managed"
                onEmbeddedStatus={onEmbeddedStatus}
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId("editor-page")).toBeTruthy();
        });

        await waitFor(() => {
            expect(onEmbeddedStatus).toHaveBeenCalledWith({
                phase: "ready",
                progress: 1,
                detail: "Rebalance studio is ready.",
            });
        });
    });

    it("keeps the ready embedded status when the callback reference changes", async () => {
        const firstStatusListener = vi.fn();
        const secondStatusListener = vi.fn();

        const { rerender } = render(
            <LauncherApp
                embedded
                initialPage="editor"
                profileLabel="Creator Kit / build-2025-08-19-750068"
                instanceSource="official-managed"
                onEmbeddedStatus={firstStatusListener}
            />,
        );

        await waitFor(() => {
            expect(screen.getByTestId("editor-page")).toBeTruthy();
        });

        await waitFor(() => {
            expect(firstStatusListener).toHaveBeenCalledWith({
                phase: "ready",
                progress: 1,
                detail: "Rebalance studio is ready.",
            });
        });

        rerender(
            <LauncherApp
                embedded
                initialPage="editor"
                profileLabel="Creator Kit / build-2025-08-19-750068"
                instanceSource="official-managed"
                onEmbeddedStatus={secondStatusListener}
            />,
        );

        await waitFor(() => {
            expect(secondStatusListener).toHaveBeenCalledWith({
                phase: "ready",
                progress: 1,
                detail: "Rebalance studio is ready.",
            });
        });

        expect(secondStatusListener).not.toHaveBeenCalledWith({
            phase: "shell",
            progress: 0.12,
            detail: "Preparing the embedded Rebalance shell.",
        });
    });

    it("collapses into focus mode on heavy pages and can reopen the full tool rail", async () => {
        render(
            <LauncherApp
                embedded
                initialPage="editor"
                profileLabel="Creator Kit / build-2025-08-19-750068"
                instanceSource="official-managed"
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId("editor-page")).toBeTruthy();
        });

        expect(screen.getByTestId("rebalance-embedded-root").getAttribute("data-focus-mode")).toBe("true");
        expect(screen.queryByTestId("rebalance-embedded-rail")).toBeNull();

        fireEvent.click(screen.getByTestId("rebalance-embedded-focus-toggle"));

        await waitFor(() => {
            expect(screen.getByTestId("rebalance-embedded-root").getAttribute("data-focus-mode")).toBe("false");
        });

        expect(screen.getByTestId("rebalance-embedded-rail")).toBeTruthy();
        expect(screen.getByTestId("rebalance-embedded-nav-dashboard")).toBeTruthy();
        expect(screen.getByTestId("rebalance-embedded-nav-editor")).toBeTruthy();
        expect(screen.getByTestId("rebalance-embedded-nav-gamemode")).toBeTruthy();
        expect(screen.getByTestId("rebalance-embedded-utility-nav-settings")).toBeTruthy();
    });

    it("can reopen the drawer from packs and navigate into settings", async () => {
        render(
            <LauncherApp
                embedded
                initialPage="packs"
                profileLabel="Creator Kit / build-2025-08-19-750068"
                instanceSource="official-managed"
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId("packs-page")).toBeTruthy();
        });

        expect(screen.getByTestId("rebalance-embedded-root").getAttribute("data-focus-mode")).toBe("true");
        expect(screen.queryByTestId("rebalance-embedded-rail")).toBeNull();

        fireEvent.click(screen.getByTestId("rebalance-embedded-focus-toggle"));

        await waitFor(() => {
            expect(screen.getByTestId("rebalance-embedded-root").getAttribute("data-tool-rail-expanded")).toBe("true");
        });

        expect(screen.getByTestId("rebalance-embedded-rail")).toBeTruthy();

        fireEvent.click(screen.getByTestId("rebalance-embedded-utility-nav-settings"));

        await waitFor(() => {
            expect(screen.getByTestId("settings-page")).toBeTruthy();
        });
    });

    it("restores focus to the toggle after closing the drawer", async () => {
        render(
            <LauncherApp
                embedded
                initialPage="editor"
                profileLabel="Creator Kit / build-2025-08-19-750068"
                instanceSource="official-managed"
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId("editor-page")).toBeTruthy();
        });

        const toggle = screen.getByTestId("rebalance-embedded-focus-toggle");
        toggle.focus();
        expect(document.activeElement).toBe(toggle);

        fireEvent.click(toggle);

        await waitFor(() => {
            expect(screen.getByTestId("rebalance-embedded-rail")).toBeTruthy();
        });

        fireEvent.click(screen.getAllByRole("button", { name: "Close tools" })[0]);

        await waitFor(() => {
            expect(screen.queryByTestId("rebalance-embedded-rail")).toBeNull();
        });

        expect(document.activeElement).toBe(toggle);
    });

    it("closes the drawer with Escape on focus pages", async () => {
        render(
            <LauncherApp
                embedded
                initialPage="editor"
                profileLabel="Creator Kit / build-2025-08-19-750068"
                instanceSource="official-managed"
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId("editor-page")).toBeTruthy();
        });

        fireEvent.click(screen.getByTestId("rebalance-embedded-focus-toggle"));

        await waitFor(() => {
            expect(screen.getByTestId("rebalance-embedded-rail")).toBeTruthy();
        });

        fireEvent.keyDown(window, { key: "Escape" });

        await waitFor(() => {
            expect(screen.queryByTestId("rebalance-embedded-rail")).toBeNull();
        });
    });

    it("auto-hides and restores the workspace tool strip based on window scroll direction", async () => {
        const { container } = render(
            <LauncherApp
                initialPage="editor"
                profileLabel="Creator Kit / build-2025-08-19-750068"
                instanceSource="official-managed"
            />
        );

        await waitFor(() => {
            expect(container.querySelector(".atelier-shell")).toBeTruthy();
        });

        const shell = container.querySelector(".atelier-shell") as HTMLElement | null;
        if (!shell) {
            throw new Error("Expected atelier shell to exist.");
        }
        expect(shell.getAttribute("data-workspace-strip-hidden")).toBe("false");

        Object.defineProperty(window, "scrollY", {
            configurable: true,
            writable: true,
            value: 160,
        });
        window.dispatchEvent(new Event("scroll"));

        await waitFor(() => {
            expect(shell.getAttribute("data-workspace-strip-hidden")).toBe("true");
        });

        Object.defineProperty(window, "scrollY", {
            configurable: true,
            writable: true,
            value: 20,
        });
        window.dispatchEvent(new Event("scroll"));

        await waitFor(() => {
            expect(shell.getAttribute("data-workspace-strip-hidden")).toBe("false");
        });
    });

    it("keeps Swap as its own active tab instead of leaving Change active", async () => {
        render(
            <LauncherApp
                embedded
                initialPage="editor"
                profileLabel="Creator Kit / build-2025-08-19-750068"
                instanceSource="official-managed"
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId("editor-page")).toBeTruthy();
        });

        await clickEmbeddedNav("swap");

        await waitFor(() => {
            expect(screen.getByTestId("swap-page")).toBeTruthy();
        });

        expectEmbeddedPage("swap");
    });

    it("marks Swap as the active tab without leaving Change active", async () => {
        render(
            <LauncherApp
                embedded
                initialPage="swap"
                profileLabel="Creator Kit / build-2025-08-19-750068"
                instanceSource="official-managed"
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId("swap-page")).toBeTruthy();
        });

        expectEmbeddedPage("swap");
    });

    it("keeps ability swap files out of the generic Change editor list", async () => {
        render(
            <LauncherApp
                embedded
                initialPage="editor"
                profileLabel="Creator Kit / build-2025-08-19-750068"
                instanceSource="official-managed"
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId("editor-page")).toBeTruthy();
        });

        fireEvent.click(screen.getByRole("button", { name: "Open Characters Group" }));

        await waitFor(() => {
            expect(within(screen.getByTestId("editor-page")).getByText("Kiddo Default")).toBeTruthy();
        });

        expect(screen.queryByText("Ability Swap")).toBeNull();
    });

    it("returns to a normal Change selection after visiting Swap", async () => {
        render(
            <LauncherApp
                embedded
                initialPage="editor"
                profileLabel="Creator Kit / build-2025-08-19-750068"
                instanceSource="official-managed"
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId("editor-page")).toBeTruthy();
        });

        await clickEmbeddedNav("swap");

        await waitFor(() => {
            expect(screen.getByTestId("swap-page")).toBeTruthy();
        });

        await clickEmbeddedNav("editor");

        await waitFor(() => {
            expect(screen.getByTestId("editor-page")).toBeTruthy();
        });

        fireEvent.click(screen.getByRole("button", { name: "Open Characters Group" }));

        await waitFor(() => {
            expect(within(screen.getByTestId("editor-page")).getByText("Kiddo Default")).toBeTruthy();
        });

        expectEmbeddedPage("editor");
        expect(screen.queryByText("Ability Swap")).toBeNull();
    });

    it("passes embedded mode into the Packs page", async () => {
        render(
            <LauncherApp
                embedded
                initialPage="packs"
                profileLabel="Creator Kit / build-2025-08-19-750068"
                instanceSource="official-managed"
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId("packs-page")).toBeTruthy();
        });

        expect(screen.getByText("embedded-packs")).toBeTruthy();
    });

    it("loads library metadata only for metadata-heavy pages while still lazy-loading packs and game mode data", async () => {
        render(
            <LauncherApp
                embedded
                initialPage="editor"
                profileLabel="Creator Kit / build-2025-08-19-750068"
                instanceSource="official-managed"
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId("editor-page")).toBeTruthy();
        });

        expect(launcherApiMock.openDocument).toHaveBeenCalledTimes(1);
        expect(launcherApiMock.listImportReceipts).not.toHaveBeenCalled();
        expect(launcherApiMock.listInstalledPacks).not.toHaveBeenCalled();
        expect(launcherApiMock.readGameModeIndex).not.toHaveBeenCalled();
        await waitFor(() => {
            expect(launcherApiMock.readLibraryMetadata).toHaveBeenCalled();
        });
        const initialLibraryMetadataCalls = launcherApiMock.readLibraryMetadata.mock.calls.length;

        await clickEmbeddedNav("custom");

        await waitFor(() => {
            expect(screen.getByTestId("custom-page")).toBeTruthy();
        });

        await waitFor(() => {
            expect(launcherApiMock.openDocument).toHaveBeenCalledTimes(2);
        });
        expect(launcherApiMock.readLibraryMetadata).toHaveBeenCalledTimes(initialLibraryMetadataCalls);

        await clickEmbeddedNav("gamemode");

        await waitFor(() => {
            expect(screen.getByTestId("gamemode-page")).toBeTruthy();
        });

        await waitFor(() => {
            expect(launcherApiMock.readGameModeIndex).toHaveBeenCalledTimes(1);
        });

        await clickEmbeddedNav("packs");

        await waitFor(() => {
            expect(screen.getByTestId("packs-page")).toBeTruthy();
        });

        await waitFor(() => {
            expect(launcherApiMock.listImportReceipts).toHaveBeenCalledTimes(1);
            expect(launcherApiMock.listInstalledPacks).toHaveBeenCalledTimes(1);
        });

        await clickEmbeddedNav("editor");
        await waitFor(() => {
            expect(screen.getByTestId("editor-page")).toBeTruthy();
        });
        await clickEmbeddedNav("packs");

        await waitFor(() => {
            expect(screen.getByTestId("packs-page")).toBeTruthy();
        });

        expect(launcherApiMock.listImportReceipts).toHaveBeenCalledTimes(1);
        expect(launcherApiMock.listInstalledPacks).toHaveBeenCalledTimes(1);
    });

    it("keeps library metadata deferred on Home until a page actually needs it", async () => {
        render(
            <LauncherApp
                embedded
                initialPage="dashboard"
                profileLabel="Creator Kit / build-2025-08-19-750068"
                instanceSource="official-managed"
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId("dashboard-page")).toBeTruthy();
        });

        expect(launcherApiMock.readLibraryMetadata).not.toHaveBeenCalled();

        await clickEmbeddedNav("custom");

        await waitFor(() => {
            expect(screen.getByTestId("custom-page")).toBeTruthy();
        });

        await waitFor(() => {
            expect(launcherApiMock.readLibraryMetadata).toHaveBeenCalledTimes(1);
        });
    });

    it("passes embedded launcher context into the Settings page", async () => {
        render(
            <LauncherApp
                embedded
                initialPage="settings"
                profileLabel="Standard / build-2025-08-19"
                track="steam"
                instanceSource="steam-library"
                compatibilityWarning="Steam installs can differ."
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId("settings-page")).toBeTruthy();
        });

        expect(screen.getByText("embedded-settings")).toBeTruthy();
        expect(screen.getAllByText("Standard / build-2025-08-19").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Steam installs can differ.").length).toBeGreaterThan(0);
    });
});
