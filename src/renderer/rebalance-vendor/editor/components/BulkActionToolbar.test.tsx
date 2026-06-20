// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { BulkActionToolbar } from "./BulkActionToolbar";

afterEach(() => cleanup());

describe("BulkActionToolbar", () => {
  it("renders null when count < 2", () => {
    const { container } = render(
      <BulkActionToolbar
        count={1}
        onResetSelected={vi.fn()}
        onCopyValues={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("renders toolbar with role=toolbar and the count visible when count >= 2", () => {
    render(
      <BulkActionToolbar
        count={3}
        onResetSelected={vi.fn()}
        onCopyValues={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const toolbar = screen.getByRole("toolbar");
    expect(toolbar).toBeTruthy();
    expect(toolbar.getAttribute("data-testid")).toBe("rebalance-bulk-action-toolbar");
    expect(toolbar.textContent).toContain("3");
    expect(toolbar.textContent).toContain("fields selected");
  });

  it("fires onResetSelected when bulk-reset-selected is clicked", () => {
    const onResetSelected = vi.fn();
    render(
      <BulkActionToolbar
        count={2}
        onResetSelected={onResetSelected}
        onCopyValues={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("bulk-reset-selected"));
    expect(onResetSelected).toHaveBeenCalledTimes(1);
  });

  it("fires onCopyValues when bulk-copy-values is clicked", () => {
    const onCopyValues = vi.fn();
    render(
      <BulkActionToolbar
        count={2}
        onResetSelected={vi.fn()}
        onCopyValues={onCopyValues}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("bulk-copy-values"));
    expect(onCopyValues).toHaveBeenCalledTimes(1);
  });

  it("fires onCancel when bulk-cancel is clicked", () => {
    const onCancel = vi.fn();
    render(
      <BulkActionToolbar
        count={2}
        onResetSelected={vi.fn()}
        onCopyValues={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByTestId("bulk-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("fires onCancel when Escape is pressed", () => {
    const onCancel = vi.fn();
    render(
      <BulkActionToolbar
        count={2}
        onResetSelected={vi.fn()}
        onCopyValues={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders the optional bulk-apply-preset button only when onApplyPreset is provided", () => {
    const onApplyPreset = vi.fn();
    const { rerender } = render(
      <BulkActionToolbar
        count={2}
        onResetSelected={vi.fn()}
        onCopyValues={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("bulk-apply-preset")).toBeNull();

    rerender(
      <BulkActionToolbar
        count={2}
        onResetSelected={vi.fn()}
        onCopyValues={vi.fn()}
        onApplyPreset={onApplyPreset}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("bulk-apply-preset"));
    expect(onApplyPreset).toHaveBeenCalledTimes(1);
  });
});
