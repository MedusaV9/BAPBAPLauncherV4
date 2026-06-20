import { describe, expect, it } from "vitest";
import { getHint, hasHint, listHintIds, loadHints } from "./hints";

describe("hints helper (Phase 3 Task 23)", () => {
  it("loads at least 12 hints from the catalog", () => {
    const hints = loadHints();
    expect(Object.keys(hints).length).toBeGreaterThanOrEqual(12);
  });

  it("each loaded hint has a non-empty title and body", () => {
    const hints = loadHints();
    for (const [id, entry] of Object.entries(hints)) {
      expect(entry.title.length, `hint=${id} title`).toBeGreaterThan(0);
      expect(entry.body.length, `hint=${id} body`).toBeGreaterThan(10);
    }
  });

  it("getHint returns a real entry for known ids", () => {
    const entry = getHint("quick-edit-damage");
    expect(entry).not.toBeNull();
    expect(entry!.title).toBe("Damage tuning");
    expect(entry!.body).toMatch(/HP/i);
  });

  it("getHint returns null for unknown ids", () => {
    expect(getHint("not-a-real-hint-id")).toBeNull();
    expect(getHint("")).toBeNull();
  });

  it("hasHint mirrors getHint", () => {
    expect(hasHint("override-map")).toBe(true);
    expect(hasHint("nope")).toBe(false);
  });

  it("listHintIds returns a stable array of strings", () => {
    const ids = listHintIds();
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBeGreaterThanOrEqual(12);
    expect(ids.every((id) => typeof id === "string")).toBe(true);
  });
});
