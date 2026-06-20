// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SwapAbilityPage } from "./SwapAbilityPage";

vi.mock("./motion", () => ({
  useOverlayDrawerAnimation: (isOpen: boolean) => ({ shouldRender: isOpen, ref: React.createRef<HTMLDivElement>(), phase: isOpen ? "open" : "idle" }),
  useOverlayEntranceMotion: () => ({ ref: React.createRef<HTMLDivElement>(), mounted: true }),
  usePageEntranceMotion: () => React.createRef<HTMLDivElement>(),
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
  Input: ({
    value,
    onValueChange,
    startContent: _startContent,
    ...props
  }: { value?: string; onValueChange?: (value: string) => void; startContent?: React.ReactNode } & Record<string, unknown>) => (
    <input value={value} onChange={(event) => onValueChange?.(event.target.value)} {...props} />
  ),
  Spinner: () => <div>Loading</div>,
}));

vi.mock("./common", async () => {
  const actual = await vi.importActual<typeof import("./common")>("./common");
  return {
    ...actual,
    SectionCard: ({ title, subtitle, children }: React.PropsWithChildren<{ title: string; subtitle?: string }>) => (
      <section>
        <h3>{title}</h3>
        {subtitle ? <p>{subtitle}</p> : null}
        {children}
      </section>
    ),
  };
});

describe("SwapAbilityPage component", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const openSourceBrowser = () => {
    fireEvent.click(screen.getByRole("button", { name: "Browse sources" }));
  };

  it("prioritizes same-character same-slot sources and keeps readable names visible", () => {
    render(
      <SwapAbilityPage
        entries={[
          {
            id: "anna-swap",
            title: "Anna / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never,
        ]}
        selectedEntry={
          {
            id: "anna-swap",
            title: "Anna / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never
        }
        selectedState={
          {
            document: {
              displayName: "Anna",
              characterDisplayName: "Anna",
              slots: [
                {
                  slotIndex: 0,
                  slotLabel: "Basic",
                  currentTargetKey: "ANNA#1/Ability[0]",
                  currentDisplayName: "Anna / Basic",
                  currentCommandLabel: "Spinning Slash",
                  currentCharacterKey: "ANNA#1",
                  currentCharacterDisplayName: "Anna",
                  sourceTargetKey: "",
                },
              ],
              availableSources: [
                {
                  targetKey: "ANNA#1/Ability[0]",
                  displayName: "Anna / Basic",
                  commandLabel: "Spinning Slash",
                  characterKey: "ANNA#1",
                  characterDisplayName: "Anna",
                  slotIndex: 0,
                  slotLabel: "Basic",
                  sameCharacter: true,
                  sameSlot: true,
                },
                {
                  targetKey: "KITSU#0/Ability[0]",
                  displayName: "Kitsu / Basic",
                  commandLabel: "Foxfire Burst",
                  characterKey: "KITSU#0",
                  characterDisplayName: "Kitsu",
                  slotIndex: 0,
                  slotLabel: "Basic",
                },
              ],
            },
            draftOverrides: {},
            draftOperations: [],
            loading: false,
            saving: false,
          } as never
        }
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onSave={vi.fn()}
        onReload={vi.fn()}
      />,
    );

    openSourceBrowser();

    expect(screen.getAllByText("Anna").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Recommended").length).toBeGreaterThan(0);
    expect(screen.getByText("Choose one swap file")).toBeTruthy();
    expect(screen.getAllByText("Spinning Slash").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Basic").length).toBeGreaterThan(0);
    expect(screen.getByText("Other sources")).toBeTruthy();
    expect(screen.getAllByText("Closest match for the current character and slot").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Search ability sources")).toBeTruthy();
  });

  it("reveals the wider source pool before filtering by search text", () => {
    render(
      <SwapAbilityPage
        entries={[
          {
            id: "anna-swap",
            title: "Anna / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never,
        ]}
        selectedEntry={
          {
            id: "anna-swap",
            title: "Anna / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never
        }
        selectedState={
          {
            document: {
              displayName: "Anna",
              characterDisplayName: "Anna",
              slots: [
                {
                  slotIndex: 0,
                  slotLabel: "Basic",
                  currentTargetKey: "ANNA#1/Ability[0]",
                  currentDisplayName: "Anna / Basic",
                  currentCommandLabel: "Spinning Slash",
                  currentCharacterKey: "ANNA#1",
                  currentCharacterDisplayName: "Anna",
                  sourceTargetKey: "",
                },
              ],
              availableSources: [
                {
                  targetKey: "ANNA#1/Ability[0]",
                  displayName: "Anna / Basic",
                  commandLabel: "Spinning Slash",
                  characterKey: "ANNA#1",
                  characterDisplayName: "Anna",
                  slotIndex: 0,
                  slotLabel: "Basic",
                },
                {
                  targetKey: "KITSU#0/Ability[0]",
                  displayName: "Kitsu / Basic",
                  commandLabel: "Foxfire Burst",
                  characterKey: "KITSU#0",
                  characterDisplayName: "Kitsu",
                  slotIndex: 0,
                  slotLabel: "Basic",
                },
              ],
            },
            draftOverrides: {},
            draftOperations: [],
            loading: false,
            saving: false,
          } as never
        }
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onSave={vi.fn()}
        onReload={vi.fn()}
      />,
    );

    openSourceBrowser();
    fireEvent.click(screen.getByRole("button", { name: "Other sources" }));

    fireEvent.change(screen.getByLabelText("Search ability sources"), {
      target: { value: "kitsu" },
    });

    expect(screen.getAllByText("Foxfire Burst").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Choose this source").length).toBeGreaterThan(0);
  });

  it("falls back to readable slot context when exported labels stay technical", () => {
    render(
      <SwapAbilityPage
        entries={[
          {
            id: "kitsu-swap",
            title: "Kitsu / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never,
        ]}
        selectedEntry={
          {
            id: "kitsu-swap",
            title: "Kitsu / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never
        }
        selectedState={
          {
            document: {
              displayName: "Kitsu",
              characterDisplayName: "Kitsu",
              slots: [
                {
                  slotIndex: 0,
                  currentTargetKey: "KITSU#0/Ability[0]",
                  currentDisplayName: "Ability[0] Ability1 (Ability)",
                  currentCharacterKey: "KITSU#0",
                  currentCharacterDisplayName: "Kitsu",
                  sourceTargetKey: "KITSU#0/Ability[0]",
                },
              ],
              availableSources: [
                {
                  targetKey: "KITSU#0/Ability[0]",
                  displayName: "Ability[0] Ability1 (Ability)",
                  characterKey: "KITSU#0",
                  characterDisplayName: "Kitsu",
                  slotIndex: 0,
                },
              ],
            },
            draftOverrides: {},
            draftOperations: [],
            loading: false,
            saving: false,
          } as never
        }
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onSave={vi.fn()}
        onReload={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Basic").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Kitsu").length).toBeGreaterThan(0);
    expect(screen.queryByText("Ability[0] Ability1 (Ability)")).toBeNull();
    expect(screen.getAllByText(/No unique ability name was exported here yet/i).length).toBeGreaterThan(0);
  });

  it("shows the selected source label when the slot already points at a different source", () => {
    render(
      <SwapAbilityPage
        entries={[
          {
            id: "anna-swap",
            title: "Anna / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never,
        ]}
        selectedEntry={
          {
            id: "anna-swap",
            title: "Anna / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never
        }
        selectedState={
          {
            document: {
              displayName: "Anna",
              characterDisplayName: "Anna",
              slots: [
                {
                  slotIndex: 0,
                  slotLabel: "Basic",
                  currentTargetKey: "ANNA#1/Ability[0]",
                  currentDisplayName: "Anna / Basic",
                  currentCommandLabel: "Spinning Slash",
                  currentCharacterKey: "ANNA#1",
                  currentCharacterDisplayName: "Anna",
                  sourceTargetKey: "KITSU#0/Ability[0]",
                  sourceDisplayName: "Kitsu / Basic",
                  sourceCommandLabel: "Foxfire Burst",
                  sourceCharacterKey: "KITSU#0",
                  sourceCharacterDisplayName: "Kitsu",
                  sourceSlotIndex: 0,
                  sourceSlotLabel: "Basic",
                },
              ],
              availableSources: [
                {
                  targetKey: "KITSU#0/Ability[0]",
                  displayName: "Kitsu / Basic",
                  commandLabel: "Foxfire Burst",
                  characterKey: "KITSU#0",
                  characterDisplayName: "Kitsu",
                  slotIndex: 0,
                  slotLabel: "Basic",
                },
              ],
            },
            draftOverrides: {},
            draftOperations: [],
            loading: false,
            saving: false,
          } as never
        }
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onSave={vi.fn()}
        onReload={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Foxfire Burst").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Currently using Foxfire Burst/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Currently using Spinning Slash/i)).toBeNull();
  });

  it("clears the source search when the selected swap file changes", () => {
    const { rerender } = render(
      <SwapAbilityPage
        entries={[
          {
            id: "anna-swap",
            title: "Anna / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never,
          {
            id: "kitsu-swap",
            title: "Kitsu / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never,
        ]}
        selectedEntry={
          {
            id: "anna-swap",
            title: "Anna / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never
        }
        selectedState={
          {
            document: {
              displayName: "Anna",
              characterDisplayName: "Anna",
              slots: [
                {
                  slotIndex: 0,
                  slotLabel: "Basic",
                  currentTargetKey: "ANNA#1/Ability[0]",
                  currentDisplayName: "Anna / Basic",
                  currentCommandLabel: "Spinning Slash",
                  currentCharacterKey: "ANNA#1",
                  currentCharacterDisplayName: "Anna",
                  sourceTargetKey: "",
                },
              ],
              availableSources: [
                {
                  targetKey: "ANNA#1/Ability[0]",
                  displayName: "Anna / Basic",
                  commandLabel: "Spinning Slash",
                  characterKey: "ANNA#1",
                  characterDisplayName: "Anna",
                  slotIndex: 0,
                  slotLabel: "Basic",
                },
                {
                  targetKey: "KITSU#0/Ability[0]",
                  displayName: "Kitsu / Basic",
                  commandLabel: "Foxfire Burst",
                  characterKey: "KITSU#0",
                  characterDisplayName: "Kitsu",
                  slotIndex: 0,
                  slotLabel: "Basic",
                },
              ],
            },
            draftOverrides: {},
            draftOperations: [],
            loading: false,
            saving: false,
          } as never
        }
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onSave={vi.fn()}
        onReload={vi.fn()}
      />,
    );

    openSourceBrowser();
    fireEvent.click(screen.getByRole("button", { name: "Other sources" }));

    fireEvent.change(screen.getByLabelText("Search ability sources"), {
      target: { value: "kitsu" },
    });
    expect(screen.getAllByText("Choose this source").length).toBeGreaterThan(0);

    rerender(
      <SwapAbilityPage
        entries={[
          {
            id: "anna-swap",
            title: "Anna / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never,
          {
            id: "kitsu-swap",
            title: "Kitsu / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never,
        ]}
        selectedEntry={
          {
            id: "kitsu-swap",
            title: "Kitsu / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never
        }
        selectedState={
          {
            document: {
              displayName: "Kitsu",
              characterDisplayName: "Kitsu",
              slots: [
                {
                  slotIndex: 0,
                  slotLabel: "Basic",
                  currentTargetKey: "KITSU#0/Ability[0]",
                  currentDisplayName: "Kitsu / Basic",
                  currentCommandLabel: "Foxfire Burst",
                  currentCharacterKey: "KITSU#0",
                  currentCharacterDisplayName: "Kitsu",
                  sourceTargetKey: "",
                },
              ],
              availableSources: [
                {
                  targetKey: "KITSU#0/Ability[0]",
                  displayName: "Kitsu / Basic",
                  commandLabel: "Foxfire Burst",
                  characterKey: "KITSU#0",
                  characterDisplayName: "Kitsu",
                  slotIndex: 0,
                  slotLabel: "Basic",
                },
              ],
            },
            draftOverrides: {},
            draftOperations: [],
            loading: false,
            saving: false,
          } as never
        }
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onSave={vi.fn()}
        onReload={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Other sources" })).toBeNull();
    openSourceBrowser();
    expect(screen.getByLabelText("Search ability sources")).toBeTruthy();
    expect(screen.getAllByText("Foxfire Burst").length).toBeGreaterThan(0);
  });

  it("reconstructs slots from advanced runtime values and falls back to catalog ability sources", () => {
    render(
      <SwapAbilityPage
        entries={[
          {
            id: "anna-swap",
            title: "Anna / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never,
        ]}
        sourceEntries={[
          {
            id: "anna-ability-1",
            title: "Spinning Slash",
            subtitle: "Character ability",
            relativePath: "Runtime/Characters/0001_ANNA/Abilities/00_Ability.json",
            absolutePath: "C:/Runtime/Characters/0001_ANNA/Abilities/00_Ability.json",
            targetType: "CharacterAbility",
            targetKey: "ANNA#1/Ability[0]",
            tags: [],
            quickEditCount: 0,
            hasQuickEdit: false,
            updatedAtMs: 0,
          } as never,
          {
            id: "kitsu-ability-1",
            title: "Foxfire Burst",
            subtitle: "Character ability",
            relativePath: "Runtime/Characters/0002_KITSU/Abilities/00_Ability.json",
            absolutePath: "C:/Runtime/Characters/0002_KITSU/Abilities/00_Ability.json",
            targetType: "CharacterAbility",
            targetKey: "KITSU#2/Ability[0]",
            tags: [],
            quickEditCount: 0,
            hasQuickEdit: false,
            updatedAtMs: 0,
          } as never,
        ]}
        selectedEntry={
          {
            id: "anna-swap",
            title: "Anna / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never
        }
        selectedState={
          {
            document: {
              displayName: "Anna",
              advanced: {
                effectiveValues: {
                  "slots[0].slotLabel": "Basic",
                  "slots[0].currentTargetKey": "ANNA#1/Ability[0]",
                  "slots[0].currentDisplayName": "Anna / Basic",
                  "slots[0].currentCommandLabel": "Spinning Slash",
                  "slots[0].currentCharacterKey": "ANNA#1",
                  "slots[0].currentCharacterDisplayName": "Anna",
                  "slots[0].sourceTargetKey": "ANNA#1/Ability[0]",
                },
              },
            },
            draftOverrides: {},
            draftOperations: [],
            loading: false,
            saving: false,
          } as never
        }
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onSave={vi.fn()}
        onReload={vi.fn()}
      />,
    );

    openSourceBrowser();

    expect(screen.getAllByText("Basic").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Spinning Slash").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Recommended").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Other sources" }));
    expect(screen.getAllByText("Foxfire Burst").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Kitsu / Basic").length).toBeGreaterThan(0);
    expect(screen.queryByText("Character ability")).toBeNull();
  });

  it("keeps readable current and selected source labels when a sparse exported slot only stores rollback and source target keys", () => {
    render(
      <SwapAbilityPage
        entries={[
          {
            id: "anna-swap",
            title: "Anna / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never,
        ]}
        selectedEntry={
          {
            id: "anna-swap",
            title: "Anna / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never
        }
        selectedState={
          {
            document: {
              displayName: "Anna / Ability Swap",
              advanced: {
                effectiveValues: {
                  "slots[0].slotLabel": "Basic",
                  "slots[0].rollbackSourceTargetKey": "ANNA#1/Ability[0]",
                  "slots[0].sourceTargetKey": "ANNA#1/Ability[0]",
                },
              },
            },
            draftOverrides: {
              "slots[0].sourceTargetKey": "KITSU#0/Ability[0]",
            },
            draftOperations: [],
            loading: false,
            saving: false,
          } as never
        }
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onSave={vi.fn()}
        onReload={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Anna" })).toBeTruthy();
    expect(screen.queryByText(/Unknown character/i)).toBeNull();
    expect(screen.getAllByText("Kitsu / Basic").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Anna / Basic").length).toBeGreaterThan(0);
    expect(screen.getByText("KITSU#0/Ability[0]")).toBeTruthy();
  });

  it("treats an empty source target key as the current exported source instead of an unassigned changed state", () => {
    render(
      <SwapAbilityPage
        entries={[
          {
            id: "anna-swap",
            title: "Anna / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never,
        ]}
        selectedEntry={
          {
            id: "anna-swap",
            title: "Anna / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never
        }
        selectedState={
          {
            document: {
              displayName: "Anna / Ability Swap",
              advanced: {
                effectiveValues: {
                  "slots[0].slotLabel": "Basic",
                  "slots[0].currentTargetKey": "ANNA#1/Ability[0]",
                  "slots[0].sourceTargetKey": "",
                },
              },
            },
            draftOverrides: {},
            draftOperations: [],
            loading: false,
            saving: false,
          } as never
        }
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onSave={vi.fn()}
        onReload={vi.fn()}
      />,
    );

    expect(screen.queryByText("Unassigned")).toBeNull();
    expect(screen.queryByText("Changed")).toBeNull();
    expect(screen.getByText("ANNA#1/Ability[0]")).toBeTruthy();
    expect(screen.getAllByText("Anna / Basic").length).toBeGreaterThan(0);
  });

  it("prefers the readable character label over a generic document display name", () => {
    render(
      <SwapAbilityPage
        entries={[
          {
            id: "kitsu-swap",
            title: "KITSU / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never,
        ]}
        selectedEntry={
          {
            id: "kitsu-swap",
            title: "KITSU / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never
        }
        selectedState={
          {
            document: {
              displayName: "Ability Swap",
              slots: [
                {
                  slotIndex: 0,
                  slotLabel: "Basic",
                  currentTargetKey: "KITSU#0/Ability[0]",
                  currentDisplayName: "Ability[0] Ability1 (Ability)",
                  currentCommandLabel: "Foxfire Burst",
                  currentCharacterKey: "KITSU#0",
                  currentCharacterDisplayName: "KITSU",
                  sourceTargetKey: "",
                },
              ],
              availableSources: [
                {
                  targetKey: "KITSU#0/Ability[0]",
                  displayName: "Ability[0] Ability1 (Ability)",
                  commandLabel: "Foxfire Burst",
                  characterKey: "KITSU#0",
                  characterDisplayName: "KITSU",
                  slotIndex: 0,
                  slotLabel: "Basic",
                  sameCharacter: true,
                  sameSlot: true,
                },
              ],
            },
            draftOverrides: {},
            draftOperations: [],
            loading: false,
            saving: false,
          } as never
        }
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onSave={vi.fn()}
        onReload={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: /kitsu/i })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Ability Swap" })).toBeNull();
    expect(screen.getAllByText("Foxfire Burst").length).toBeGreaterThan(0);
  });

  it("suppresses thin runtime labels and falls back to readable character-slot source text", () => {
    render(
      <SwapAbilityPage
        entries={[
          {
            id: "anna-swap",
            title: "Anna / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never,
        ]}
        sourceEntries={[
          {
            id: "anna-ability-1",
            title: "Anna / Basic",
            subtitle: "Abilities / 00 Ability 1",
            relativePath: "Runtime/Characters/0001_ANNA/Abilities/00_Ability.json",
            absolutePath: "C:/Runtime/Characters/0001_ANNA/Abilities/00_Ability.json",
            targetType: "CharacterAbility",
            targetKey: "ANNA#1/Ability[0]",
            tags: [],
            quickEditCount: 0,
            hasQuickEdit: false,
            updatedAtMs: 0,
          } as never,
        ]}
        selectedEntry={
          {
            id: "anna-swap",
            title: "Anna / Ability Swap",
            subtitle: "Character Ability Swap",
          } as never
        }
        selectedState={
          {
            document: {
              displayName: "Anna",
              advanced: {
                effectiveValues: {
                  "slots[0].slotLabel": "Ability Slot 1",
                  "slots[0].currentTargetKey": "ANNA#1/Ability[0]",
                  "slots[0].currentDisplayName": "Ability[0] Ability1 (Ability)",
                  "slots[0].currentCharacterKey": "ANNA#1",
                  "slots[0].currentCharacterDisplayName": "Anna",
                  "slots[0].sourceTargetKey": "ANNA#1/Ability[0]",
                },
              },
            },
            draftOverrides: {},
            draftOperations: [],
            loading: false,
            saving: false,
          } as never
        }
        onSelectEntry={vi.fn()}
        onUpdateValue={vi.fn()}
        onSave={vi.fn()}
        onReload={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Basic").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Anna").length).toBeGreaterThan(0);
    expect(screen.queryByText("Abilities / 00 Ability 1")).toBeNull();
    expect(screen.queryByText(/current character export/i)).toBeNull();
  });
});
