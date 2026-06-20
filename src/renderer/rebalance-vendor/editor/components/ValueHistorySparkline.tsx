import React from "react";

/**
 * ValueHistorySparkline — pure SVG mini bar-chart used inline next to a
 * rebalance field's value. Renders the most recent N committed values so
 * editors can see at a glance how a knob has been trending.
 *
 * Design notes:
 * - Pure SVG, no charting libraries (keeps the bundle lean).
 * - Bars are coloured with `--accent-cool` to align with the editor's cool
 *   accent palette (no green / teal to avoid overlap with status colours).
 * - Statically rendered: there are no transitions or keyframes on the bars,
 *   which makes the component reduce-motion safe by construction.
 */

export interface ValueHistorySparklineProps {
    /**
     * Sequence of historical numeric values for the field, in chronological
     * order (oldest first). Values can be any finite numbers; non-finite
     * values are coerced to the running min so they don't blow up scaling.
     */
    values: number[];
    /**
     * SVG height in user-units. The viewBox is always `0 0 100 {height}`
     * so callers can stretch the rendered SVG horizontally with CSS.
     */
    height?: number;
    /**
     * Accessible label exposed to assistive tech. Defaults to a generic
     * description so consumers can omit it without losing accessibility.
     */
    ariaLabel?: string;
}

const ACCENT_COOL = "var(--accent-cool, #3b82f6)";
const ROOT_CLASS = "rebalance-value-history-sparkline";

function sanitize(values: number[]): number[] {
    // Clamp non-finite values to 0 so Math.min/max still produce sensible output.
    return values.map(v => (Number.isFinite(v) ? v : 0));
}

export function ValueHistorySparkline({
    values,
    height = 12,
    ariaLabel,
}: ValueHistorySparklineProps): React.ReactElement {
    const safeHeight = height > 0 ? height : 12;
    const viewBox = `0 0 100 ${safeHeight}`;

    /* ─── Placeholder ────────────────────────────────────────────────── */
    if (values.length < 2) {
        const label = ariaLabel ?? "Value history (no history yet)";
        return (
            <span
                className={`${ROOT_CLASS} ${ROOT_CLASS}--empty`}
                role="img"
                aria-label={label}
                data-testid="rebalance-value-history-sparkline"
                data-empty="true"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
                <svg
                    viewBox={viewBox}
                    aria-hidden="true"
                    preserveAspectRatio="none"
                    style={{ width: "100%", height: safeHeight, display: "block" }}
                >
                    <line
                        x1={0}
                        y1={safeHeight / 2}
                        x2={100}
                        y2={safeHeight / 2}
                        stroke={ACCENT_COOL}
                        strokeWidth={0.75}
                        strokeLinecap="round"
                        opacity={0.45}
                    />
                </svg>
                <span
                    className={`${ROOT_CLASS}__caption`}
                    data-testid="rebalance-value-history-sparkline-empty-caption"
                    style={{
                        fontSize: 10,
                        color: "var(--text-2, #94a3b8)",
                        whiteSpace: "nowrap",
                    }}
                >
                    no history yet
                </span>
            </span>
        );
    }

    /* ─── Bars ───────────────────────────────────────────────────────── */
    const cleaned = sanitize(values);
    const min = Math.min(...cleaned);
    const max = Math.max(...cleaned);
    const range = max - min;

    const slot = 100 / cleaned.length;
    // Reserve ~20% of each slot as a gap between bars for visual separation.
    const gap = Math.min(slot * 0.2, 1.5);
    const barWidth = Math.max(slot - gap, 0.5);
    // Keep a minimum visible bar height so flat series still render.
    const minBarHeight = Math.max(safeHeight * 0.08, 0.75);

    return (
        <svg
            className={ROOT_CLASS}
            viewBox={viewBox}
            preserveAspectRatio="none"
            role="img"
            aria-label={ariaLabel ?? "Value history"}
            data-testid="rebalance-value-history-sparkline"
            style={{ width: "100%", height: safeHeight, display: "block" }}
        >
            {cleaned.map((value, index) => {
                const normalized = range === 0 ? 0.5 : (value - min) / range;
                const drawHeight = Math.max(minBarHeight, normalized * safeHeight);
                const x = index * slot + gap / 2;
                const y = safeHeight - drawHeight;
                return (
                    <rect
                        key={index}
                        x={x}
                        y={y}
                        width={barWidth}
                        height={drawHeight}
                        fill={ACCENT_COOL}
                        data-testid="rebalance-sparkline-bar"
                        data-index={index}
                    />
                );
            })}
        </svg>
    );
}

export default ValueHistorySparkline;
