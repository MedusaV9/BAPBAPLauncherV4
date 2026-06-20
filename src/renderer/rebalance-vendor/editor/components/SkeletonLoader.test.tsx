// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PageSkeleton, Skeleton } from "./SkeletonLoader";

describe("Skeleton component", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a single skeleton element with correct variant dimensions", () => {
    const { container } = render(<Skeleton variant="card" />);
    const el = container.querySelector("[data-testid='skeleton']") as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.style.width).toBe("100%");
    expect(el.style.height).toBe("120px");
    expect(el.style.borderRadius).toBe("8px");
  });

  it("renders multiple skeleton elements when count > 1", () => {
    render(<Skeleton variant="row" count={4} />);
    const elements = screen.getAllByTestId("skeleton");
    expect(elements).toHaveLength(4);
  });

  it("applies custom width and height", () => {
    const { container } = render(<Skeleton variant="text" width="200px" height="20px" />);
    const el = container.querySelector("[data-testid='skeleton']") as HTMLElement;
    expect(el.style.width).toBe("200px");
    expect(el.style.height).toBe("20px");
  });

  it("applies shimmer animation by default", () => {
    const { container } = render(<Skeleton variant="text" />);
    const el = container.querySelector("[data-testid='skeleton']") as HTMLElement;
    expect(el.style.animation).toContain("skeleton-shimmer");
    expect(el.classList.contains("skeleton-shimmer")).toBe(true);
  });

  it("disables shimmer animation when animate=false", () => {
    const { container } = render(<Skeleton variant="text" animate={false} />);
    const el = container.querySelector("[data-testid='skeleton']") as HTMLElement;
    expect(el.style.animation).toBe("");
  });

  it("sets aria-hidden on skeleton elements", () => {
    const { container } = render(<Skeleton variant="heading" />);
    const el = container.querySelector("[data-testid='skeleton']") as HTMLElement;
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders avatar variant with circular border-radius", () => {
    const { container } = render(<Skeleton variant="avatar" />);
    const el = container.querySelector("[data-testid='skeleton']") as HTMLElement;
    expect(el.style.borderRadius).toBe("50%");
    expect(el.style.width).toBe("40px");
    expect(el.style.height).toBe("40px");
  });

  it("renders heading variant with 60% width", () => {
    const { container } = render(<Skeleton variant="heading" />);
    const el = container.querySelector("[data-testid='skeleton']") as HTMLElement;
    expect(el.style.width).toBe("60%");
    expect(el.style.height).toBe("22px");
  });

  it("applies additional className", () => {
    const { container } = render(<Skeleton variant="text" className="my-custom-class" />);
    const el = container.querySelector("[data-testid='skeleton']") as HTMLElement;
    expect(el.classList.contains("my-custom-class")).toBe(true);
  });

  it("injects stylesheet into document head", () => {
    render(<Skeleton variant="text" />);
    const styleEl = document.querySelector("[data-skeleton-styles]");
    expect(styleEl).toBeTruthy();
    expect(styleEl!.textContent).toContain("skeleton-shimmer");
    expect(styleEl!.textContent).toContain("prefers-reduced-motion");
  });

  it("uses Launcher V2 token variables in background gradient", () => {
    const { container } = render(<Skeleton variant="card" />);
    const el = container.querySelector("[data-testid='skeleton']") as HTMLElement;
    // Now uses CSS custom properties: var(--bg-1) and var(--bg-2)
    expect(el.style.background).toContain("var(--bg-1");
    expect(el.style.background).toContain("var(--bg-2");
  });
});

describe("PageSkeleton component", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders dashboard layout with heading and cards", () => {
    render(<PageSkeleton layout="dashboard" />);
    const page = screen.getByTestId("page-skeleton");
    expect(page).toBeTruthy();
    const skeletons = page.querySelectorAll("[data-testid='skeleton']");
    // heading + 3 cards + 3 text lines = 7
    expect(skeletons.length).toBeGreaterThanOrEqual(7);
  });

  it("renders editor layout with sidebar and main content", () => {
    const { container } = render(<PageSkeleton layout="editor" />);
    const page = container.querySelector("[data-testid='page-skeleton']") as HTMLElement;
    expect(page.style.flexDirection).toBe("row");
  });

  it("renders list layout with heading and rows", () => {
    render(<PageSkeleton layout="list" />);
    const page = screen.getByTestId("page-skeleton");
    const skeletons = page.querySelectorAll("[data-testid='skeleton']");
    // heading + 8 rows = 9
    expect(skeletons.length).toBeGreaterThanOrEqual(9);
  });

  it("renders grid layout with configurable columns", () => {
    render(<PageSkeleton layout="grid" columns={4} />);
    const page = screen.getByTestId("page-skeleton");
    const skeletons = page.querySelectorAll("[data-testid='skeleton']");
    // heading + (4 columns * 2) cards = 9
    expect(skeletons.length).toBeGreaterThanOrEqual(9);
  });

  it("passes animate prop to child skeletons", () => {
    render(<PageSkeleton layout="list" animate={false} />);
    const page = screen.getByTestId("page-skeleton");
    const skeletons = page.querySelectorAll("[data-testid='skeleton']") as NodeListOf<HTMLElement>;
    for (const el of skeletons) {
      expect(el.style.animation).toBe("");
    }
  });

  it("applies custom className to page skeleton container", () => {
    render(<PageSkeleton layout="dashboard" className="test-class" />);
    const page = screen.getByTestId("page-skeleton");
    expect(page.classList.contains("test-class")).toBe(true);
  });
});
