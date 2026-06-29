import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "../../app/lib/utils";

type RowProps = {
    children: ReactNode;
    /** Marks the active/current item with the 2px accent spine. */
    active?: boolean;
    /** Override the spine + selection tint accent (defaults to magenta). */
    accent?: string;
    onClick?: () => void;
    className?: string;
};

// The universal list-row primitive — shared by Launch profiles, Radio queue,
// Tools file list, and Settings rows so every dense list reads as one material.
export function Row({ children, active = false, accent, onClick, className }: RowProps) {
    const interactive = Boolean(onClick);
    const style = active && accent ? ({ ["--spine-accent" as string]: accent } as React.CSSProperties) : undefined;
    return (
        <div
            onClick={onClick}
            {...(interactive
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
            style={style}
            className={cn(
                "flex items-center gap-3 rounded-[0.625rem] px-3 py-2.5 transition-colors duration-150 ease-pop",
                interactive && "cursor-pointer hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active && "bap-spine bg-[var(--surface-inset)]",
                className
            )}
        >
            {children}
        </div>
    );
}
