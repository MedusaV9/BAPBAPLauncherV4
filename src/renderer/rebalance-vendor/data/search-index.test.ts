import { describe, expect, it } from "vitest";
import { createSearchIndex, tokenize } from "./search-index";

describe("tokenize (Phase 3 Task 17)", () => {
  it("lowercases", () => {
    expect(tokenize("Damage HP")).toEqual(["damage", "hp"]);
  });

  it("splits on whitespace and punctuation", () => {
    expect(tokenize("fire-burn,poison.dot")).toEqual(["fire", "burn", "poison", "dot"]);
  });

  it("returns empty array for empty input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("createSearchIndex (Phase 3 Task 17)", () => {
  it("starts empty", () => {
    const idx = createSearchIndex();
    expect(idx.size).toBe(0);
    expect(idx.query("anything")).toEqual([]);
  });

  it("adds a record and queries it back", () => {
    const idx = createSearchIndex();
    idx.addRecord({ id: "r1", tokens: ["damage", "fire", "burn"] });
    expect(idx.size).toBe(1);
    const results = idx.query("damage");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("r1");
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("addMany batches insertion", () => {
    const idx = createSearchIndex();
    idx.addRecords([
      { id: "a", tokens: ["fire", "wave"] },
      { id: "b", tokens: ["damage", "burn"] },
      { id: "c", tokens: ["poison"] },
    ]);
    expect(idx.size).toBe(3);
  });

  it("scores higher when more tokens match", () => {
    const idx = createSearchIndex();
    idx.addRecords([
      { id: "exact", tokens: ["damage", "fire", "burn"] },
      { id: "partial", tokens: ["damage", "ice"] },
    ]);
    const results = idx.query("damage fire");
    expect(results[0].id).toBe("exact");
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it("returns empty array for non-matching queries", () => {
    const idx = createSearchIndex();
    idx.addRecord({ id: "r1", tokens: ["damage"] });
    expect(idx.query("zonkbat")).toEqual([]);
  });

  it("respects the limit option", () => {
    const idx = createSearchIndex();
    for (let i = 0; i < 20; i++) {
      idx.addRecord({ id: `r${i}`, tokens: ["damage"] });
    }
    expect(idx.query("damage", { limit: 5 })).toHaveLength(5);
  });

  it("removeRecord purges by id", () => {
    const idx = createSearchIndex();
    idx.addRecord({ id: "r1", tokens: ["damage"] });
    expect(idx.size).toBe(1);
    idx.removeRecord("r1");
    expect(idx.size).toBe(0);
    expect(idx.query("damage")).toEqual([]);
  });

  it("clear empties everything", () => {
    const idx = createSearchIndex();
    idx.addRecords([
      { id: "a", tokens: ["fire"] },
      { id: "b", tokens: ["ice"] },
    ]);
    idx.clear();
    expect(idx.size).toBe(0);
    expect(idx.query("fire")).toEqual([]);
  });

  it("attaches metadata to results", () => {
    const idx = createSearchIndex();
    idx.addRecord({ id: "r1", tokens: ["damage"], metadata: { kind: "field" } });
    const results = idx.query("damage");
    expect(results[0].metadata).toEqual({ kind: "field" });
  });

  it("queries are case-insensitive", () => {
    const idx = createSearchIndex();
    idx.addRecord({ id: "r1", tokens: ["damage"] });
    expect(idx.query("DAMAGE")[0]?.id).toBe("r1");
  });
});
