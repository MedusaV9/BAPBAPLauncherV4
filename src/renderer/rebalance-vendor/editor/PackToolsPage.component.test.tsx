// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PackToolsPage } from "./PackToolsPage";

vi.mock("./motion", () => ({
  usePageEntranceMotion: () => React.createRef<HTMLDivElement>(),
  useTabTransition: () => ({ ref: React.createRef<HTMLElement>() }),
}));

describe("PackToolsPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const baseProps: React.ComponentProps<typeof PackToolsPage> = {
    catalogGroups: [
      {
        key: "augments",
        label: "Augments",
        entries: [
          {
            id: "entry-firewave",
            title: "Firewave",
            subtitle: "augment",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Passives/0158_P_Firewave.json",
          },
        ],
      },
    ] as never,
    selectedPaths: ["C:/Profiles/Standard/UserData/BalanceMod/Runtime/Passives/0158_P_Firewave.json"],
    onTogglePath: vi.fn(),
    onSelectGroup: vi.fn(),
    onClearSelection: vi.fn(),
    exportState: {
      packId: "starter-pack",
      packVersion: "1.0.0",
      name: "Starter Pack",
      description: "One focused rebalance pack",
      author: "Codex",
      outputPath: "C:/Exports/starter-pack.rbpack",
      preview: null,
      busy: false,
    },
    onExportStateChange: vi.fn(),
    onPickExportPath: vi.fn(),
    onPreviewExport: vi.fn(),
    onExportPack: vi.fn(),
    importState: {
      packPath: "C:/Imports/community-pack.rbpack",
      conflictStrategy: "replace-targeted-files" as const,
      createBackup: true,
      preview: null,
      busy: false,
    },
    onImportStateChange: vi.fn(),
    onPickImportPath: vi.fn(),
    onPreviewImport: vi.fn(),
    onImportPack: vi.fn(),
    onDropPackToMod: vi.fn(),
    installedPacks: [
      {
        packId: "starter-pack",
        name: "Starter Pack",
        packVersion: "1.0.0",
        author: "Codex",
        active: true,
        contentFileCount: 4,
        arenaPresetCount: 2,
        packRoot: "C:/Profiles/Standard/UserData/BalanceMod/InstalledPacks/starter-pack",
      },
      {
        packId: "alt-pack",
        name: "Alt Pack",
        packVersion: "2.0.0",
        author: "Codex",
        active: false,
        contentFileCount: 8,
        arenaPresetCount: 1,
        packRoot: "C:/Profiles/Standard/UserData/BalanceMod/InstalledPacks/alt-pack",
      },
    ],
    onRefreshInstalledPacks: vi.fn(),
    onSetActivePack: vi.fn(),
    receipts: [
      {
        packId: "starter-pack",
        packVersion: "1.0.0",
        importedBy: "Codex",
        importedFileCount: 4,
        importedAtUtc: "2026-04-03T08:00:00Z",
        receiptPath: "C:/Profiles/Standard/UserData/BalanceMod/Receipts/starter-pack.json",
        backupPath: "C:/Profiles/Standard/UserData/BalanceMod/Backups/starter-pack.zip",
      },
    ],
    onRefreshReceipts: vi.fn(),
    onOpenFolder: vi.fn(),
  };

  it("renders the embedded pack workspace with the installed-pack flow first", () => {
    render(<PackToolsPage {...baseProps} embedded />);

    expect(screen.getByTestId("rebalance-packs-embedded")).toBeTruthy();
    expect(screen.getAllByText("Installed packs").length).toBeGreaterThan(0);
    expect(screen.getByText("Manage installed packs")).toBeTruthy();
    expect(screen.getAllByText("Starter Pack").length).toBeGreaterThan(0);
    expect(screen.getByText("Make active")).toBeTruthy();
  });

  it("switches the installed surface between installed packs and history", () => {
    render(<PackToolsPage {...baseProps} embedded />);

    fireEvent.click(screen.getByRole("button", { name: "History" }));

    expect(screen.getByText("Recent imports and backups")).toBeTruthy();
    expect(screen.getByText(/Imported at 2026-04-03T08:00:00Z/i)).toBeTruthy();
  });

  it("switches between manage, import, and export tasks", () => {
    render(<PackToolsPage {...baseProps} embedded />);

    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(screen.getByText("Apply a pack")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByText("Build one focused pack")).toBeTruthy();
    expect(screen.getByText(/Selected files right now: 1/i)).toBeTruthy();
  });
});
