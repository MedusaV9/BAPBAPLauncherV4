// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ResponsiveGrid } from "./ResponsiveGrid";

describe("ResponsiveGrid", () => {
  it("renders children inside a grid container", () => {
    const { container } = render(
      <ResponsiveGrid minItemWidth={200}>
        <div>Item 1</div>
        <div>Item 2</div>
        <div>Item 3</div>
      </ResponsiveGrid>,
    );

    const grid = container.firstElementChild as HTMLElement;
    expect(grid).toBeTruthy();
    expect(grid.style.display).toBe("grid");
    expect(grid.children).toHaveLength(3);
  });

  it("applies auto-fill minmax grid-template-columns", () => {
    const { container } = render(
      <ResponsiveGrid minItemWidth={240}>
        <div>Item</div>
      </ResponsiveGrid>,
    );

    const grid = container.firstElementChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toContain("auto-fill");
    expect(grid.style.gridTemplateColumns).toContain("240px");
  });

  it("uses default gap of 1rem", () => {
    const { container } = render(
      <ResponsiveGrid minItemWidth={200}>
        <div>Item</div>
      </ResponsiveGrid>,
    );

    const grid = container.firstElementChild as HTMLElement;
    expect(grid.style.gap).toBe("1rem");
  });

  it("accepts a custom gap", () => {
    const { container } = render(
      <ResponsiveGrid minItemWidth={200} gap="2rem">
        <div>Item</div>
      </ResponsiveGrid>,
    );

    const grid = container.firstElementChild as HTMLElement;
    expect(grid.style.gap).toBe("2rem");
  });

  it("respects the 1920px content cap", () => {
    const { container } = render(
      <ResponsiveGrid minItemWidth={200}>
        <div>Item</div>
      </ResponsiveGrid>,
    );

    const grid = container.firstElementChild as HTMLElement;
    expect(grid.style.maxWidth).toBe("1920px");
  });

  it("applies custom className", () => {
    const { container } = render(
      <ResponsiveGrid minItemWidth={200} className="my-grid">
        <div>Item</div>
      </ResponsiveGrid>,
    );

    const grid = container.firstElementChild as HTMLElement;
    expect(grid.className).toBe("my-grid");
  });

  it("caps columns when maxColumns is set", () => {
    const { container } = render(
      <ResponsiveGrid minItemWidth={200} maxColumns={3} gap="1rem">
        <div>Item 1</div>
        <div>Item 2</div>
        <div>Item 3</div>
        <div>Item 4</div>
      </ResponsiveGrid>,
    );

    const grid = container.firstElementChild as HTMLElement;
    // The grid-template-columns should include a calc that references maxColumns (3)
    expect(grid.style.gridTemplateColumns).toContain("auto-fill");
    expect(grid.style.gridTemplateColumns).toContain("/ 3");
  });
});
