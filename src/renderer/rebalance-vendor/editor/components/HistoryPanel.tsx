import React, { useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { DiffEngine, HistoryEntry } from "../../data/DiffEngine";
import { CTA, EMPTY_STATES } from "../copy";

/**
 * Phase 3 Task 14 — HistoryPanel.
 *
 * Drawer-style component that visualises the DiffEngine history stack and
 * lets users undo/redo, clear, or jump to any previous state.
 *
 * Rendered via React portal so the absolute positioning is unaffected by
 * transformed ancestors. Uses CSS variables for theming so all 4 themes
 * (default / light / amoled / high-contrast) skin it correctly.
 */

export interface HistoryPanelProps {
  open: boolean;
  engine: DiffEngine;
  /** When provided, only entries for this docPath are rendered. */
  docPath?: string | null;
  /** Maximum number of entries shown. Defaults to 50. */
  maxEntries?: number;
  onClose: () => void;
}

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diffMs = Date.now() - t;
  if (diffMs < 0) return "just now";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 30) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function summariseEntry(entry: HistoryEntry): string {
  const fileName = entry.docPath.split(/[\\/]/).pop() || entry.docPath;
  if (entry.fieldPath === "*") return `Reset ${fileName}`;
  return entry.label || `Edit ${entry.fieldPath} in ${fileName}`;
}

export function HistoryPanel({
  open,
  engine,
  docPath = null,
  maxEntries = 50,
  onClose,
}: HistoryPanelProps): React.ReactElement | null {
  const [tick, setTick] = React.useState(0);

  // Re-render whenever the engine notifies of history change.
  useEffect(() => {
    return engine.onHistoryChange(() => setTick((n) => n + 1));
  }, [engine]);

  // Read fresh history each render.
  const past = useMemo(() => {
    void tick;
    let entries = engine.getHistory();
    if (docPath) entries = entries.filter((e) => e.docPath === docPath);
    return entries.slice(-maxEntries).reverse(); // newest first
  }, [engine, docPath, maxEntries, tick]);

  const future = useMemo(() => {
    void tick;
    let entries = [...engine.history.future];
    if (docPath) entries = entries.filter((e) => e.docPath === docPath);
    return entries.slice(0, maxEntries);
  }, [engine, docPath, maxEntries, tick]);

  // Escape closes
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleUndo = useCallback(() => engine.undo(), [engine]);
  const handleRedo = useCallback(() => engine.redo(), [engine]);
  const handleClear = useCallback(() => engine.clearHistory(), [engine]);
  const handleJump = useCallback((id: string) => engine.jumpTo(id), [engine]);

  if (!open || typeof document === "undefined") return null;

  const hasAny = past.length > 0 || future.length > 0;

  return createPortal(
    <div
      className="rebalance-history-panel-backdrop"
      data-testid="rebalance-history-panel-backdrop"
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
        className="rebalance-history-panel"
        data-testid="rebalance-history-panel"
        role="dialog"
        aria-label="History panel"
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
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>History</h2>
          <button
            type="button"
            data-rebalance-pressable="true"
            onClick={onClose}
            aria-label="Close history panel"
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

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            data-rebalance-pressable="true"
            data-testid="history-undo"
            onClick={handleUndo}
            disabled={past.length === 0}
            style={ctaButtonStyle(past.length > 0)}
          >
            {CTA.undo}
          </button>
          <button
            type="button"
            data-rebalance-pressable="true"
            data-testid="history-redo"
            onClick={handleRedo}
            disabled={future.length === 0}
            style={ctaButtonStyle(future.length > 0)}
          >
            {CTA.redo}
          </button>
          <button
            type="button"
            data-rebalance-pressable="true"
            data-testid="history-clear"
            onClick={handleClear}
            disabled={!hasAny}
            style={ctaButtonStyle(hasAny)}
          >
            Clear history
          </button>
        </div>

        {hasAny ? null : (
          <p
            data-testid="history-empty"
            style={{ color: "var(--text-muted, #94a3b8)", fontSize: 13, marginTop: 4 }}
          >
            {EMPTY_STATES.noHistoryYet}
          </p>
        )}

        {future.length > 0 ? (
          <section data-testid="history-future-list" aria-label="Redo entries">
            <h3 style={sectionHeaderStyle}>Redo</h3>
            <ul style={listStyle}>
              {future.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    data-rebalance-pressable="true"
                    data-testid={`history-jump-${entry.id}`}
                    onClick={() => handleJump(entry.id)}
                    style={entryButtonStyle(false)}
                  >
                    <span style={{ color: "var(--accent-warm, #f59e0b)", fontWeight: 600 }}>
                      ↷
                    </span>
                    <span style={{ flex: 1, textAlign: "left" }}>{summariseEntry(entry)}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted, #94a3b8)" }}>
                      {relativeTime(entry.timestamp)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {past.length > 0 ? (
          <section data-testid="history-past-list" aria-label="Past entries">
            <h3 style={sectionHeaderStyle}>Past</h3>
            <ul style={listStyle}>
              {past.map((entry, idx) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    data-rebalance-pressable="true"
                    data-testid={`history-jump-${entry.id}`}
                    onClick={() => handleJump(entry.id)}
                    style={entryButtonStyle(idx === 0)}
                  >
                    <span style={{ color: "var(--accent-cool, #3b82f6)", fontWeight: 600 }}>
                      {idx === 0 ? "•" : "↶"}
                    </span>
                    <span style={{ flex: 1, textAlign: "left" }}>{summariseEntry(entry)}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted, #94a3b8)" }}>
                      {relativeTime(entry.timestamp)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </aside>
    </div>,
    document.body,
  );
}

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted, #94a3b8)",
  margin: "12px 0 4px",
};

const listStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

function ctaButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    background: "transparent",
    color: enabled ? "var(--text, #f8fafc)" : "var(--text-muted, #94a3b8)",
    border: "1px solid var(--line, rgba(40,52,86,0.4))",
    borderRadius: 6,
    padding: "4px 10px",
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.5,
    fontSize: 12,
  };
}

function entryButtonStyle(active: boolean): React.CSSProperties {
  return {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: active ? "rgba(99, 102, 241, 0.10)" : "transparent",
    border: `1px solid ${active ? "rgba(99, 102, 241, 0.45)" : "var(--line, rgba(40,52,86,0.4))"}`,
    borderRadius: 6,
    padding: "8px 12px",
    color: "inherit",
    cursor: "pointer",
    textAlign: "left",
    fontSize: 13,
  };
}
