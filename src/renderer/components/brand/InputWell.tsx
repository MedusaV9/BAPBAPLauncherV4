import * as React from "react";
import { cn } from "../../app/lib/utils";

// Recessed form-control well — #1f242e fill, #2d333f border, 10px radius,
// magenta focus ring. Shared by Settings, the folder picker, and dialogs.
export const InputWell = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    ({ className, ...props }, ref) => (
        <input
            ref={ref}
            className={cn(
                "flex h-10 w-full rounded-[0.625rem] border border-input bg-[var(--surface-inset)] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 ease-pop focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-50",
                className
            )}
            {...props}
        />
    )
);
InputWell.displayName = "InputWell";
