import React, { useMemo, useState } from "react";
import type { DiffHunk, DiffOperation } from "../helpers/compute-diff";
import { CTA } from "../copy";

/**
 * Phase 3 Task 15 — DiffView.
 *
 * Renders a list of {@link DiffHunk}s with selectable checkboxes and a
 * mode toggle for side-by-side vs inline display. Indigo (`--accent-cool`)
 * marks added entries, amber (`--accent-warm`) marks removed, both colours
 * mark modified, and unchanged entries stay neutral.
 *
 * Apply button calls `onApply` with the currently selected hunks so the
 * caller can merge them via `applyDiff` from `helpers/compute-diff`.
 */

export interface DiffViewProps {
  hunks: DiffHunk[];
  /** Default `'side-by-side'`. */
  initialMode?: "side-by-side" | "inline";
  /** Whether each hunk is selected by default. Defaults to `true`. */
  defaultSelected?: boolean;
  onApply?: (selected: DiffHunk[]) => void;
  onCancel?: () => void;
}

const OPERATION_TINT: Record<DiffOperation, { background: string; border: string; label: string }> = {
  added: {
    background: "rgba(99, 102, 241, 0.10)",
    border: "rgba(99, 102, 241, 0.45)",
    label: "+ Added",
  },
  removed: {
    background: "rgba(245, 158, 11, 0.08)",
    border: "rgba(245, 158, 11, 0.40)",
    label: "− Removed",
  },
  modified: {
    background: "rgba(99, 102, 241, 0.06)",
    border: "rgba(99, 102, 241, 0.35)",
    label: "~ Modified",
  },
  unchanged: {
    background: "transparent",
    border: "var(--line, rgba(40,52,86,0.4))",
    label: "= Unchanged",
  },
};

function formatValue(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "null";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function DiffView({
  hunks,
  initialMode = "side-by-side",
  defaultSelected = true,
  onApply,
  onCancel,
}: DiffViewProps): React.ReactElement {
  const [mode, setMode] = useState<"side-by-side" | "inline">(initialMode);
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (!defaultSelected) return new Set();
    const initial = new Set<string>();
    for (const h of hunks) {
      if (h.operation !== "unchanged") initial.add(h.path);
    }
    return initial;
  });

  const visibleHunks = useMemo(() => hunks, [hunks]);

  const toggle = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(hunks.filter((h) => h.operation !== "unchanged").map((h) => h.path)));
  };

  const selectNone = () => {
    setSelected(new Set());
  };

  const handleApply = () => {
    if (!onApply) return;
    const list = hunks.filter((h) => selected.has(h.path));
    onApply(list);
  };

  return (
    <div
      data-testid="rebalance-diff-view"
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div className="task-segmented" style={{ display: "inline-flex", gap: 4 }}>
          <button
            type="button"
            data-rebalance-pressable="true"
            data-testid="diff-mode-side"
            aria-pressed={mode === "side-by-side"}
            onClick={() => setMode("side-by-side")}
            style={modeButtonStyle(mode === "side-by-side")}
          >
            Side by side
          </button>
          <button
            type="button"
            data-rebalance-pressable="true"
            data-testid="diff-mode-inline"
            aria-pressed={mode === "inline"}
            onClick={() => setMode("inline")}
            style={modeButtonStyle(mode === "inline")}
          >
            Inline
          </button>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            data-rebalance-pressable="true"
            data-testid="diff-select-all"
            onClick={selectAll}
            style={modeButtonStyle(false)}
          >
            Select all
          </button>
          <button
            type="button"
            data-rebalance-pressable="true"
            data-testid="diff-select-none"
            onClick={selectNone}
            style={modeButtonStyle(false)}
          >
            Select none
          </button>
        </div>
      </header>

      {visibleHunks.length === 0 ? (
        <p
          data-testid="diff-empty"
          style={{ color: "var(--text-muted, #94a3b8)", fontSize: 13, padding: 12 }}
        >
          No differences detected.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {visibleHunks.map((hunk) => {
            const tint = OPERATION_TINT[hunk.operation];
            const isSelected = selected.has(hunk.path);
            const isUnchanged = hunk.operation === "unchanged";
            return (
              <li
                key={hunk.path}
                data-testid={`diff-hunk-${hunk.path}`}
                data-operation={hunk.operation}
                style={{
                  display: "grid",
                  gridTemplateColumns: mode === "side-by-side" ? "auto 1fr 1fr" : "auto 1fr",
                  gap: 8,
                  alignItems: "center",
                  background: tint.background,
                  border: `1px solid ${tint.border}`,
                  borderRadius: 6,
                  padding: "6px 10px",
                  fontSize: 12,
                  color: "var(--text, #f8fafc)",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                <input
                  type="checkbox"
                  data-testid={`diff-hunk-checkbox-${hunk.path}`}
                  checked={isSelected}
                  disabled={isUnchanged}
                  onChange={() => toggle(hunk.path)}
                  aria-label={`Select diff hunk for ${hunk.path}`}
                />
                {mode === "side-by-side" ? (
                  <>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-muted, #94a3b8)" }}>
                        {hunk.path} · {tint.label}
                      </div>
                      <div data-testid={`diff-hunk-before-${hunk.path}`}>{formatValue(hunk.before)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-muted, #94a3b8)" }}>
                        →
                      </div>
                      <div data-testid={`diff-hunk-after-${hunk.path}`}>{formatValue(hunk.after)}</div>
                    </div>
                  </>
                ) : (
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-muted, #94a3b8)" }}>
                      {hunk.path} · {tint.label}
                    </div>
                    <div data-testid={`diff-hunk-inline-${hunk.path}`}>
                      <span style={{ color: "var(--accent-warm, #f59e0b)" }}>− {formatValue(hunk.before)}</span>
                      <br />
                      <span style={{ color: "var(--accent-cool, #3b82f6)" }}>+ {formatValue(hunk.after)}</span>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <footer style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {onCancel ? (
          <button
            type="button"
            data-rebalance-pressable="true"
            data-testid="diff-cancel"
            onClick={onCancel}
            style={modeButtonStyle(false)}
          >
            {CTA.cancel}
          </button>
        ) : null}
        {onApply ? (
          <button
            type="button"
            data-rebalance-pressable="true"
            data-testid="diff-apply"
            onClick={handleApply}
            disabled={selected.size === 0}
            style={{
              ...modeButtonStyle(true),
              background: "var(--accent-cool, #3b82f6)",
              color: "var(--bg-0, #020305)",
              border: "1px solid var(--accent-cool, #3b82f6)",
              opacity: selected.size === 0 ? 0.5 : 1,
              cursor: selected.size === 0 ? "not-allowed" : "pointer",
            }}
          >
            {CTA.applyDiff} ({selected.size})
          </button>
        ) : null}
      </footer>
    </div>
  );
}

function modeButtonStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "rgba(99, 102, 241, 0.15)" : "transparent",
    color: "var(--text, #f8fafc)",
    border: `1px solid ${active ? "rgba(99, 102, 241, 0.55)" : "var(--line, rgba(40,52,86,0.4))"}`,
    borderRadius: 6,
    padding: "4px 10px",
    cursor: "pointer",
    fontSize: 12,
  };
}
