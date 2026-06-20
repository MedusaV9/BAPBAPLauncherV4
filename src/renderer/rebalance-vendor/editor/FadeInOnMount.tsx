import { useEffect, useRef, useState } from "react";

export interface FadeInOnMountProps {
  children: React.ReactNode;
  /** Delay before starting the fade (applied as transition-delay) */
  delay?: number;
  /** Duration of the fade in ms (default 200) */
  duration?: number;
  className?: string;
}

/**
 * FadeInOnMount – wraps children in a div that fades in on mount via CSS transition.
 * Respects `prefers-reduced-motion` by showing content immediately.
 * No layout-affecting styles (no transform, no position changes).
 */
export function FadeInOnMount({
  children,
  delay = 0,
  duration = 200,
  className,
}: FadeInOnMountProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReduced) {
      setVisible(true);
      return;
    }

    // Start animation on next frame to ensure initial opacity:0 is painted
    setAnimating(true);
    const raf = requestAnimationFrame(() => {
      setVisible(true);
    });

    // Remove will-change after transition completes
    const timer = window.setTimeout(() => {
      setAnimating(false);
    }, delay + duration + 50); // small buffer for safety

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [delay, duration]);

  const style: React.CSSProperties = {
    opacity: visible ? 1 : 0,
    transition: `opacity ${duration}ms ease-out${delay ? ` ${delay}ms` : ""}`,
    ...(animating ? { willChange: "opacity" } : {}),
  };

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
