// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { HistoryPanel } from "./HistoryPanel";
import type { DiffEngine, HistoryEntry } from "../../data/DiffEngine";

afterEach(() => cleanup());

/**
 * Build a minimal stub satisfying the {@link DiffEngine} interface. Only the
 * methods exercised by HistoryPanel (history, getHistory, undo, redo, jumpTo,
 * clearHistory, onHistoryChange) are wired up — the rest return sensible
 * defaults.
 */
function makeFakeEngine(
  past: HistoryEntry[] = [],
  future: HistoryEntry[] = [],
): DiffEngine {
  const engine: DiffEngine = {
    hasOverride: vi.fn(() => false),
    getOverrideCount: vi.fn(() => 0),
    getAllOverrides: vi.fn(() => ({})),
    set: vi.fn(),
    remove: vi.fn(),
    reset: vi.fn(),
    getWritePayload: vi.fn(() => null),
    onDirtyChange: vi.fn(() => () => undefined),
    history: { past: [...past], future: [...future] },
    getHistory: vi.fn(() => [...past]),
    undo: vi.fn(() => true),
    redo: vi.fn(() => true),
    jumpTo: vi.fn(() => true),
    clearHistory: vi.fn(),
    onHistoryChange: vi.fn(() => () => undefined),
  };
  return engine;
}

function makeEntry(
  id: string,
  fieldPath = "hp",
  docPath = "C:\\game\\file.dat",
  offsetMs = 5_000,
): HistoryEntry {
  return {
    id,
    timestamp: new Date(Date.now() - offsetMs).toISOString(),
    docPath,
    fieldPath,
    before: null,
    after: 100,
    label: `Edit ${fieldPath}`,
    source: "user",
  };
}

describe("HistoryPanel", () => {
  it("renders nothing when open=false", () => {
    const engine = makeFakeEngine([makeEntry("e1")]);
    const { container } = render(
      <HistoryPanel open={false} engine={engine} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByTestId("rebalance-history-panel")).toBeNull();
  });

  it("renders the panel with role=dialog when open=true", () => {
    const engine = makeFakeEngine([makeEntry("e1")]);
    render(<HistoryPanel open engine={engine} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("data-testid")).toBe("rebalance-history-panel");
    expect(dialog.getAttribute("aria-label")).toBe("History panel");
  });

  it("renders past entries from the fake DiffEngine", () => {
    const e1 = makeEntry("entry-1", "hp");
    const e2 = makeEntry("entry-2", "damage");
    const engine = makeFakeEngine([e1, e2]);
    render(<HistoryPanel open engine={engine} onClose={vi.fn()} />);

    expect(engine.getHistory).toHaveBeenCalled();
    expect(screen.getByTestId("history-jump-entry-1")).toBeTruthy();
    expect(screen.getByTestId("history-jump-entry-2")).toBeTruthy();
    expect(screen.getByTestId("history-past-list")).toBeTruthy();
  });

  it("calls engine.undo when history-undo is clicked", () => {
    const engine = makeFakeEngine([makeEntry("e1")]);
    render(<HistoryPanel open engine={engine} onClose={vi.fn()} />);
    const undoBtn = screen.getByTestId("history-undo") as HTMLButtonElement;
    expect(undoBtn.disabled).toBe(false);
    fireEvent.click(undoBtn);
    expect(engine.undo).toHaveBeenCalledTimes(1);
  });

  it("calls engine.clearHistory when history-clear is clicked", () => {
    const engine = makeFakeEngine([makeEntry("e1")]);
    render(<HistoryPanel open engine={engine} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("history-clear"));
    expect(engine.clearHistory).toHaveBeenCalledTimes(1);
  });

  it("calls engine.jumpTo with the entry id when a jump button is clicked", () => {
    const target = makeEntry("jump-target", "damage");
    const other = makeEntry("entry-other", "hp");
    const engine = makeFakeEngine([other, target]);
    render(<HistoryPanel open engine={engine} onClose={vi.fn()} />);

    fireEvent.click(screen.getByTestId("history-jump-jump-target"));
    expect(engine.jumpTo).toHaveBeenCalledTimes(1);
    expect(engine.jumpTo).toHaveBeenCalledWith("jump-target");
  });

  it("disables history-undo and history-clear when there are no entries", () => {
    const engine = makeFakeEngine([], []);
    render(<HistoryPanel open engine={engine} onClose={vi.fn()} />);
    expect((screen.getByTestId("history-undo") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("history-clear") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("history-empty")).toBeTruthy();
  });
});
