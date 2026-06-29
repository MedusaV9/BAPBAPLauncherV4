import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "../../app/lib/utils";

type FeatureCardProps = {
    children: ReactNode;
    /** Lift + accent-edge on hover (clickable tiles). */
    interactive?: boolean;
    selected?: boolean;
    onClick?: () => void;
    className?: string;
};

// Shared card DNA — 18px radius, surface-step depth, magenta-tinted hover lift,
// full-bleed image top. Mods cards and instance/bundle tiles both build on this.
export function FeatureCard({
    children,
    interactive = false,
    selected = false,
    onClick,
    className,
}: FeatureCardProps) {
    const clickable = interactive && Boolean(onClick);
    return (
        <div
            onClick={onClick}
            {...(clickable
                ? {
                      role: "button",
                      tabIndex: 0,
                      onKeyDown: (e: KeyboardEvent) => {
                          if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onClick!();
                          }
                      },
                  }
                : {})}
            className={cn(
                "relative overflow-hidden rounded-[1.125rem] border border-border bg-card",
                clickable &&
                    "cursor-pointer transition-all duration-200 ease-pop hover:-translate-y-[3px] hover:border-accent/45 hover:bg-[var(--surface-inset)] hover:shadow-[0_8px_24px_rgba(233,30,140,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected && "border-accent ring-1 ring-accent/40",
                className
            )}
        >
            {children}
        </div>
    );
}
