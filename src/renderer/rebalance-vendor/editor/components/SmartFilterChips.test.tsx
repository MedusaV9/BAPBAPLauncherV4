// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { SmartFilterChips } from "./SmartFilterChips";
import type { SmartFilterId } from "../helpers/filter-predicates";
import type { SavedSearch } from "../helpers/saved-searches";

afterEach(() => cleanup());

const SMART_FILTER_IDS: SmartFilterId[] = [
  "modified-only",
  "has-overrides",
  "recently-changed",
  "has-icon",
  "empty-values",
];

describe("SmartFilterChips", () => {
  it("renders all five smart-filter chips", () => {
    render(
      <SmartFilterChips
        activeFilters={new Set<SmartFilterId>()}
        onToggle={vi.fn()}
      />,
    );

    for (const id of SMART_FILTER_IDS) {
      const chip = screen.getByTestId(`smart-filter-${id}`);
      expect(chip).toBeTruthy();
      expect(chip.tagName).toBe("BUTTON");
    }
  });

  it("reflects activeFilters via aria-pressed on each chip", () => {
    const active = new Set<SmartFilterId>(["modified-only", "has-icon"]);
    render(<SmartFilterChips activeFilters={active} onToggle={vi.fn()} />);

    expect(
      screen.getByTestId("smart-filter-modified-only").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByTestId("smart-filter-has-icon").getAttribute("aria-pressed"),
    ).toBe("true");

    expect(
      screen.getByTestId("smart-filter-has-overrides").getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen.getByTestId("smart-filter-recently-changed").getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen.getByTestId("smart-filter-empty-values").getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("calls onToggle with the chip id when a smart-filter is clicked", () => {
    const onToggle = vi.fn();
    render(
      <SmartFilterChips
        activeFilters={new Set<SmartFilterId>()}
        onToggle={onToggle}
      />,
    );

    fireEvent.click(screen.getByTestId("smart-filter-modified-only"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("modified-only");

    fireEvent.click(screen.getByTestId("smart-filter-has-overrides"));
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(onToggle).toHaveBeenLastCalledWith("has-overrides");
  });

  it("renders saved-search chips with `saved-search-{query}` testids", () => {
    const savedSearches: SavedSearch[] = [
      { query: "damage", label: "Damage tweaks", savedAt: new Date().toISOString() },
      { query: "fire", savedAt: new Date().toISOString() },
    ];
    render(
      <SmartFilterChips
        activeFilters={new Set<SmartFilterId>()}
        onToggle={vi.fn()}
        savedSearches={savedSearches}
      />,
    );

    const damageChip = screen.getByTestId("saved-search-damage");
    const fireChip = screen.getByTestId("saved-search-fire");
    expect(damageChip).toBeTruthy();
    expect(fireChip).toBeTruthy();
    // Label takes precedence over the raw query when present
    expect(damageChip.textContent).toContain("Damage tweaks");
    expect(fireChip.textContent).toContain("fire");
  });

  it("calls onApplySavedSearch when the saved-search text is clicked", () => {
    const onApplySavedSearch = vi.fn();
    const savedSearches: SavedSearch[] = [
      { query: "damage", label: "Damage tweaks", savedAt: new Date().toISOString() },
    ];
    render(
      <SmartFilterChips
        activeFilters={new Set<SmartFilterId>()}
        onToggle={vi.fn()}
        savedSearches={savedSearches}
        onApplySavedSearch={onApplySavedSearch}
      />,
    );

    const chip = screen.getByTestId("saved-search-damage");
    // The text button is the first interactive child of the chip
    const applyButton = chip.querySelector("button");
    expect(applyButton).toBeTruthy();
    fireEvent.click(applyButton as HTMLButtonElement);
    expect(onApplySavedSearch).toHaveBeenCalledTimes(1);
    expect(onApplySavedSearch).toHaveBeenCalledWith("damage");
  });

  it("calls onRemoveSavedSearch when the × button is clicked", () => {
    const onRemoveSavedSearch = vi.fn();
    const savedSearches: SavedSearch[] = [
      { query: "damage", label: "Damage tweaks", savedAt: new Date().toISOString() },
    ];
    render(
      <SmartFilterChips
        activeFilters={new Set<SmartFilterId>()}
        onToggle={vi.fn()}
        savedSearches={savedSearches}
        onRemoveSavedSearch={onRemoveSavedSearch}
      />,
    );

    fireEvent.click(screen.getByTestId("saved-search-remove-damage"));
    expect(onRemoveSavedSearch).toHaveBeenCalledTimes(1);
    expect(onRemoveSavedSearch).toHaveBeenCalledWith("damage");
  });

  it("does not render the remove button when onRemoveSavedSearch is not supplied", () => {
    const savedSearches: SavedSearch[] = [
      { query: "fire", savedAt: new Date().toISOString() },
    ];
    render(
      <SmartFilterChips
        activeFilters={new Set<SmartFilterId>()}
        onToggle={vi.fn()}
        savedSearches={savedSearches}
      />,
    );

    expect(screen.getByTestId("saved-search-fire")).toBeTruthy();
    expect(screen.queryByTestId("saved-search-remove-fire")).toBeNull();
  });
});
