// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { DiffView } from "./DiffView";
import type { DiffHunk } from "../helpers/compute-diff";

afterEach(() => cleanup());

const HUNKS: DiffHunk[] = [
  { path: "hp", operation: "modified", before: 100, after: 150 },
  { path: "name", operation: "added", before: undefined, after: "Boss" },
  { path: "legacy", operation: "removed", before: "old", after: undefined },
  { path: "kept", operation: "unchanged", before: 1, after: 1 },
];

describe("DiffView", () => {
  it("renders all hunks with their operation badges", () => {
    render(<DiffView hunks={HUNKS} />);

    const hp = screen.getByTestId("diff-hunk-hp");
    expect(hp.getAttribute("data-operation")).toBe("modified");
    expect(hp.textContent).toContain("Modified");

    const added = screen.getByTestId("diff-hunk-name");
    expect(added.getAttribute("data-operation")).toBe("added");
    expect(added.textContent).toContain("Added");

    const removed = screen.getByTestId("diff-hunk-legacy");
    expect(removed.getAttribute("data-operation")).toBe("removed");
    expect(removed.textContent).toContain("Removed");

    const unchanged = screen.getByTestId("diff-hunk-kept");
    expect(unchanged.getAttribute("data-operation")).toBe("unchanged");
    expect(unchanged.textContent).toContain("Unchanged");
  });

  it("toggles a hunk's inclusion in onApply when its checkbox is clicked", () => {
    const onApply = vi.fn();
    render(<DiffView hunks={HUNKS} onApply={onApply} />);

    const hpCheckbox = screen.getByTestId("diff-hunk-checkbox-hp") as HTMLInputElement;
    expect(hpCheckbox.checked).toBe(true); // defaultSelected=true → modified is selected

    fireEvent.click(hpCheckbox);
    expect((screen.getByTestId("diff-hunk-checkbox-hp") as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByTestId("diff-apply"));
    const applied = onApply.mock.calls[0][0] as DiffHunk[];
    expect(applied.some((h) => h.path === "hp")).toBe(false);
    expect(applied.some((h) => h.path === "name")).toBe(true);
    expect(applied.some((h) => h.path === "legacy")).toBe(true);
  });

  it("fires onApply with only the currently selected hunks", () => {
    const onApply = vi.fn();
    render(<DiffView hunks={HUNKS} defaultSelected={false} onApply={onApply} />);

    fireEvent.click(screen.getByTestId("diff-hunk-checkbox-hp"));
    fireEvent.click(screen.getByTestId("diff-apply"));

    expect(onApply).toHaveBeenCalledTimes(1);
    const applied = onApply.mock.calls[0][0] as DiffHunk[];
    expect(applied.map((h) => h.path)).toEqual(["hp"]);
  });

  it("switches between side-by-side and inline modes via diff-mode-side / diff-mode-inline", () => {
    render(<DiffView hunks={HUNKS} />);

    expect(screen.getByTestId("diff-mode-side").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("diff-mode-inline").getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByTestId("diff-mode-inline"));
    expect(screen.getByTestId("diff-mode-inline").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("diff-mode-side").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("diff-hunk-inline-hp")).toBeTruthy();

    fireEvent.click(screen.getByTestId("diff-mode-side"));
    expect(screen.getByTestId("diff-mode-side").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("diff-hunk-before-hp")).toBeTruthy();
    expect(screen.getByTestId("diff-hunk-after-hp")).toBeTruthy();
  });

  it("diff-select-all selects every non-unchanged hunk", () => {
    const onApply = vi.fn();
    render(<DiffView hunks={HUNKS} defaultSelected={false} onApply={onApply} />);

    fireEvent.click(screen.getByTestId("diff-select-all"));
    fireEvent.click(screen.getByTestId("diff-apply"));

    const applied = onApply.mock.calls[0][0] as DiffHunk[];
    const paths = applied.map((h) => h.path).sort();
    expect(paths).toEqual(["hp", "legacy", "name"]);
    expect(paths).not.toContain("kept");
  });

  it("diff-select-none clears the selection (apply becomes disabled)", () => {
    render(<DiffView hunks={HUNKS} onApply={vi.fn()} />);
    expect((screen.getByTestId("diff-apply") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId("diff-select-none"));
    expect((screen.getByTestId("diff-apply") as HTMLButtonElement).disabled).toBe(true);

    // All non-unchanged checkboxes should now be unchecked.
    expect((screen.getByTestId("diff-hunk-checkbox-hp") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId("diff-hunk-checkbox-name") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId("diff-hunk-checkbox-legacy") as HTMLInputElement).checked).toBe(false);
  });

  it("renders the diff-empty placeholder when hunks is empty", () => {
    render(<DiffView hunks={[]} />);
    expect(screen.getByTestId("diff-empty")).toBeTruthy();
    expect(screen.queryByTestId("diff-hunk-hp")).toBeNull();
  });
});
