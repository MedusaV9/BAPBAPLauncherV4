import * as React from "react";
import { cn } from "../../app/lib/utils";

type ProgressProps = React.HTMLAttributes<HTMLDivElement> & {
    value?: number;
};

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
    ({ className, value = 0, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                "relative h-3 w-full overflow-hidden rounded-full border border-border bg-muted",
                className
            )}
            {...props}
        >
            <div
                className="h-full bg-accent transition-all duration-300 ease-pop"
                style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
            />
        </div>
    )
);
Progress.displayName = "Progress";

export { Progress };
