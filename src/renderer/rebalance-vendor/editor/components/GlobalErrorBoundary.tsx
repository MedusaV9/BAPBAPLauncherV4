import React from "react";
import { ErrorFallback } from "./ErrorFallback";

/* ─── Types ──────────────────────────────────────────────────────────── */

interface GlobalErrorBoundaryProps {
  children: React.ReactNode;
}

interface GlobalErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/* ─── GlobalErrorBoundary ────────────────────────────────────────────── */

/**
 * Top-level error boundary for the Rebalance LauncherApp.
 * Catches any unhandled rendering errors and shows a full-page
 * recovery UI with a reload option.
 */
export class GlobalErrorBoundary extends React.Component<
  GlobalErrorBoundaryProps,
  GlobalErrorBoundaryState
> {
  state: GlobalErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): GlobalErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[Rebalance GlobalErrorBoundary] Uncaught error:", error);
    console.error("[Rebalance GlobalErrorBoundary] Component stack:", errorInfo.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={this.handleReload}
          fullPage
        />
      );
    }
    return this.props.children;
  }
}
