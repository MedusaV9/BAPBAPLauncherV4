/**
 * Compact nav-glass bubble — opens/closes the archive.
 * Parent should place it truly centered (absolute left-1/2 -translate-x-1/2).
 */
import { ChevronDown, ChevronUp } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { cn } from "../lib/utils";

const ARCHIVE_ANCHOR_ID = "bapbap-files-archive";

export function ArchiveScrollHint({
    archiveOpen,
    onToggle,
}: {
    archiveOpen: boolean;
    onToggle: () => void;
}) {
    const reduceMotion = useReducedMotion();

    const handleClick = () => {
        const willOpen = !archiveOpen;
        onToggle();
        if (willOpen) {
            // After open, nudge archive into view (bubble stays above it)
            window.setTimeout(() => {
                document.getElementById(ARCHIVE_ANCHOR_ID)?.scrollIntoView({
                    behavior: reduceMotion ? "auto" : "smooth",
                    block: "start",
                });
            }, 80);
        }
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            aria-expanded={archiveOpen}
            className={cn(
                "nav-glass group flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 pr-2.5",
                "font-body text-[0.72rem] font-medium tracking-wide text-foreground/90",
                "transition-[transform,filter] duration-200 ease-pop",
                "hover:-translate-y-px hover:brightness-110",
                "focus-ring"
            )}
        >
            <span className="whitespace-nowrap">
                {archiveOpen ? "Hide archive" : "Searching for another version?"}
            </span>
            {archiveOpen ? (
                <ChevronUp size={14} className="shrink-0 text-muted-foreground" />
            ) : (
                <ChevronDown
                    size={14}
                    className={cn(
                        "shrink-0 text-muted-foreground transition-transform group-hover:translate-y-0.5",
                        !reduceMotion && "archive-hint-bob"
                    )}
                />
            )}
            <style>{`
                @keyframes archive-hint-bob-kf {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(2px); }
                }
                .archive-hint-bob {
                    animation: archive-hint-bob-kf 1.5s ease-in-out infinite;
                }
            `}</style>
        </button>
    );
}

export { ARCHIVE_ANCHOR_ID };
