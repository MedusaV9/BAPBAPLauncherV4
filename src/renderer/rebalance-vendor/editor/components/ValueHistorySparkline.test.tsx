// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ValueHistorySparkline } from "./ValueHistorySparkline";

afterEach(() => {
  cleanup();
});

describe("ValueHistorySparkline (Phase 3 Task 20)", () => {
  it("renders the empty placeholder when given <2 values", () => {
    render(<ValueHistorySparkline values={[]} />);
    const caption = screen.getByTestId("rebalance-value-history-sparkline-empty-caption");
    expect(caption.textContent ?? "").toMatch(/no history/i);
  });

  it("renders one bar per value when given >=2 values", () => {
    render(<ValueHistorySparkline values={[1, 2, 3, 4, 5]} />);
    expect(screen.getAllByTestId("rebalance-sparkline-bar")).toHaveLength(5);
  });

  it("uses the provided ariaLabel", () => {
    render(<ValueHistorySparkline values={[1, 2, 3]} ariaLabel="HP history" />);
    expect(screen.getByLabelText("HP history")).toBeTruthy();
  });

  it("falls back to a default ariaLabel when none provided", () => {
    render(<ValueHistorySparkline values={[1, 2, 3]} />);
    expect(screen.getByLabelText(/value history/i)).toBeTruthy();
  });

  it("clamps non-finite values without crashing", () => {
    render(<ValueHistorySparkline values={[1, Number.NaN, Number.POSITIVE_INFINITY, 4]} />);
    expect(screen.getAllByTestId("rebalance-sparkline-bar")).toHaveLength(4);
  });

  it("uses the supplied height", () => {
    render(<ValueHistorySparkline values={[1, 2]} height={20} />);
    const svg = screen.getByTestId("rebalance-value-history-sparkline");
    expect(svg.tagName.toLowerCase() === "svg" || svg.querySelector("svg")).toBeTruthy();
  });
});
