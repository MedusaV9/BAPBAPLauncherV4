// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chunkedForEach, chunkedMap, yieldToIdle } from "./idle-yield";

describe("idle-yield (Phase 3 Task 19)", () => {
  let originalRic: ((cb: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void) => number) | undefined;

  beforeEach(() => {
    originalRic = (window as unknown as { requestIdleCallback?: typeof originalRic }).requestIdleCallback;
  });

  afterEach(() => {
    (window as unknown as { requestIdleCallback?: typeof originalRic }).requestIdleCallback = originalRic;
  });

  describe("yieldToIdle", () => {
    it("resolves via requestIdleCallback when available", async () => {
      const ric = vi.fn((cb: (d: { didTimeout: boolean; timeRemaining: () => number }) => void) => {
        Promise.resolve().then(() => cb({ didTimeout: false, timeRemaining: () => 50 }));
        return 1;
      });
      (window as unknown as { requestIdleCallback?: typeof ric }).requestIdleCallback = ric;
      await yieldToIdle();
      expect(ric).toHaveBeenCalledTimes(1);
    });

    it("falls back to setTimeout when requestIdleCallback is missing", async () => {
      delete (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback;
      const before = Date.now();
      await yieldToIdle();
      const after = Date.now();
      expect(after - before).toBeGreaterThanOrEqual(0);
    });
  });

  describe("chunkedForEach", () => {
    it("processes every item in original order", async () => {
      const seen: number[] = [];
      await chunkedForEach([1, 2, 3, 4, 5], 2, (n) => seen.push(n));
      expect(seen).toEqual([1, 2, 3, 4, 5]);
    });

    it("processes empty arrays", async () => {
      const seen: number[] = [];
      await chunkedForEach([], 5, (n) => seen.push(n));
      expect(seen).toEqual([]);
    });

    it("calls each callback exactly once", async () => {
      const callback = vi.fn();
      await chunkedForEach([1, 2, 3], 1, callback);
      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenNthCalledWith(1, 1, 0);
      expect(callback).toHaveBeenNthCalledWith(2, 2, 1);
      expect(callback).toHaveBeenNthCalledWith(3, 3, 2);
    });

    it("yields between batches but not after the final batch", async () => {
      const ric = vi.fn((cb: (d: { didTimeout: boolean; timeRemaining: () => number }) => void) => {
        Promise.resolve().then(() => cb({ didTimeout: false, timeRemaining: () => 50 }));
        return 1;
      });
      (window as unknown as { requestIdleCallback?: typeof ric }).requestIdleCallback = ric;
      await chunkedForEach([1, 2, 3, 4, 5], 2, () => undefined);
      // 5 items / chunk 2 → 3 batches → 2 inter-batch yields
      expect(ric).toHaveBeenCalledTimes(2);
    });

    it("handles chunk sizes of 0 gracefully", async () => {
      const seen: number[] = [];
      await chunkedForEach([1, 2, 3], 0, (n) => seen.push(n));
      expect(seen).toEqual([1, 2, 3]);
    });
  });

  describe("chunkedMap", () => {
    it("returns the mapped array in original order", async () => {
      const out = await chunkedMap([1, 2, 3, 4], 2, (n) => n * 2);
      expect(out).toEqual([2, 4, 6, 8]);
    });

    it("returns an empty array for empty input", async () => {
      const out = await chunkedMap([], 5, (n) => n);
      expect(out).toEqual([]);
    });
  });
});
