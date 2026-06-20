// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuickEditControl } from "./common";
import type { QuickEditEntry } from "./types";

vi.mock("./bundledFallbacks", () => ({
  resolveBundledInlineIconRun: () => null,
}));

describe("QuickEditControl component", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders boolean quick edits with a visible switch control and state copy", () => {
    const { container } = render(
      <QuickEditControl
        item={
          {
            setting: "One Instance",
            category: "General",
            path: "configuration.oneInstance",
            editable: true,
            valueType: "boolean",
            value: true,
            defaultValue: false,
            whatItDoes: "Controls whether only one copy can exist.",
          } satisfies QuickEditEntry
        }
        value={true}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    const toggle = container.querySelector(".v2-switch");
    expect(toggle).toBeTruthy();
    expect(toggle?.getAttribute("role")).toBe("switch");
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
    expect((toggle?.getAttribute("class") ?? "")).toContain("v2-switch--selected");
    expect(screen.getAllByText("On").length).toBeGreaterThan(0);
  });

  it("renders text quick edits with the hardened embedded input class", () => {
    const { container } = render(
      <QuickEditControl
        item={
          {
            setting: "Stat Type",
            category: "General",
            path: "configuration.stats[0].type",
            editable: true,
            valueType: "string",
            value: "AtkSpeed",
            defaultValue: "Damage",
            whatItDoes: "Changes which stat this entry modifies.",
          } satisfies QuickEditEntry
        }
        value={"AtkSpeed"}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    const input = screen.getByDisplayValue("AtkSpeed");
    expect((input.getAttribute("class") ?? "")).toContain("v2-input-element");
    expect(container.querySelector(".task-quick-control-field")).toBeTruthy();
  });

  it("shows exact current and standard values in the inspector meta", () => {
    render(
      <QuickEditControl
        item={
          {
            setting: "Short Description Label",
            category: "Presentation",
            path: "configuration.ShortDescriptionLabel",
            editable: true,
            valueType: "string",
            value: "<color=grey>Fallback text shown when no translation key resolves.</color>",
            defaultValue: "<color=grey>Fallback text shown when no translation key resolves.</color>",
            whatItDoes: "Controls the in-game fallback text.",
          } satisfies QuickEditEntry
        }
        value={"<color=grey>Fallback text shown when no translation key resolves.</color>"}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    expect(screen.getAllByText("<color=grey>Fallback text shown when no translation key resolves.</color>").length).toBe(3);
  });

  it("renders select quick edits with the hardened embedded select class", () => {
    render(
      <QuickEditControl
        item={
          {
            setting: "Compatibility",
            category: "General",
            path: "slots[0].compatibility",
            editable: true,
            valueType: "string",
            value: "current",
            verifiedChoices: [
              { label: "Current", value: "current" },
              { label: "Any", value: "any" },
            ],
            whatItDoes: "Restricts compatible sources.",
          } satisfies QuickEditEntry
        }
        value={"current"}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    const select = screen.getByDisplayValue("Current");
    expect((select.getAttribute("class") ?? "")).toContain("v2-select-input");
  });

  it("opens a searchable SO effect picker backed by external effect options", () => {
    const onChange = vi.fn();
    render(
      <QuickEditControl
        item={
          {
            setting: "Burn effect",
            category: "Advanced",
            path: "configuration.statusEffects.statusEffect",
            editable: true,
            valueType: "string",
            value: "PassiveSO:P_Firewave_Burn",
            defaultValue: "PassiveSO:P_Firewave_Burn",
            referenceChoice: {
              path: "configuration.statusEffects.statusEffect",
              label: "Burn effect",
              referenceType: "PassiveSO",
              currentReference: "PassiveSO:P_Firewave_Burn",
              availableReferences: ["PassiveSO:P_Firewave_Burn", "PassiveSO:P_Fireball"],
            },
          } satisfies QuickEditEntry
        }
        value={"PassiveSO:P_Firewave_Burn"}
        effectReferenceOptions={[
          {
            value: "PassiveSO:P_Berserk",
            label: "Berserk",
            kind: "PassiveSO",
            source: "Passive templates",
            description: "Known indexed passive.",
          },
        ]}
        onChange={onChange}
        onReset={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add effect" }));
    expect(screen.getByRole("dialog", { name: "Choose SO effect" })).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Search by name, id, source, or type..."), { target: { value: "berserk" } });
    const choice = within(screen.getByRole("listbox", { name: "Known SO effects" })).getByText("Berserk").closest("button");
    expect(choice).toBeTruthy();
    fireEvent.click(choice as HTMLButtonElement);

    expect(onChange).toHaveBeenCalledWith("PassiveSO:P_Berserk");
  });
});
