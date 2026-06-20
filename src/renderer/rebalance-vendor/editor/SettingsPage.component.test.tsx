// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";

vi.mock("./motion", () => ({
    usePageEntranceMotion: () => React.createRef<HTMLDivElement>(),
    useTabTransition: () => ({ ref: React.createRef<HTMLElement>() }),
}));

describe("SettingsPage", () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

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

    it("renders the embedded branch without standalone setup controls", () => {
        render(
            <SettingsPage
                bootstrap={bootstrap}
                mode="guided"
                embedded
                profileLabel="Standard / build-2025-08-19"
                track="bapbap"
                instanceSource="steam-library"
                compatibilityWarning="Steam installs can differ."
                workspaceInput=""
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

        expect(screen.getByTestId("rebalance-settings-embedded")).toBeTruthy();
        expect(screen.getByText("Active profile")).toBeTruthy();
        expect(screen.getByText("Standard / build-2025-08-19")).toBeTruthy();
        expect(screen.getAllByText("Steam install")).toHaveLength(2);
        expect(screen.getAllByText("bapbap")).toHaveLength(2);
        expect(screen.getByLabelText("Profile status summary")).toBeTruthy();
        expect(screen.getByText("Profile source")).toBeTruthy();
        expect(screen.getByText("Workspace")).toBeTruthy();
        expect(screen.getByText("Backups")).toBeTruthy();
        expect(screen.getByText("Ready")).toBeTruthy();
        expect(screen.getByText("Steam installs can differ.")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Open profile folder" })).toBeTruthy();
        expect(screen.getByText("Support panels")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Reload profile files" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Folders" }));
        expect(screen.getByText("Custom augments")).toBeTruthy();
        expect(screen.getByText("Game Mode files")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Browse" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Use this folder" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Run first-time setup again" })).toBeNull();
    });

    it("renders the standalone setup controls outside embedded mode", () => {
        const onChooseWorkspace = vi.fn();
        const onApplyWorkspace = vi.fn();

        render(
            <SettingsPage
                bootstrap={bootstrap}
                mode="guided"
                embedded={false}
                workspaceInput="C:/Games/BAPBAP"
                onChangeMode={() => undefined}
                onWorkspaceInputChange={() => undefined}
                onChooseWorkspace={onChooseWorkspace}
                onApplyWorkspace={onApplyWorkspace}
                onRefreshCatalog={() => undefined}
                onSnapshot={() => undefined}
                onOpenFolder={() => undefined}
                onRestartSetup={() => undefined}
                onOpenPackTools={() => undefined}
            />
        );

        expect(screen.getByTestId("rebalance-settings-standalone")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Browse" }));
        fireEvent.click(screen.getByRole("button", { name: "Use this folder" }));
        expect(onChooseWorkspace).toHaveBeenCalledTimes(1);
        expect(onApplyWorkspace).toHaveBeenCalledTimes(1);
    });
});
