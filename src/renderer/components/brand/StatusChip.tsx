import { cn } from "../../app/lib/utils";

export type StatusTone = "idle" | "active" | "busy" | "error";

const TONE: Record<StatusTone, { dot: string; text: string; ring: string }> = {
    idle: { dot: "bg-muted-foreground", text: "text-muted-foreground", ring: "ring-white/10" },
    active: { dot: "bg-[#22d3ee]", text: "text-[#22d3ee]", ring: "ring-[#22d3ee]/25" },
    busy: { dot: "bg-[#ffb800]", text: "text-[#ffb800]", ring: "ring-[#ffb800]/25" },
    error: { dot: "bg-destructive", text: "text-destructive", ring: "ring-destructive/25" },
};

export function StatusChip({
    tone,
    label,
    pulse = false,
    className,
}: {
    tone: StatusTone;
    label: string;
    pulse?: boolean;
    className?: string;
}) {
    const t = TONE[tone];
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 ring-1",
                t.ring,
                className
            )}
        >
            <span className="relative flex h-1.5 w-1.5">
                {pulse && (
                    <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", t.dot)} />
                )}
                <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", t.dot)} />
            </span>
            <span className={cn("font-mono text-[0.625rem] font-medium uppercase tracking-[0.14em]", t.text)}>
                {label}
            </span>
        </span>
    );
}
