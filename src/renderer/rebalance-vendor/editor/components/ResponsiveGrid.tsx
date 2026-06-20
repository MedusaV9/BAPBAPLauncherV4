import React from "react";

export interface ResponsiveGridProps {
  /** Minimum item width in px */
  minItemWidth: number;
  /** Cap columns at ultrawide */
  maxColumns?: number;
  /** Grid gap, default "1rem" */
  gap?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * A fluid grid container that automatically adjusts column count based on
 * available width, using CSS Grid with auto-fill + minmax() for smooth scaling.
 *
 * - Scales from 1 column at narrow panels to 4+ at ultrawide
 * - Respects the 1920px content cap on ultrawide viewports
 * - Pure fluid behavior, no media query jumps
 */
export function ResponsiveGrid({
  minItemWidth,
  maxColumns,
  gap = "1rem",
  children,
  className,
}: ResponsiveGridProps) {
  const style: React.CSSProperties = {
    display: "grid",
    gap,
    gridTemplateColumns: maxColumns
      ? `repeat(auto-fill, minmax(min(${minItemWidth}px, 100%), 1fr))`
      : `repeat(auto-fill, minmax(min(${minItemWidth}px, 100%), 1fr))`,
    maxWidth: "1920px",
    width: "100%",
    ...(maxColumns
      ? ({
          "--responsive-grid-max-cols": maxColumns,
        } as React.CSSProperties)
      : {}),
  };

  // When maxColumns is set, use a CSS trick to cap columns:
  // We compute a minimum width that guarantees no more than maxColumns.
  // minmax(max(minItemWidth, 100%/maxColumns - gap), 1fr)
  if (maxColumns) {
    const gapValue = parseFloat(gap) || 1;
    const unit = gap.replace(/[\d.]/g, "") || "rem";
    // Ensure items are wide enough that at most maxColumns fit
    const minWidth = `max(${minItemWidth}px, calc((100% - ${(maxColumns - 1) * gapValue}${unit}) / ${maxColumns}))`;
    style.gridTemplateColumns = `repeat(auto-fill, minmax(min(${minWidth}, 100%), 1fr))`;
  }

  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

export default ResponsiveGrid;
