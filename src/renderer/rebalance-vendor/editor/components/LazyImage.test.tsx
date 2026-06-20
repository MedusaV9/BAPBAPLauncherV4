// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { LazyImage } from "./LazyImage";

// Mock IntersectionObserver
let mockObserverInstances: Array<{ observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; trigger: (isIntersecting: boolean) => void }> = [];
let mockObserverConstructorCalls: Array<[IntersectionObserverCallback, IntersectionObserverInit | undefined]> = [];

function createMockObserver() {
  beforeEach(() => {
    mockObserverInstances = [];
    mockObserverConstructorCalls = [];

    class MockObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "";
      readonly thresholds = [];
      readonly observe = vi.fn();
      readonly disconnect = vi.fn();
      readonly unobserve = vi.fn();

      private readonly callback: IntersectionObserverCallback;

      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        this.callback = callback;
        mockObserverConstructorCalls.push([callback, options]);
        mockObserverInstances.push(this);
      }

      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }

      trigger(isIntersecting: boolean) {
        this.callback(
          [{ isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 } as IntersectionObserverEntry],
          this,
        );
      }
    }

    vi.stubGlobal("IntersectionObserver", MockObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
}

describe("LazyImage", () => {
  createMockObserver();

  it("renders a shimmer placeholder initially and does not load the image", () => {
    const { container } = render(<LazyImage src="/test.png" alt="Test" width={100} height={100} />);
    expect(container.querySelector(".lazy-image-shimmer")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("starts loading the image when IntersectionObserver fires", () => {
    const { container } = render(<LazyImage src="/test.png" alt="Test" width={100} height={100} />);

    act(() => {
      mockObserverInstances[0]?.trigger(true);
    });

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("/test.png");
    // Image should be invisible (opacity 0) until loaded
    expect(img?.style.opacity).toBe("0");
  });

  it("fades in the image once loaded (opacity transition)", () => {
    const { container } = render(<LazyImage src="/test.png" alt="Test" width={100} height={100} />);

    act(() => {
      mockObserverInstances[0]?.trigger(true);
    });

    const img = container.querySelector("img")!;
    fireEvent.load(img);

    expect(img.style.opacity).toBe("1");
    // Shimmer should be gone
    expect(container.querySelector(".lazy-image-shimmer")).toBeNull();
  });

  it("shows error placeholder on load failure", () => {
    const { container } = render(<LazyImage src="/broken.png" alt="Broken" width={100} height={100} />);

    act(() => {
      mockObserverInstances[0]?.trigger(true);
    });

    const img = container.querySelector("img")!;
    fireEvent.error(img);

    expect(container.querySelector(".lazy-image-error")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".lazy-image-shimmer")).toBeNull();
  });

  it("uses rootMargin of 200px", () => {
    render(<LazyImage src="/test.png" alt="Test" width={100} height={100} />);
    expect(mockObserverConstructorCalls).toEqual([[expect.any(Function), { rootMargin: "200px" }]]);
  });

  it("passes standard img props through", () => {
    const { container } = render(
      <LazyImage src="/test.png" alt="Card art" width={200} height={150} data-testid="card-img" />,
    );

    act(() => {
      mockObserverInstances[0]?.trigger(true);
    });

    const img = container.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("Card art");
    expect(img.getAttribute("width")).toBe("200");
    expect(img.getAttribute("height")).toBe("150");
    expect(img.getAttribute("data-testid")).toBe("card-img");
  });

  it("disconnects observer after intersection", () => {
    render(<LazyImage src="/test.png" alt="Test" width={100} height={100} />);
    const observer = mockObserverInstances[0]!;

    act(() => {
      observer.trigger(true);
    });

    expect(observer.disconnect).toHaveBeenCalled();
  });

  it("falls back to eager loading when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);

    const { container } = render(<LazyImage src="/test.png" alt="Test" width={100} height={100} />);

    // Should immediately render the img (eager loading)
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("/test.png");
  });
});
