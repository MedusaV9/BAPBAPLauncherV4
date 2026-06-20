import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

/**
 * Hook that animates a number from its previous value to the target value.
 * Uses GSAP for smooth interpolation with configurable duration/easing.
 *
 * @param target - The target number to animate to
 * @param options - Configuration options
 * @returns The current displayed value (animated)
 */
export function useAnimatedCounter(
  target: number,
  options: {
    duration?: number;
    ease?: string;
    decimals?: number;
    enabled?: boolean;
  } = {}
): number {
  const {
    duration = 0.6,
    ease = "power2.out",
    decimals = 0,
    enabled = true,
  } = options;

  const [displayed, setDisplayed] = useState(target);
  const objRef = useRef({ value: target });
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    if (!enabled) {
      setDisplayed(target);
      return;
    }

    // Respect reduced motion
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReduced) {
      setDisplayed(target);
      return;
    }

    // Kill any in-progress animation
    if (tweenRef.current) {
      tweenRef.current.kill();
    }

    tweenRef.current = gsap.to(objRef.current, {
      value: target,
      duration,
      ease,
      onUpdate: () => {
        const rounded =
          decimals > 0
            ? parseFloat(objRef.current.value.toFixed(decimals))
            : Math.round(objRef.current.value);
        setDisplayed(rounded);
      },
      onComplete: () => {
        tweenRef.current = null;
      },
    });

    return () => {
      tweenRef.current?.kill();
    };
  }, [target, duration, ease, decimals, enabled]);

  return displayed;
}
