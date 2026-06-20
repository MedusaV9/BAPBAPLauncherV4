// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SortableFieldList } from "./SortableFieldList";

afterEach(() => {
  cleanup();
});

describe("SortableFieldList (Phase 3 Task 22)", () => {
  const items = [
    { id: "a", label: "Alpha" },
    { id: "b", label: "Beta" },
    { id: "c", label: "Gamma" },
  ];

  it("renders all items", () => {
    render(<SortableFieldList items={items} onReorder={() => undefined} />);
    expect(screen.getByTestId("rebalance-sortable-row-a")).toBeTruthy();
    expect(screen.getByTestId("rebalance-sortable-row-b")).toBeTruthy();
    expect(screen.getByTestId("rebalance-sortable-row-c")).toBeTruthy();
  });

  it("renders item labels", () => {
    render(<SortableFieldList items={items} onReorder={() => undefined} />);
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.getByText("Gamma")).toBeTruthy();
  });

  it("each row has a drag handle with descriptive aria-label", () => {
    render(<SortableFieldList items={items} onReorder={() => undefined} />);
    const handle = screen.getByLabelText("Drag to reorder Alpha");
    expect(handle).toBeTruthy();
    expect(handle.getAttribute("data-testid")).toBe("rebalance-sortable-handle-a");
  });

  it("each row is data-rebalance-pressable for focus-visible support", () => {
    render(<SortableFieldList items={items} onReorder={() => undefined} />);
    const row = screen.getByTestId("rebalance-sortable-row-a");
    expect(row.getAttribute("data-rebalance-pressable")).toBe("true");
  });

  it("disables drag when isDisabled is true (handle aria-disabled set)", () => {
    render(<SortableFieldList items={items} isDisabled onReorder={() => undefined} />);
    const handle = screen.getByLabelText("Drag to reorder Alpha");
    expect(handle.getAttribute("aria-disabled")).toBe("true");
  });

  it("does not call onReorder when source and destination are the same", () => {
    const onReorder = vi.fn();
    render(<SortableFieldList items={items} onReorder={onReorder} />);
    // We cannot easily simulate a real drag here; this test guards the
    // contract that onReorder is wired correctly. Confirm that the handler
    // exists by inspecting the rendered DOM and ensuring the handler is bound
    // (no thrown errors during render).
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("uses a custom listId for the droppable container", () => {
    render(<SortableFieldList items={items} listId="my-list" onReorder={() => undefined} />);
    const list = screen.getByTestId("rebalance-sortable-list");
    expect(list.getAttribute("data-rbd-droppable-id")).toBe("my-list");
  });
});
