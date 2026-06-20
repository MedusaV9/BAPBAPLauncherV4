// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ProvenanceTooltip, formatRelativeTime } from "./ProvenanceTooltip";

afterEach(() => cleanup());

describe("ProvenanceTooltip", () => {
  it("always renders the wrapped children inside the wrapper", () => {
    render(
      <ProvenanceTooltip standardValue={100}>
        <span>HP value</span>
      </ProvenanceTooltip>,
    );
    const wrapper = screen.getByTestId("rebalance-provenance-wrapper");
    expect(wrapper).toBeTruthy();
    expect(wrapper.textContent).toContain("HP value");
    // Tooltip is hidden until hover/focus
    expect(screen.queryByTestId("rebalance-provenance-tooltip")).toBeNull();
  });

  it("shows the tooltip on mouse enter and hides on mouse leave", () => {
    render(
      <ProvenanceTooltip standardValue={100}>
        <span>HP value</span>
      </ProvenanceTooltip>,
    );
    const wrapper = screen.getByTestId("rebalance-provenance-wrapper");

    fireEvent.mouseEnter(wrapper);
    const tooltip = screen.getByTestId("rebalance-provenance-tooltip");
    expect(tooltip).toBeTruthy();
    expect(tooltip.getAttribute("role")).toBe("tooltip");

    fireEvent.mouseLeave(wrapper);
    expect(screen.queryByTestId("rebalance-provenance-tooltip")).toBeNull();
  });

  it("shows the tooltip on focus and hides on blur", () => {
    render(
      <ProvenanceTooltip provenance="quick">
        <span>field</span>
      </ProvenanceTooltip>,
    );
    const wrapper = screen.getByTestId("rebalance-provenance-wrapper");
    fireEvent.focus(wrapper);
    expect(screen.getByTestId("rebalance-provenance-tooltip")).toBeTruthy();
    fireEvent.blur(wrapper);
    expect(screen.queryByTestId("rebalance-provenance-tooltip")).toBeNull();
  });

  it("renders all four rows when every provenance prop is supplied", () => {
    const lastChangedAt = new Date(Date.now() - 5_000).toISOString();
    render(
      <ProvenanceTooltip
        standardValue={100}
        defaultValue={120}
        lastChangedAt={lastChangedAt}
        lastChangedBy="alice"
        provenance="advanced"
      >
        <span>field</span>
      </ProvenanceTooltip>,
    );
    fireEvent.mouseEnter(screen.getByTestId("rebalance-provenance-wrapper"));

    expect(screen.getByTestId("rebalance-provenance-row-standard")).toBeTruthy();
    expect(screen.getByTestId("rebalance-provenance-row-default")).toBeTruthy();
    expect(
      screen.getByTestId("rebalance-provenance-row-last-changed"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("rebalance-provenance-row-provenance"),
    ).toBeTruthy();

    expect(
      screen.getByTestId("rebalance-provenance-row-standard").textContent,
    ).toContain("100");
    expect(
      screen.getByTestId("rebalance-provenance-row-default").textContent,
    ).toContain("120");
    expect(
      screen.getByTestId("rebalance-provenance-row-last-changed").textContent,
    ).toContain("alice");
    expect(
      screen.getByTestId("rebalance-provenance-row-provenance").textContent,
    ).toContain("Advanced");
  });

  it("does not render the tooltip when there is nothing to show", () => {
    render(
      <ProvenanceTooltip>
        <span>bare</span>
      </ProvenanceTooltip>,
    );
    fireEvent.mouseEnter(screen.getByTestId("rebalance-provenance-wrapper"));
    expect(screen.queryByTestId("rebalance-provenance-tooltip")).toBeNull();
  });
});

describe("formatRelativeTime", () => {
  it("returns 'just now' for very recent timestamps", () => {
    const now = new Date(Date.now() - 1_000).toISOString();
    expect(formatRelativeTime(now)).toBe("just now");
  });

  it("returns 'just now' for future timestamps", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(formatRelativeTime(future)).toBe("just now");
  });

  it("returns 'X min ago' for timestamps minutes ago", () => {
    const past = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(past)).toBe("5 min ago");
  });

  it("returns 'Xh ago' for timestamps hours ago", () => {
    const past = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(past)).toBe("3h ago");
  });

  it("returns 'Xd ago' for timestamps days ago", () => {
    const past = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(past)).toBe("2d ago");
  });

  it("returns an empty string for unparseable input", () => {
    expect(formatRelativeTime("not-an-iso")).toBe("");
  });
});
