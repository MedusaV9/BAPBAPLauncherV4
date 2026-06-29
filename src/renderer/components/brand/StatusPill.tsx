import type { ReactNode } from "react";
import { cn } from "../../app/lib/utils";

export type StatusTone = "new" | "installed" | "update" | "error" | "curated" | "neutral";

// Column formula: text = accent 100%, bg = accent @12%, border 1px accent @40%.
const TONE: Record<StatusTone, string> = {
    new: "#22d3ee",
    installed: "#ffb800",
    update: "#e91e8c",
    error: "#ff5a5a",
    curated: "#7c3aed",
    neutral: "#969cab",
};

export function StatusPill({
    tone,
    children,
    onImage = false,
    className,
}: {
    tone: StatusTone;
    children: ReactNode;
    /** Transparent variant for overlaying full-bleed art. */
    onImage?: boolean;
    className?: string;
}) {
    const accent = TONE[tone];
    const style = onImage
        ? { color: "#fff", borderColor: "rgba(255,255,255,0.35)", background: "rgba(10,11,16,0.35)" }
        : {
              color: accent,
              borderColor: `color-mix(in oklab, ${accent} 40%, transparent)`,
              background: `color-mix(in oklab, ${accent} 12%, transparent)`,
          };
    return (
        <span
            style={style}
            className={cn(
                "inline-flex items-center gap-1 rounded-[0.625rem] border px-2 py-0.5 font-body text-[0.6875rem] font-semibold uppercase tracking-wide",
                className
            )}
        >
            {children}
        </span>
    );
}
