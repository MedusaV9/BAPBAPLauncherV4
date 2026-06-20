// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { VirtualizedList } from "./VirtualizedList";
import type { VirtualizedListProps } from "./VirtualizedList";

// Mock ResizeObserver
class MockResizeObserver {
  callback: ResizeObserverCallback;
  targets: Element[] = [];
  static instances: MockResizeObserver[] = [];

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.push(target);
  }

  unobserve() {}

  disconnect() {
    this.targets = [];
  }

  // Helper for tests to trigger resize
  trigger(entries: Partial<ResizeObserverEntry>[]) {
    this.callback(entries as ResizeObserverEntry[], this as unknown as ResizeObserver);
  }
}

beforeEach(() => {
  MockResizeObserver.instances = [];
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function createItems(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `Item ${i}`);
}

function defaultRenderItem(item: string, index: number, style: React.CSSProperties) {
  return <div data-testid={`item-${index}`}>{item}</div>;
}

describe("VirtualizedList", () => {
  it("renders empty state when items array is empty", () => {
    render(
      <VirtualizedList
        items={[]}
        itemHeight={40}
        renderItem={defaultRenderItem}
        emptyState={<div data-testid="empty">No items</div>}
      />
    );

    expect(screen.getByTestId("empty")).toBeTruthy();
    expect(screen.getByText("No items")).toBeTruthy();
  });

  it("renders fallback items when container height is 0 (not yet measured)", () => {
    const items = createItems(100);

    const { container } = render(
      <VirtualizedList
        items={items}
        itemHeight={40}
        renderItem={defaultRenderItem}
        containerHeight={0}
      />
    );

    // Should render up to FALLBACK_MAX_ITEMS (50) when container is unmeasured
    const rendered = container.querySelectorAll('[data-testid^="item-"]');
    expect(rendered.length).toBeLessThanOrEqual(50);
    expect(rendered.length).toBeGreaterThan(0);
  });

  it("renders correct item count for given container height with fixed item height", () => {
    const items = createItems(200);
    const itemHeight = 40;
    const containerH = 400; // 400 / 40 = 10 visible items + 5 overscan each side

    const { container } = render(
      <VirtualizedList
        items={items}
        itemHeight={itemHeight}
        renderItem={defaultRenderItem}
        containerHeight={containerH}
      />
    );

    // With numeric containerHeight prop, virtualization works immediately
    // At scroll 0: start=0, end=ceil(400/40)=10, with overscan: start=max(0,0-5)=0, end=min(200,10+5)=15
    const rendered = container.querySelectorAll('[data-testid^="item-"]');
    expect(rendered.length).toBe(15);
  });

  it("supports variable item heights", () => {
    const items = createItems(100);
    const variableHeight = (index: number) => (index % 2 === 0 ? 40 : 60);
    const containerH = 300;

    const { container } = render(
      <VirtualizedList
        items={items}
        itemHeight={variableHeight}
        renderItem={defaultRenderItem}
        containerHeight={containerH}
      />
    );

    const rendered = container.querySelectorAll('[data-testid^="item-"]');
    // With variable heights (40, 60 alternating), 300px fits: 40+60+40+60+40+60 = 300
    // That's 6 items visible + 5 overscan below = 11 items minimum
    expect(rendered.length).toBeGreaterThanOrEqual(6);
    expect(rendered.length).toBeLessThan(items.length);
  });

  it("renders items with position:absolute styling", () => {
    const items = createItems(5);
    const itemHeight = 40;

    const { container } = render(
      <VirtualizedList
        items={items}
        itemHeight={itemHeight}
        renderItem={defaultRenderItem}
        containerHeight={400}
      />
    );

    // Items should have absolute positioning wrappers
    const wrappers = container.querySelectorAll('[data-motion-result]');
    expect(wrappers.length).toBeGreaterThan(0);

    const firstWrapper = wrappers[0] as HTMLElement;
    expect(firstWrapper.style.position).toBe("absolute");
    expect(firstWrapper.style.top).toBe("0px");
  });

  it("includes data-motion-result attribute for stagger animation compatibility", () => {
    const items = createItems(10);

    const { container } = render(
      <VirtualizedList
        items={items}
        itemHeight={40}
        renderItem={defaultRenderItem}
        containerHeight={500}
      />
    );

    const motionElements = container.querySelectorAll("[data-motion-result]");
    expect(motionElements.length).toBeGreaterThan(0);
  });

  it("applies custom className to container", () => {
    const { container } = render(
      <VirtualizedList
        items={createItems(5)}
        itemHeight={40}
        renderItem={defaultRenderItem}
        className="my-custom-class"
      />
    );

    const scrollContainer = container.firstElementChild as HTMLElement;
    expect(scrollContainer.classList.contains("my-custom-class")).toBe(true);
  });

  it("calculates correct total height for the scroll area", () => {
    const items = createItems(50);
    const itemHeight = 40;

    const { container } = render(
      <VirtualizedList
        items={items}
        itemHeight={itemHeight}
        renderItem={defaultRenderItem}
        containerHeight={200}
      />
    );

    // The inner div should have height = itemCount * itemHeight
    const scrollContainer = container.firstElementChild as HTMLElement;
    const innerDiv = scrollContainer.firstElementChild as HTMLElement;
    expect(innerDiv.style.height).toBe(`${50 * 40}px`);
  });

  it("uses custom overscan value", () => {
    const items = createItems(200);
    const itemHeight = 40;
    const containerH = 400;
    const overscan = 10;

    const { container } = render(
      <VirtualizedList
        items={items}
        itemHeight={itemHeight}
        overscan={overscan}
        renderItem={defaultRenderItem}
        containerHeight={containerH}
      />
    );

    // With numeric containerHeight, virtualization works immediately
    // At scroll 0: start=max(0,0-10)=0, end=min(200,10+10)=20
    const rendered = container.querySelectorAll('[data-testid^="item-"]');
    expect(rendered.length).toBe(20);
  });

  it("handles scroll events and updates visible range", () => {
    const items = createItems(200);
    const itemHeight = 40;
    const containerH = 400;

    const { container } = render(
      <VirtualizedList
        items={items}
        itemHeight={itemHeight}
        renderItem={defaultRenderItem}
        containerHeight={containerH}
      />
    );

    const scrollContainer = container.firstElementChild as HTMLElement;

    // Set scrollTop on the element before firing scroll event (jsdom doesn't scroll natively)
    Object.defineProperty(scrollContainer, "scrollTop", { value: 800, configurable: true, writable: true });
    fireEvent.scroll(scrollContainer);

    // After scrolling to 800: startIndex = floor(800/40) - 5 = 15
    // endIndex = ceil((800+400)/40) + 5 = 30 + 5 = 35
    // So rendered = 35 - 15 = 20 items
    const rendered = container.querySelectorAll('[data-testid^="item-"]');
    expect(rendered.length).toBe(20);
  });
});
