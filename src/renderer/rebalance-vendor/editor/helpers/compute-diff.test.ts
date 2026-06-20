import { describe, expect, it } from "vitest";
import { computeDiff, type DiffHunk } from "./compute-diff";

describe("computeDiff (Phase 3 Task 15)", () => {
  it("returns all unchanged for identical objects", () => {
    const left = { a: 1, b: "x" };
    const right = { a: 1, b: "x" };
    const hunks = computeDiff(left, right);
    expect(hunks).toHaveLength(2);
    expect(hunks.every((h) => h.operation === "unchanged")).toBe(true);
  });

  it("emits added hunks for keys only on right", () => {
    const hunks = computeDiff({ a: 1 }, { a: 1, b: 2 });
    const added = hunks.filter((h) => h.operation === "added");
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ path: "b", before: undefined, after: 2 });
  });

  it("emits removed hunks for keys only on left", () => {
    const hunks = computeDiff({ a: 1, b: 2 }, { a: 1 });
    const removed = hunks.filter((h) => h.operation === "removed");
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({ path: "b", before: 2, after: undefined });
  });

  it("emits modified hunks for keys with different primitive values", () => {
    const hunks = computeDiff({ hp: 100 }, { hp: 200 });
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({
      path: "hp",
      operation: "modified",
      before: 100,
      after: 200,
    });
  });

  it("recurses into nested plain objects", () => {
    const hunks = computeDiff(
      { stats: { hp: 100, dmg: 50 } },
      { stats: { hp: 200, dmg: 50 } },
    );
    const modified = hunks.filter((h) => h.operation === "modified");
    expect(modified).toHaveLength(1);
    expect(modified[0].path).toBe("stats.hp");
  });

  it("treats arrays as leaves (not recursed)", () => {
    const hunks = computeDiff({ tags: [1, 2] }, { tags: [1, 3] });
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({
      path: "tags",
      operation: "modified",
      before: [1, 2],
      after: [1, 3],
    });
  });

  it("preserves left key order, then right-only keys", () => {
    const hunks = computeDiff({ a: 1, b: 2 }, { b: 2, c: 3 });
    const paths = hunks.map((h) => h.path);
    expect(paths).toEqual(["a", "b", "c"]);
  });

  it("handles deeply nested mismatch", () => {
    const hunks = computeDiff(
      { outer: { inner: { value: 1 } } },
      { outer: { inner: { value: 2 } } },
    );
    const modified = hunks.filter((h) => h.operation === "modified");
    expect(modified).toHaveLength(1);
    expect(modified[0].path).toBe("outer.inner.value");
  });

  it("treats null vs object as modified at the parent path", () => {
    const hunks = computeDiff({ x: { a: 1 } }, { x: null });
    const mod = hunks.find((h) => h.path === "x");
    expect(mod).toBeDefined();
    expect(mod!.operation).toBe("modified");
  });

  it("emits no hunks for two empty objects", () => {
    const hunks: DiffHunk[] = computeDiff({}, {});
    expect(hunks).toEqual([]);
  });
});
