/**
 * Phase 3 Task 16 — Saved & Recent Searches.
 *
 * Persists pinned searches plus a rolling list of recent searches per page in
 * localStorage. Pages access this through page-keyed APIs (e.g. "editor",
 * "gamemode", "library") so each page's chip row stays independent.
 *
 *   const pinned = loadSavedSearches("editor");           // SavedSearch[]
 *   saveSearch("editor", "damage", "Damage tweaks");      // append + persist
 *   removeSearch("editor", "damage");                     // remove
 *   const recent = loadRecentSearches("editor");          // string[]
 *   recordRecentSearch("editor", "fire");                 // append + truncate
 */

const SAVED_KEY = "rebalancebap.savedsearches.v1";
const RECENT_KEY = "rebalancebap.recentsearches.v1";

const RECENT_LIMIT = 5;
const SAVED_LIMIT = 30;

export interface SavedSearch {
  query: string;
  label?: string;
  savedAt: string;
}

interface SavedShape {
  [pageKey: string]: SavedSearch[];
}

interface RecentShape {
  [pageKey: string]: string[];
}

function safeStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    /* sandboxed iframe / disabled storage */
  }
  return null;
}

function readJson<T>(key: string, fallback: T): T {
  const storage = safeStorage();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / disabled */
  }
}

/* ============================================================================
   Saved (pinned) searches
   ============================================================================ */

export function loadSavedSearches(pageKey: string): SavedSearch[] {
  if (!pageKey) return [];
  const map = readJson<SavedShape>(SAVED_KEY, {});
  const list = map[pageKey];
  if (!Array.isArray(list)) return [];
  return list.filter(
    (entry): entry is SavedSearch =>
      Boolean(entry) && typeof entry === "object" && typeof (entry as SavedSearch).query === "string",
  );
}

export function saveSearch(pageKey: string, query: string, label?: string): SavedSearch[] {
  if (!pageKey || !query.trim()) return loadSavedSearches(pageKey);
  const map = readJson<SavedShape>(SAVED_KEY, {});
  const list = Array.isArray(map[pageKey]) ? map[pageKey] : [];
  const trimmed = query.trim();
  const filtered = list.filter((entry) => entry.query !== trimmed);
  filtered.push({ query: trimmed, label: label?.trim() || undefined, savedAt: new Date().toISOString() });
  while (filtered.length > SAVED_LIMIT) filtered.shift();
  map[pageKey] = filtered;
  writeJson(SAVED_KEY, map);
  return filtered;
}

export function removeSearch(pageKey: string, query: string): SavedSearch[] {
  if (!pageKey) return [];
  const map = readJson<SavedShape>(SAVED_KEY, {});
  const list = Array.isArray(map[pageKey]) ? map[pageKey] : [];
  const filtered = list.filter((entry) => entry.query !== query);
  if (filtered.length === 0) {
    delete map[pageKey];
  } else {
    map[pageKey] = filtered;
  }
  writeJson(SAVED_KEY, map);
  return filtered;
}

export function clearSavedSearches(pageKey?: string): void {
  if (!pageKey) {
    writeJson(SAVED_KEY, {});
    return;
  }
  const map = readJson<SavedShape>(SAVED_KEY, {});
  delete map[pageKey];
  writeJson(SAVED_KEY, map);
}

/* ============================================================================
   Recent searches
   ============================================================================ */

export function loadRecentSearches(pageKey: string, limit = RECENT_LIMIT): string[] {
  if (!pageKey) return [];
  const map = readJson<RecentShape>(RECENT_KEY, {});
  const list = map[pageKey];
  if (!Array.isArray(list)) return [];
  return list.filter((s): s is string => typeof s === "string").slice(0, limit);
}

export function recordRecentSearch(pageKey: string, query: string, limit = RECENT_LIMIT): string[] {
  if (!pageKey || !query.trim()) return loadRecentSearches(pageKey, limit);
  const trimmed = query.trim();
  const map = readJson<RecentShape>(RECENT_KEY, {});
  const list = Array.isArray(map[pageKey]) ? map[pageKey] : [];
  const filtered = [trimmed, ...list.filter((s) => s !== trimmed)].slice(0, limit);
  map[pageKey] = filtered;
  writeJson(RECENT_KEY, map);
  return filtered;
}

export function clearRecentSearches(pageKey?: string): void {
  if (!pageKey) {
    writeJson(RECENT_KEY, {});
    return;
  }
  const map = readJson<RecentShape>(RECENT_KEY, {});
  delete map[pageKey];
  writeJson(RECENT_KEY, map);
}

export const __TESTING__ = {
  SAVED_KEY,
  RECENT_KEY,
  RECENT_LIMIT,
  SAVED_LIMIT,
};
