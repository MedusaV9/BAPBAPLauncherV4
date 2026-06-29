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
        <div className={cn("mb-7", className)}>
            {eyebrow && (
                <div className="mb-3 flex items-center gap-2.5">
                    <span className="h-3.5 w-[3px] shrink-0 rounded-full bg-accent" />
                    <span className="font-body text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-accent">
                        {eyebrow}
                    </span>
                </div>
            )}
            <h1 className="font-display text-4xl leading-[0.95] tracking-tight text-foreground sm:text-[2.85rem]">
                {children}
            </h1>
            {subtitle && (
                <p className="mt-3 max-w-prose text-[0.95rem] leading-relaxed text-muted-foreground">{subtitle}</p>
            )}
        </div>
    );
}
