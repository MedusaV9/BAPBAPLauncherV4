// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomBuilderPage } from "./CustomBuilderPage";

vi.mock("./motion", () => ({
  usePageEntranceMotion: () => React.createRef<HTMLDivElement>(),
  useTabTransition: () => ({ ref: React.createRef<HTMLElement>() }),
}));

vi.mock("./ui", () => ({
  Button: ({
    children,
    onPress,
    startContent: _startContent,
    isDisabled,
    ...props
  }: React.PropsWithChildren<{
    onPress?: () => void;
    startContent?: React.ReactNode;
    isDisabled?: boolean;
  }> & Record<string, unknown>) => (
    <button type="button" onClick={onPress} disabled={isDisabled} {...props}>
      {children}
    </button>
  ),
  Card: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  CardBody: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  Input: ({
    value,
    onValueChange,
    ...props
  }: { value?: string; onValueChange?: (value: string) => void } & Record<string, unknown>) => (
    <input value={value} onChange={(event) => onValueChange?.(event.target.value)} {...props} />
  ),
  Select: ({
    options,
    value,
    onValueChange,
    ...props
  }: {
    options?: Array<{ label: string; value: string }>;
    value?: string;
    onValueChange?: (value: string) => void;
  } & Record<string, unknown>) => (
    <select value={value} onChange={(event) => onValueChange?.(event.target.value)} {...props}>
      {(options ?? []).map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  Switch: ({
    isSelected,
    onValueChange,
    ...props
  }: { isSelected?: boolean; onValueChange?: (value: boolean) => void } & Record<string, unknown>) => (
    <input
      checked={Boolean(isSelected)}
      onChange={(event) => onValueChange?.(event.target.checked)}
      type="checkbox"
      {...props}
    />
  ),
  Textarea: ({
    value,
    onValueChange,
    minRows: _minRows,
    ...props
  }: { value?: string; onValueChange?: (value: string) => void; minRows?: number } & Record<string, unknown>) => (
    <textarea value={value} onChange={(event) => onValueChange?.(event.target.value)} {...props} />
  ),
}));

vi.mock("./common", () => ({
  CardPreviewPanel: ({ preview }: { preview?: { shortDescription?: string } }) => (
    <div data-testid="card-preview-panel">{preview?.shortDescription ?? "Preview card"}</div>
  ),
  IconPreview: () => <div>Icon</div>,
  MissingIconBadge: () => <div>Missing icon</div>,
  SectionCard: ({ title, subtitle, children }: React.PropsWithChildren<{ title: string; subtitle?: string }>) => (
    <section>
      <h3>{title}</h3>
      {subtitle ? <p>{subtitle}</p> : null}
      {children}
    </section>
  ),
  resolveFriendlyName: (...values: Array<string | undefined>) => values.find(Boolean) ?? "",
}));

describe("CustomBuilderPage component", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps the selected draft visible, offers creating a fresh draft, and hides save until the draft loads", () => {
    const onCreateDraft = vi.fn();
    const onOpenFile = vi.fn();
    render(
      <CustomBuilderPage
        entries={[]}
        search=""
        onSearchChange={vi.fn()}
        selectedEntry={
          {
            id: "custom-firewave",
            title: "Starter Firewave",
            subtitle: "custom draft",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Custom/Augments/00_Example_Firewave.json",
            relativePath: "Custom/Augments/00_Example_Firewave.json",
            targetType: "CustomPassive",
          } as never
        }
        selectedState={{ loading: false } as never}
        libraryMetadata={null}
        mode="studio"
        onSelectEntry={vi.fn()}
        onToggleEnabled={vi.fn()}
        onChangeString={vi.fn()}
        onChangeNumber={vi.fn()}
        onChangeBoolean={vi.fn()}
        onSave={vi.fn()}
        onCreateDraft={onCreateDraft}
        onOpenFile={onOpenFile}
      />
    );

    expect(screen.getAllByText("Starter Firewave").length).toBeGreaterThan(0);
    expect(screen.getByText("Open or create one starter draft")).toBeTruthy();
    screen.getByRole("button", { name: "Open selected draft" }).click();
    expect(onOpenFile).toHaveBeenCalledTimes(1);
    screen.getByRole("button", { name: "Create starter draft" }).click();
    expect(onCreateDraft).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Save augment" })).toBeNull();
  });

  it("offers a create starter draft action when no custom draft is loaded yet", () => {
    const onCreateDraft = vi.fn();

    render(
      <CustomBuilderPage
        entries={[]}
        search=""
        onSearchChange={vi.fn()}
        selectedEntry={null}
        selectedState={{ loading: false } as never}
        libraryMetadata={null}
        mode="studio"
        onSelectEntry={vi.fn()}
        onToggleEnabled={vi.fn()}
        onChangeString={vi.fn()}
        onChangeNumber={vi.fn()}
        onChangeBoolean={vi.fn()}
        onSave={vi.fn()}
        onCreateDraft={onCreateDraft}
        onOpenFile={vi.fn()}
      />
    );

    const button = screen.getByRole("button", { name: "Create starter draft" });
    button.click();

    expect(onCreateDraft).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Choose one starter draft")).toBeNull();
    expect(screen.getByText("No starter draft is ready in this instance yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create bundled starter draft" })).toBeNull();
    expect(screen.getByText("Balanced Firewave")).toBeTruthy();
  });

  it("falls back to readable draft labels when metadata is thin", () => {
    render(
      <CustomBuilderPage
        entries={[
          {
            id: "custom-firewave",
            title: "Custom/Augments/00_Example_Firewave.json",
            subtitle: "",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Custom/Augments/00_Example_Firewave.json",
            relativePath: "Custom/Augments/00_Example_Firewave.json",
            targetType: "CustomPassive",
          } as never,
        ]}
        search=""
        onSearchChange={vi.fn()}
        selectedEntry={{
          id: "custom-firewave",
          title: "Custom/Augments/00_Example_Firewave.json",
          subtitle: "",
          absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Custom/Augments/00_Example_Firewave.json",
          relativePath: "Custom/Augments/00_Example_Firewave.json",
          targetType: "CustomPassive",
        } as never}
        selectedState={{ loading: false } as never}
        libraryMetadata={null}
        mode="studio"
        onSelectEntry={vi.fn()}
        onToggleEnabled={vi.fn()}
        onChangeString={vi.fn()}
        onChangeNumber={vi.fn()}
        onChangeBoolean={vi.fn()}
        onSave={vi.fn()}
        onCreateDraft={vi.fn()}
        onOpenFile={vi.fn()}
      />
    );

    expect(screen.getAllByText(/00[_ ]Example[_ ]Firewave/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/custom\s*passive draft/i).length).toBeGreaterThan(0);
  });

  it("builds real passive block fields from editableValueKeys and hides incompatible manager-only blocks", () => {
    const { container } = render(
      <CustomBuilderPage
        entries={[
          {
            id: "custom-status-test",
            title: "Status Test",
            subtitle: "custom draft",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Custom/Augments/01_Status_Test.json",
            relativePath: "Custom/Augments/01_Status_Test.json",
            targetType: "CustomPassive",
          } as never,
        ]}
        search=""
        onSearchChange={vi.fn()}
        selectedEntry={{
          id: "custom-status-test",
          title: "Status Test",
          subtitle: "custom draft",
          absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Custom/Augments/01_Status_Test.json",
          relativePath: "Custom/Augments/01_Status_Test.json",
          targetType: "CustomPassive",
        } as never}
        selectedState={{
          loading: false,
          customDraft: {
            displayName: "Status Test",
            templatePassiveKey: "P_Firewave#158",
            icon: { sourcePassiveKey: "P_Firewave#158" },
            blocks: [
              {
                blockId: "effect.status-burn",
                values: { duration: 3, multiplier: 1.25 },
              },
              {
                blockId: "effect.linked-passive",
                values: { reference: "PassiveSO:P_Firewave_Burn" },
              },
            ],
          },
        } as never}
        libraryMetadata={{
          workspaceRoot: "C:/Profiles/Standard",
          libraryRoot: "C:/Profiles/Standard/UserData/BalanceMod/Library",
          blocks: [
            {
              blockId: "effect.status-burn",
              label: "Burn",
              supportedTargetTypes: ["Passive"],
              editableValueKeys: ["duration", "multiplier"],
            },
            {
              blockId: "effect.linked-passive",
              label: "Linked Passive",
              supportedTargetTypes: ["Passive"],
              editableValueKeys: ["reference"],
            },
            {
              blockId: "effect.pool-entry",
              label: "Pool Entry",
              supportedTargetTypes: ["Manager"],
              editableValueKeys: ["entryId"],
            },
          ],
          icons: [],
          effects: [],
          templates: [],
          allOptions: [],
          sharedCollections: [],
          warnings: [],
        }}
        mode="studio"
        onSelectEntry={vi.fn()}
        onToggleEnabled={vi.fn()}
        onChangeString={vi.fn()}
        onChangeNumber={vi.fn()}
        onChangeBoolean={vi.fn()}
        onSave={vi.fn()}
        onCreateDraft={vi.fn()}
        onOpenFile={vi.fn()}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Add blocks/i })[0] as HTMLElement);
    expect(container.querySelector('input[label="Duration"]')).toBeTruthy();
    expect(container.querySelector('input[label="Multiplier"]')).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /Second block/i })[0] as HTMLElement);
    expect(container.querySelector('input[label="Linked passive reference"]')).toBeTruthy();
    expect(screen.queryByText("Pool Entry")).toBeNull();
  });

  it("keeps the bundled Poison Wave starter draft on the current status-block contract", () => {
    const starterDraftPathCandidates = [
      resolve(process.cwd(), "src/main/rebalance-vendor/default-workspace-overrides/Custom/Augments/01_Starter_PoisonWave.json"),
      resolve(process.cwd(), "src/main/rebalance-vendor/default-workspace/Custom/Augments/01_Starter_PoisonWave.json"),
      resolve(process.cwd(), "apps/bapbap-launcher/src/main/rebalance-vendor/default-workspace-overrides/Custom/Augments/01_Starter_PoisonWave.json"),
      resolve(process.cwd(), "apps/bapbap-launcher/src/main/rebalance-vendor/default-workspace/Custom/Augments/01_Starter_PoisonWave.json"),
    ];
    const starterDraftPath = starterDraftPathCandidates.find((candidate) => existsSync(candidate));
    if (!starterDraftPath) {
      throw new Error("Could not locate the bundled Poison Wave starter draft fixture.");
    }

    const starterDraft = JSON.parse(
      readFileSync(
        starterDraftPath,
        "utf8",
      ),
    );

    render(
      <CustomBuilderPage
        entries={[
          {
            id: "starter-poison-wave",
            title: "Poison Wave",
            subtitle: "custom draft",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Custom/Augments/01_Starter_PoisonWave.json",
            relativePath: "Custom/Augments/01_Starter_PoisonWave.json",
            targetType: "CustomPassive",
          } as never,
        ]}
        search=""
        onSearchChange={vi.fn()}
        selectedEntry={{
          id: "starter-poison-wave",
          title: "Poison Wave",
          subtitle: "custom draft",
          absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Custom/Augments/01_Starter_PoisonWave.json",
          relativePath: "Custom/Augments/01_Starter_PoisonWave.json",
          targetType: "CustomPassive",
        } as never}
        selectedState={{
          loading: false,
          customDraft: starterDraft,
        } as never}
        libraryMetadata={{
          workspaceRoot: "C:/Profiles/Standard",
          libraryRoot: "C:/Profiles/Standard/UserData/BalanceMod/Library",
          blocks: [
            {
              blockId: "basic.damage",
              label: "Damage",
              supportedTargetTypes: ["Passive"],
              editableValueKeys: ["value"],
            },
            {
              blockId: "effect.status-poison",
              label: "Poison",
              supportedTargetTypes: ["Passive"],
              editableValueKeys: ["duration", "multiplier"],
            },
            {
              blockId: "presentation.description",
              label: "Description",
              supportedTargetTypes: ["Passive"],
              editableValueKeys: ["text"],
            },
          ],
          icons: [],
          effects: [],
          templates: [],
          allOptions: [],
          sharedCollections: [],
          warnings: [],
        }}
        mode="studio"
        onSelectEntry={vi.fn()}
        onToggleEnabled={vi.fn()}
        onChangeString={vi.fn()}
        onChangeNumber={vi.fn()}
        onChangeBoolean={vi.fn()}
        onSave={vi.fn()}
        onCreateDraft={vi.fn()}
        onOpenFile={vi.fn()}
      />
    );

    expect(screen.getAllByTestId("card-preview-panel")[0]?.textContent).toContain("220 damage, 2.5s poison");
  });

  it("shows bundled template entries in the template gallery instead of an empty-state message", () => {
    render(
      <CustomBuilderPage
        entries={[
          {
            id: "custom-firewave",
            title: "Starter Firewave",
            subtitle: "custom draft",
            absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Custom/Augments/00_Example_Firewave.json",
            relativePath: "Custom/Augments/00_Example_Firewave.json",
            targetType: "CustomPassive",
          } as never,
        ]}
        search=""
        onSearchChange={vi.fn()}
        selectedEntry={{
          id: "custom-firewave",
          title: "Starter Firewave",
          subtitle: "custom draft",
          absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Custom/Augments/00_Example_Firewave.json",
          relativePath: "Custom/Augments/00_Example_Firewave.json",
          targetType: "CustomPassive",
        } as never}
        selectedState={{
          loading: false,
          customDraft: {
            displayName: "Starter Firewave",
            templatePassiveKey: "P_Firewave#158",
            icon: { sourcePassiveKey: "P_Firewave#158" },
            blocks: [],
          },
        } as never}
        libraryMetadata={{
          workspaceRoot: "C:/Profiles/Standard",
          libraryRoot: "C:/Profiles/Standard/UserData/BalanceMod/Library",
          blocks: [],
          icons: [
            {
              passiveKey: "P_Firewave#158",
              label: "Firewave",
              previewPath: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
            },
          ],
          effects: [],
          templates: [
            {
              targetType: "Passive",
              targetKey: "P_Firewave#158",
              templatePassiveKey: "P_Firewave#158",
              label: "Firewave",
              description: "Starter passive template",
              previewPath: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
            },
          ],
          allOptions: [],
          sharedCollections: [],
          warnings: [],
        }}
        mode="studio"
        onSelectEntry={vi.fn()}
        onToggleEnabled={vi.fn()}
        onChangeString={vi.fn()}
        onChangeNumber={vi.fn()}
        onChangeBoolean={vi.fn()}
        onSave={vi.fn()}
        onCreateDraft={vi.fn()}
        onOpenFile={vi.fn()}
      />
    );

    screen.getAllByRole("button", { name: "Open template gallery" })[0]?.click();

    expect(screen.getAllByText("Firewave").length).toBeGreaterThan(0);
    expect(screen.queryByText("No bundled passive templates match that search yet.")).toBeNull();
  });
});
