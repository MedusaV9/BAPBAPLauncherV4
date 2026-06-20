import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HISTORY_STORAGE_KEY,
  RESET_FIELD_PATH,
  createDiffEngine,
  type DataCache,
  type CachedDocument,
} from "./DiffEngine";
import type { JsonValue, RuntimeDocument } from "../editor/types";

/* ----------------------------------------------------------------------------
   Fakes
---------------------------------------------------------------------------- */

function makeCache(workspaceRoot = "/ws"): DataCache & { _docs: Map<string, CachedDocument> } {
  const docs = new Map<string, CachedDocument>();
  return {
    workspaceRoot,
    _docs: docs,
    getDocument: (path) => docs.get(path) ?? null,
    getStandardValue: (docPath, fieldPath) => {
      const cached = docs.get(docPath);
      return cached?.standardValues[fieldPath];
    },
  };
}

function seedDoc(
  cache: ReturnType<typeof makeCache>,
  path: string,
  standard: Record<string, JsonValue>,
): void {
  cache._docs.set(path, {
    absolutePath: path,
    relativePath: path,
    mtimeMs: 1,
    raw: {} as RuntimeDocument,
    standardValues: standard,
    overrides: {},
    isDirty: false,
  });
}

function makeStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> & {
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
  };
}

let counter = 0;
let nowValue = Date.parse("2024-05-25T12:00:00.000Z");
const deterministicId = () => {
  counter += 1;
  return `id_${counter.toString().padStart(3, "0")}`;
};
const deterministicNow = () => nowValue;

beforeEach(() => {
  counter = 0;
  nowValue = Date.parse("2024-05-25T12:00:00.000Z");
});

/* ----------------------------------------------------------------------------
   Tests
---------------------------------------------------------------------------- */

describe("DiffEngine history (Phase 3 Task 14)", () => {
  describe("set + undo + redo", () => {
    it("records a single set as a past entry", () => {
      const cache = makeCache();
      seedDoc(cache, "/d1", { hp: 100 });
      const engine = createDiffEngine(cache, "/ws", {
        storage: null,
        now: deterministicNow,
        generateId: deterministicId,
      });

      engine.set("/d1", "hp", 200);

      expect(engine.history.past).toHaveLength(1);
      expect(engine.history.future).toHaveLength(0);
      expect(engine.history.past[0]).toMatchObject({
        docPath: "/d1",
        fieldPath: "hp",
        before: null,
        after: 200,
        source: "user",
      });
      expect(engine.hasOverride("/d1", "hp")).toBe(true);
    });

    it("undo reverts the last set and pushes onto future", () => {
      const cache = makeCache();
      seedDoc(cache, "/d1", { hp: 100 });
      const engine = createDiffEngine(cache, "/ws", { storage: null, now: deterministicNow, generateId: deterministicId });
      engine.set("/d1", "hp", 200);

      const ok = engine.undo();
      expect(ok).toBe(true);
      expect(engine.hasOverride("/d1", "hp")).toBe(false);
      expect(engine.history.past).toHaveLength(0);
      expect(engine.history.future).toHaveLength(1);
    });

    it("redo re-applies the undone set", () => {
      const cache = makeCache();
      seedDoc(cache, "/d1", { hp: 100 });
      const engine = createDiffEngine(cache, "/ws", { storage: null, now: deterministicNow, generateId: deterministicId });
      engine.set("/d1", "hp", 200);
      engine.undo();

      const ok = engine.redo();
      expect(ok).toBe(true);
      expect(engine.hasOverride("/d1", "hp")).toBe(true);
      expect(engine.getAllOverrides("/d1")).toEqual({ hp: 200 });
      expect(engine.history.past).toHaveLength(1);
      expect(engine.history.future).toHaveLength(0);
    });

    it("undo returns false when there is nothing to undo", () => {
      const cache = makeCache();
      seedDoc(cache, "/d1", { hp: 100 });
      const engine = createDiffEngine(cache, "/ws", { storage: null });
      expect(engine.undo()).toBe(false);
    });

    it("redo returns false when there is nothing to redo", () => {
      const cache = makeCache();
      seedDoc(cache, "/d1", { hp: 100 });
      const engine = createDiffEngine(cache, "/ws", { storage: null });
      expect(engine.redo()).toBe(false);
    });

    it("a fresh set after undo clears the future stack", () => {
      const cache = makeCache();
      seedDoc(cache, "/d1", { hp: 100 });
      const engine = createDiffEngine(cache, "/ws", { storage: null, now: deterministicNow, generateId: deterministicId });
      engine.set("/d1", "hp", 200);
      engine.undo();
      expect(engine.history.future).toHaveLength(1);

      engine.set("/d1", "hp", 300);
      expect(engine.history.future).toHaveLength(0);
      expect(engine.history.past).toHaveLength(1);
    });
  });

  describe("remove + reset", () => {
    it("remove records a past entry with null after", () => {
      const cache = makeCache();
      seedDoc(cache, "/d1", { hp: 100 });
      const engine = createDiffEngine(cache, "/ws", { storage: null, now: deterministicNow, generateId: deterministicId });
      engine.set("/d1", "hp", 200);

      engine.remove("/d1", "hp");
      expect(engine.history.past).toHaveLength(2);
      expect(engine.history.past[1]).toMatchObject({
        fieldPath: "hp",
        before: 200,
        after: null,
      });
      expect(engine.hasOverride("/d1", "hp")).toBe(false);
    });

    it("reset records a sentinel entry with the snapshot in `before`", () => {
      const cache = makeCache();
      seedDoc(cache, "/d1", { hp: 100, dmg: 50 });
      const engine = createDiffEngine(cache, "/ws", { storage: null, now: deterministicNow, generateId: deterministicId });
      engine.set("/d1", "hp", 200);
      nowValue += 5000;
      engine.set("/d1", "dmg", 75);

      nowValue += 5000;
      engine.reset("/d1");
      const last = engine.history.past[engine.history.past.length - 1];
      expect(last.fieldPath).toBe(RESET_FIELD_PATH);
      expect(last.before).toEqual({ hp: 200, dmg: 75 });
      expect(last.after).toBe(null);
      expect(engine.getOverrideCount("/d1")).toBe(0);
    });

    it("undo of a reset restores the entire override snapshot", () => {
      const cache = makeCache();
      seedDoc(cache, "/d1", { hp: 100, dmg: 50 });
      const engine = createDiffEngine(cache, "/ws", { storage: null, now: deterministicNow, generateId: deterministicId });
      engine.set("/d1", "hp", 200);
      nowValue += 5000;
      engine.set("/d1", "dmg", 75);
      nowValue += 5000;
      engine.reset("/d1");

      engine.undo();
      expect(engine.getAllOverrides("/d1")).toEqual({ hp: 200, dmg: 75 });
    });
  });

  describe("coalescing", () => {
    it("merges successive same-path edits within the coalesce window", () => {
      const cache = makeCache();
      seedDoc(cache, "/d1", { hp: 100 });
      const engine = createDiffEngine(cache, "/ws", {
        storage: null,
        coalesceWindowMs: 500,
        now: deterministicNow,
        generateId: deterministicId,
      });

      engine.set("/d1", "hp", 200);
      nowValue += 100;
      engine.set("/d1", "hp", 250);
      nowValue += 100;
      engine.set("/d1", "hp", 275);

      expect(engine.history.past).toHaveLength(1);
      expect(engine.history.past[0]).toMatchObject({
        before: null,
        after: 275,
      });
    });

    it("does not coalesce across the idle window", () => {
      const cache = makeCache();
      seedDoc(cache, "/d1", { hp: 100 });
      const engine = createDiffEngine(cache, "/ws", {
        storage: null,
        coalesceWindowMs: 500,
        now: deterministicNow,
        generateId: deterministicId,
      });
      engine.set("/d1", "hp", 200);
      nowValue += 600;
      engine.set("/d1", "hp", 250);
      expect(engine.history.past).toHaveLength(2);
    });

    it("does not coalesce different paths", () => {
      const cache = makeCache();
      seedDoc(cache, "/d1", { hp: 100, dmg: 50 });
      const engine = createDiffEngine(cache, "/ws", {
        storage: null,
        coalesceWindowMs: 500,
        now: deterministicNow,
        generateId: deterministicId,
      });
      engine.set("/d1", "hp", 200);
      nowValue += 100;
      engine.set("/d1", "dmg", 75);
      expect(engine.history.past).toHaveLength(2);
    });
  });

  describe("history limit", () => {
    it("drops oldest entries past the configured limit", () => {
      const cache = makeCache();
      seedDoc(cache, "/d1", { hp: 100 });
      const engine = createDiffEngine(cache, "/ws", {
        storage: null,
        historyLimit: 3,
        coalesceWindowMs: 0,
        now: deterministicNow,
        generateId: deterministicId,
      });

      engine.set("/d1", "hp", 1);
      nowValue += 1000;
      engine.set("/d1", "hp", 2);
      nowValue += 1000;
      engine.set("/d1", "hp", 3);
      nowValue += 1000;
      engine.set("/d1", "hp", 4);
      nowValue += 1000;
      engine.set("/d1", "hp", 5);

      expect(engine.history.past).toHaveLength(3);
      const afters = engine.history.past.map((entry) => entry.after);
      expect(afters).toEqual([3, 4, 5]);
    });
  });

  describe("jumpTo", () => {
    it("jumps backward to a past entry", () => {
      const cache = makeCache();
      seedDoc(cache, "/d1", { hp: 100 });
      const engine = createDiffEngine(cache, "/ws", {
        storage: null,
        coalesceWindowMs: 0,
        now: deterministicNow,
        generateId: deterministicId,
      });
      engine.set("/d1", "hp", 1);
      nowValue += 1000;
      engine.set("/d1", "hp", 2);
      nowValue += 1000;
      engine.set("/d1", "hp", 3);

      const targetId = engine.history.past[0].id;
      const ok = engine.jumpTo(targetId);
      expect(ok).toBe(true);
      expect(engine.getAllOverrides("/d1")).toEqual({ hp: 1 });
      expect(engine.history.past).toHaveLength(1);
      expect(engine.history.future).toHaveLength(2);
    });

    it("jumps forward to a future entry", () => {
      const cache = makeCache();
      seedDoc(cache, "/d1", { hp: 100 });
      const engine = createDiffEngine(cache, "/ws", {
        storage: null,
        coalesceWindowMs: 0,
        now: deterministicNow,
        generateId: deterministicId,
      });
      engine.set("/d1", "hp", 1);
      nowValue += 1000;
      engine.set("/d1", "hp", 2);
      nowValue += 1000;
      engine.set("/d1", "hp", 3);
      engine.undo();
      engine.undo();

      const targetId = engine.history.future[1].id;
      const ok = engine.jumpTo(targetId);
      expect(ok).toBe(true);
      expect(engine.getAllOverrides("/d1")).toEqual({ hp: 3 });
    });

    it("returns false for unknown ids", () => {
      const cache = makeCache();
      seedDoc(cache, "/d1", { hp: 100 });
      const engine = createDiffEngine(cache, "/ws", { storage: null });
      expect(engine.jumpTo("missing")).toBe(false);
    });
  });

  describe("clearHistory", () => {
    it("empties past + future and notifies subscribers", () => {
      const cache = makeCache();
      seedDoc(cache, "/d1", { hp: 100 });
      const engine = createDiffEngine(cache, "/ws", { storage: null, now: deterministicNow, generateId: deterministicId });
      engine.set("/d1", "hp", 200);
      engine.undo();

      const listener = vi.fn();
      const unsubscribe = engine.onHistoryChange(listener);

      engine.clearHistory();
      expect(engine.history.past).toEqual([]);
      expect(engine.history.future).toEqual([]);
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });
  });

  describe("persistence", () => {
    it("persists history to storage and restores it on a new engine", () => {
      const storage = makeStorage();
      const cacheA = makeCache();
      seedDoc(cacheA, "/d1", { hp: 100 });
      const engineA = createDiffEngine(cacheA, "/ws", {
        storage,
        coalesceWindowMs: 0,
        now: deterministicNow,
        generateId: deterministicId,
      });
      engineA.set("/d1", "hp", 200);
      nowValue += 1000;
      engineA.set("/d1", "hp", 300);

      const cacheB = makeCache();
      seedDoc(cacheB, "/d1", { hp: 100 });
      const engineB = createDiffEngine(cacheB, "/ws", { storage });

      expect(engineB.history.past).toHaveLength(2);
      expect(engineB.history.past[1].after).toBe(300);
    });

    it("isolates history per workspace root", () => {
      const storage = makeStorage();
      const cacheA = makeCache("/wsA");
      seedDoc(cacheA, "/d1", { hp: 100 });
      const engineA = createDiffEngine(cacheA, "/wsA", { storage, coalesceWindowMs: 0 });
      engineA.set("/d1", "hp", 200);

      const cacheB = makeCache("/wsB");
      seedDoc(cacheB, "/d1", { hp: 100 });
      const engineB = createDiffEngine(cacheB, "/wsB", { storage });
      expect(engineB.history.past).toHaveLength(0);
    });

    it("ignores corrupted persisted JSON", () => {
      const storage = makeStorage();
      storage.setItem(HISTORY_STORAGE_KEY, "{ this is not json");
      const cache = makeCache();
      seedDoc(cache, "/d1", { hp: 100 });
      const engine = createDiffEngine(cache, "/ws", { storage });
      expect(engine.history.past).toEqual([]);
    });
  });

  describe("subscriptions", () => {
    it("notifies onHistoryChange after mutations and undo/redo", () => {
      const cache = makeCache();
      seedDoc(cache, "/d1", { hp: 100 });
      const engine = createDiffEngine(cache, "/ws", { storage: null, coalesceWindowMs: 0, now: deterministicNow, generateId: deterministicId });
      const listener = vi.fn();
      const unsubscribe = engine.onHistoryChange(listener);

      engine.set("/d1", "hp", 200);
      expect(listener).toHaveBeenCalledTimes(1);
      engine.undo();
      expect(listener).toHaveBeenCalledTimes(2);
      engine.redo();
      expect(listener).toHaveBeenCalledTimes(3);

      unsubscribe();
      engine.set("/d1", "hp", 300);
      expect(listener).toHaveBeenCalledTimes(3);
    });
  });
});
