// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __TESTING__,
  applyTheme,
  getAvailableThemes,
  loadTheme,
} from "./theme";

const STORAGE_KEY = __TESTING__.STORAGE_KEY;

beforeEach(() => {
  if (typeof window !== "undefined") {
    window.localStorage.clear();
    delete document.body.dataset.theme;
  }
});

afterEach(() => {
  if (typeof window !== "undefined") {
    window.localStorage.clear();
    delete document.body.dataset.theme;
  }
});

describe("theme helper (Phase 3 Task 21)", () => {
  describe("applyTheme", () => {
    it("sets data-theme on body for non-default themes", () => {
      applyTheme("amoled");
      expect(document.body.dataset.theme).toBe("amoled");
    });

    it("removes data-theme for default theme", () => {
      document.body.dataset.theme = "amoled";
      applyTheme("default");
      expect(document.body.dataset.theme).toBeUndefined();
    });

    it("persists the chosen theme to localStorage", () => {
      applyTheme("light", "/workspaces/standard");
      const raw = window.localStorage.getItem(STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed["/workspaces/standard"]).toBe("light");
    });

    it("does not store default theme (empty slot in storage)", () => {
      applyTheme("light", "/ws");
      applyTheme("default", "/ws");
      const raw = window.localStorage.getItem(STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed["/ws"]).toBeUndefined();
    });

    it("falls back to default for invalid theme ids", () => {
      // @ts-expect-error — testing runtime guard
      applyTheme("rainbow");
      expect(document.body.dataset.theme).toBeUndefined();
    });

    it("isolates themes by workspace root", () => {
      applyTheme("amoled", "/wsA");
      applyTheme("light", "/wsB");
      const raw = window.localStorage.getItem(STORAGE_KEY)!;
      const parsed = JSON.parse(raw);
      expect(parsed["/wsA"]).toBe("amoled");
      expect(parsed["/wsB"]).toBe("light");
    });

    it("falls back to default slot when no workspace supplied", () => {
      applyTheme("high-contrast");
      const raw = window.localStorage.getItem(STORAGE_KEY)!;
      const parsed = JSON.parse(raw);
      expect(parsed[__TESTING__.DEFAULT_SLOT]).toBe("high-contrast");
    });
  });

  describe("loadTheme", () => {
    it("returns 'default' when nothing is persisted", () => {
      expect(loadTheme("/ws")).toBe("default");
    });

    it("reads the persisted theme for a given workspace", () => {
      applyTheme("amoled", "/ws");
      expect(loadTheme("/ws")).toBe("amoled");
    });

    it("returns 'default' for unknown workspaces", () => {
      applyTheme("amoled", "/wsA");
      expect(loadTheme("/wsB")).toBe("default");
    });

    it("falls back to default when storage holds an invalid value", () => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ "/ws": "neon-pink" }),
      );
      expect(loadTheme("/ws")).toBe("default");
    });

    it("falls back to default when storage holds malformed JSON", () => {
      window.localStorage.setItem(STORAGE_KEY, "{not json");
      expect(loadTheme("/ws")).toBe("default");
    });

    it("uses the default slot when no workspace supplied", () => {
      applyTheme("light");
      expect(loadTheme()).toBe("light");
    });
  });

  describe("getAvailableThemes", () => {
    it("returns all four theme options in stable order", () => {
      const themes = getAvailableThemes();
      expect(themes).toHaveLength(4);
      expect(themes.map((t) => t.id)).toEqual(["default", "light", "amoled", "high-contrast"]);
    });

    it("each option has label + description", () => {
      const themes = getAvailableThemes();
      for (const t of themes) {
        expect(t.label.length).toBeGreaterThan(0);
        expect(t.description.length).toBeGreaterThan(10);
      }
    });
  });
});
