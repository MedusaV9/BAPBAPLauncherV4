// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";

/* ============================================================================
   Phase 3 Task 21 — additional integration tests for the theme switcher that
   is now wired into the standalone SettingsPage. These complement
   SettingsPage.component.test.tsx (which verifies the embedded vs standalone
   chrome) by asserting the contract that the four theme option buttons are
   rendered with the expected test ids, that exactly one is marked active,
   and that clicking a different option flips the active state and updates
   the document body's `data-theme` attribute.
   ============================================================================ */

vi.mock("./motion", () => ({
    usePageEntranceMotion: () => React.createRef<HTMLDivElement>(),
    useTabTransition: () => ({ ref: React.createRef<HTMLElement>() }),
}));

const bootstrap = {
    workspace: {
        workspaceRoot: "C:/Profiles/Standard/UserData/BalanceMod",
        runtimeRoot: "C:/Profiles/Standard/UserData/BalanceMod/Runtime",
        customRoot: "C:/Profiles/Standard/UserData/BalanceMod/Custom",
        nativeUiRoot: "C:/Profiles/Standard/UserData/BalanceMod/NativeUI",
        backupRoot: "C:/Profiles/Standard/UserData/BalanceMod/Backups",
        arenaPresetsRoot: "C:/Profiles/Standard/UserData/BalanceMod/ArenaPresets",
        libraryRoot: "C:/Profiles/Standard/UserData/BalanceMod/Library",
        installedPacksRoot: "C:/Profiles/Standard/UserData/BalanceMod/InstalledPacks",
        modProjectRoot: "C:/Repos/BAPBAPBalanceMod",
    },
} as any;

function renderStandaloneSettings() {
    return render(
        <SettingsPage
            bootstrap={bootstrap}
            mode="guided"
            embedded={false}
            workspaceInput="C:/Games/BAPBAP"
            onChangeMode={() => undefined}
            onWorkspaceInputChange={() => undefined}
            onChooseWorkspace={() => undefined}
            onApplyWorkspace={() => undefined}
            onRefreshCatalog={() => undefined}
            onSnapshot={() => undefined}
            onOpenFolder={() => undefined}
            onRestartSetup={() => undefined}
            onOpenPackTools={() => undefined}
        />
    );
}

const THEME_IDS = ["default", "light", "amoled", "high-contrast"] as const;

describe("SettingsPage theme switcher", () => {
    beforeEach(() => {
        // Reset the persisted theme so each test starts from a clean slate.
        try {
            window.localStorage.clear();
        } catch {
            /* sandboxed environments — ignore */
        }
        // Clear any data-theme set by a previous test so we can assert the
        // raw transition cleanly.
        delete document.body.dataset.theme;
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
        delete document.body.dataset.theme;
        try {
            window.localStorage.clear();
        } catch {
            /* ignore */
        }
    });

    it("renders all four theme option buttons with stable test ids", () => {
        renderStandaloneSettings();

        for (const id of THEME_IDS) {
            const option = screen.getByTestId(`theme-option-${id}`);
            expect(option).toBeTruthy();
            expect(option.tagName).toBe("BUTTON");
        }
    });

    it("marks exactly one theme option as active via aria-pressed", () => {
        renderStandaloneSettings();

        const pressed = THEME_IDS.filter((id) => {
            const option = screen.getByTestId(`theme-option-${id}`);
            return option.getAttribute("aria-pressed") === "true";
        });

        expect(pressed.length).toBe(1);
        // With a clean localStorage the persisted slot resolves to the
        // `default` theme.
        expect(pressed[0]).toBe("default");

        // aria-checked mirrors aria-pressed for the radio role contract.
        const activeOption = screen.getByTestId(`theme-option-${pressed[0]}`);
        expect(activeOption.getAttribute("aria-checked")).toBe("true");
    });

    it("flips aria-pressed and updates document.body[data-theme] when a different theme is clicked", () => {
        renderStandaloneSettings();

        const defaultOption = screen.getByTestId("theme-option-default");
        const amoledOption = screen.getByTestId("theme-option-amoled");

        expect(defaultOption.getAttribute("aria-pressed")).toBe("true");
        expect(amoledOption.getAttribute("aria-pressed")).toBe("false");
        expect(document.body.dataset.theme).toBeUndefined();

        fireEvent.click(amoledOption);

        // Re-query after re-render to pick up the freshest aria state.
        const defaultAfter = screen.getByTestId("theme-option-default");
        const amoledAfter = screen.getByTestId("theme-option-amoled");

        expect(amoledAfter.getAttribute("aria-pressed")).toBe("true");
        expect(defaultAfter.getAttribute("aria-pressed")).toBe("false");
        // applyTheme writes the body attribute so the tokens-amoled.css
        // overlay activates.
        expect(document.body.dataset.theme).toBe("amoled");
    });

    it("removes data-theme when the user switches back to the default theme", () => {
        renderStandaloneSettings();

        // First, switch away from the default so data-theme is set.
        fireEvent.click(screen.getByTestId("theme-option-light"));
        expect(document.body.dataset.theme).toBe("light");

        // Switching back to the default should remove the attribute so the
        // base :root tokens drive again.
        fireEvent.click(screen.getByTestId("theme-option-default"));
        expect(document.body.dataset.theme).toBeUndefined();
        expect(screen.getByTestId("theme-option-default").getAttribute("aria-pressed")).toBe("true");
    });

    it("marks every theme option as a rebalance-pressable surface", () => {
        renderStandaloneSettings();

        for (const id of THEME_IDS) {
            const option = screen.getByTestId(`theme-option-${id}`);
            expect(option.getAttribute("data-rebalance-pressable")).toBe("true");
            // Each option is a real button (radio role) so keyboard a11y
            // walks the group correctly.
            expect(option.getAttribute("role")).toBe("radio");
        }
    });
});
