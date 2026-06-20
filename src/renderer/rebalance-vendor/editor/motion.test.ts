// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOverlayTransition } from "./motion";

// Mock GSAP
vi.mock("gsap", () => {
  const mockTimeline = {
    from: vi.fn().mockReturnThis(),
    fromTo: vi.fn().mockReturnThis(),
    to: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    kill: vi.fn(),
    play: vi.fn(),
    reverse: vi.fn(),
  };
  return {
    default: {
      timeline: vi.fn(() => mockTimeline),
      from: vi.fn(() => mockTimeline),
      to: vi.fn(() => mockTimeline),
      fromTo: vi.fn(() => mockTimeline),
      set: vi.fn(),
      killTweensOf: vi.fn(),
    },
  };
});

// Mock matchMedia for prefers-reduced-motion
beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useOverlayTransition", () => {
  it("should not be mounted when isOpen is false", () => {
    const { result } = renderHook(() => useOverlayTransition(false));
    expect(result.current.mounted).toBe(false);
  });

  it("should mount when isOpen becomes true", () => {
    const { result, rerender } = renderHook(({ isOpen }) => useOverlayTransition(isOpen), {
      initialProps: { isOpen: false },
    });

    expect(result.current.mounted).toBe(false);

    rerender({ isOpen: true });
    expect(result.current.mounted).toBe(true);
  });

  it("should unmount after close when no DOM elements are attached", async () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(({ isOpen }) => useOverlayTransition(isOpen), {
      initialProps: { isOpen: true },
    });

    expect(result.current.mounted).toBe(true);

    // Trigger close — with no DOM ref, close is instant (no elements to animate)
    await act(async () => {
      rerender({ isOpen: false });
      await Promise.resolve();
    });

    expect(result.current.mounted).toBe(false);

    vi.useRealTimers();
  });

  it("should provide a ref for the overlay root element", () => {
    const { result } = renderHook(() => useOverlayTransition(true));
    expect(result.current.ref).toBeDefined();
    expect(result.current.ref.current).toBeNull();
  });

  it("should handle rapid open/close by canceling previous animations", async () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(({ isOpen }) => useOverlayTransition(isOpen), {
      initialProps: { isOpen: false },
    });

    // Open
    rerender({ isOpen: true });
    expect(result.current.mounted).toBe(true);

    // Close immediately (within 100ms)
    rerender({ isOpen: false });

    // Should unmount quickly because rapid close skips animation
    await act(async () => {
      vi.advanceTimersByTime(10);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.mounted).toBe(false);

    vi.useRealTimers();
  });

  it("should expose setCloseCallback for external close registration", () => {
    const { result } = renderHook(() => useOverlayTransition(true));
    expect(typeof result.current.setCloseCallback).toBe("function");
  });
});
