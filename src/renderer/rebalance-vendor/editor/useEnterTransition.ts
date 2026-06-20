import gsap from "gsap";
import { useEffect, useRef } from "react";

export function useEnterTransition<T extends HTMLElement = HTMLDivElement>(trigger: boolean): React.RefObject<T> {
  const containerRef = useRef<T | null>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    if (!trigger) return;
    const container = containerRef.current;
    if (!container) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      container.style.opacity = "1";
      return;
    }

    tweenRef.current?.kill();

    // Simple fade + subtle y shift on the container only
    container.style.opacity = "0";
    const tween = gsap.fromTo(
      container,
      { opacity: 0, y: 10 },
      {
        opacity: 1,
        y: 0,
        duration: 0.2,
        ease: "power2.out",
        onComplete: () => {
          container.style.removeProperty("opacity");
          container.style.removeProperty("transform");
        },
      },
    );
    tweenRef.current = tween;

    return () => {
      tweenRef.current?.kill();
    };
  }, [trigger]);

  return containerRef as React.RefObject<T>;
}
