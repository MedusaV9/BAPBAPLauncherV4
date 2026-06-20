import React from "react";
import type { SmartFilterId } from "../helpers/filter-predicates";
import type { SavedSearch } from "../helpers/saved-searches";
import { SMART_FILTERS } from "../copy";

/**
 * Phase 3 Task 16 — SmartFilterChips.
 *
 * Renders a chip row above field/file lists. Each chip is a toggleable
 * smart-filter (Modified only, Has overrides, etc.) plus optional saved
 * search chips with X to remove. Designed to sit above any list and emit
 * onToggle / onRemoveSavedSearch events.
 */

export interface SmartFilterChipsProps {
  activeFilters: ReadonlySet<SmartFilterId>;
  onToggle: (id: SmartFilterId) => void;
  savedSearches?: SavedSearch[];
  onRemoveSavedSearch?: (query: string) => void;
  onApplySavedSearch?: (query: string) => void;
}

const SMART_FILTER_ORDER: ReadonlyArray<{ id: SmartFilterId; label: string }> = [
  { id: "modified-only", label: SMART_FILTERS.modifiedOnly },
  { id: "has-overrides", label: SMART_FILTERS.hasOverrides },
  { id: "recently-changed", label: SMART_FILTERS.recentlyChanged },
  { id: "has-icon", label: SMART_FILTERS.hasIcon },
  { id: "empty-values", label: SMART_FILTERS.emptyValues },
];

export function SmartFilterChips({
  activeFilters,
  onToggle,
  savedSearches = [],
  onRemoveSavedSearch,
  onApplySavedSearch,
}: SmartFilterChipsProps): React.ReactElement {
  return (
    <div
      role="toolbar"
      aria-label="Smart filters"
      data-testid="rebalance-smart-filter-chips"
      className="task-segmented"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        alignItems: "center",
      }}
    >
      {SMART_FILTER_ORDER.map(({ id, label }) => {
        const active = activeFilters.has(id);
        return (
          <button
            key={id}
            type="button"
            data-rebalance-pressable="true"
            data-testid={`smart-filter-${id}`}
            data-active={active || undefined}
            aria-pressed={active}
            onClick={() => onToggle(id)}
            style={chipStyle(active)}
          >
            {label}
          </button>
        );
      })}

      {savedSearches.length > 0 ? (
        <span
          aria-hidden="true"
          style={{
            width: 1,
            height: 16,
            background: "var(--line, rgba(40,52,86,0.4))",
            margin: "0 4px",
          }}
        />
      ) : null}

      {savedSearches.map((entry) => (
        <span
          key={entry.query}
          data-testid={`saved-search-${entry.query}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            background: "rgba(245, 158, 11, 0.10)",
            border: "1px solid rgba(245, 158, 11, 0.45)",
            borderRadius: 999,
            padding: "2px 8px",
            fontSize: 12,
            color: "var(--text, #f8fafc)",
          }}
        >
          <button
            type="button"
            data-rebalance-pressable="true"
            onClick={() => onApplySavedSearch?.(entry.query)}
            aria-label={`Apply saved search: ${entry.label ?? entry.query}`}
            style={{
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: onApplySavedSearch ? "pointer" : "default",
              fontSize: "inherit",
              padding: 0,
            }}
          >
            {entry.label ?? entry.query}
          </button>
          {onRemoveSavedSearch ? (
            <button
              type="button"
              data-rebalance-pressable="true"
              data-testid={`saved-search-remove-${entry.query}`}
              aria-label={`Remove saved search: ${entry.label ?? entry.query}`}
              onClick={() => onRemoveSavedSearch(entry.query)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted, #94a3b8)",
                cursor: "pointer",
                padding: "0 2px",
                fontSize: 12,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          ) : null}
        </span>
      ))}
    </div>
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    background: active ? "rgba(99, 102, 241, 0.15)" : "transparent",
    border: `1px solid ${active ? "rgba(99, 102, 241, 0.55)" : "var(--line, rgba(40,52,86,0.4))"}`,
    borderRadius: 999,
    padding: "3px 10px",
    fontSize: 12,
    color: active ? "var(--text, #f8fafc)" : "var(--text-muted, #94a3b8)",
    cursor: "pointer",
  };
}
