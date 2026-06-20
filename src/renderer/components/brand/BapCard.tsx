import type { ReactNode } from "react";
import { cn } from "../../app/lib/utils";

type BapCardProps = {
    children: ReactNode;
    className?: string;
    /** Lift on hover (use for clickable tiles). */
    interactive?: boolean;
    onClick?: () => void;
};

export function BapCard({ children, className = "", interactive = false, onClick }: BapCardProps) {
    const interactiveProps = interactive && onClick
        ? {
              role: "button",
              tabIndex: 0,
              onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onClick();
                  }
              },
          }
        : {};
    return (
        <div
            onClick={onClick}
            {...interactiveProps}
            className={cn(
                "bap-card",
                interactive &&
                    "cursor-pointer transition-all duration-200 ease-pop hover:-translate-y-0.5 hover:border-white/15 hover:shadow-soft active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                className
            )}
        >
            {children}
        </div>
    );
}
