import type { ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useMagnetic } from "../../hooks/useMagnetic";

type BapButtonProps = {
    children: ReactNode;
    onClick?: () => void;
    type?: "button" | "submit";
    variant?: "primary" | "ghost" | "ghost-dark";
    accentColor?: string;
    size?: "md" | "lg" | "xl";
    icon?: LucideIcon;
    /** Trailing chevron (on by default — turn off for plain action buttons). */
    showChevron?: boolean;
    /** Cursor-following magnetic pull (use on hero/conversion CTAs). */
    magnetic?: boolean;
    /** Peak-moment treatment: pulsing accent glow + tactile pressed depth. */
    glow?: boolean;
    disabled?: boolean;
    className?: string;
};

/** Relative luminance of a #rrggbb color → choose readable ink. */
export function readableInk(hex: string): string {
    const m = hex.replace("#", "");
    if (m.length !== 6) return "#fff";
    const ch = [0, 2, 4].map(i => {
        const v = parseInt(m.slice(i, i + 2), 16) / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    return L > 0.4 ? "#0E1A2B" : "#ffffff";
}

export function BapButton({
    children,
    onClick,
    type = "button",
    variant = "primary",
    accentColor,
    size = "md",
    icon: Icon,
    showChevron = true,
    magnetic = false,
    glow = false,
    disabled = false,
    className = "",
}: BapButtonProps) {
    const mag = useMagnetic(0.35);
    const sizing =
        size === "xl"
            ? { padY: "py-3.5", padX: "px-7", text: "1rem", icon: 20 }
            : size === "lg"
              ? { padY: "py-3", padX: "px-6", text: "0.95rem", icon: 18 }
              : { padY: "py-2.5", padX: "px-5", text: "0.875rem", icon: 16 };

    const base =
        variant === "primary"
            ? "bg-primary text-primary-foreground hover:brightness-110 shadow-soft-sm"
            : variant === "ghost-dark"
              ? "bg-white/5 text-white border border-white/15 hover:bg-white/10"
              : "bg-secondary text-foreground border border-border hover:bg-muted";

    const accentStyle = accentColor ? { background: accentColor, color: readableInk(accentColor) } : undefined;
    const glowVar = glow ? ({ ["--cta-accent" as string]: accentColor ?? "#22d3ee" } as React.CSSProperties) : undefined;
    const press = variant === "primary" && !magnetic ? "bap-press" : "";

    return (
        <motion.button
            type={type}
            onClick={onClick}
            disabled={disabled}
            {...(magnetic ? { onPointerMove: mag.onPointerMove, onPointerLeave: mag.onPointerLeave } : {})}
            className={`font-display focus-ring group inline-flex items-center justify-center gap-2 ${base} ${glow ? "bap-cta-glow" : ""} ${press} ${sizing.padX} ${sizing.padY} rounded-xl tracking-wide transition-all duration-200 ease-pop hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none ${className}`}
            style={{
                fontSize: sizing.text,
                ...(accentColor && variant === "primary" ? accentStyle : {}),
                ...(glowVar ?? {}),
                ...(magnetic ? { x: mag.x, y: mag.y } : {}),
            }}
        >
            {Icon && <Icon size={sizing.icon} className="shrink-0" />}
            {children}
            {showChevron && (
                <ChevronRight
                    size={sizing.icon}
                    className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
            )}
        </motion.button>
    );
}
