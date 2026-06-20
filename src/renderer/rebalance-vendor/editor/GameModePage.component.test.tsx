// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameModePage } from "./GameModePage";

vi.mock("./motion", () => ({
  usePageEntranceMotion: () => React.createRef<HTMLDivElement>(),
  useCollapsibleSection: () => React.createRef<HTMLElement>(),
  useTabTransition: () => ({ ref: React.createRef<HTMLElement>() }),
}));

vi.mock("./ui", () => ({
  Button: ({
    children,
    onPress,
    isDisabled: _isDisabled,
    startContent: _startContent,
    ...props
  }: React.PropsWithChildren<{ onPress?: () => void; isDisabled?: boolean; startContent?: React.ReactNode }> & Record<string, unknown>) => (
    <button type="button" onClick={onPress} {...props}>
      {children}
    </button>
  ),
  Card: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  CardBody: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  Input: ({
    value,
    onValueChange,
    startContent: _startContent,
    ...props
  }: { value?: string; onValueChange?: (value: string) => void; startContent?: React.ReactNode } & Record<string, unknown>) => (
    <input value={value} onChange={(event) => onValueChange?.(event.target.value)} {...props} />
  ),
  Select: ({
    value,
    onValueChange,
    options,
    ...props
  }: {
    value?: string;
    onValueChange?: (value: string) => void;
    options?: Array<{ label: string; value: string }>;
  } & Record<string, unknown>) => (
    <select value={value} onChange={(event) => onValueChange?.(event.target.value)} {...props}>
      {(options ?? []).map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  Spinner: () => <div>Loading</div>,
  Switch: ({ isSelected, onValueChange }: { isSelected?: boolean; onValueChange?: (value: boolean) => void }) => (
    <button type="button" onClick={() => onValueChange?.(!isSelected)}>
      {isSelected ? "On" : "Off"}
    </button>
  ),
}));

vi.mock("./common", () => ({
  IconPreview: () => <div>Icon</div>,
  SectionCard: ({
    title,
    subtitle,
    actions,
    children,
  }: React.PropsWithChildren<{ title: string; subtitle?: string; actions?: React.ReactNode }>) => (
    <section>
      <h3>{title}</h3>
      {subtitle ? <p>{subtitle}</p> : null}
      {actions}
      {children}
    </section>
  ),
  resolveFriendlyName: (...values: Array<string | undefined>) => values.find(Boolean) ?? "",
  IconPreviewFallback: () => <div>Fallback</div>,
}));

describe("GameModePage component", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("turns the grouped research block into a jump point for editable fields", async () => {
    render(
      <GameModePage
        entries={[
          {
            id: "arena-game-mode",
            title: "Arena Game Mode",
            subtitle: "live runtime",
            relativePath: "Runtime/ArenaSettings/ArenaGameMode.json",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/ArenaSettings/ArenaGameMode.json",
            targetType: "ArenaGameMode",
          } as never,
        ]}
        search=""
        onSearchChange={vi.fn()}
        selectedEntry={
          {
            id: "arena-game-mode",
            title: "Arena Game Mode",
            subtitle: "live runtime",
            relativePath: "Runtime/ArenaSettings/ArenaGameMode.json",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/ArenaSettings/ArenaGameMode.json",
            targetType: "ArenaGameMode",
          } as never
        }
        selectedState={
          {
            document: {
              displayName: "Arena Game Mode",
              sourceRole: "arena_game_mode",
              simpleSettings: {
                groups: [
                  {
                    category: "Rules",
                    entries: [
                      {
                        name: "Score To Win",
                        path: "configuration.scoreToWin",
                        editable: true,
                        valueType: "integer",
                        currentValue: 5,
                        defaultValue: 5,
                      },
                    ],
                  },
                  {
                    category: "Zone",
                    entries: [
                      {
                        name: "Spawn Invulnerability",
                        path: "configuration.spawnInvulnerableDuration",
                        editable: true,
                        valueType: "integer",
                        currentValue: 2,
                        defaultValue: 2,
                      },
                    ],
                  },
                ],
              },
              advanced: {
                fields: [
                  {
                    path: "configuration.respawnDelaySeconds",
                    label: "Respawn Delay",
                    category: "Rules",
                    editable: true,
                    valueType: "number",
                    currentValue: 4,
                    defaultValue: 4,
                  },
                ],
              },
              collectionEditors: [],
              namedCollections: [],
              overrides: {},
              operations: { entries: [] },
            },
            draftOverrides: {},
            draftOperations: [],
            overrideText: "{}",
            loading: false,
            saving: false,
          } as never
        }
        mode="studio"
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onResetValue={vi.fn()}
        onSetCollectionValue={vi.fn()}
        onOverrideTextChange={vi.fn()}
        onSave={vi.fn()}
        onRevert={vi.fn()}
        onReset={vi.fn()}
        onReload={vi.fn()}
        libraryMetadata={null}
        gameModeIndex={null}
        onRefreshGameModeIndex={vi.fn()}
        snapshotCopyTargets={[]}
        onCopySnapshotToTarget={vi.fn()}
      />,
    );

    expect(screen.getByText("Context and utilities")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Research" }));
    fireEvent.click(screen.getByRole("button", { name: "Spawns and entities" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open editable fields" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Open editable fields" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Spawn Invulnerability")).toBeTruthy();
    });
    expect(screen.queryByLabelText("Score To Win")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Rules" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Score To Win")).toBeTruthy();
    });
    fireEvent.click(screen.getAllByRole("button", { name: /^Spawns/i }).at(-1)!);

    await waitFor(() => {
      expect(screen.getByLabelText("Respawn Delay")).toBeTruthy();
    });
  });

  it("renders named fishing collections with readable labels and editable toggles", async () => {
    const onSetCollectionValue = vi.fn();

    render(
      <GameModePage
        entries={[
          {
            id: "fishing-rod",
            title: "Pond Alpha Fishing Rod",
            subtitle: "fishing loot table",
            relativePath: "Runtime/ArenaSettings/Fishing/01_Pond_Alpha_Fishing_Rod.json",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/ArenaSettings/Fishing/01_Pond_Alpha_Fishing_Rod.json",
            targetType: "ArenaFishingRod",
          } as never,
        ]}
        search=""
        onSearchChange={vi.fn()}
        selectedEntry={
          {
            id: "fishing-rod",
            title: "Pond Alpha Fishing Rod",
            subtitle: "fishing loot table",
            relativePath: "Runtime/ArenaSettings/Fishing/01_Pond_Alpha_Fishing_Rod.json",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/ArenaSettings/Fishing/01_Pond_Alpha_Fishing_Rod.json",
            targetType: "ArenaFishingRod",
          } as never
        }
        selectedState={
          {
            document: {
              displayName: "Pond Alpha Fishing Rod",
              sourceRole: "arena_fishing",
              simpleSettings: {
                groups: [],
              },
              advanced: { fields: [] },
              collectionEditors: [],
              namedCollections: [
                {
                  collectionId: "trashItems",
                  label: "Trash Items",
                  items: [
                    { index: 0, displayName: "Boot", value: "Item:Trash_Boot" },
                    { index: 1, displayName: "Tin Can", value: "Item:Trash_TinCan" },
                  ],
                },
              ],
              overrides: {},
              operations: { entries: [] },
            },
            draftOverrides: {},
            draftOperations: [],
            overrideText: "{}",
            loading: false,
            saving: false,
          } as never
        }
        mode="guided"
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onResetValue={vi.fn()}
        onSetCollectionValue={onSetCollectionValue}
        onOverrideTextChange={vi.fn()}
        onSave={vi.fn()}
        onRevert={vi.fn()}
        onReset={vi.fn()}
        onReload={vi.fn()}
        libraryMetadata={null}
        gameModeIndex={null}
        onRefreshGameModeIndex={vi.fn()}
        snapshotCopyTargets={[]}
        onCopySnapshotToTarget={vi.fn()}
      />,
    );

    expect(screen.getAllByText(/Trash Items/).length).toBeGreaterThan(0);
    expect(screen.getByText("Boot")).toBeTruthy();
    expect(screen.getByText("Tin Can")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "On" })[0]);

    await waitFor(() => {
      expect(onSetCollectionValue).toHaveBeenCalledWith("trashItems", ["Item:Trash_TinCan"], ["Item:Trash_Boot", "Item:Trash_TinCan"]);
    });
  });

  it("groups game mode sources into calmer sidebar sections", () => {
    render(
      <GameModePage
        entries={[
          {
            id: "current-preset",
            title: "Current Preset",
            subtitle: "current rules",
            relativePath: "Runtime/ArenaSettings/CurrentPreset.json",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/ArenaSettings/CurrentPreset.json",
            targetType: "ArenaGameModePreset",
          } as never,
          {
            id: "live-snapshot",
            title: "Live Snapshot",
            subtitle: "current lobby",
            relativePath: "Runtime/ArenaSettings/ArenaLobby.json",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/ArenaSettings/ArenaLobby.json",
            targetType: "ArenaLobby",
          } as never,
          {
            id: "saved-preset",
            title: "Saved Custom Preset 1",
            subtitle: "saved preset",
            relativePath: "Runtime/ArenaSettings/SavedPreset01.json",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/ArenaSettings/SavedPreset01.json",
            targetType: "ArenaGameModePreset",
          } as never,
          {
            id: "arena-game-mode",
            title: "Arena Game Mode",
            subtitle: "advanced rules",
            relativePath: "Runtime/ArenaSettings/ArenaGameMode.json",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/ArenaSettings/ArenaGameMode.json",
            targetType: "ArenaGameMode",
          } as never,
        ]}
        search=""
        onSearchChange={vi.fn()}
        selectedEntry={
          {
            id: "current-preset",
            title: "Current Preset",
            subtitle: "current rules",
            relativePath: "Runtime/ArenaSettings/CurrentPreset.json",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/ArenaSettings/CurrentPreset.json",
            targetType: "ArenaGameModePreset",
          } as never
        }
        selectedState={
          {
            document: {
              displayName: "Current Preset",
              sourceRole: "current_preset",
              simpleSettings: { groups: [] },
              advanced: { fields: [] },
              collectionEditors: [],
              namedCollections: [],
              overrides: {},
              operations: { entries: [] },
            },
            draftOverrides: {},
            draftOperations: [],
            overrideText: "{}",
            loading: false,
            saving: false,
          } as never
        }
        mode="guided"
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onResetValue={vi.fn()}
        onSetCollectionValue={vi.fn()}
        onOverrideTextChange={vi.fn()}
        onSave={vi.fn()}
        onRevert={vi.fn()}
        onReset={vi.fn()}
        onReload={vi.fn()}
        libraryMetadata={null}
        gameModeIndex={null}
        onRefreshGameModeIndex={vi.fn()}
        snapshotCopyTargets={[]}
        onCopySnapshotToTarget={vi.fn()}
      />,
    );

    expect(screen.getByText("Start here")).toBeTruthy();
    expect(screen.getByText("Live lobby")).toBeTruthy();
    expect(screen.getByText("Saved presets")).toBeTruthy();
    expect(screen.getByText("Deep sources")).toBeTruthy();
  });
});
