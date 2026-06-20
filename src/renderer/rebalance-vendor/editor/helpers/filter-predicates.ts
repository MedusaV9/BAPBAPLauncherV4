/**
 * Phase 3 Task 16 — Composable filter predicates for Smart Filters.
 *
 * The chip row above lists in EditorPage / GameModePage / AddLibraryPage
 * applies ANDed combinations of these predicates. They are deliberately
 * generic so a single library-of-predicates serves every list type — they
 * just look at duck-typed shape (`hasOverride`, `iconPreviewPath`,
 * `currentValue`, etc.).
 */

export type SmartFilterId =
  | "modified-only"
  | "has-overrides"
  | "recently-changed"
  | "has-icon"
  | "empty-values";

/**
 * Anything carrying the fields a smart filter might inspect. Keep the
 * required shape narrow by making everything optional — callers shape-cast
 * their items into this minimal contract before filtering.
 */
export interface FilterableItem {
  hasOverride?: boolean;
  isModified?: boolean;
  modifiedAt?: string | number;
  iconPreviewPath?: string | null;
  iconPath?: string | null;
  icon?: { path?: string | null } | null;
  currentValue?: unknown;
  value?: unknown;
}

export type Predicate<T> = (item: T) => boolean;

/* ============================================================================
   Individual smart filters
   ============================================================================ */

export function isModifiedOnly<T extends FilterableItem>(item: T): boolean {
  if (typeof item.isModified === "boolean") return item.isModified;
  if (typeof item.hasOverride === "boolean") return item.hasOverride;
  return false;
}

export function hasOverridesPredicate<T extends FilterableItem>(item: T): boolean {
  return Boolean(item.hasOverride);
}

/**
 * Recently-changed: items whose modifiedAt timestamp falls within the last
 * `withinMs` milliseconds of `now`. Defaults to 24h.
 */
export function isRecentlyChangedFactory(
  withinMs = 24 * 60 * 60 * 1000,
  now: () => number = () => Date.now(),
): Predicate<FilterableItem> {
  return (item) => {
    const ts = item.modifiedAt;
    if (ts === undefined || ts === null) return false;
    const t = typeof ts === "number" ? ts : Date.parse(String(ts));
    if (!Number.isFinite(t)) return false;
    return now() - t <= withinMs;
  };
}

export function hasIcon<T extends FilterableItem>(item: T): boolean {
  if (typeof item.iconPreviewPath === "string" && item.iconPreviewPath.trim().length > 0) return true;
  if (typeof item.iconPath === "string" && item.iconPath.trim().length > 0) return true;
  if (item.icon && typeof item.icon.path === "string" && item.icon.path.trim().length > 0) return true;
  return false;
}

export function hasEmptyValue<T extends FilterableItem>(item: T): boolean {
  const value = item.currentValue ?? item.value;
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.trim().length === 0) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === "object" && Object.keys(value as Record<string, unknown>).length === 0) return true;
  return false;
}

/* ============================================================================
   Composer
   ============================================================================ */

/**
 * AND-composes the supplied predicates. Returns `true` if every predicate
 * returns truthy. An empty list passes through everything.
 */
export function composeFilters<T>(predicates: ReadonlyArray<Predicate<T>>): Predicate<T> {
  if (predicates.length === 0) {
    return () => true;
  }
  return (item) => {
    for (const predicate of predicates) {
      if (!predicate(item)) return false;
    }
    return true;
  };
}

/* ============================================================================
   Public registry — used by SmartFilterChips
   ============================================================================ */

export interface SmartFilterRegistry<T extends FilterableItem> {
  /** Builds a predicate for the given filter id, or `null` for unknown ids. */
  build(id: SmartFilterId): Predicate<T> | null;
  /** Composes the union of all active filter ids into a single predicate. */
  buildActive(active: ReadonlySet<SmartFilterId>): Predicate<T>;
}

export function createSmartFilterRegistry<T extends FilterableItem>(
  options: { now?: () => number; recentlyChangedWindowMs?: number } = {},
): SmartFilterRegistry<T> {
  const recentPredicate = isRecentlyChangedFactory(
    options.recentlyChangedWindowMs ?? 24 * 60 * 60 * 1000,
    options.now,
  ) as Predicate<T>;

  function build(id: SmartFilterId): Predicate<T> | null {
    switch (id) {
      case "modified-only":
        return isModifiedOnly as Predicate<T>;
      case "has-overrides":
        return hasOverridesPredicate as Predicate<T>;
      case "recently-changed":
        return recentPredicate;
      case "has-icon":
        return hasIcon as Predicate<T>;
      case "empty-values":
        return hasEmptyValue as Predicate<T>;
      default:
        return null;
    }
  }

  function buildActive(active: ReadonlySet<SmartFilterId>): Predicate<T> {
    const list: Array<Predicate<T>> = [];
    for (const id of active) {
      const predicate = build(id);
      if (predicate) list.push(predicate);
    }
    return composeFilters(list);
  }

  return { build, buildActive };
}

/* ============================================================================
   String search predicate
   ============================================================================ */

/**
 * Lightweight text-search predicate factory. Lower-cases query and tests against
 * a list of fields (defaults to common ones). Used alongside smart filters.
 */
export function createTextSearchPredicate<T extends Record<string, unknown>>(
  query: string,
  fields: ReadonlyArray<keyof T>,
): Predicate<T> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return () => true;
  return (item) => {
    for (const field of fields) {
      const value = item[field];
      if (typeof value === "string" && value.toLowerCase().includes(trimmed)) {
        return true;
      }
    }
    return false;
  };
}
