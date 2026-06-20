// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __TESTING__,
  clearRecentSearches,
  clearSavedSearches,
  loadRecentSearches,
  loadSavedSearches,
  recordRecentSearch,
  removeSearch,
  saveSearch,
} from "./saved-searches";

beforeEach(() => {
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

afterEach(() => {
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

describe("saved-searches (Phase 3 Task 16)", () => {
  describe("saveSearch / loadSavedSearches", () => {
    it("returns empty list when nothing is persisted", () => {
      expect(loadSavedSearches("editor")).toEqual([]);
    });

    it("persists and reloads a saved search", () => {
      saveSearch("editor", "damage", "Damage tweaks");
      const list = loadSavedSearches("editor");
      expect(list).toHaveLength(1);
      expect(list[0].query).toBe("damage");
      expect(list[0].label).toBe("Damage tweaks");
      expect(list[0].savedAt).toMatch(/T/);
    });

    it("dedupes by query — re-saving updates the entry", () => {
      saveSearch("editor", "damage", "Old");
      saveSearch("editor", "damage", "New");
      const list = loadSavedSearches("editor");
      expect(list).toHaveLength(1);
      expect(list[0].label).toBe("New");
    });

    it("isolates pages from each other", () => {
      saveSearch("editor", "damage");
      saveSearch("gamemode", "rules");
      expect(loadSavedSearches("editor").map((s) => s.query)).toEqual(["damage"]);
      expect(loadSavedSearches("gamemode").map((s) => s.query)).toEqual(["rules"]);
    });

    it("ignores empty queries", () => {
      saveSearch("editor", "");
      saveSearch("editor", "   ");
      expect(loadSavedSearches("editor")).toEqual([]);
    });

    it("trims whitespace", () => {
      saveSearch("editor", "  damage  ");
      expect(loadSavedSearches("editor")[0].query).toBe("damage");
    });

    it("respects the per-page saved limit", () => {
      for (let i = 0; i < __TESTING__.SAVED_LIMIT + 5; i++) {
        saveSearch("editor", `q${i}`);
      }
      expect(loadSavedSearches("editor").length).toBe(__TESTING__.SAVED_LIMIT);
    });
  });

  describe("removeSearch", () => {
    it("removes the matching query", () => {
      saveSearch("editor", "damage");
      saveSearch("editor", "fire");
      const after = removeSearch("editor", "damage");
      expect(after.map((s) => s.query)).toEqual(["fire"]);
    });

    it("clears the page entry when the last query is removed", () => {
      saveSearch("editor", "damage");
      removeSearch("editor", "damage");
      const raw = window.localStorage.getItem(__TESTING__.SAVED_KEY)!;
      const parsed = JSON.parse(raw);
      expect(parsed.editor).toBeUndefined();
    });
  });

  describe("clearSavedSearches", () => {
    it("clears one page", () => {
      saveSearch("editor", "damage");
      saveSearch("gamemode", "rules");
      clearSavedSearches("editor");
      expect(loadSavedSearches("editor")).toEqual([]);
      expect(loadSavedSearches("gamemode")).toHaveLength(1);
    });

    it("clears everything when called without page key", () => {
      saveSearch("editor", "damage");
      saveSearch("gamemode", "rules");
      clearSavedSearches();
      expect(loadSavedSearches("editor")).toEqual([]);
      expect(loadSavedSearches("gamemode")).toEqual([]);
    });
  });

  describe("recent searches", () => {
    it("starts empty", () => {
      expect(loadRecentSearches("editor")).toEqual([]);
    });

    it("records recent in MRU order, deduped", () => {
      recordRecentSearch("editor", "fire");
      recordRecentSearch("editor", "damage");
      recordRecentSearch("editor", "fire");
      expect(loadRecentSearches("editor")).toEqual(["fire", "damage"]);
    });

    it("respects the limit parameter", () => {
      for (let i = 0; i < 10; i++) {
        recordRecentSearch("editor", `q${i}`);
      }
      const recent = loadRecentSearches("editor", 3);
      expect(recent).toHaveLength(3);
      expect(recent[0]).toBe("q9");
    });

    it("ignores empty inputs", () => {
      recordRecentSearch("editor", "");
      expect(loadRecentSearches("editor")).toEqual([]);
    });

    it("isolates pages", () => {
      recordRecentSearch("editor", "fire");
      recordRecentSearch("gamemode", "rules");
      expect(loadRecentSearches("editor")).toEqual(["fire"]);
      expect(loadRecentSearches("gamemode")).toEqual(["rules"]);
    });

    it("clears recent searches per page or globally", () => {
      recordRecentSearch("editor", "fire");
      recordRecentSearch("gamemode", "rules");
      clearRecentSearches("editor");
      expect(loadRecentSearches("editor")).toEqual([]);
      expect(loadRecentSearches("gamemode")).toEqual(["rules"]);
      clearRecentSearches();
      expect(loadRecentSearches("gamemode")).toEqual([]);
    });
  });
});
