import type { ReactNode } from "react";
import { cn } from "../../app/lib/utils";

type SectionHeadingProps = {
    children: ReactNode;
    subtitle?: ReactNode;
    eyebrow?: ReactNode;
    className?: string;
};

export function SectionHeading({ children, subtitle, eyebrow, className = "" }: SectionHeadingProps) {
    return (
        <div className={cn("mb-6", className)}>
            {eyebrow && (
                <div className="mb-2 flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                    <span className="font-display text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">
                        {eyebrow}
                    </span>
                </div>
            )}
            <h1 className="font-display text-3xl leading-[1.05] tracking-tight text-foreground">{children}</h1>
            {subtitle && <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
        </div>
    );
}
