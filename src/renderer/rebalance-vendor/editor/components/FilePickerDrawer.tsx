import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CTA, EMPTY_STATES, SEARCH_PLACEHOLDERS } from "../copy";

/**
 * Phase 3 Task 12 — FilePickerDrawer.
 *
 * Right-anchored drawer (rendered via React portal) for picking a file from a
 * list. Generic over T so callers can pass enriched item shapes without
 * losing type-safety on the selection callback.
 *
 * Layout:
 *   [Header: 'Choose a file' + Close]
 *   [Search input]
 *   [Group chip row — 'All' + each group] (optional)
 *   [Sticky active item — pinned when activeId matches]
 *   [Filtered list — query + group filtered]
 *
 * Interaction:
 *   - Escape  → onClose
 *   - Backdrop click → onClose
 *   - Row click → onSelectItem(id) AND onClose
 *
 * Theming uses CSS variables only; no hard-coded green/teal hues.
 */

export interface FilePickerItem {
  id: string;
  label: string;
  group?: string;
  subtitle?: string;
}

export interface FilePickerDrawerProps<T extends FilePickerItem> {
  open: boolean;
  items: T[];
  activeId?: string | null;
  groupOptions?: string[];
  activeGroup?: string | null;
  onSelectGroup?: (group: string | null) => void;
  onSelectItem: (id: string) => void;
  onClose: () => void;
}

export function FilePickerDrawer<T extends FilePickerItem>({
  open,
  items,
  activeId = null,
  groupOptions,
  activeGroup = null,
  onSelectGroup,
  onSelectItem,
  onClose,
}: FilePickerDrawerProps<T>): React.ReactElement | null {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset query whenever the drawer transitions to open and focus the input.
  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    const handle = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(handle);
  }, [open]);

  // Escape closes
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const activeItem = useMemo(
    () => (activeId ? items.find((i) => i.id === activeId) ?? null : null),
    [items, activeId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (activeGroup && item.group !== activeGroup) return false;
      if (q && !item.label.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, activeGroup]);

  const handleSelect = useCallback(
    (id: string) => {
      onSelectItem(id);
      onClose();
    },
    [onSelectItem, onClose],
  );

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="rebalance-file-picker-backdrop"
      data-testid="file-picker-drawer-backdrop"
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.45)",
        zIndex: 1000,
      }}
    >
      <aside
        className="rebalance-file-picker-drawer"
        data-testid="file-picker-drawer"
        role="dialog"
        aria-label="Choose a file"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(420px, 90vw)",
          background: "var(--bg-1, #070911)",
          borderLeft: "1px solid var(--line, rgba(40,52,86,0.4))",
          padding: "20px 22px",
          overflowY: "auto",
          color: "var(--text, #f8fafc)",
          boxShadow: "var(--shadow-xl, 0 16px 48px rgba(0,0,0,0.4))",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Choose a file</h2>
          <button
            type="button"
            data-rebalance-pressable="true"
            data-testid="file-picker-close"
            onClick={onClose}
            aria-label={CTA.close}
            style={{
              background: "transparent",
              color: "inherit",
              border: "1px solid var(--line, rgba(40,52,86,0.4))",
              borderRadius: 6,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            {CTA.close}
          </button>
        </header>

        <input
          ref={inputRef}
          type="search"
          data-testid="file-picker-search"
          data-rebalance-pressable="true"
          aria-label="Search files"
          placeholder={SEARCH_PLACEHOLDERS.files}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          style={{
            background: "var(--bg-2, #0c1020)",
            color: "var(--text, #f8fafc)",
            border: "1px solid var(--line, rgba(40,52,86,0.4))",
            borderRadius: 6,
            padding: "8px 10px",
            fontSize: 13,
          }}
        />

        {groupOptions && groupOptions.length > 0 ? (
          <div
            role="group"
            aria-label="Filter by group"
            style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
          >
            <button
              type="button"
              data-rebalance-pressable="true"
              data-testid="file-picker-group-all"
              aria-pressed={!activeGroup}
              onClick={() => onSelectGroup?.(null)}
              style={chipStyle(!activeGroup)}
            >
              All
            </button>
            {groupOptions.map((group) => {
              const active = activeGroup === group;
              return (
                <button
                  key={group}
                  type="button"
                  data-rebalance-pressable="true"
                  data-testid={`file-picker-group-${group}`}
                  aria-pressed={active}
                  onClick={() => onSelectGroup?.(group)}
                  style={chipStyle(active)}
                >
                  {group}
                </button>
              );
            })}
          </div>
        ) : null}

        <ul
          data-testid="file-picker-list"
          aria-label="Files"
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 0,
          }}
        >
          {activeItem ? (
            <li
              style={{
                position: "sticky",
                top: 0,
                background: "var(--bg-1, #070911)",
                borderBottom: "1px solid var(--line, rgba(40,52,86,0.4))",
                paddingBottom: 6,
                marginBottom: 4,
                zIndex: 1,
              }}
            >
              <button
                type="button"
                data-rebalance-pressable="true"
                data-testid={`file-picker-row-${activeItem.id}`}
                aria-current="true"
                onClick={() => handleSelect(activeItem.id)}
                style={rowStyle(true)}
              >
                <span style={{ fontWeight: 600 }}>{activeItem.label}</span>
                {activeItem.subtitle ? (
                  <span style={subtitleStyle}>{activeItem.subtitle}</span>
                ) : null}
              </button>
            </li>
          ) : null}

          {filtered.length === 0 ? (
            <li>
              <p
                data-testid="file-picker-empty"
                style={{
                  color: "var(--text-muted, #94a3b8)",
                  fontSize: 13,
                  margin: "12px 0",
                }}
              >
                {EMPTY_STATES.noFilesMatch}
              </p>
            </li>
          ) : null}

          {filtered.map((item) => {
            // Skip rendering the active item again — it is already pinned.
            if (activeItem && item.id === activeItem.id) return null;
            return (
              <li key={item.id} style={{ marginTop: 4 }}>
                <button
                  type="button"
                  data-rebalance-pressable="true"
                  data-testid={`file-picker-row-${item.id}`}
                  onClick={() => handleSelect(item.id)}
                  style={rowStyle(false)}
                >
                  <span>{item.label}</span>
                  {item.subtitle ? (
                    <span style={subtitleStyle}>{item.subtitle}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>,
    document.body,
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "var(--bg-3, rgba(99,102,241,0.15))" : "transparent",
    color: active ? "var(--text, #f8fafc)" : "var(--text-muted, #94a3b8)",
    border: `1px solid ${
      active ? "var(--accent, rgba(99,102,241,0.45))" : "var(--line, rgba(40,52,86,0.4))"
    }`,
    borderRadius: 999,
    padding: "4px 12px",
    cursor: "pointer",
    fontSize: 12,
  };
}

function rowStyle(active: boolean): React.CSSProperties {
  return {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
    background: active ? "rgba(99, 102, 241, 0.10)" : "transparent",
    border: `1px solid ${
      active ? "rgba(99, 102, 241, 0.45)" : "var(--line, rgba(40,52,86,0.4))"
    }`,
    borderRadius: 6,
    padding: "8px 12px",
    color: "inherit",
    cursor: "pointer",
    textAlign: "left",
    fontSize: 13,
  };
}

const subtitleStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted, #94a3b8)",
};
