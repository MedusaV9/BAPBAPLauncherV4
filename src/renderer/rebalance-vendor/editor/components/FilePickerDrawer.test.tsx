// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { FilePickerDrawer } from "./FilePickerDrawer";

afterEach(() => cleanup());

interface SampleItem {
  id: string;
  label: string;
  group?: string;
  subtitle?: string;
}

const SAMPLE_ITEMS: SampleItem[] = [
  { id: "weapons.dat", label: "weapons.dat", group: "Combat", subtitle: "Damage tables" },
  { id: "ai.dat", label: "ai.dat", group: "AI", subtitle: "Behaviour" },
  { id: "items.dat", label: "items.dat", group: "Items", subtitle: "Inventory" },
];

describe("FilePickerDrawer", () => {
  it("returns null (no portal content) when open=false", () => {
    const { container } = render(
      <FilePickerDrawer
        open={false}
        items={SAMPLE_ITEMS}
        onSelectItem={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("file-picker-drawer")).toBeNull();
    expect(screen.queryByTestId("file-picker-drawer-backdrop")).toBeNull();
  });

  it("renders the portal with role=dialog when open=true", () => {
    render(
      <FilePickerDrawer
        open
        items={SAMPLE_ITEMS}
        onSelectItem={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const drawer = screen.getByTestId("file-picker-drawer");
    expect(drawer).toBeTruthy();
    expect(drawer.getAttribute("role")).toBe("dialog");
    expect(drawer.getAttribute("aria-label")).toBe("Choose a file");
    // Header title
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Choose a file");
    // Search input is present and labelled
    const search = screen.getByTestId("file-picker-search");
    expect(search.getAttribute("aria-label")).toBe("Search files");
    expect(search.getAttribute("placeholder")).toBe("Search files");
    // List + sample rows
    expect(screen.getByTestId("file-picker-list")).toBeTruthy();
    expect(screen.getByTestId("file-picker-row-weapons.dat")).toBeTruthy();
    expect(screen.getByTestId("file-picker-row-ai.dat")).toBeTruthy();
    expect(screen.getByTestId("file-picker-row-items.dat")).toBeTruthy();
  });

  it("filters items by label substring (case-insensitive)", () => {
    render(
      <FilePickerDrawer
        open
        items={SAMPLE_ITEMS}
        onSelectItem={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const search = screen.getByTestId("file-picker-search") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "WEAP" } });
    expect(screen.getByTestId("file-picker-row-weapons.dat")).toBeTruthy();
    expect(screen.queryByTestId("file-picker-row-ai.dat")).toBeNull();
    expect(screen.queryByTestId("file-picker-row-items.dat")).toBeNull();

    fireEvent.change(search, { target: { value: "" } });
    expect(screen.getByTestId("file-picker-row-ai.dat")).toBeTruthy();
    expect(screen.getByTestId("file-picker-row-items.dat")).toBeTruthy();
  });

  it("renders group chips and clicking one calls onSelectGroup", () => {
    const onSelectGroup = vi.fn();
    render(
      <FilePickerDrawer
        open
        items={SAMPLE_ITEMS}
        groupOptions={["Combat", "AI", "Items"]}
        activeGroup={null}
        onSelectGroup={onSelectGroup}
        onSelectItem={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const allChip = screen.getByTestId("file-picker-group-all");
    expect(allChip).toBeTruthy();
    expect(allChip.getAttribute("aria-pressed")).toBe("true");

    const combatChip = screen.getByTestId("file-picker-group-Combat");
    expect(combatChip).toBeTruthy();
    expect(combatChip.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("file-picker-group-AI")).toBeTruthy();
    expect(screen.getByTestId("file-picker-group-Items")).toBeTruthy();

    fireEvent.click(combatChip);
    expect(onSelectGroup).toHaveBeenCalledTimes(1);
    expect(onSelectGroup).toHaveBeenCalledWith("Combat");

    fireEvent.click(allChip);
    expect(onSelectGroup).toHaveBeenCalledWith(null);
  });

  it("reflects activeGroup with aria-pressed on the matching chip", () => {
    render(
      <FilePickerDrawer
        open
        items={SAMPLE_ITEMS}
        groupOptions={["Combat", "AI"]}
        activeGroup="AI"
        onSelectGroup={vi.fn()}
        onSelectItem={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId("file-picker-group-all").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("file-picker-group-AI").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("file-picker-group-Combat").getAttribute("aria-pressed")).toBe("false");
  });

  it("pins the active item at the top of the list", () => {
    render(
      <FilePickerDrawer
        open
        items={SAMPLE_ITEMS}
        activeId="ai.dat"
        onSelectItem={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const list = screen.getByTestId("file-picker-list");
    const rows = Array.from(
      list.querySelectorAll('[data-testid^="file-picker-row-"]'),
    );
    expect(rows.length).toBeGreaterThan(0);
    const firstRow = rows[0];
    expect(firstRow.getAttribute("data-testid")).toBe("file-picker-row-ai.dat");
    expect(firstRow.getAttribute("aria-current")).toBe("true");
    // The active item should not be duplicated in the body of the list.
    const aiRows = rows.filter(
      (r) => r.getAttribute("data-testid") === "file-picker-row-ai.dat",
    );
    expect(aiRows.length).toBe(1);
  });

  it("calls onSelectItem(id) AND onClose when a row is clicked", () => {
    const onSelectItem = vi.fn();
    const onClose = vi.fn();
    render(
      <FilePickerDrawer
        open
        items={SAMPLE_ITEMS}
        onSelectItem={onSelectItem}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId("file-picker-row-weapons.dat"));
    expect(onSelectItem).toHaveBeenCalledTimes(1);
    expect(onSelectItem).toHaveBeenCalledWith("weapons.dat");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <FilePickerDrawer
        open
        items={SAMPLE_ITEMS}
        onSelectItem={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <FilePickerDrawer
        open
        items={SAMPLE_ITEMS}
        onSelectItem={vi.fn()}
        onClose={onClose}
      />,
    );
    const backdrop = screen.getByTestId("file-picker-drawer-backdrop");
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when the drawer body is clicked (event does not bubble to backdrop)", () => {
    const onClose = vi.fn();
    render(
      <FilePickerDrawer
        open
        items={SAMPLE_ITEMS}
        onSelectItem={vi.fn()}
        onClose={onClose}
      />,
    );
    const drawer = screen.getByTestId("file-picker-drawer");
    fireEvent.click(drawer);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders the close button with the correct aria-label and triggers onClose", () => {
    const onClose = vi.fn();
    render(
      <FilePickerDrawer
        open
        items={SAMPLE_ITEMS}
        onSelectItem={vi.fn()}
        onClose={onClose}
      />,
    );
    const closeBtn = screen.getByTestId("file-picker-close");
    expect(closeBtn.getAttribute("aria-label")).toBe("Close");
    expect(closeBtn.textContent).toBe("Close");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
