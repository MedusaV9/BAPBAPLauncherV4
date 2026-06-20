import React, { useEffect } from "react";
import { CTA } from "../copy";

/**
 * Phase 3 Task 13 — BulkActionToolbar.
 *
 * Floating toolbar that appears at the bottom of the page when 2+ fields
 * are selected via the multi-select hook. Provides Reset selected, Copy
 * values, Apply preset, and Cancel actions.
 */

export interface BulkActionToolbarProps {
  /** Currently selected count. Toolbar is hidden when count < 2. */
  count: number;
  onResetSelected: () => void;
  onCopyValues: () => void;
  onApplyPreset?: () => void;
  /** Cancel = clear selection. */
  onCancel: () => void;
}

export function BulkActionToolbar({
  count,
  onResetSelected,
  onCopyValues,
  onApplyPreset,
  onCancel,
}: BulkActionToolbarProps): React.ReactElement | null {
  // Escape clears selection
  useEffect(() => {
    if (count < 2) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [count, onCancel]);

  if (count < 2) return null;

  return (
    <div
      role="toolbar"
      aria-label={`Bulk actions for ${count} selected fields`}
      data-testid="rebalance-bulk-action-toolbar"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 24,
        transform: "translateX(-50%)",
        zIndex: 900,
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "var(--bg-2, #10172a)",
        border: "1px solid rgba(99, 102, 241, 0.45)",
        borderRadius: 12,
        boxShadow: "var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.3))",
        padding: "10px 14px",
        color: "var(--text, #f8fafc)",
        fontSize: 13,
      }}
    >
      <span style={{ marginRight: 6, color: "var(--accent-cool, #3b82f6)", fontWeight: 700 }}>
        {count}
      </span>
      <span style={{ marginRight: 12, color: "var(--text-muted, #94a3b8)" }}>
        {count === 1 ? "field selected" : "fields selected"}
      </span>

      <button
        type="button"
        data-rebalance-pressable="true"
        data-testid="bulk-reset-selected"
        onClick={onResetSelected}
        style={toolbarButtonStyle()}
      >
        {CTA.resetSelected}
      </button>
      <button
        type="button"
        data-rebalance-pressable="true"
        data-testid="bulk-copy-values"
        onClick={onCopyValues}
        style={toolbarButtonStyle()}
      >
        {CTA.copyValues}
      </button>
      {onApplyPreset ? (
        <button
          type="button"
          data-rebalance-pressable="true"
          data-testid="bulk-apply-preset"
          onClick={onApplyPreset}
          style={toolbarButtonStyle()}
        >
          {CTA.applyPreset}
        </button>
      ) : null}
      <span style={{ width: 1, height: 20, background: "var(--line, rgba(40,52,86,0.4))" }} />
      <button
        type="button"
        data-rebalance-pressable="true"
        data-testid="bulk-cancel"
        onClick={onCancel}
        style={toolbarButtonStyle()}
      >
        {CTA.cancel}
      </button>
    </div>
  );
}

function toolbarButtonStyle(): React.CSSProperties {
  return {
    background: "transparent",
    color: "inherit",
    border: "1px solid var(--line, rgba(40,52,86,0.4))",
    borderRadius: 6,
    padding: "4px 10px",
    cursor: "pointer",
    fontSize: 12,
  };
}
