/**
 * Multi-Select foundations — Phase 3 Task 13.
 *
 * Provides a small, well-typed state machine for "select many fields/files/blocks"
 * interactions across Rebalance Studio (Editor, Library, Packs, etc.).
 *
 * Two layers:
 *   1. `multiSelectReducer` — pure, framework-agnostic. Easy to unit test
 *      without React. Each action returns a brand-new `Set<T>` so consumers
 *      can rely on referential change detection.
 *   2. `useMultiSelect` — React hook that wraps the reducer in `useState`
 *      with stable callback identities (useCallback + functional setState)
 *      so it can be passed deep into memoised lists without thrashing.
 *
 * The hook intentionally keeps the surface narrow:
 *   - id-based, generic over `T extends string`
 *   - exposes both per-id (`add`, `remove`, `toggle`, `isSelected`) and
 *     bulk operations (`addMany`, `removeMany`, `selectAll`, `clear`)
 *   - exposes `count`, `hasSelection`, `isAllSelected(allIds)` for toolbar
 *     visibility checks (e.g. show <BulkActionToolbar /> when count >= 2).
 */

import { useCallback, useState } from "react";

/* ============================================================================
   Reducer-style state machine — pure, testable without React
   ============================================================================ */

export type MultiSelectAction<T extends string> =
  | { type: "add"; payload: T }
  | { type: "remove"; payload: T }
  | { type: "toggle"; payload: T }
  | { type: "addMany"; payload: readonly T[] }
  | { type: "removeMany"; payload: readonly T[] }
  | { type: "clear" }
  | { type: "selectAll"; payload: readonly T[] };

/**
 * Pure reducer for multi-select state. Every dispatch returns a freshly
 * allocated `Set<T>` so callers can rely on `prev !== next` for change
 * detection — even when the contents are identical (e.g. a no-op `add`
 * of an already-selected id).
 */
export function multiSelectReducer<T extends string>(
    state: ReadonlySet<T>,
    action: MultiSelectAction<T>,
): Set<T> {
    switch (action.type) {
        case "add": {
            const next = new Set(state);
            next.add(action.payload);
            return next;
        }
        case "remove": {
            const next = new Set(state);
            next.delete(action.payload);
            return next;
        }
        case "toggle": {
            const next = new Set(state);
            if (next.has(action.payload)) {
                next.delete(action.payload);
            } else {
                next.add(action.payload);
            }
            return next;
        }
        case "addMany": {
            const next = new Set(state);
            for (const id of action.payload) {
                next.add(id);
            }
            return next;
        }
        case "removeMany": {
            const next = new Set(state);
            for (const id of action.payload) {
                next.delete(id);
            }
            return next;
        }
        case "clear": {
            return new Set();
        }
        case "selectAll": {
            return new Set(action.payload);
        }
    }
}

/* ============================================================================
   useMultiSelect — React hook with stable callback identities
   ============================================================================ */

export interface UseMultiSelectResult<T extends string> {
    /** Snapshot of currently selected ids. Treat as read-only. */
    readonly selected: Set<T>;
    /** Cheap membership test. */
    isSelected: (id: T) => boolean;
    add: (id: T) => void;
    remove: (id: T) => void;
    /** Add the id if missing, remove it if present. */
    toggle: (id: T) => void;
    addMany: (ids: readonly T[]) => void;
    removeMany: (ids: readonly T[]) => void;
    /** Empty the selection. */
    clear: () => void;
    /** Replace the selection with exactly `allIds`. */
    selectAll: (allIds: readonly T[]) => void;
    /** Number of selected ids. */
    count: number;
    /** `count > 0` — convenient for conditional UI. */
    hasSelection: boolean;
    /**
     * `true` when every id in `allIds` is selected.
     * Returns `false` when `allIds` is empty so an empty list is never
     * mistaken for a "fully selected" state.
     */
    isAllSelected: (allIds: readonly T[]) => boolean;
}

/**
 * React hook backing the bulk-edit experience.
 *
 * - `selected` is a `Set<T>` that changes referentially on every mutation,
 *   so memoised consumers re-render correctly.
 * - All mutation callbacks are stable across renders (empty `useCallback`
 *   deps + functional `setState`), so they can be passed to deeply memoised
 *   lists without invalidating their props.
 */
export function useMultiSelect<T extends string>(
    initial?: Iterable<T>,
): UseMultiSelectResult<T> {
    const [selected, setSelected] = useState<Set<T>>(() => new Set(initial ?? []));

    const isSelected = useCallback(
        (id: T) => selected.has(id),
        [selected],
    );

    const add = useCallback((id: T) => {
        setSelected(prev => multiSelectReducer(prev, { type: "add", payload: id }));
    }, []);

    const remove = useCallback((id: T) => {
        setSelected(prev => multiSelectReducer(prev, { type: "remove", payload: id }));
    }, []);

    const toggle = useCallback((id: T) => {
        setSelected(prev => multiSelectReducer(prev, { type: "toggle", payload: id }));
    }, []);

    const addMany = useCallback((ids: readonly T[]) => {
        setSelected(prev => multiSelectReducer(prev, { type: "addMany", payload: ids }));
    }, []);

    const removeMany = useCallback((ids: readonly T[]) => {
        setSelected(prev => multiSelectReducer(prev, { type: "removeMany", payload: ids }));
    }, []);

    const clear = useCallback(() => {
        setSelected(prev => multiSelectReducer(prev, { type: "clear" }));
    }, []);

    const selectAll = useCallback((allIds: readonly T[]) => {
        setSelected(prev => multiSelectReducer(prev, { type: "selectAll", payload: allIds }));
    }, []);

    const isAllSelected = useCallback(
        (allIds: readonly T[]) => {
            if (allIds.length === 0) return false;
            for (const id of allIds) {
                if (!selected.has(id)) return false;
            }
            return true;
        },
        [selected],
    );

    return {
        selected,
        isSelected,
        add,
        remove,
        toggle,
        addMany,
        removeMany,
        clear,
        selectAll,
        count: selected.size,
        hasSelection: selected.size > 0,
        isAllSelected,
    };
}
