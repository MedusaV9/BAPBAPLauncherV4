// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorPage } from "./EditorPage";

vi.mock("./motion", () => ({
  usePageEntranceMotion: () => React.createRef<HTMLDivElement>(),
  useSelectionChangeMotion: () => React.createRef<HTMLDivElement>(),
  useSidebarCollapseMotion: () => React.createRef<HTMLElement>(),
  useCollapsibleSection: () => React.createRef<HTMLElement>(),
  useTabTransition: () => ({ ref: React.createRef<HTMLElement>() }),
}));

vi.mock("./ui", () => ({
  Button: ({
    children,
    onPress,
    startContent: _startContent,
    ...props
  }: React.PropsWithChildren<{ onPress?: () => void; startContent?: React.ReactNode }> & Record<string, unknown>) => (
    <button type="button" onClick={onPress} {...props}>
      {children}
    </button>
  ),
  Card: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  CardBody: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  Input: React.forwardRef<HTMLInputElement, any>(({
    value,
    onValueChange,
    startContent: _startContent,
    ...props
  }, ref) => (
    <input ref={ref} value={value} onChange={(event) => onValueChange?.(event.target.value)} {...props} />
  )),
  Spinner: () => <div>Loading</div>,
}));

vi.mock("./common", () => ({
  CardPreviewPanel: () => <div data-testid="card-preview-panel">Preview card</div>,
  IconPreview: () => <div>Icon</div>,
  MissingIconBadge: () => <div>Missing icon</div>,
  QuickEditControl: ({
    item,
  }: {
    item: { path: string; verifiedChoices?: Array<{ value: string }>; allowCustomValue?: boolean };
  }) => (
    <div data-testid={`quick-edit-${item.path}`}>
      <span>{item.path}</span>
      <span data-testid={`quick-edit-choice-count-${item.path}`}>{item.verifiedChoices?.length ?? 0}</span>
      <span data-testid={`quick-edit-custom-${item.path}`}>{item.allowCustomValue ? "custom" : "fixed"}</span>
    </div>
  ),
  SectionCard: ({ title, subtitle, children }: React.PropsWithChildren<{ title: string; subtitle?: string }>) => (
    <section>
      <h3>{title}</h3>
      {subtitle ? <p>{subtitle}</p> : null}
      {children}
    </section>
  ),
  resolveFriendlyName: (...values: Array<string | undefined>) => values.find(Boolean) ?? "",
  stringifyInlineSafe: (value: unknown) => (value == null ? "" : typeof value === "string" ? value : JSON.stringify(value)),
}));

describe("EditorPage component", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders stable editor shell hooks for the selected runtime document", () => {
    render(
      <EditorPage
        editorGroups={[{ key: "augments", label: "Augments", count: 1, entries: [] } as never]}
        editorGroup="augments"
        mode="studio"
        onChangeGroup={vi.fn()}
        entries={[
          {
            id: "entry-firewave",
            title: "Custom Firewave Plus",
            subtitle: "augment",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Passives/0158_P_Firewave.json",
            relativePath: "Runtime/Passives/0158_P_Firewave.json",
            targetType: "Passive",
          } as never,
        ]}
        search=""
        onSearchChange={vi.fn()}
        selectedEntry={
          {
            id: "entry-firewave",
            title: "Custom Firewave Plus",
            subtitle: "augment",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Passives/0158_P_Firewave.json",
            relativePath: "Runtime/Passives/0158_P_Firewave.json",
            targetType: "Passive",
          } as never
        }
        selectedState={
          {
            document: {
              id: "entry-firewave",
              displayName: "Custom Firewave Plus",
              quickEdit: [{ path: "configuration.speed", editable: true, value: 14, defaultValue: 12 }],
              simpleSettings: {
                whatThisConfigDoes: "Firewave test document",
                groups: [],
              },
              advanced: { fields: [] },
              overrides: {},
              operations: { entries: [] },
              cardPreview: {
                title: "Firewave",
                description: "Burn the map in a line.",
              },
            },
            draftOverrides: {},
            draftOperations: [],
            overrideText: "{}",
            loading: false,
            saving: false,
          } as never
        }
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onResetValue={vi.fn()}
        onOverrideTextChange={vi.fn()}
        onSave={vi.fn()}
        onRevert={vi.fn()}
        onReset={vi.fn()}
        onReload={vi.fn()}
      />
    );

    expect(screen.getByTestId("rebalance-editor-layout")).toBeTruthy();
    expect(screen.getByTestId("rebalance-editor-sidebar")).toBeTruthy();
    expect(screen.getByTestId("rebalance-editor-main")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quick edit" })).toBeTruthy();
    expect(screen.queryByTestId("rebalance-editor-preview")).toBeNull();
    expect(screen.queryByTestId("card-preview-panel")).toBeNull();
  });

  it("uses the denser embedded chrome without the long selection explainer", () => {
    render(
      <EditorPage
        editorGroups={[{ key: "augments", label: "Augments", count: 1, entries: [] } as never]}
        editorGroup="augments"
        mode="studio"
        onChangeGroup={vi.fn()}
        entries={[
          {
            id: "entry-bad-breath",
            title: "Bad Breath",
            subtitle: "augment",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Passives/0101_P_BadBreath.json",
            relativePath: "Runtime/Passives/0101_P_BadBreath.json",
            targetType: "Passive",
          } as never,
        ]}
        search=""
        onSearchChange={vi.fn()}
        selectedEntry={
          {
            id: "entry-bad-breath",
            title: "Bad Breath",
            subtitle: "augment",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Passives/0101_P_BadBreath.json",
            relativePath: "Runtime/Passives/0101_P_BadBreath.json",
            targetType: "Passive",
          } as never
        }
        selectedState={
          {
            document: {
              id: "entry-bad-breath",
              displayName: "Bad Breath",
              quickEdit: [{ path: "configuration.damage", editable: true, value: 75, defaultValue: 60 }],
              simpleSettings: {
                whatThisConfigDoes: "Leaves a smoke bomb trail.",
                groups: [],
              },
              advanced: { fields: [] },
              overrides: {},
              operations: { entries: [] },
              cardPreview: {
                title: "Bad Breath",
                description: "Leaves behind a smoke cloud.",
              },
            },
            draftOverrides: {},
            draftOperations: [],
            overrideText: "{}",
            loading: false,
            saving: false,
          } as never
        }
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onResetValue={vi.fn()}
        onOverrideTextChange={vi.fn()}
        onSave={vi.fn()}
        onRevert={vi.fn()}
        onReset={vi.fn()}
        onReload={vi.fn()}
        previewDisplayMode="compact"
        collapseSidebarOnSelection={false}
        embeddedCompact
      />
    );

    expect(screen.queryByText("Start small. Pick one file, change one easy value, save it, then test it.")).toBeNull();
    expect(screen.getByText("Choose one file")).toBeTruthy();
    expect(screen.getAllByText("Bad Breath").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("rebalance-editor-preview")).toBeNull();
  });

  it("prefers the hydrated runtime display name over a stale technical card title", () => {
    render(
      <EditorPage
        editorGroups={[{ key: "characters", label: "Characters", count: 1, entries: [] } as never]}
        editorGroup="characters"
        mode="studio"
        onChangeGroup={vi.fn()}
        entries={[
          {
            id: "entry-kitsu-ability",
            title: "Ability[0] Ability1 (Ability)",
            displayName: "Kitsu / Ability Slot 1",
            subtitle: "character ability",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Characters/0000_KITSU/Abilities/00_Ability.json",
            relativePath: "Runtime/Characters/0000_KITSU/Abilities/00_Ability.json",
            targetType: "CharacterAbility",
          } as never,
        ]}
        search=""
        onSearchChange={vi.fn()}
        selectedEntry={
          {
            id: "entry-kitsu-ability",
            title: "Ability[0] Ability1 (Ability)",
            displayName: "Kitsu / Ability Slot 1",
            subtitle: "character ability",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Characters/0000_KITSU/Abilities/00_Ability.json",
            relativePath: "Runtime/Characters/0000_KITSU/Abilities/00_Ability.json",
            targetType: "CharacterAbility",
          } as never
        }
        selectedState={
          {
            document: {
              id: "entry-kitsu-ability",
              displayName: "Kitsu / Ability Slot 1",
              resolvedName: "Kitsu / Ability Slot 1",
              quickEdit: [{ path: "configuration.damage", editable: true, value: 12, defaultValue: 10 }],
              simpleSettings: {
                whatThisConfigDoes: "Ability slot editor.",
                groups: [],
              },
              advanced: { fields: [] },
              overrides: {},
              operations: { entries: [] },
              cardPreview: {
                title: "Ability[0] Ability1 (Ability)",
                description: "Technical old title should not win.",
              },
            },
            draftOverrides: {},
            draftOperations: [],
            overrideText: "{}",
            loading: false,
            saving: false,
          } as never
        }
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onResetValue={vi.fn()}
        onOverrideTextChange={vi.fn()}
        onSave={vi.fn()}
        onRevert={vi.fn()}
        onReset={vi.fn()}
        onReload={vi.fn()}
      />
    );

    expect(screen.getAllByText("Kitsu / Ability Slot 1").length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "Ability[0] Ability1 (Ability)" })).toBeNull();
  });

  it("falls back to a readable character-slot title when only technical ability labels exist", () => {
    render(
      <EditorPage
        editorGroups={[{ key: "characters", label: "Characters", count: 1, entries: [] } as never]}
        editorGroup="characters"
        mode="studio"
        onChangeGroup={vi.fn()}
        entries={[
          {
            id: "entry-anna-ability",
            title: "Ability[0] Ability1 (Ability)",
            subtitle: "character ability",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Characters/0001_ANNA/Abilities/00_Ability.json",
            relativePath: "Runtime/Characters/0001_ANNA/Abilities/00_Ability.json",
            targetType: "CharacterAbility",
            targetKey: "ANNA#1/Ability[0]",
          } as never,
        ]}
        search=""
        onSearchChange={vi.fn()}
        selectedEntry={
          {
            id: "entry-anna-ability",
            title: "Ability[0] Ability1 (Ability)",
            subtitle: "character ability",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Characters/0001_ANNA/Abilities/00_Ability.json",
            relativePath: "Runtime/Characters/0001_ANNA/Abilities/00_Ability.json",
            targetType: "CharacterAbility",
            targetKey: "ANNA#1/Ability[0]",
          } as never
        }
        selectedState={
          {
            document: {
              id: "entry-anna-ability",
              displayName: "Ability[0] Ability1 (Ability)",
              quickEdit: [{ path: "configuration.damage", editable: true, value: 22, defaultValue: 20 }],
              simpleSettings: {
                whatThisConfigDoes: "Ability slot editor.",
                groups: [],
              },
              advanced: { fields: [] },
              overrides: {},
              operations: { entries: [] },
              cardPreview: {
                title: "Ability[0] Ability1 (Ability)",
                description: "Technical title should collapse to a readable fallback.",
              },
              targetType: "CharacterAbility",
              targetKey: "ANNA#1/Ability[0]",
            },
            draftOverrides: {},
            draftOperations: [],
            overrideText: "{}",
            loading: false,
            saving: false,
          } as never
        }
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onResetValue={vi.fn()}
        onOverrideTextChange={vi.fn()}
        onSave={vi.fn()}
        onRevert={vi.fn()}
        onReset={vi.fn()}
        onReload={vi.fn()}
      />
    );

    expect(screen.getAllByText(/anna.*ability slot 1/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("Ability[0] Ability1 (Ability)")).toBeNull();
  });

  it("moves the file browser shortcut into the header when a selection is active", () => {
    render(
      <EditorPage
        editorGroups={[{ key: "augments", label: "Augments", count: 1, entries: [] } as never]}
        editorGroup="augments"
        mode="studio"
        onChangeGroup={vi.fn()}
        entries={[
          {
            id: "entry-360-scythe",
            title: "360 Scythe",
            subtitle: "augment",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Passives/0200_P_360Scythe.json",
            relativePath: "Runtime/Passives/0200_P_360Scythe.json",
            targetType: "Passive",
          } as never,
        ]}
        search=""
        onSearchChange={vi.fn()}
        selectedEntry={
          {
            id: "entry-360-scythe",
            title: "360 Scythe",
            subtitle: "augment",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Passives/0200_P_360Scythe.json",
            relativePath: "Runtime/Passives/0200_P_360Scythe.json",
            targetType: "Passive",
          } as never
        }
        selectedState={
          {
            document: {
              id: "entry-360-scythe",
              displayName: "360 Scythe",
              quickEdit: [{ path: "configuration.damage", editable: true, value: 75, defaultValue: 60 }],
              simpleSettings: {
                whatThisConfigDoes: "Spins around the user.",
                groups: [],
              },
              advanced: { fields: [] },
              overrides: {},
              operations: { entries: [] },
              cardPreview: {
                title: "360 Scythe",
                description: "Your melee now hits in a circle.",
              },
            },
            draftOverrides: {},
            draftOperations: [],
            overrideText: "{}",
            loading: false,
            saving: false,
          } as never
        }
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onResetValue={vi.fn()}
        onOverrideTextChange={vi.fn()}
        onSave={vi.fn()}
        onRevert={vi.fn()}
        onReset={vi.fn()}
        onReload={vi.fn()}
      />
    );

    expect(screen.getAllByRole("button", { name: "Browse files" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /360 Scythe/i })).toBeTruthy();
  });

  it("keeps advanced and raw override details collapsed in embedded compact mode", () => {
    render(
      <EditorPage
        editorGroups={[{ key: "augments", label: "Augments", count: 1, entries: [] } as never]}
        editorGroup="augments"
        mode="studio"
        onChangeGroup={vi.fn()}
        entries={[
          {
            id: "entry-firewave",
            title: "Custom Firewave Plus",
            subtitle: "augment",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Passives/0158_P_Firewave.json",
            relativePath: "Runtime/Passives/0158_P_Firewave.json",
            targetType: "Passive",
          } as never,
        ]}
        search=""
        onSearchChange={vi.fn()}
        selectedEntry={
          {
            id: "entry-firewave",
            title: "Custom Firewave Plus",
            subtitle: "augment",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Passives/0158_P_Firewave.json",
            relativePath: "Runtime/Passives/0158_P_Firewave.json",
            targetType: "Passive",
          } as never
        }
        selectedState={
          {
            document: {
              id: "entry-firewave",
              displayName: "Custom Firewave Plus",
              quickEdit: [{ path: "configuration.speed", editable: true, value: 14, defaultValue: 12 }],
              simpleSettings: {
                whatThisConfigDoes: "Firewave test document",
                groups: [
                  {
                    category: "Behavior",
                    entries: [
                      {
                        name: "Wave lifetime",
                        path: "configuration.ttl",
                        editable: true,
                        currentValue: 3,
                        defaultValue: 2,
                        description: "How long the wave persists.",
                      },
                    ],
                  },
                ],
              },
              advanced: {
                fields: [
                  {
                    path: "configuration.spawnCount",
                    editable: true,
                    effectiveValue: 2,
                    defaultValue: 1,
                    description: "How many projectiles spawn.",
                  },
                ],
              },
              overrides: { configuration: { ttl: 3 } },
              operations: { entries: [] },
              cardPreview: {
                title: "Firewave",
                description: "Burn the map in a line.",
              },
            },
            draftOverrides: {},
            draftOperations: [],
            overrideText: "{\n  \"configuration.ttl\": 3\n}",
            loading: false,
            saving: false,
          } as never
        }
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onResetValue={vi.fn()}
        onOverrideTextChange={vi.fn()}
        onSave={vi.fn()}
        onRevert={vi.fn()}
        onReset={vi.fn()}
        onReload={vi.fn()}
        embeddedCompact
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "All values" }));

    expect(screen.getAllByText("All values").length).toBeGreaterThan(0);
    expect(screen.getByTestId("quick-edit-configuration.ttl")).toBeTruthy();
    expect(screen.queryByTestId("quick-edit-configuration.spawnCount")).toBeNull();
    fireEvent.click(screen.getByText("Advanced").closest("button") as HTMLElement);
    expect(screen.getByTestId("quick-edit-configuration.spawnCount")).toBeTruthy();
    expect(screen.queryByText("Helpful next steps appear here when a file exports deeper values.")).toBeNull();
    expect(screen.queryByText("Raw overrides")).toBeNull();
  });

  it("collapses to one compact workspace panel when no files are available", () => {
    render(
      <EditorPage
        editorGroups={[{ key: "augments", label: "Augments", count: 0, entries: [] } as never]}
        editorGroup="augments"
        mode="studio"
        onChangeGroup={vi.fn()}
        entries={[]}
        search=""
        onSearchChange={vi.fn()}
        selectedEntry={null}
        selectedState={
          {
            loading: false,
            saving: false,
            draftOverrides: {},
            draftOperations: [],
            overrideText: "{}",
          } as never
        }
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onResetValue={vi.fn()}
        onOverrideTextChange={vi.fn()}
        onSave={vi.fn()}
        onRevert={vi.fn()}
        onReset={vi.fn()}
        onReload={vi.fn()}
      />
    );

    expect(screen.queryByTestId("rebalance-editor-sidebar")).toBeNull();
    expect(screen.getByText("No exported file is ready yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload this category" })).toBeTruthy();
  });

  it("shows one all-values category at a time so the editor does not dump every field into one long scroll", () => {
    render(
      <EditorPage
        editorGroups={[{ key: "augments", label: "Augments", count: 1, entries: [] } as never]}
        editorGroup="augments"
        mode="studio"
        onChangeGroup={vi.fn()}
        entries={[
          {
            id: "entry-categorized",
            title: "Categorized Test",
            subtitle: "augment",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Passives/0158_P_Firewave.json",
            relativePath: "Runtime/Passives/0158_P_Firewave.json",
            targetType: "Passive",
          } as never,
        ]}
        search=""
        onSearchChange={vi.fn()}
        selectedEntry={
          {
            id: "entry-categorized",
            title: "Categorized Test",
            subtitle: "augment",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Passives/0158_P_Firewave.json",
            relativePath: "Runtime/Passives/0158_P_Firewave.json",
            targetType: "Passive",
          } as never
        }
        selectedState={
          {
            document: {
              id: "entry-categorized",
              displayName: "Categorized Test",
              quickEdit: [],
              simpleSettings: {
                groups: [
                  {
                    category: "Behavior",
                    entries: [
                      {
                        name: "Wave lifetime",
                        path: "configuration.ttl",
                        editable: true,
                        currentValue: 3,
                        defaultValue: 2,
                      },
                    ],
                  },
                ],
              },
              advanced: {
                fields: [
                  {
                    category: "Advanced",
                    label: "Spawn count",
                    path: "configuration.spawnCount",
                    editable: true,
                    effectiveValue: 2,
                    defaultValue: 1,
                  },
                ],
              },
              overrides: {},
              operations: { entries: [] },
              cardPreview: {
                title: "Categorized Test",
                description: "Category browser test.",
              },
            },
            draftOverrides: {},
            draftOperations: [],
            overrideText: "{}",
            loading: false,
            saving: false,
          } as never
        }
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onResetValue={vi.fn()}
        onOverrideTextChange={vi.fn()}
        onSave={vi.fn()}
        onRevert={vi.fn()}
        onReset={vi.fn()}
        onReload={vi.fn()}
        embeddedCompact
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "All values" }));

    expect(screen.getByTestId("quick-edit-configuration.ttl")).toBeTruthy();
    expect(screen.queryByTestId("quick-edit-configuration.spawnCount")).toBeNull();

    fireEvent.click(screen.getByText("Advanced").closest("button") as HTMLElement);

    expect(screen.getByTestId("quick-edit-configuration.spawnCount")).toBeTruthy();
    expect(screen.queryByTestId("quick-edit-configuration.ttl")).toBeNull();
  });

  it("renders fallback controls for exported effective values even without curated advanced field metadata", () => {
    render(
      <EditorPage
        editorGroups={[{ key: "augments", label: "Augments", count: 1, entries: [] } as never]}
        editorGroup="augments"
        mode="studio"
        onChangeGroup={vi.fn()}
        entries={[
          {
            id: "entry-firewave-fallback",
            title: "Custom Firewave Plus",
            subtitle: "augment",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Passives/0158_P_Firewave.json",
            relativePath: "Runtime/Passives/0158_P_Firewave.json",
            targetType: "Passive",
          } as never,
        ]}
        search=""
        onSearchChange={vi.fn()}
        selectedEntry={
          {
            id: "entry-firewave-fallback",
            title: "Custom Firewave Plus",
            subtitle: "augment",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Passives/0158_P_Firewave.json",
            relativePath: "Runtime/Passives/0158_P_Firewave.json",
            targetType: "Passive",
          } as never
        }
        selectedState={
          {
            document: {
              id: "entry-firewave-fallback",
              displayName: "Custom Firewave Plus",
              quickEdit: [{ path: "configuration.speed", editable: true, value: 14, defaultValue: 12 }],
              simpleSettings: {
                whatThisConfigDoes: "Firewave test document",
                groups: [],
              },
              advanced: {
                fields: [],
                defaults: {
                  "configuration.spawnCount": 1,
                  "configuration.projectileOffsets": [0, 20, 40],
                },
                effectiveValues: {
                  "configuration.spawnCount": 3,
                  "configuration.projectileOffsets": [0, 24, 48],
                },
              },
              overrides: {},
              operations: { entries: [] },
              cardPreview: {
                title: "Firewave",
                description: "Burn the map in a line.",
              },
            },
            draftOverrides: {},
            draftOperations: [],
            overrideText: "{}",
            loading: false,
            saving: false,
          } as never
        }
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onResetValue={vi.fn()}
        onOverrideTextChange={vi.fn()}
        onSave={vi.fn()}
        onRevert={vi.fn()}
        onReset={vi.fn()}
        onReload={vi.fn()}
        embeddedCompact
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "All values" }));

    expect(screen.getByTestId("quick-edit-configuration.projectileOffsets")).toBeTruthy();
    expect(screen.queryByTestId("quick-edit-configuration.spawnCount")).toBeNull();
    fireEvent.click(screen.getByText("Configuration / SpawnCount").closest("button") as HTMLElement);
    expect(screen.getByTestId("quick-edit-configuration.spawnCount")).toBeTruthy();
  });

  it("does not crash when a quick edit entry has a nullish icon path", () => {
    render(
      <EditorPage
        editorGroups={[{ key: "managers", label: "Managers", count: 1, entries: [] } as never]}
        editorGroup="managers"
        mode="studio"
        onChangeGroup={vi.fn()}
        entries={[
          {
            id: "entry-augment-manager",
            title: "Augment Manager",
            subtitle: "manager",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Managers/AugmentManager.json",
            relativePath: "Runtime/Managers/AugmentManager.json",
            targetType: "Manager",
          } as never,
        ]}
        search=""
        onSearchChange={vi.fn()}
        selectedEntry={
          {
            id: "entry-augment-manager",
            title: "Augment Manager",
            subtitle: "manager",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Managers/AugmentManager.json",
            relativePath: "Runtime/Managers/AugmentManager.json",
            targetType: "Manager",
          } as never
        }
        selectedState={
          {
            document: {
              id: "entry-augment-manager",
              displayName: "Augment Manager",
              quickEdit: [
                { path: null, setting: "Broken icon", editable: true, value: "ignored" },
                { path: "vaultedAugments", setting: "Vaulted Augments", editable: true, value: [] },
              ],
              simpleSettings: { groups: [] },
              advanced: { fields: [] },
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
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onResetValue={vi.fn()}
        onOverrideTextChange={vi.fn()}
        onSave={vi.fn()}
        onRevert={vi.fn()}
        onReset={vi.fn()}
        onReload={vi.fn()}
      />
    );

    expect(screen.getAllByText("Augment Manager").length).toBeGreaterThan(0);
    expect(screen.getByTestId("rebalance-editor-main")).toBeTruthy();
  });

  it("upgrades runtime reference choices into selectable all-value controls", () => {
    render(
      <EditorPage
        editorGroups={[{ key: "augments", label: "Augments", count: 1, entries: [] } as never]}
        editorGroup="augments"
        mode="studio"
        onChangeGroup={vi.fn()}
        entries={[
          {
            id: "entry-passive-reference",
            title: "Passive Ref",
            subtitle: "augment",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Passives/0001_P_Test.json",
            relativePath: "Runtime/Passives/0001_P_Test.json",
            targetType: "Passive",
          } as never,
        ]}
        search=""
        onSearchChange={vi.fn()}
        selectedEntry={
          {
            id: "entry-passive-reference",
            title: "Passive Ref",
            subtitle: "augment",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Passives/0001_P_Test.json",
            relativePath: "Runtime/Passives/0001_P_Test.json",
            targetType: "Passive",
          } as never
        }
        selectedState={
          {
            document: {
              id: "entry-passive-reference",
              displayName: "Passive Ref",
              quickEdit: [],
              simpleSettings: {
                whatThisConfigDoes: "Reference choice test.",
                groups: [],
              },
              advanced: {
                fields: [
                  {
                    path: "configuration.statusEffects.statusEffect",
                    label: "Burn effect",
                    editable: true,
                    valueType: "string",
                    effectiveValue: "PassiveSO:P_Firewave_Burn",
                    defaultValue: "PassiveSO:P_Firewave_Burn",
                  },
                ],
              },
              referenceChoices: [
                {
                  path: "configuration.statusEffects.statusEffect",
                  label: "Burn effect",
                  currentReference: "PassiveSO:P_Firewave_Burn",
                  referenceType: "Passive",
                  allowCustomReference: true,
                  availableReferences: [
                    "PassiveSO:P_Firewave_Burn",
                    "PassiveSO:P_Fireball",
                    "PassiveSO:P_Berserk",
                  ],
                },
              ],
              overrides: {},
              operations: { entries: [] },
              cardPreview: {
                title: "Passive Ref",
                description: "Reference choice test.",
              },
            },
            draftOverrides: {},
            draftOperations: [],
            overrideText: "{}",
            loading: false,
            saving: false,
          } as never
        }
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onResetValue={vi.fn()}
        onOverrideTextChange={vi.fn()}
        onSave={vi.fn()}
        onRevert={vi.fn()}
        onReset={vi.fn()}
        onReload={vi.fn()}
        embeddedCompact
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "All values" }));

    expect(screen.getByTestId("quick-edit-choice-count-configuration.statusEffects.statusEffect").textContent).toBe("3");
    expect(screen.getByTestId("quick-edit-custom-configuration.statusEffects.statusEffect").textContent).toBe("custom");
  });
});
