import React from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────────── */

export interface ErrorFallbackProps {
  /** The error that was caught */
  error?: Error | null;
  /** Called when the user clicks "Try Again" */
  onRetry?: () => void;
  /** Called when the user clicks "Go Home" */
  onGoHome?: () => void;
  /** If true, renders as a full-page overlay instead of an inline card */
  fullPage?: boolean;
}

/* ─── ErrorFallback ──────────────────────────────────────────────────── */

/**
 * A user-friendly error recovery UI shown when a lazy-loaded page or
 * component fails to render. Offers retry and navigation options.
 */
export function ErrorFallback({
  error = null,
  onRetry,
  onGoHome,
  fullPage = false,
}: ErrorFallbackProps): React.ReactElement {
  const message = error?.message ?? "An unexpected error occurred.";
  const truncatedMessage = message.length > 200 ? `${message.slice(0, 200)}…` : message;

  const card = (
    <div style={styles.card}>
      {/* Error icon */}
      <div style={styles.iconWrapper}>
        <AlertTriangle size={48} style={styles.icon} strokeWidth={1.5} />
      </div>

      {/* Text */}
      <div style={styles.textGroup}>
        <h2 style={styles.title}>Something went wrong</h2>
        <p style={styles.subtitle}>{truncatedMessage}</p>
      </div>

      {/* Actions */}
      <div style={styles.actions}>
        {onRetry && (
          <button type="button" style={styles.primaryButton} onClick={onRetry}>
            <RotateCcw size={14} />
            Try Again
          </button>
        )}
        {onGoHome && (
          <button type="button" style={styles.ghostButton} onClick={onGoHome}>
            <Home size={14} />
            Go Home
          </button>
        )}
      </div>
    </div>
  );

  if (fullPage) {
    return <div style={styles.fullPageWrapper}>{card}</div>;
  }

  return <div style={styles.inlineWrapper}>{card}</div>;
}

/* ─── Styles ─────────────────────────────────────────────────────────── */

const styles: Record<string, React.CSSProperties> = {
  fullPageWrapper: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    background: "var(--bg-0, #0a0e1a)",
    padding: "2rem",
  },
  inlineWrapper: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
    minHeight: "300px",
    padding: "2rem",
  },
  card: {
    background: "var(--bg-1, #141820)",
    border: "1px solid var(--line, rgba(255,255,255,0.08))",
    borderRadius: "16px",
    padding: "2rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1.25rem",
    textAlign: "center",
    maxWidth: "480px",
    width: "100%",
  },
  iconWrapper: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    color: "rgba(220, 38, 38, 0.8)",
  },
  textGroup: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.5rem",
  },
  title: {
    fontSize: "1.25rem",
    fontWeight: 700,
    color: "var(--text, #f5f0e8)",
    margin: 0,
  },
  subtitle: {
    fontSize: "0.875rem",
    color: "var(--text-muted, rgba(245,240,232,0.6))",
    maxWidth: "400px",
    margin: 0,
    lineHeight: 1.5,
  },
  actions: {
    display: "flex",
    gap: "0.75rem",
    marginTop: "0.5rem",
  },
  primaryButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.5rem 1rem",
    borderRadius: "8px",
    border: "none",
    background: "var(--text, #f5f0e8)",
    color: "var(--bg-0, #0a0e1a)",
    fontSize: "0.8125rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "opacity 0.15s",
  },
  ghostButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.5rem 1rem",
    borderRadius: "8px",
    border: "1px solid var(--line, rgba(255,255,255,0.08))",
    background: "transparent",
    color: "var(--text-muted, rgba(245,240,232,0.6))",
    fontSize: "0.8125rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "opacity 0.15s",
  },
};
