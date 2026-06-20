import React, { useId, useState } from "react";
import { PROVENANCE } from "../copy";

/**
 * Phase 3 Task 20 — ProvenanceTooltip.
 *
 * Wraps children with a hover/focus tooltip that surfaces the field's value
 * provenance:
 *   - Standard value (the runtime default)
 *   - Default value (post-overrides default)
 *   - Last changed (relative time + optional user)
 *   - Provenance badge (Quick / Simple / Advanced)
 *
 * Uses an aria-describedby pattern (no popper / floating-ui) to stay
 * dependency-free. Tooltip stays open as long as the wrapped element has
 * focus or hover.
 */

export type Provenance = "quick" | "simple" | "advanced";

export interface ProvenanceTooltipProps {
  children: React.ReactNode;
  standardValue?: unknown;
  defaultValue?: unknown;
  lastChangedAt?: string;
  lastChangedBy?: string;
  provenance?: Provenance;
}

export function formatRelativeTime(iso: string): string {
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

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value || '""';
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function provenanceLabel(p?: Provenance): string {
  if (!p) return "";
  switch (p) {
    case "quick":
      return PROVENANCE.quick;
    case "simple":
      return PROVENANCE.simple;
    case "advanced":
      return PROVENANCE.advanced;
  }
}

export function ProvenanceTooltip({
  children,
  standardValue,
  defaultValue,
  lastChangedAt,
  lastChangedBy,
  provenance,
}: ProvenanceTooltipProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  const rows: Array<{ label: string; value: string }> = [];
  if (standardValue !== undefined) rows.push({ label: "Standard", value: formatValue(standardValue) });
  if (defaultValue !== undefined) rows.push({ label: "Default", value: formatValue(defaultValue) });
  if (lastChangedAt) {
    const rel = formatRelativeTime(lastChangedAt);
    const by = lastChangedBy ? ` by ${lastChangedBy}` : "";
    rows.push({ label: "Last changed", value: `${rel}${by}` });
  }
  if (provenance) rows.push({ label: "Provenance", value: provenanceLabel(provenance) });

  const showTooltip = open && rows.length > 0;

  return (
    <span
      data-testid="rebalance-provenance-wrapper"
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={showTooltip ? tooltipId : undefined}>{children}</span>
      {showTooltip ? (
        <span
          id={tooltipId}
          role="tooltip"
          data-testid="rebalance-provenance-tooltip"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 6,
            background: "var(--bg-2, #10172a)",
            color: "var(--text, #f8fafc)",
            border: "1px solid var(--line, rgba(40,52,86,0.4))",
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 12,
            minWidth: 180,
            boxShadow: "var(--shadow-md, 0 4px 12px rgba(0,0,0,0.2))",
            zIndex: 800,
            display: "flex",
            flexDirection: "column",
            gap: 3,
            pointerEvents: "none",
          }}
        >
          {rows.map((row) => (
            <span
              key={row.label}
              data-testid={`rebalance-provenance-row-${row.label.toLowerCase().replace(/\s+/g, "-")}`}
              style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
            >
              <span style={{ color: "var(--text-muted, #94a3b8)" }}>{row.label}:</span>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{row.value}</span>
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}
