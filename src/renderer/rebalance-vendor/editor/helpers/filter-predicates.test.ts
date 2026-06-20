import { describe, expect, it } from "vitest";
import {
  composeFilters,
  createSmartFilterRegistry,
  createTextSearchPredicate,
  hasEmptyValue,
  hasIcon,
  hasOverridesPredicate,
  isModifiedOnly,
  isRecentlyChangedFactory,
} from "./filter-predicates";

describe("filter-predicates (Phase 3 Task 16)", () => {
  describe("isModifiedOnly", () => {
    it("returns true when isModified=true", () => {
      expect(isModifiedOnly({ isModified: true })).toBe(true);
    });

    it("falls back to hasOverride when isModified is missing", () => {
      expect(isModifiedOnly({ hasOverride: true })).toBe(true);
      expect(isModifiedOnly({ hasOverride: false })).toBe(false);
    });

    it("returns false when neither flag is set", () => {
      expect(isModifiedOnly({})).toBe(false);
    });
  });

  describe("hasOverridesPredicate", () => {
    it("returns true when hasOverride is truthy", () => {
      expect(hasOverridesPredicate({ hasOverride: true })).toBe(true);
      expect(hasOverridesPredicate({ hasOverride: false })).toBe(false);
      expect(hasOverridesPredicate({})).toBe(false);
    });
  });

  describe("isRecentlyChangedFactory", () => {
    it("includes items modified within the window", () => {
      const now = () => Date.parse("2024-05-25T12:00:00.000Z");
      const predicate = isRecentlyChangedFactory(60_000, now);
      expect(predicate({ modifiedAt: "2024-05-25T11:59:30.000Z" })).toBe(true);
      expect(predicate({ modifiedAt: "2024-05-25T11:00:00.000Z" })).toBe(false);
    });

    it("accepts numeric timestamps", () => {
      const now = () => 1_000_000;
      const predicate = isRecentlyChangedFactory(500, now);
      expect(predicate({ modifiedAt: 999_750 })).toBe(true);
      expect(predicate({ modifiedAt: 999_000 })).toBe(false);
    });

    it("returns false for missing or invalid timestamps", () => {
      const predicate = isRecentlyChangedFactory();
      expect(predicate({})).toBe(false);
      expect(predicate({ modifiedAt: "not a date" })).toBe(false);
    });
  });

  describe("hasIcon", () => {
    it("matches iconPreviewPath", () => {
      expect(hasIcon({ iconPreviewPath: "C:/icons/x.png" })).toBe(true);
    });

    it("matches iconPath", () => {
      expect(hasIcon({ iconPath: "/icons/x.png" })).toBe(true);
    });

    it("matches nested icon.path", () => {
      expect(hasIcon({ icon: { path: "/img.png" } })).toBe(true);
    });

    it("rejects empty / missing paths", () => {
      expect(hasIcon({})).toBe(false);
      expect(hasIcon({ iconPath: "" })).toBe(false);
      expect(hasIcon({ iconPreviewPath: "   " })).toBe(false);
    });
  });

  describe("hasEmptyValue", () => {
    it("treats null/undefined values as empty", () => {
      expect(hasEmptyValue({ currentValue: null })).toBe(true);
      expect(hasEmptyValue({})).toBe(true);
    });

    it("treats empty strings/arrays/objects as empty", () => {
      expect(hasEmptyValue({ currentValue: "" })).toBe(true);
      expect(hasEmptyValue({ currentValue: [] })).toBe(true);
      expect(hasEmptyValue({ currentValue: {} })).toBe(true);
    });

    it("treats meaningful values as non-empty", () => {
      expect(hasEmptyValue({ currentValue: 0 })).toBe(false);
      expect(hasEmptyValue({ currentValue: false })).toBe(false);
      expect(hasEmptyValue({ currentValue: "hp" })).toBe(false);
      expect(hasEmptyValue({ currentValue: [1] })).toBe(false);
      expect(hasEmptyValue({ currentValue: { a: 1 } })).toBe(false);
    });
  });

  describe("composeFilters", () => {
    it("ANDs predicates together", () => {
      const isPositive = (n: number) => n > 0;
      const isEven = (n: number) => n % 2 === 0;
      const both = composeFilters([isPositive, isEven]);
      expect(both(2)).toBe(true);
      expect(both(-2)).toBe(false);
      expect(both(3)).toBe(false);
    });

    it("returns true for empty list (no filter)", () => {
      const passthrough = composeFilters<number>([]);
      expect(passthrough(0)).toBe(true);
      expect(passthrough(-100)).toBe(true);
    });
  });

  describe("createSmartFilterRegistry", () => {
    it("builds individual predicates per id", () => {
      const registry = createSmartFilterRegistry();
      const modified = registry.build("modified-only");
      expect(modified).toBeTypeOf("function");
      expect(modified!({ hasOverride: true })).toBe(true);
    });

    it("returns null for unknown ids", () => {
      const registry = createSmartFilterRegistry();
      // @ts-expect-error — testing runtime guard
      expect(registry.build("ufo")).toBeNull();
    });

    it("composes the union of active filter ids", () => {
      const registry = createSmartFilterRegistry();
      const active = new Set<"has-overrides" | "has-icon">(["has-overrides", "has-icon"]);
      const predicate = registry.buildActive(active);
      expect(predicate({ hasOverride: true, iconPath: "/x.png" })).toBe(true);
      expect(predicate({ hasOverride: true })).toBe(false);
      expect(predicate({ iconPath: "/x.png" })).toBe(false);
    });
  });

  describe("createTextSearchPredicate", () => {
    it("matches substrings case-insensitively across listed fields", () => {
      type Item = { name: string; description: string };
      const predicate = createTextSearchPredicate<Item>("Damage", ["name", "description"]);
      expect(predicate({ name: "Damage tweak", description: "" })).toBe(true);
      expect(predicate({ name: "", description: "Boost damage by 20%" })).toBe(true);
      expect(predicate({ name: "Cooldown", description: "Seconds" })).toBe(false);
    });

    it("returns true for everything when query is empty", () => {
      const predicate = createTextSearchPredicate<{ a: string }>("  ", ["a"]);
      expect(predicate({ a: "anything" })).toBe(true);
    });
  });
});
