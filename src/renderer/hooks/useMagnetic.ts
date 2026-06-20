import { useMotionValue, useSpring } from "motion/react";
import type React from "react";

function prefersReducedMotion(): boolean {
    return (
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
    );
}

/** Magnetic pull toward the cursor. Spread onto a motion element. */
export function useMagnetic(strength = 0.3) {
    const mx = useMotionValue(0);
    const my = useMotionValue(0);
    const x = useSpring(mx, { stiffness: 260, damping: 18 });
    const y = useSpring(my, { stiffness: 260, damping: 18 });
    const finePointer =
        typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;

    function onPointerMove(e: React.PointerEvent) {
        if (prefersReducedMotion() || !finePointer) return;
        const el = e.currentTarget as HTMLElement;
        const r = el.getBoundingClientRect();
        mx.set((e.clientX - (r.left + r.width / 2)) * strength);
        my.set((e.clientY - (r.top + r.height / 2)) * strength);
    }
    function onPointerLeave() {
        mx.set(0);
        my.set(0);
    }
    return { x, y, onPointerMove, onPointerLeave };
}
