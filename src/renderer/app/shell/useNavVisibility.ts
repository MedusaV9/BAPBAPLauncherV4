import { useEffect, useRef, useState } from "react";

/**
 * Drives the floating top-nav visibility: shown at rest, hidden when the user
 * scrolls down, revealed on scroll-up or when the pointer nears the top edge.
 * Listens in the capture phase so it catches scrolls from any nested workspace
 * scroll container, not just window.
 */
export function useNavVisibility(revealZonePx = 90): boolean {
    const [visible, setVisible] = useState(true);
    const lastTops = useRef(new WeakMap<EventTarget, number>());

    useEffect(() => {
        function onScroll(e: Event) {
            const el = e.target as HTMLElement | null;
            if (!el || typeof el.scrollTop !== "number") return;
            const prev = lastTops.current.get(el) ?? 0;
            const top = el.scrollTop;
            lastTops.current.set(el, top);
            if (top <= 8) {
                setVisible(true);
            } else if (top > prev + 4) {
                setVisible(false);
            } else if (top < prev - 4) {
                setVisible(true);
            }
        }
        function onMove(e: PointerEvent) {
            if (e.clientY <= revealZonePx) setVisible(true);
        }
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("pointermove", onMove);
        return () => {
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("pointermove", onMove);
        };
    }, [revealZonePx]);

    return visible;
}
