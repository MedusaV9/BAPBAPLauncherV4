import { describe, it, expect } from "vitest";
import { AsyncMutex, KeyedMutex } from "./async-mutex";

describe("AsyncMutex", () => {
  it("starts unlocked", () => {
    const mutex = new AsyncMutex();
    expect(mutex.isLocked()).toBe(false);
  });

  it("is locked after acquire", async () => {
    const mutex = new AsyncMutex();
    await mutex.acquire();
    expect(mutex.isLocked()).toBe(true);
  });

  it("is unlocked after release", async () => {
    const mutex = new AsyncMutex();
    const release = await mutex.acquire();
    release();
    expect(mutex.isLocked()).toBe(false);
  });

  it("double release is a no-op", async () => {
    const mutex = new AsyncMutex();
    const release = await mutex.acquire();
    release();
    release(); // should not throw or corrupt state
    expect(mutex.isLocked()).toBe(false);
  });

  it("serializes concurrent acquires", async () => {
    const mutex = new AsyncMutex();
    const order: number[] = [];

    const run = async (id: number) => {
      const release = await mutex.acquire();
      order.push(id);
      // simulate async work
      await new Promise((r) => setTimeout(r, 5));
      release();
    };

    await Promise.all([run(1), run(2), run(3)]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("waiters resolve in FIFO order", async () => {
    const mutex = new AsyncMutex();
    const release1 = await mutex.acquire();

    const order: number[] = [];
    const p2 = mutex.acquire().then((release) => {
      order.push(2);
      release();
    });
    const p3 = mutex.acquire().then((release) => {
      order.push(3);
      release();
    });

    release1();
    await Promise.all([p2, p3]);
    expect(order).toEqual([2, 3]);
  });
});

describe("KeyedMutex", () => {
  it("different keys are independent", async () => {
    const keyed = new KeyedMutex();
    const releaseA = await keyed.acquire("a");
    expect(keyed.isLocked("a")).toBe(true);
    expect(keyed.isLocked("b")).toBe(false);

    const releaseB = await keyed.acquire("b");
    expect(keyed.isLocked("b")).toBe(true);

    releaseA();
    releaseB();
    expect(keyed.isLocked("a")).toBe(false);
    expect(keyed.isLocked("b")).toBe(false);
  });

  it("same key serializes access", async () => {
    const keyed = new KeyedMutex();
    const order: number[] = [];

    const run = async (id: number) => {
      const release = await keyed.acquire("shared");
      order.push(id);
      await new Promise((r) => setTimeout(r, 5));
      release();
    };

    await Promise.all([run(1), run(2), run(3)]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("returns false for unknown keys", () => {
    const keyed = new KeyedMutex();
    expect(keyed.isLocked("nonexistent")).toBe(false);
  });
});
