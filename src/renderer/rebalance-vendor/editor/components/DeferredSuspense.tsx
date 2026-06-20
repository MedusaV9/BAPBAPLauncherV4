import React, { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { FadeInOnMount } from "../FadeInOnMount";
import { ErrorFallback } from "./ErrorFallback";

/* ─── Constants ──────────────────────────────────────────────────────── */

/** If content loads within this time, skip the fallback entirely (no flash). */
const FAST_LOAD_THRESHOLD_MS = 100;

/* ─── Types ──────────────────────────────────────────────────────────── */

export interface DeferredSuspenseProps {
  /** Content that may suspend (typically a lazy-loaded component) */
  children: React.ReactNode;
  /** Fallback UI (skeleton) shown while content is loading */
  fallback: React.ReactNode;
  /** Minimum delay (ms) before showing content after load (prevents flash for fast loads) */
  delay?: number;
}

/* ─── Error Boundary ─────────────────────────────────────────────────── */

interface LazyErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class LazyErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  LazyErrorBoundaryState
> {
  state: LazyErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): LazyErrorBoundaryState {
    return { hasError: true, error };
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={this.handleRetry}
        />
      );
    }
    return this.props.children;
  }
}

/* ─── SuspenseTracker (internal) ─────────────────────────────────────── */

/**
 * Rendered inside the Suspense fallback slot. Tracks whether the fallback
 * was shown long enough to warrant displaying it, and signals the parent
 * when it unmounts (content resolved).
 */
function SuspenseTracker({
  fallback,
  onMount,
  onUnmount,
}: {
  fallback: React.ReactNode;
  onMount: () => void;
  onUnmount: () => void;
}) {
  const onUnmountRef = useRef(onUnmount);
  onUnmountRef.current = onUnmount;

  useEffect(() => {
    onMount();
    return () => {
      onUnmountRef.current();
    };
  }, [onMount]);

  return <>{fallback}</>;
}

/* ─── DeferredSuspense ───────────────────────────────────────────────── */

/**
 * A Suspense wrapper with smart loading UX:
 * - Shows fallback (skeleton) immediately when lazy component is loading
 * - If content loads within 100ms, skips fallback entirely (no flash)
 * - When content loads, fades it in using FadeInOnMount
 * - Handles errors gracefully via an internal error boundary
 */
export function DeferredSuspense({
  children,
  fallback,
  delay,
}: DeferredSuspenseProps): React.ReactElement {
  const [phase, setPhase] = useState<"loading" | "loaded">("loading");
  const suspenseStartRef = useRef<number>(performance.now());
  const showedFallbackRef = useRef(false);

  const onFallbackMount = useCallback(() => {
    suspenseStartRef.current = performance.now();
    showedFallbackRef.current = true;
  }, []);

  const onFallbackUnmount = useCallback(() => {
    setPhase("loaded");
  }, []);

  // If content resolves without ever suspending, phase stays "loading"
  // but showedFallbackRef stays false. We detect this case and show immediately.
  const wasFastLoad =
    phase === "loaded" &&
    showedFallbackRef.current &&
    performance.now() - suspenseStartRef.current < FAST_LOAD_THRESHOLD_MS;

  const suspenseFallback = (
    <SuspenseTracker
      fallback={fallback}
      onMount={onFallbackMount}
      onUnmount={onFallbackUnmount}
    />
  );

  const content = (
    <LazyErrorBoundary fallback={fallback}>
      <Suspense fallback={suspenseFallback}>
        <ContentWrapper
          phase={phase}
          wasFastLoad={wasFastLoad}
          delay={delay}
        >
          {children}
        </ContentWrapper>
      </Suspense>
    </LazyErrorBoundary>
  );

  return <>{content}</>;
}

/* ─── ContentWrapper (internal) ──────────────────────────────────────── */

/**
 * Wraps the resolved content. When the content just loaded and the fallback
 * was visible, applies a fade-in. If load was fast (under threshold), renders
 * immediately without animation.
 */
function ContentWrapper({
  children,
  phase,
  wasFastLoad,
  delay,
}: {
  children: React.ReactNode;
  phase: "loading" | "loaded";
  wasFastLoad: boolean;
  delay?: number;
}) {
  // If we haven't transitioned to "loaded" yet, the content just rendered
  // for the first time (Suspense resolved). Show with fade.
  if (phase === "loading") {
    // Content resolved without suspending (no fallback was shown) — show immediately
    return <>{children}</>;
  }

  // Fast load — skip fade, show immediately
  if (wasFastLoad) {
    return <>{children}</>;
  }

  // Normal load — fade in
  return <FadeInOnMount delay={delay}>{children}</FadeInOnMount>;
}
