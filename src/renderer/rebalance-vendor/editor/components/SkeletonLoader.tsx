import React from "react";

/* ─── Constants ──────────────────────────────────────────────────────── */

const SKELETON_BASE = "var(--bg-1, #070911)";
const SKELETON_HIGHLIGHT = "var(--bg-2, #10172a)";

/* ─── Inline Styles (CSS-in-JS for self-contained component) ─────────── */

const shimmerKeyframes = `
@keyframes skeleton-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes skeleton-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
`;

const reducedMotionStyles = `
@media (prefers-reduced-motion: reduce) {
  .skeleton-shimmer {
    animation: none !important;
    background-size: 100% 100% !important;
  }
}
`;

/**
 * Inject the keyframes stylesheet once into the document head.
 * Uses a data attribute to prevent duplicate injection.
 */
let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  if (typeof document === "undefined") return;
  const existing = document.querySelector("[data-skeleton-styles]");
  if (existing) {
    stylesInjected = true;
    return;
  }
  const style = document.createElement("style");
  style.setAttribute("data-skeleton-styles", "");
  style.textContent = shimmerKeyframes + reducedMotionStyles;
  document.head.appendChild(style);
  stylesInjected = true;
}

/* ─── Types ──────────────────────────────────────────────────────────── */

export interface SkeletonProps {
  /** Visual variant of the skeleton placeholder */
  variant: "card" | "row" | "text" | "heading" | "avatar" | "hero" | "field" | "title";
  /** Number of skeleton elements to render (for lists) */
  count?: number;
  /** Custom width override */
  width?: string;
  /** Custom height override */
  height?: string;
  /** Additional CSS class */
  className?: string;
  /** Enable shimmer animation (default: true) */
  animate?: boolean;
}

export interface PageSkeletonProps {
  /** Layout variant matching the page type */
  layout: "dashboard" | "editor" | "list" | "grid";
  /** Number of columns for grid layout */
  columns?: number;
  /** Additional CSS class */
  className?: string;
  /** Enable shimmer animation (default: true) */
  animate?: boolean;
  /** Whether the skeleton is fading out (content loaded) */
  fadingOut?: boolean;
}

/* ─── Variant Dimensions ─────────────────────────────────────────────── */

const VARIANT_DEFAULTS: Record<
  SkeletonProps["variant"],
  { width: string; height: string; borderRadius: string }
> = {
  hero: { width: "100%", height: "180px", borderRadius: "8px" },
  card: { width: "100%", height: "120px", borderRadius: "8px" },
  field: { width: "100%", height: "48px", borderRadius: "8px" },
  row: { width: "100%", height: "40px", borderRadius: "8px" },
  title: { width: "40%", height: "20px", borderRadius: "8px" },
  heading: { width: "60%", height: "22px", borderRadius: "8px" },
  text: { width: "100%", height: "14px", borderRadius: "8px" },
  avatar: { width: "40px", height: "40px", borderRadius: "50%" },
};

/* ─── Skeleton Component ─────────────────────────────────────────────── */

export function Skeleton({
  variant,
  count = 1,
  width,
  height,
  className,
  animate = true,
}: SkeletonProps): React.ReactElement {
  injectStyles();

  const defaults = VARIANT_DEFAULTS[variant];
  const resolvedWidth = width ?? defaults.width;
  const resolvedHeight = height ?? defaults.height;

  const baseStyle: React.CSSProperties = {
    width: resolvedWidth,
    height: resolvedHeight,
    borderRadius: defaults.borderRadius,
    background: animate
      ? `linear-gradient(90deg, ${SKELETON_BASE} 25%, ${SKELETON_HIGHLIGHT} 50%, ${SKELETON_BASE} 75%)`
      : SKELETON_BASE,
    backgroundSize: animate ? "200% 100%" : undefined,
    animation: animate ? "skeleton-shimmer 1.5s ease-in-out infinite" : undefined,
    display: "block",
    flexShrink: 0,
  };

  const elements: React.ReactElement[] = [];
  for (let i = 0; i < count; i++) {
    elements.push(
      <div
        key={i}
        aria-hidden="true"
        className={`skeleton-shimmer${className ? ` ${className}` : ""}`}
        data-testid="skeleton"
        style={{
          ...baseStyle,
          marginBottom: i < count - 1 ? "8px" : undefined,
        }}
      />,
    );
  }

  if (count === 1) return elements[0];
  return <div data-testid="skeleton-group">{elements}</div>;
}

/* ─── PageSkeleton Layouts ───────────────────────────────────────────── */

export function PageSkeleton({
  layout,
  columns = 3,
  className,
  animate = true,
  fadingOut = false,
}: PageSkeletonProps): React.ReactElement {
  injectStyles();

  const containerStyle: React.CSSProperties = {
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    opacity: fadingOut ? 0 : 1,
    transition: "opacity 0.2s ease-out",
    pointerEvents: fadingOut ? "none" : undefined,
  };

  switch (layout) {
    /**
     * Dashboard: Hero block (wide rectangle) + 3 card placeholders in a row
     */
    case "dashboard":
      return (
        <div className={className} data-testid="page-skeleton" style={containerStyle}>
          {/* Heading */}
          <Skeleton variant="heading" animate={animate} />
          {/* 3 stat/summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
            <Skeleton variant="card" animate={animate} />
            <Skeleton variant="card" animate={animate} />
            <Skeleton variant="card" animate={animate} />
          </div>
          {/* 3 text lines */}
          <Skeleton variant="text" animate={animate} />
          <Skeleton variant="text" animate={animate} />
          <Skeleton variant="text" animate={animate} />
        </div>
      );

    /**
     * Editor: Left sidebar (narrow column) + right content area with stacked field placeholders
     */
    case "editor":
      return (
        <div
          className={className}
          data-testid="page-skeleton"
          style={{ ...containerStyle, flexDirection: "row", gap: "24px" }}
        >
          {/* Left sidebar */}
          <div
            style={{
              width: "220px",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              paddingTop: "4px",
            }}
          >
            <Skeleton variant="title" animate={animate} width="70%" />
            <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <Skeleton variant="text" animate={animate} width="90%" />
              <Skeleton variant="text" animate={animate} width="85%" />
              <Skeleton variant="text" animate={animate} width="92%" />
              <Skeleton variant="text" animate={animate} width="78%" />
              <Skeleton variant="text" animate={animate} width="88%" />
              <Skeleton variant="text" animate={animate} width="80%" />
              <Skeleton variant="text" animate={animate} width="86%" />
            </div>
          </div>
          {/* Right content area with stacked fields */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
            <Skeleton variant="title" animate={animate} width="50%" />
            <Skeleton variant="field" animate={animate} />
            <Skeleton variant="field" animate={animate} />
            <Skeleton variant="field" animate={animate} />
            <Skeleton variant="field" animate={animate} />
            <Skeleton variant="field" animate={animate} />
          </div>
        </div>
      );

    /**
     * List: Stacked rows of cards
     */
    case "list":
      return (
        <div className={className} data-testid="page-skeleton" style={containerStyle}>
          <Skeleton variant="heading" animate={animate} />
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <Skeleton variant="row" animate={animate} />
            <Skeleton variant="row" animate={animate} />
            <Skeleton variant="row" animate={animate} />
            <Skeleton variant="row" animate={animate} />
            <Skeleton variant="row" animate={animate} />
            <Skeleton variant="row" animate={animate} />
            <Skeleton variant="row" animate={animate} />
            <Skeleton variant="row" animate={animate} />
          </div>
        </div>
      );

    /**
     * Grid: Grid of card placeholders (3 columns)
     */
    case "grid":
      return (
        <div className={className} data-testid="page-skeleton" style={containerStyle}>
          <Skeleton variant="title" animate={animate} width="30%" />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${columns}, 1fr)`,
              gap: "16px",
            }}
          >
            {Array.from({ length: columns * 3 }, (_, i) => (
              <Skeleton key={i} variant="card" animate={animate} />
            ))}
          </div>
        </div>
      );
  }
}
