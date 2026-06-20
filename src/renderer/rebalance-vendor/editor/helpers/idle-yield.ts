/**
 * Phase 3 Task 19 — Idle yielding helpers.
 *
 * Tools to keep the main thread responsive when processing large arrays of
 * items. Used by `bundledFallbacks.hydrateRuntimeDocumentAsync` and any other
 * routine that wants to fan-out work into idle gaps without blocking the
 * paint loop.
 *
 *   await yieldToIdle();
 *   await chunkedForEach(items, 200, (item, i) => process(item));
 */

type IdleCallbackHandle = number;
type IdleDeadline = { didTimeout: boolean; timeRemaining: () => number };

function getIdle(): {
  request: ((cb: (deadline: IdleDeadline) => void, opts?: { timeout?: number }) => IdleCallbackHandle) | null;
  cancel: ((handle: IdleCallbackHandle) => void) | null;
} {
  const w = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : null;
  const requestIdleCallback =
    w && typeof w.requestIdleCallback === "function"
      ? (w.requestIdleCallback as (cb: (deadline: IdleDeadline) => void, opts?: { timeout?: number }) => IdleCallbackHandle)
      : null;
  const cancelIdleCallback =
    w && typeof w.cancelIdleCallback === "function"
      ? (w.cancelIdleCallback as (handle: IdleCallbackHandle) => void)
      : null;
  return { request: requestIdleCallback, cancel: cancelIdleCallback };
}

/**
 * Resolves on the next idle tick (`requestIdleCallback` when available,
 * otherwise `setTimeout(0)`). Always macro-task-resolved so React commit
 * phases get a chance to run.
 */
export function yieldToIdle(): Promise<void> {
  const idle = getIdle();
  return new Promise<void>((resolve) => {
    if (idle.request) {
      idle.request(() => resolve(), { timeout: 50 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Apply a callback to every item, yielding to idle between batches. Resolves
 * once every item has been processed in original order.
 */
export async function chunkedForEach<T>(
  items: ReadonlyArray<T>,
  chunkSize: number,
  callback: (item: T, index: number) => void,
): Promise<void> {
  const size = Math.max(1, chunkSize | 0);
  let index = 0;
  while (index < items.length) {
    const end = Math.min(index + size, items.length);
    for (let i = index; i < end; i++) {
      callback(items[i], i);
    }
    index = end;
    if (index < items.length) {
      await yieldToIdle();
    }
  }
}

/**
 * Map every item, yielding between batches. Returns a new array in the same
 * order as the input.
 */
export async function chunkedMap<T, U>(
  items: ReadonlyArray<T>,
  chunkSize: number,
  mapper: (item: T, index: number) => U,
): Promise<U[]> {
  const out: U[] = new Array(items.length);
  await chunkedForEach(items, chunkSize, (item, index) => {
    out[index] = mapper(item, index);
  });
  return out;
}
