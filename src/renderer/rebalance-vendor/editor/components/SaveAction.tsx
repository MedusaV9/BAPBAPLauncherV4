import React from "react";
import { CTA, STATUS } from "../copy";

/**
 * Phase 3 Task 11 — SaveAction.
 *
 * Compact "Save" CTA + apply-timing note + optional overflow menu slot. Used
 * in the editor page header so the user always sees what saving will do
 * (apply now / next launch / next reload) right next to the action.
 *
 * The component is presentational: it does not manage saving state. Pass
 * `isSaving=true` while a save is in flight, `isDirty=true` to enable the
 * button, and `onSave` to fire when clicked.
 */

export type SaveAppliesAt = "now" | "next-launch" | "next-reload";

export interface SaveActionProps {
  onSave: () => void | Promise<void>;
  isSaving?: boolean;
  isDirty?: boolean;
  /** ISO timestamp of last successful save, or null. Reserved for future "Saved 3 min ago" hint. */
  lastSavedAt?: string | null;
  /** Apply timing — drives the small note below the button. */
  appliesAt?: SaveAppliesAt;
  /** Optional overflow menu slot (typically a `<details>` with Reset all etc.). */
  overflow?: React.ReactNode;
  className?: string;
}

function timingNote(appliesAt: SaveAppliesAt): string {
  switch (appliesAt) {
    case "now":
      return "Applies immediately";
    case "next-launch":
      return STATUS.willApplyNextLaunch;
    case "next-reload":
      return STATUS.willApplyAfterReload;
  }
}

export function SaveAction({
  onSave,
  isSaving = false,
  isDirty = false,
  appliesAt = "now",
  overflow,
  className,
}: SaveActionProps): React.ReactElement {
  const isDisabled = isSaving || !isDirty;
  const buttonLabel = isSaving ? STATUS.saving : CTA.save;
  const note = timingNote(appliesAt);

  return (
    <div
      className={`rebalance-save-action ${className ?? ""}`.trim()}
      data-testid="rebalance-save-action"
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "stretch", gap: 4, minWidth: 120 }}
    >
      <button
        type="button"
        data-rebalance-pressable="true"
        data-testid="rebalance-save-action-button"
        onClick={() => {
          if (isDisabled) return;
          void onSave();
        }}
        disabled={isDisabled}
        aria-disabled={isDisabled || undefined}
        aria-busy={isSaving || undefined}
        style={{
          background: "var(--accent-cool, #3b82f6)",
          color: "var(--bg-0, #020305)",
          border: "1px solid var(--accent-cool, #3b82f6)",
          borderRadius: 6,
          padding: "8px 16px",
          cursor: isDisabled ? "not-allowed" : "pointer",
          opacity: isDisabled ? 0.55 : 1,
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        {buttonLabel}
      </button>
      <span
        data-testid="rebalance-save-action-note"
        style={{
          fontSize: 11,
          color: "var(--text-muted, #94a3b8)",
          textAlign: "center",
        }}
      >
        {note}
      </span>
      {overflow ? (
        <div data-testid="rebalance-save-action-overflow" style={{ marginTop: 4 }}>
          {overflow}
        </div>
      ) : null}
    </div>
  );
}
