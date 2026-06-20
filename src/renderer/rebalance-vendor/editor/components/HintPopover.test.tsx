// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { HintPopover } from "./HintPopover";

afterEach(() => cleanup());

describe("HintPopover", () => {
  it("renders null when the hint id is unknown", () => {
    const { container } = render(<HintPopover hintId="not-real" />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("hint-trigger-not-real")).toBeNull();
  });

  it("renders a `?` trigger button for a known hint id", () => {
    render(<HintPopover hintId="quick-edit-damage" />);
    const trigger = screen.getByTestId("hint-trigger-quick-edit-damage");
    expect(trigger).toBeTruthy();
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.textContent).toBe("?");
  });

  it("opens a dialog popover when the trigger is clicked", () => {
    render(<HintPopover hintId="quick-edit-damage" />);
    const trigger = screen.getByTestId("hint-trigger-quick-edit-damage");
    fireEvent.click(trigger);

    const popover = screen.getByTestId("hint-popover-quick-edit-damage");
    expect(popover).toBeTruthy();
    expect(popover.getAttribute("role")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("renders the title from hints.json (case-sensitive)", () => {
    render(<HintPopover hintId="quick-edit-damage" />);
    fireEvent.click(screen.getByTestId("hint-trigger-quick-edit-damage"));
    const popover = screen.getByTestId("hint-popover-quick-edit-damage");
    // Real string from hints.json
    expect(popover.textContent).toContain("Damage tuning");
  });

  it("renders the example block from hints.json under hint-example-{id}", () => {
    render(<HintPopover hintId="quick-edit-damage" />);
    fireEvent.click(screen.getByTestId("hint-trigger-quick-edit-damage"));
    const example = screen.getByTestId("hint-example-quick-edit-damage");
    expect(example).toBeTruthy();
    // Real string from hints.json
    expect(example.textContent).toBe(
      "Try 110 for moderate combat, 220 for heavy hitters.",
    );
  });

  it("closes the popover when Escape is pressed", () => {
    render(<HintPopover hintId="quick-edit-damage" />);
    const trigger = screen.getByTestId("hint-trigger-quick-edit-damage");
    fireEvent.click(trigger);
    expect(screen.getByTestId("hint-popover-quick-edit-damage")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByTestId("hint-popover-quick-edit-damage")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("uses a default aria-label that includes the hint title", () => {
    render(<HintPopover hintId="quick-edit-damage" />);
    const trigger = screen.getByTestId("hint-trigger-quick-edit-damage");
    expect(trigger.getAttribute("aria-label")).toBe(
      "Show hint about Damage tuning",
    );
  });
});
