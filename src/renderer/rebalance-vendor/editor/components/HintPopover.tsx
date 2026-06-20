import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getHint, type HintId } from "../helpers/hints";
import { CTA } from "../copy";

/**
 * Phase 3 Task 23 — HintPopover.
 *
 * Small `?`-icon button that opens a contextual hint popover when clicked,
 * focused, or hovered. The hint content comes from `hints.json` via
 * `getHint(hintId)`. When the hint id is unknown the trigger is hidden so
 * the surrounding layout stays clean.
 *
 * Accessibility:
 * - Trigger has `aria-haspopup="dialog"`, `aria-expanded`, and is keyboard
 *   focusable. Picks up the universal `:focus-visible` ring via
 *   `data-rebalance-pressable="true"`.
 * - Popover is portal-rendered with `role="dialog"` and `aria-labelledby`
 *   pointing at the title. `Escape` closes it and restores focus.
 */

export interface HintPopoverProps {
  hintId: HintId;
  /** Optional accessible name override. Defaults to "Show hint about <title>". */
  ariaLabel?: string;
  /** Visual size of the trigger circle in pixels. */
  size?: number;
}

export function HintPopover({ hintId, ariaLabel, size = 16 }: HintPopoverProps): React.ReactElement | null {
  const hint = getHint(hintId);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const dialogId = useId();
  const titleId = `${dialogId}-title`;

  // Compute popover position relative to trigger.
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 8,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 320)),
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const handler = () => updatePosition();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [open, updatePosition]);

  // Escape closes; click outside closes.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClickOutside);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClickOutside);
    };
  }, [open]);

  if (!hint) return null;

  const buttonLabel = ariaLabel ?? `Show hint about ${hint.title}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-rebalance-pressable="true"
        data-testid={`hint-trigger-${hintId}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={buttonLabel}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          borderRadius: size,
          background: "transparent",
          color: "var(--text-muted, #94a3b8)",
          border: "1px solid var(--line, rgba(40,52,86,0.4))",
          cursor: "pointer",
          fontSize: Math.max(10, size - 4),
          fontWeight: 700,
          padding: 0,
          marginLeft: 4,
        }}
      >
        ?
      </button>

      {open && position && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              id={dialogId}
              role="dialog"
              aria-modal="false"
              aria-labelledby={titleId}
              data-testid={`hint-popover-${hintId}`}
              style={{
                position: "fixed",
                top: position.top,
                left: position.left,
                width: 320,
                background: "var(--bg-2, #10172a)",
                color: "var(--text, #f8fafc)",
                border: "1px solid var(--line, rgba(40,52,86,0.4))",
                borderRadius: 10,
                padding: "12px 14px",
                boxShadow: "var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.3))",
                zIndex: 1100,
                fontSize: 13,
                lineHeight: 1.5,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <h4
                  id={titleId}
                  style={{ margin: 0, fontSize: 14, fontWeight: 700 }}
                >
                  {hint.title}
                </h4>
                <button
                  type="button"
                  data-rebalance-pressable="true"
                  onClick={() => {
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  aria-label="Close hint"
                  style={{
                    background: "transparent",
                    color: "inherit",
                    border: "1px solid var(--line, rgba(40,52,86,0.4))",
                    borderRadius: 4,
                    padding: "1px 7px",
                    cursor: "pointer",
                    fontSize: 11,
                  }}
                >
                  {CTA.close}
                </button>
              </div>
              <p style={{ margin: 0, color: "var(--text, #f8fafc)" }}>{hint.body}</p>
              {hint.example ? (
                <div
                  data-testid={`hint-example-${hintId}`}
                  style={{
                    background: "rgba(99, 102, 241, 0.10)",
                    border: "1px solid rgba(99, 102, 241, 0.30)",
                    borderRadius: 6,
                    padding: "6px 8px",
                    fontSize: 12,
                    color: "var(--text, #f8fafc)",
                    fontStyle: "italic",
                  }}
                >
                  {hint.example}
                </div>
              ) : null}
              {hint.clipPath ? (
                <img
                  src={hint.clipPath}
                  alt=""
                  data-testid={`hint-clip-${hintId}`}
                  style={{ width: "100%", borderRadius: 6, marginTop: 4 }}
                />
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
