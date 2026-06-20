/**
 * Phase 3 Task 21 — Theme Variants helper.
 *
 * Manages the three Rebalance Studio theme variants (Light, AMOLED,
 * High-Contrast) plus the default dark theme. Applies a `data-theme`
 * attribute to `document.body` so the corresponding tokens-*.css overlay
 * activates. Persists the selected theme per workspace in localStorage.
 *
 * Usage:
 *
 *   import { applyTheme, loadTheme, getAvailableThemes } from './helpers/theme';
 *   const initial = loadTheme(workspaceRoot);
 *   applyTheme(initial, workspaceRoot);
 */

export type ThemeId = "default" | "light" | "amoled" | "high-contrast";

export interface ThemeOption {
  id: ThemeId;
  label: string;
  description: string;
}

const STORAGE_KEY = "rebalancebap.theme.v1";

const VALID_THEMES: readonly ThemeId[] = ["default", "light", "amoled", "high-contrast"];

const THEME_LABELS: Record<ThemeId, ThemeOption> = {
  default: {
    id: "default",
    label: "Default",
    description: "The standard dark Rebalance theme.",
  },
  light: {
    id: "light",
    label: "Light",
    description: "Cream paper-style theme for daytime / sunlit editing.",
  },
  amoled: {
    id: "amoled",
    label: "AMOLED",
    description: "True-black background designed for OLED panels.",
  },
  "high-contrast": {
    id: "high-contrast",
    label: "High Contrast",
    description: "Maximum legibility — WCAG AAA body text and bold borders.",
  },
};

function isValidTheme(value: unknown): value is ThemeId {
  return typeof value === "string" && (VALID_THEMES as readonly string[]).includes(value);
}

function safeStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    /* Sandboxed iframe / disabled storage. */
  }
  return null;
}

interface PersistedShape {
  /** Workspace-keyed theme map. `__default__` slot used when no workspace is supplied. */
  [workspaceRoot: string]: ThemeId;
}

const DEFAULT_SLOT = "__default__";

function readMap(): PersistedShape {
  const storage = safeStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const typed = parsed as Record<string, unknown>;
    const out: PersistedShape = {};
    for (const [k, v] of Object.entries(typed)) {
      if (isValidTheme(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(map: PersistedShape): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* Ignore quota / disabled storage. */
  }
}

/**
 * Returns the theme persisted for the given workspace, or `default`.
 * Falls back gracefully if localStorage is unavailable or contents are
 * corrupted.
 */
export function loadTheme(workspaceRoot?: string | null): ThemeId {
  const map = readMap();
  const slot = workspaceRoot && workspaceRoot.length > 0 ? workspaceRoot : DEFAULT_SLOT;
  const value = map[slot];
  return isValidTheme(value) ? value : "default";
}

/**
 * Persists and applies a theme. Sets `document.body.dataset.theme` so the
 * matching `tokens-*.css` overlay picks up. Passing `'default'` removes the
 * attribute so the base `:root` tokens drive again.
 */
export function applyTheme(theme: ThemeId, workspaceRoot?: string | null): void {
  if (!isValidTheme(theme)) {
    theme = "default";
  }

  // Persist
  const slot = workspaceRoot && workspaceRoot.length > 0 ? workspaceRoot : DEFAULT_SLOT;
  const map = readMap();
  if (theme === "default") {
    delete map[slot];
  } else {
    map[slot] = theme;
  }
  writeMap(map);

  // Apply
  if (typeof document === "undefined") return;
  if (theme === "default") {
    delete document.body.dataset.theme;
  } else {
    document.body.dataset.theme = theme;
  }
}

/**
 * List of theme options for selectors. Order is stable.
 */
export function getAvailableThemes(): ThemeOption[] {
  return VALID_THEMES.map((id) => THEME_LABELS[id]);
}

export const __TESTING__ = {
  STORAGE_KEY,
  DEFAULT_SLOT,
  readMap,
  writeMap,
  isValidTheme,
};
