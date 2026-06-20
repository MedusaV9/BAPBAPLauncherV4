import gsap from "gsap";
import React, { useEffect, useRef, useState } from "react";

const PRESSABLE_SELECTOR = [
  '[data-rebalance-pressable="true"]',
  ".v2-button",
  ".v2-card--interactive",
  ".task-record",
  ".swap-source-card",
  '[role="button"]',
  ".rebalance-workspace-tool-button",
  ".rebalance-nav-drawer-item",
  ".rebalance-home-flow-card",
  ".task-choice",
  ".task-group-button",
  ".task-icon-choice",
  ".task-value-browser-row",
  ".task-value-browser-tab",
  ".task-linked-effect-actions button",
  ".task-effect-reference-grid button",
  ".task-effect-picker-results button",
  ".task-swap-source-card",
  ".task-empty-workspace-pill",
  ".rebalance-search-result-card",
  ".task-segmented button",
].join(",");

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setPrefersReducedMotion(mediaQuery.matches);

    apply();
    mediaQuery.addEventListener("change", apply);
    return () => mediaQuery.removeEventListener("change", apply);
  }, []);

  return prefersReducedMotion;
}

/**
 * Checks if an element's bounding rect is within the viewport plus a 120px margin.
 */
function inViewport(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.top < window.innerHeight + 120 &&
    rect.bottom > -120 &&
    rect.left < window.innerWidth + 120 &&
    rect.right > -120
  );
}

export function usePageEntranceMotion() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    if (prefersReducedMotion) {
      root.style.opacity = "1";
      return;
    }

    // Simple container fade — no per-item stagger, no transforms
    root.style.opacity = "0";
    const tween = gsap.to(root, {
      opacity: 1,
      duration: 0.2,
      ease: "power2.out",
      onComplete: () => {
        root.style.removeProperty("opacity");
      },
    });

    return () => { tween.kill(); };
  }, [prefersReducedMotion]);

  return rootRef;
}

export function useAttentionPulse<T extends HTMLElement>(enabled: boolean) {
  const elementRef = useRef<T | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion || !enabled || !elementRef.current) {
      return;
    }

    if (elementRef.current.closest(".rebalance-embedded-root")) {
      return;
    }

    const target = elementRef.current;
    target.style.willChange = "transform, box-shadow";

    // Looping scale pulse (1.0 → 1.02 → 1.0) with blue glow, every 3 seconds
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 3 });

    tl.to(target, {
      scale: 1.01,
      boxShadow: "0 0 16px 4px rgba(88, 113, 255, 0.45), 0 0 32px 8px rgba(88, 113, 255, 0.2)",
      duration: 0.5,
      ease: "power2.inOut",
    });
    tl.to(target, {
      scale: 1.0,
      boxShadow: "0 0 0px 0px rgba(88, 113, 255, 0), 0 0 0px 0px rgba(88, 113, 255, 0)",
      duration: 0.5,
      ease: "power2.inOut",
    });

    const stop = () => {
      tl.kill();
      gsap.set(target, { scale: 1, boxShadow: "none" });
      target.style.willChange = "";
    };

    target.addEventListener("mouseenter", stop, { once: true });
    target.addEventListener("focusin", stop, { once: true });

    return () => {
      target.removeEventListener("mouseenter", stop);
      target.removeEventListener("focusin", stop);
      stop();
    };
  }, [enabled, prefersReducedMotion]);

  return elementRef;
}

export function useDrawerEntranceMotion<T extends HTMLElement>(enabled: boolean) {
  const elementRef = useRef<T | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const target = elementRef.current;
    if (prefersReducedMotion || !enabled || !target) {
      return;
    }

    target.style.willChange = "transform, opacity";
    const tween = gsap.from(target, {
      opacity: 0,
      x: -22,
      scale: 0.985,
      duration: 0.23,
      ease: "power3.out",
      onComplete: () => {
        target.style.willChange = "";
      },
    });

    return () => {
      tween.kill();
      target.style.willChange = "";
    };
  }, [enabled, prefersReducedMotion]);

  return elementRef;
}

export function useSelectionChangeMotion<T extends HTMLElement>(motionKey: unknown) {
  const elementRef = useRef<T | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const target = elementRef.current;
    if (prefersReducedMotion || !target) {
      return;
    }

    target.style.willChange = "transform, opacity";
    const tween = gsap.from(target, {
      opacity: 0.72,
      y: 6,
      scale: 0.996,
      duration: 0.18,
      ease: "power2.out",
      onComplete: () => {
        target.style.willChange = "";
      },
    });

    return () => {
      target.style.willChange = "";
      tween.kill();
    };
  }, [motionKey, prefersReducedMotion]);

  return elementRef;
}

/**
 * Manages overlay entrance/exit animations with mount lifecycle.
 * Takes `isOpen` parameter, returns `{ ref, mounted }`.
 * `mounted` stays true during exit animation so the DOM remains until animation completes.
 * Kills previous animation on rapid open/close.
 *
 * Animations:
 * - Backdrop: fade in over 200ms / fade out over 150ms
 * - Dialog (modal): scale 0.9→1 + opacity 0→1 over 300ms (back.out(1.5)) / scale→0.95 + opacity→0 over 200ms (power2.in)
 * - Drawer: slide from x:100% over 250ms (power3.out) / slide to x:100% over 200ms (power2.in)
 * - Toast: slide from y:-20 + opacity 0 over 200ms / slide to y:-10 + opacity 0 over 150ms
 */
export function useOverlayEntranceMotion<T extends HTMLElement>(isOpen: boolean) {
  const elementRef = useRef<T | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(isOpen);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const phaseRef = useRef<"idle" | "entering" | "visible" | "exiting">("idle");

  const killTimeline = () => {
    if (timelineRef.current) {
      timelineRef.current.kill();
      timelineRef.current = null;
    }
  };

  const clearStyles = (root: HTMLElement) => {
    const backdrop = root.querySelector<HTMLElement>("[data-motion-backdrop]");
    const dialog = root.querySelector<HTMLElement>("[data-motion-dialog]");
    const drawer = root.querySelector<HTMLElement>("[data-motion-drawer]");
    const toasts = Array.from(root.querySelectorAll<HTMLElement>("[data-motion-toast]"));
    [backdrop, dialog, drawer, ...toasts].filter((t): t is HTMLElement => Boolean(t)).forEach((t) => {
      t.style.willChange = "";
      t.style.transformOrigin = "";
    });
  };

  const runEnterAnimation = () => {
    const root = elementRef.current;
    if (!root || prefersReducedMotion) {
      phaseRef.current = "visible";
      return;
    }

    killTimeline();
    phaseRef.current = "entering";

    const backdrop = root.querySelector<HTMLElement>("[data-motion-backdrop]");
    const dialog = root.querySelector<HTMLElement>("[data-motion-dialog]");
    const drawer = root.querySelector<HTMLElement>("[data-motion-drawer]");
    const toasts = Array.from(root.querySelectorAll<HTMLElement>("[data-motion-toast]"));
    const allTargets = [backdrop, dialog, drawer, ...toasts].filter((t): t is HTMLElement => Boolean(t));

    allTargets.forEach((t) => {
      t.style.willChange = "transform, opacity";
    });

    const tl = gsap.timeline({
      onComplete: () => {
        allTargets.forEach((t) => {
          t.style.willChange = "";
          t.style.transformOrigin = "";
        });
        phaseRef.current = "visible";
        timelineRef.current = null;
      },
    });

    // Backdrop: fade in over 200ms
    if (backdrop) {
      tl.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power2.out" }, 0);
    }

    // Modal dialog: scale from 0.95 + opacity 0 → scale 1 + opacity 1 over 300ms with back.out(1.5)
    if (dialog) {
      dialog.style.transformOrigin = "50% 50%";
      tl.fromTo(
        dialog,
        { opacity: 0, scale: 0.95 },
        { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(1.5)" },
        0,
      );
    }

    // Drawer: slide from x: 100% over 150ms with power3.out
    if (drawer) {
      tl.fromTo(
        drawer,
        { xPercent: 100 },
        { xPercent: 0, duration: 0.15, ease: "power3.out" },
        0,
      );
    }

    // Toast: slide from y: -20 + opacity 0 over 200ms
    if (toasts.length) {
      tl.fromTo(
        toasts,
        { opacity: 0, y: -20 },
        { opacity: 1, y: 0, duration: 0.2, stagger: 0.04, ease: "power2.out" },
        0,
      );
    }

    timelineRef.current = tl;
  };

  const runExitAnimation = (onDone: () => void) => {
    const root = elementRef.current;
    if (!root || prefersReducedMotion) {
      onDone();
      return;
    }

    killTimeline();
    phaseRef.current = "exiting";

    const backdrop = root.querySelector<HTMLElement>("[data-motion-backdrop]");
    const dialog = root.querySelector<HTMLElement>("[data-motion-dialog]");
    const drawer = root.querySelector<HTMLElement>("[data-motion-drawer]");
    const toasts = Array.from(root.querySelectorAll<HTMLElement>("[data-motion-toast]"));
    const allTargets = [backdrop, dialog, drawer, ...toasts].filter((t): t is HTMLElement => Boolean(t));

    allTargets.forEach((t) => {
      t.style.willChange = "transform, opacity";
    });

    const tl = gsap.timeline({
      onComplete: () => {
        allTargets.forEach((t) => {
          t.style.willChange = "";
          t.style.transformOrigin = "";
        });
        phaseRef.current = "idle";
        timelineRef.current = null;
        onDone();
      },
    });

    // Backdrop: fade out over 150ms
    if (backdrop) {
      tl.to(backdrop, { opacity: 0, duration: 0.15, ease: "power2.in" }, 0);
    }

    // Modal dialog: scale to 0.95 + opacity 0 over 200ms with power2.in
    if (dialog) {
      tl.to(dialog, { opacity: 0, scale: 0.95, duration: 0.2, ease: "power2.in" }, 0);
    }

    // Drawer: slide to x: 100% over 120ms with power2.in
    if (drawer) {
      tl.to(drawer, { xPercent: 100, duration: 0.12, ease: "power2.in" }, 0);
    }

    // Toast: slide to y: -10 + opacity 0 over 150ms
    if (toasts.length) {
      tl.to(toasts, { opacity: 0, y: -10, duration: 0.15, ease: "power2.in" }, 0);
    }

    timelineRef.current = tl;
  };

  // Sync mounted state with isOpen
  useEffect(() => {
    if (isOpen) {
      // Kill any in-progress exit animation on rapid re-open
      killTimeline();
      setMounted(true);
    } else if (mounted) {
      // Run exit animation, then unmount
      runExitAnimation(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Run enter animation once mounted and isOpen
  useEffect(() => {
    if (mounted && isOpen && phaseRef.current !== "entering" && phaseRef.current !== "visible") {
      const frame = requestAnimationFrame(() => {
        runEnterAnimation();
      });
      return () => cancelAnimationFrame(frame);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, isOpen]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => { killTimeline(); };
  }, []);

  return { ref: elementRef, mounted };
}

/**
 * Manages overlay open/close animation lifecycle.
 * Keeps overlay mounted during close animation, then signals unmount.
 * Handles rapid open/close (cancels previous animations within 100ms).
 * Triggers close animation on Escape and backdrop click BEFORE unmount.
 *
 * Animations match useOverlayEntranceMotion:
 * - Backdrop: fade in 200ms / out 150ms
 * - Dialog: scale 0.9→1 over 300ms (back.out(1.5)) / scale→0.95 over 200ms (power2.in)
 */
export function useOverlayTransition(isOpen: boolean) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(isOpen);
  const phaseRef = useRef<"idle" | "opening" | "open" | "closing">("idle");
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const closeCallbackRef = useRef<(() => void) | null>(null);
  const lastOpenTimeRef = useRef(0);

  const killTimeline = () => {
    if (timelineRef.current) {
      timelineRef.current.kill();
      timelineRef.current = null;
    }
  };

  const clearWillChange = (root: HTMLElement) => {
    const backdrop = root.querySelector<HTMLElement>("[data-motion-backdrop]");
    const dialog = root.querySelector<HTMLElement>("[data-motion-dialog]");
    [backdrop, dialog].filter((t): t is HTMLElement => Boolean(t)).forEach((t) => {
      t.style.willChange = "";
      t.style.transformOrigin = "";
    });
  };

  const runCloseAnimation = (onDone: () => void) => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion) {
      onDone();
      return;
    }

    // If rapid open/close (within 100ms), skip close animation
    if (Date.now() - lastOpenTimeRef.current < 100) {
      killTimeline();
      clearWillChange(root);
      onDone();
      return;
    }

    killTimeline();
    phaseRef.current = "closing";

    const backdrop = root.querySelector<HTMLElement>("[data-motion-backdrop]");
    const dialog = root.querySelector<HTMLElement>("[data-motion-dialog]");
    const targets = [backdrop, dialog].filter((t): t is HTMLElement => Boolean(t));

    targets.forEach((t) => {
      t.style.willChange = "transform, opacity";
    });

    const tl = gsap.timeline({
      onComplete: () => {
        targets.forEach((t) => {
          t.style.willChange = "";
          t.style.transformOrigin = "";
        });
        phaseRef.current = "idle";
        timelineRef.current = null;
        onDone();
      },
    });

    // Backdrop: fade out over 150ms
    if (backdrop) {
      tl.to(backdrop, { opacity: 0, duration: 0.15, ease: "power2.in" }, 0);
    }

    // Dialog: scale to 0.95 + opacity 0 over 200ms
    if (dialog) {
      tl.to(dialog, { opacity: 0, scale: 0.95, duration: 0.2, ease: "power2.in" }, 0);
    }

    timelineRef.current = tl;
  };

  const runOpenAnimation = () => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion) {
      phaseRef.current = "open";
      return;
    }

    killTimeline();
    phaseRef.current = "opening";
    lastOpenTimeRef.current = Date.now();

    const backdrop = root.querySelector<HTMLElement>("[data-motion-backdrop]");
    const dialog = root.querySelector<HTMLElement>("[data-motion-dialog]");
    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-motion-result]")).slice(0, 9);
    const targets = [backdrop, dialog, ...items].filter((t): t is HTMLElement => Boolean(t));

    targets.forEach((t) => {
      t.style.willChange = "transform, opacity";
    });

    const tl = gsap.timeline({
      onComplete: () => {
        targets.forEach((t) => {
          t.style.willChange = "";
          t.style.transformOrigin = "";
        });
        phaseRef.current = "open";
        timelineRef.current = null;
      },
    });

    // Backdrop: fade in over 200ms
    if (backdrop) {
      tl.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power2.out" }, 0);
    }

    // Dialog: scale from 0.9 + opacity 0 → scale 1 + opacity 1 over 300ms with back.out(1.5)
    if (dialog) {
      dialog.style.transformOrigin = "50% 50%";
      tl.fromTo(
        dialog,
        { opacity: 0, scale: 0.9 },
        { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(1.5)" },
        0,
      );
    }

    if (items.length) {
      tl.fromTo(
        items,
        { opacity: 0, y: 6 },
        { opacity: 1, y: 0, duration: 0.17, stagger: 0.018, ease: "power2.out" },
        0.1,
      );
    }

    timelineRef.current = tl;
  };

  // Sync mounted state with isOpen
  useEffect(() => {
    if (isOpen) {
      // Cancel any in-progress close
      if (phaseRef.current === "closing") {
        killTimeline();
      }
      setMounted(true);
    } else if (mounted) {
      // Trigger close animation, then unmount
      runCloseAnimation(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Run open animation once mounted and isOpen
  useEffect(() => {
    if (mounted && isOpen && phaseRef.current !== "opening" && phaseRef.current !== "open") {
      // Wait one frame for DOM to render
      const frame = requestAnimationFrame(() => {
        runOpenAnimation();
      });
      return () => cancelAnimationFrame(frame);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, isOpen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      killTimeline();
    };
  }, []);

  return {
    /** Ref to attach to the overlay root element */
    ref: rootRef,
    /** Whether the overlay should be rendered in DOM (stays true during close animation) */
    mounted,
    /** Call this to register the external close handler (e.g., setOpen(false)) */
    setCloseCallback: (cb: () => void) => {
      closeCallbackRef.current = cb;
    },
  };
}

export function useWorkspaceTopbarMotion<T extends HTMLElement>(hidden: boolean) {
  const elementRef = useRef<T | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const target = elementRef.current;
    if (!target) {
      return;
    }

    // Always clear stale inline styles before (re)starting any animation.
    // gsap.from/to can leave opacity:0 on the element if the previous tween
    // was interrupted (rapid hidden toggles, unmount mid-tween, prefers-reduced-motion
    // changes, fast page navigation), causing the topbar to render invisible.
    target.style.opacity = "";
    target.style.transform = "";

    if (prefersReducedMotion) {
      if (hidden) {
        target.style.opacity = "0";
        target.style.transform = "translateY(calc(-100% - 0.6rem))";
      } else {
        // Force the natural visible state — explicit resets guard against
        // any edge cases where stale inline styles might linger.
        target.style.opacity = "";
        target.style.transform = "";
        target.style.display = "";
      }
      return () => {
        target.style.opacity = "";
        target.style.transform = "";
      };
    }

    target.style.willChange = "transform, opacity";
    let tween: gsap.core.Tween;

    if (hidden) {
      tween = gsap.to(target, {
        opacity: 0,
        y: -18,
        scale: 0.992,
        duration: 0.17,
        ease: "power2.in",
        onComplete: () => {
          target.style.willChange = "";
        },
      });
    } else {
      // Use fromTo (explicit start AND end states) instead of gsap.from
      // so an interrupted tween can never leave the element stuck at opacity:0.
      tween = gsap.fromTo(
        target,
        { opacity: 0, y: -18, scale: 0.992 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.22,
          ease: "power3.out",
          onComplete: () => {
            target.style.willChange = "";
          },
        }
      );
    }

    return () => {
      tween.kill();
      target.style.willChange = "";
      // Reset inline styles after kill() so a remount cannot inherit
      // a stale opacity:0 / transform from a partially-completed tween.
      target.style.opacity = "";
      target.style.transform = "";
    };
  }, [hidden, prefersReducedMotion]);

  return elementRef;
}

export function useRebalanceInteractionMotion<T extends HTMLElement>() {
  const rootRef = useRef<T | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const touchedTargets = new Set<HTMLElement>();
    const hoveredTargets = new WeakSet<HTMLElement>();
    const focusedTargets = new WeakSet<HTMLElement>();
    const pressedTargets = new WeakSet<HTMLElement>();

    const DISABLED_SELECTOR = "[disabled], .v2-button--disabled";

    const findPressable = (target: EventTarget | null) => {
      if (!(target instanceof Element)) {
        return null;
      }

      const pressable = target.closest<HTMLElement>(PRESSABLE_SELECTOR);
      if (!pressable || !root.contains(pressable)) {
        return null;
      }

      // Skip disabled elements
      if (
        pressable.matches(DISABLED_SELECTOR) ||
        pressable.getAttribute("aria-disabled") === "true"
      ) {
        return null;
      }

      return pressable;
    };

    const tweenTo = (target: HTMLElement, vars: gsap.TweenVars) => {
      gsap.killTweensOf(target);
      touchedTargets.add(target);
      target.style.willChange = "transform, box-shadow, border-color";
      target.style.transformOrigin = "50% 50%";
      gsap.to(target, vars);
    };

    const resetStyles = (target: HTMLElement) => {
      target.style.willChange = "";
      target.style.transformOrigin = "";
      target.style.boxShadow = "";
      target.style.borderColor = "";
    };

    // --- Reduced motion: only focus ring, no transforms ---
    if (prefersReducedMotion) {
      const onFocusIn = (event: FocusEvent) => {
        const pressable = findPressable(event.target);
        if (!pressable) return;
        // Only apply focus ring for keyboard focus (focus-visible)
        if (!(event.target instanceof HTMLElement) || !event.target.matches(":focus-visible")) return;
        focusedTargets.add(pressable);
        touchedTargets.add(pressable);
        gsap.to(pressable, {
          boxShadow: "0 0 0 3px rgba(88, 113, 255, 0.22)",
          duration: 0.15,
          ease: "power2.out",
        });
      };

      const onFocusOut = (event: FocusEvent) => {
        const pressable = findPressable(event.target);
        if (!pressable) return;
        focusedTargets.delete(pressable);
        gsap.to(pressable, {
          boxShadow: "none",
          duration: 0.15,
          ease: "power2.out",
          onComplete: () => {
            pressable.style.boxShadow = "";
          },
        });
      };

      root.addEventListener("focusin", onFocusIn);
      root.addEventListener("focusout", onFocusOut);

      return () => {
        root.removeEventListener("focusin", onFocusIn);
        root.removeEventListener("focusout", onFocusOut);
        touchedTargets.forEach((target) => {
          gsap.killTweensOf(target);
          target.style.boxShadow = "";
        });
      };
    }

    // --- Full motion interactions ---

    const release = (target: HTMLElement | null, forceBase = false) => {
      if (!target) {
        return;
      }

      pressedTargets.delete(target);
      const shouldFloat = !forceBase && (hoveredTargets.has(target) || focusedTargets.has(target));

      gsap.killTweensOf(target);
      gsap.to(target, {
        scale: shouldFloat ? 1.01 : 1,
        y: 0,
        duration: shouldFloat ? 0.15 : 0.2,
        ease: shouldFloat ? "power2.out" : "back.out(2.0)",
        borderColor: shouldFloat ? "rgba(255, 255, 255, 0.18)" : "",
        onComplete: () => {
          if (!shouldFloat) {
            resetStyles(target);
          }
        },
      });
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        return;
      }

      const pressable = findPressable(event.target);
      if (!pressable) {
        return;
      }

      if (event.relatedTarget instanceof Node && pressable.contains(event.relatedTarget)) {
        return;
      }

      hoveredTargets.add(pressable);
      if (pressedTargets.has(pressable)) {
        return;
      }

      // Hover: scale to 1.01 with subtle border glow
      tweenTo(pressable, {
        scale: 1.01,
        y: 0,
        duration: 0.15,
        ease: "power2.out",
        borderColor: "rgba(255, 255, 255, 0.18)",
      });
    };

    const onPointerOut = (event: PointerEvent) => {
      const pressable = findPressable(event.target);
      if (!pressable) {
        return;
      }

      if (event.relatedTarget instanceof Node && pressable.contains(event.relatedTarget)) {
        return;
      }

      hoveredTargets.delete(pressable);
      release(pressable, !focusedTargets.has(pressable));
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      const pressable = findPressable(event.target);
      if (!pressable) {
        return;
      }

      // Press: scale to 0.98 quickly for snappy feedback
      pressedTargets.add(pressable);
      tweenTo(pressable, {
        scale: 0.98,
        y: 0,
        duration: 0.1,
        ease: "power2.in",
        borderColor: "",
      });
    };

    const onPointerUp = (event: PointerEvent) => {
      // Release: bounce back with elastic spring feel
      release(findPressable(event.target));
    };
    const onPointerCancel = (event: PointerEvent) => release(findPressable(event.target), true);
    const onPointerLeave = (event: PointerEvent) => release(findPressable(event.target), true);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      const pressable = findPressable(event.target);
      if (!pressable) {
        return;
      }

      gsap.killTweensOf(pressable);
      touchedTargets.add(pressable);
      pressable.style.willChange = "transform, box-shadow, border-color";
      pressable.style.transformOrigin = "50% 50%";
      // Quick press-and-bounce for keyboard activation
      gsap.fromTo(
        pressable,
        { scale: 1, y: 0 },
        {
          scale: 0.98,
          y: 0,
          duration: 0.1,
          ease: "power2.in",
          onComplete: () => {
            gsap.to(pressable, {
              scale: 1,
              y: 0,
              duration: 0.2,
              ease: "back.out(2.0)",
              onComplete: () => {
                if (!hoveredTargets.has(pressable) && !focusedTargets.has(pressable)) {
                  resetStyles(pressable);
                }
              },
            });
          },
        },
      );
    };

    const onFocusIn = (event: FocusEvent) => {
      const pressable = findPressable(event.target);
      if (!pressable) {
        return;
      }

      focusedTargets.add(pressable);
      touchedTargets.add(pressable);

      // Focus-visible: blue ring animated in
      if (event.target instanceof HTMLElement && event.target.matches(":focus-visible")) {
        pressable.style.willChange = "transform, box-shadow, border-color";
        pressable.style.transformOrigin = "50% 50%";
        gsap.to(pressable, {
          boxShadow: "0 0 0 3px rgba(88, 113, 255, 0.22)",
          duration: 0.15,
          ease: "power2.out",
        });
      }

      if (pressedTargets.has(pressable)) {
        return;
      }

      tweenTo(pressable, {
        scale: 1.01,
        y: 0,
        duration: 0.15,
        ease: "power2.out",
        borderColor: "rgba(255, 255, 255, 0.18)",
      });
    };

    const onFocusOut = (event: FocusEvent) => {
      const pressable = findPressable(event.target);
      if (!pressable) {
        return;
      }

      focusedTargets.delete(pressable);

      // Remove focus ring
      gsap.to(pressable, {
        boxShadow: "none",
        duration: 0.12,
        ease: "power2.out",
      });

      release(pressable, !hoveredTargets.has(pressable));
    };

    root.addEventListener("pointerover", onPointerOver);
    root.addEventListener("pointerout", onPointerOut);
    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointerup", onPointerUp);
    root.addEventListener("pointercancel", onPointerCancel);
    root.addEventListener("pointerleave", onPointerLeave, true);
    root.addEventListener("keydown", onKeyDown);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);

    return () => {
      root.removeEventListener("pointerover", onPointerOver);
      root.removeEventListener("pointerout", onPointerOut);
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointercancel", onPointerCancel);
      root.removeEventListener("pointerleave", onPointerLeave, true);
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      touchedTargets.forEach((target) => {
        gsap.killTweensOf(target);
        resetStyles(target);
      });
    };
  }, [prefersReducedMotion]);

  return rootRef;
}

/**
 * State machine pattern for drawer open/close animations.
 * States: idle → opening → open → closing → idle
 *
 * Returns:
 * - shouldRender: whether the drawer DOM should be mounted
 * - ref: attach to the drawer element for open/close animation targeting
 * - phase: current animation phase
 */
export function useDrawerAnimation<T extends HTMLElement>(isOpen: boolean) {
  type Phase = "idle" | "opening" | "open" | "closing";
  const [phase, setPhase] = useState<Phase>(isOpen ? "open" : "idle");
  const elementRef = useRef<T | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (phase === "idle" || phase === "closing") {
        // Kill any in-progress tween for rapid open/close handling
        if (tweenRef.current) {
          tweenRef.current.kill();
          tweenRef.current = null;
        }
        setPhase("opening");
      }
    } else {
      if (phase === "open" || phase === "opening") {
        // Kill any in-progress tween for rapid open/close handling
        if (tweenRef.current) {
          tweenRef.current.kill();
          tweenRef.current = null;
        }
        setPhase("closing");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Opening animation
  useEffect(() => {
    if (phase !== "opening") {
      return;
    }

    const target = elementRef.current;
    if (!target || prefersReducedMotion) {
      setPhase("open");
      return;
    }

    target.style.willChange = "transform, opacity, width";
    // Set initial state for slide-in
    gsap.set(target, { opacity: 0, x: -16 });
    const tween = gsap.to(target, {
      opacity: 1,
      x: 0,
      duration: 0.12,
      ease: "power2.out",
      onComplete: () => {
        target.style.willChange = "";
        tweenRef.current = null;
        setPhase("open");
      },
    });
    tweenRef.current = tween;

    return () => {
      target.style.willChange = "";
      tween.kill();
      tweenRef.current = null;
    };
  }, [phase, prefersReducedMotion]);

  // Closing animation
  useEffect(() => {
    if (phase !== "closing") {
      return;
    }

    const target = elementRef.current;
    if (!target || prefersReducedMotion) {
      setPhase("idle");
      return;
    }

    target.style.willChange = "transform, opacity, width";
    // Immediately hide drawer to prevent children from being detected offscreen during close
    target.style.visibility = "hidden";
    const tween = gsap.to(target, {
      opacity: 0,
      x: -16,
      duration: 0.12,
      ease: "power2.in",
      onComplete: () => {
        target.style.willChange = "";
        tweenRef.current = null;
        setPhase("idle");
      },
    });
    tweenRef.current = tween;

    return () => {
      target.style.willChange = "";
      tween.kill();
      tweenRef.current = null;
    };
  }, [phase, prefersReducedMotion]);

  const shouldRender = phase !== "idle";

  return { shouldRender, ref: elementRef, phase };
}

/**
 * Variant of useDrawerAnimation for overlay-style drawers (e.g. source browser).
 * Open animation: backdrop fades in (200ms), drawer slides from x:100% (250ms, power3.out).
 * Close animation: backdrop fades out (150ms), drawer slides to x:100% (200ms, power2.in).
 * Finds [data-motion-backdrop] and [data-motion-drawer]/[data-motion-dialog] children.
 */
export function useOverlayDrawerAnimation<T extends HTMLElement>(isOpen: boolean) {
  type Phase = "idle" | "opening" | "open" | "closing";
  const [phase, setPhase] = useState<Phase>(isOpen ? "open" : "idle");
  const elementRef = useRef<T | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (phase === "idle" || phase === "closing") {
        if (timelineRef.current) {
          timelineRef.current.kill();
          timelineRef.current = null;
        }
        setPhase("opening");
      }
    } else {
      if (phase === "open" || phase === "opening") {
        if (timelineRef.current) {
          timelineRef.current.kill();
          timelineRef.current = null;
        }
        setPhase("closing");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Opening animation
  useEffect(() => {
    if (phase !== "opening") {
      return;
    }

    const root = elementRef.current;
    if (!root || prefersReducedMotion) {
      setPhase("open");
      return;
    }

    const backdrop = root.querySelector<HTMLElement>("[data-motion-backdrop]");
    const drawer = root.querySelector<HTMLElement>("[data-motion-drawer]") ||
                   root.querySelector<HTMLElement>("[data-motion-dialog]");
    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-motion-result]")).slice(0, 14);
    const allTargets = [backdrop, drawer, ...items].filter((t): t is HTMLElement => Boolean(t));

    if (!allTargets.length) {
      setPhase("open");
      return;
    }

    allTargets.forEach((t) => {
      t.style.willChange = "transform, opacity";
    });

    const tl = gsap.timeline({
      onComplete: () => {
        allTargets.forEach((t) => {
          t.style.willChange = "";
        });
        timelineRef.current = null;
        setPhase("open");
      },
    });

    // Backdrop: fade in over 200ms
    if (backdrop) {
      tl.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power2.out" }, 0);
    }

    // Drawer: slide from x: 100% over 150ms with power3.out
    if (drawer) {
      tl.fromTo(
        drawer,
        { xPercent: 100 },
        { xPercent: 0, duration: 0.15, ease: "power3.out" },
        0,
      );
    }

    // Items stagger in
    if (items.length) {
      tl.fromTo(
        items,
        { opacity: 0, y: 6 },
        { opacity: 1, y: 0, duration: 0.17, stagger: 0.018, ease: "power2.out" },
        0.1,
      );
    }

    timelineRef.current = tl;

    return () => {
      allTargets.forEach((t) => {
        t.style.willChange = "";
      });
      tl.kill();
      timelineRef.current = null;
    };
  }, [phase, prefersReducedMotion]);

  // Closing animation
  useEffect(() => {
    if (phase !== "closing") {
      return;
    }

    const root = elementRef.current;
    if (!root || prefersReducedMotion) {
      setPhase("idle");
      return;
    }

    const backdrop = root.querySelector<HTMLElement>("[data-motion-backdrop]");
    const drawer = root.querySelector<HTMLElement>("[data-motion-drawer]") ||
                   root.querySelector<HTMLElement>("[data-motion-dialog]");
    const targets = [backdrop, drawer].filter((t): t is HTMLElement => Boolean(t));

    if (!targets.length) {
      setPhase("idle");
      return;
    }

    targets.forEach((t) => {
      t.style.willChange = "transform, opacity";
    });

    const tl = gsap.timeline({
      onComplete: () => {
        targets.forEach((t) => {
          t.style.willChange = "";
        });
        timelineRef.current = null;
        setPhase("idle");
      },
    });

    // Backdrop: fade out over 150ms
    if (backdrop) {
      tl.to(backdrop, { opacity: 0, duration: 0.15, ease: "power2.in" }, 0);
    }

    // Drawer: slide to x: 100% over 120ms with power2.in
    if (drawer) {
      tl.to(drawer, { xPercent: 100, duration: 0.12, ease: "power2.in" }, 0);
    }

    timelineRef.current = tl;

    return () => {
      targets.forEach((t) => {
        t.style.willChange = "";
      });
      tl.kill();
      timelineRef.current = null;
    };
  }, [phase, prefersReducedMotion]);

  const shouldRender = phase !== "idle";

  return { shouldRender, ref: elementRef, phase };
}

/**
 * Toast/notification animation hook.
 * Entry: slide from y: -20 + opacity 0, animate over 200ms.
 * Exit: slide to y: -10 + opacity 0 over 150ms.
 * Auto-dismiss after 4 seconds (configurable).
 */
export function useToastMotion<T extends HTMLElement>(
  isVisible: boolean,
  onDismiss?: () => void,
  autoDismissMs = 4000,
) {
  const elementRef = useRef<T | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(isVisible);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const killTween = () => {
    if (tweenRef.current) {
      tweenRef.current.kill();
      tweenRef.current = null;
    }
  };

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Enter
  useEffect(() => {
    if (isVisible) {
      killTween();
      setMounted(true);
    } else if (mounted) {
      // Exit animation
      killTween();
      clearTimer();
      const target = elementRef.current;
      if (!target || prefersReducedMotion) {
        setMounted(false);
        return;
      }
      target.style.willChange = "transform, opacity";
      tweenRef.current = gsap.to(target, {
        opacity: 0,
        y: -10,
        duration: 0.15,
        ease: "power2.in",
        onComplete: () => {
          target.style.willChange = "";
          tweenRef.current = null;
          setMounted(false);
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  // Run enter animation once mounted
  useEffect(() => {
    if (!mounted || !isVisible) return;
    const target = elementRef.current;
    if (!target || prefersReducedMotion) return;

    const frame = requestAnimationFrame(() => {
      target.style.willChange = "transform, opacity";
      gsap.set(target, { opacity: 0, y: -20 });
      tweenRef.current = gsap.to(target, {
        opacity: 1,
        y: 0,
        duration: 0.2,
        ease: "power2.out",
        onComplete: () => {
          target.style.willChange = "";
          tweenRef.current = null;
        },
      });
    });

    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, isVisible]);

  // Auto-dismiss timer
  useEffect(() => {
    if (!isVisible || !onDismiss || autoDismissMs <= 0) return;
    clearTimer();
    timerRef.current = setTimeout(() => {
      onDismiss();
    }, autoDismissMs);
    return () => clearTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, autoDismissMs]);

  // Cleanup
  useEffect(() => {
    return () => {
      killTween();
      clearTimer();
    };
  }, []);

  return { ref: elementRef, mounted };
}

/**
 * Page depth map for determining navigation direction automatically.
 * Higher numbers = deeper pages. Pages at the same depth get lateral transitions.
 */
export const PAGE_DEPTH: Record<string, number> = {
  dashboard: 0,
  home: 0,
  editor: 1,
  swap: 1,
  create: 1,
  change: 1,
  assets: 1,
  detail: 2,
  preview: 2,
};

export type PageTransitionDirection = "deeper" | "shallower" | "lateral";

/**
 * Determines navigation direction from page depth values.
 */
export function getPageTransitionDirection(
  fromPage: string | undefined,
  toPage: string,
): PageTransitionDirection {
  const fromDepth: number = (fromPage ? Number(PAGE_DEPTH[fromPage]) : 0) || 0;
  const toDepth: number = Number(PAGE_DEPTH[toPage]) || 0;
  if (toDepth > fromDepth) return "deeper";
  if (toDepth < fromDepth) return "shallower";
  return "lateral";
}

/**
 * Minimal page transition hook — simple fast cross-fade, no transforms.
 * Enter: opacity 0→1 over 150ms. No exit animation (instant removal).
 */
export function usePageTransition(direction: PageTransitionDirection | "forward" | "backward"): {
  exitRef: React.RefObject<HTMLDivElement>;
  enterRef: React.RefObject<HTMLDivElement>;
  isTransitioning: boolean;
} {
  const exitRef = useRef<HTMLDivElement | null>(null);
  const enterRef = useRef<HTMLDivElement | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(true);
  const prefersReducedMotion = usePrefersReducedMotion();
  const timelineRef = useRef<gsap.core.Tween | null>(null);

  // Normalize legacy directions (kept for API compat, not used for animation)
  const resolved: PageTransitionDirection =
    direction === "forward" ? "deeper" :
    direction === "backward" ? "shallower" :
    direction;

  useEffect(() => {
    const enterEl = enterRef.current;
    if (!enterEl) return;

    // Kill previous
    if (timelineRef.current) {
      timelineRef.current.kill();
      timelineRef.current = null;
    }

    if (prefersReducedMotion) {
      enterEl.style.opacity = "1";
      setIsTransitioning(false);
      return;
    }

    // Simple fade-in only, no transforms
    enterEl.style.opacity = "0";
    const tween = gsap.to(enterEl, {
      opacity: 1,
      duration: 0.15,
      ease: "power2.out",
      onComplete: () => {
        enterEl.style.removeProperty("opacity");
        setIsTransitioning(false);
      },
    });
    timelineRef.current = tween;

    return () => { tween?.kill(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, prefersReducedMotion]);

  return { exitRef: exitRef as React.RefObject<HTMLDivElement>, enterRef: enterRef as React.RefObject<HTMLDivElement>, isTransitioning };
}

/**
 * Animates sidebar width between expanded (240px) and collapsed (48px) states
 * using GSAP. The CSS class toggle still applies for content visibility changes,
 * but the width transition is handled by GSAP for smooth reflow.
 */
export function useSidebarCollapseMotion<T extends HTMLElement>(expanded: boolean): React.RefObject<T> {
  const ref = useRef<T>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const initialRender = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Skip animation on initial render — let CSS define the starting state
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }

    if (prefersReducedMotion) {
      // Apply final width instantly when reduced motion is preferred
      el.style.width = expanded ? "240px" : "48px";
      el.style.minWidth = expanded ? "240px" : "48px";
      return;
    }

    const targetWidth = expanded ? 240 : 48;

    const tween = gsap.to(el, {
      width: targetWidth,
      minWidth: targetWidth,
      duration: 0.2,
      ease: "power2.out",
      onStart() {
        el.style.willChange = "width, min-width";
      },
      onComplete() {
        el.style.willChange = "auto";
      },
    });

    return () => {
      tween.kill();
      el.style.willChange = "auto";
    };
  }, [expanded, prefersReducedMotion]);

  return ref as React.RefObject<T>;
}


/**
 * GSAP-powered collapsible section animation.
 * Animates height and opacity over 200ms on expand/collapse.
 * Returns a ref to attach to the collapsible content wrapper.
 */
export function useCollapsibleSection<T extends HTMLElement>(expanded: boolean) {
  const contentRef = useRef<T | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    const target = contentRef.current;
    if (!target) return;

    // On first render, just set the initial state without animation
    if (!initializedRef.current) {
      initializedRef.current = true;
      if (!expanded) {
        target.style.height = "0px";
        target.style.opacity = "0";
        target.style.overflow = "hidden";
      } else {
        target.style.height = "";
        target.style.opacity = "1";
        target.style.overflow = "";
      }
      return;
    }

    if (prefersReducedMotion) {
      if (expanded) {
        target.style.height = "";
        target.style.opacity = "1";
        target.style.overflow = "";
      } else {
        target.style.height = "0px";
        target.style.opacity = "0";
        target.style.overflow = "hidden";
      }
      return;
    }

    // Kill any in-progress tween
    if (tweenRef.current) {
      tweenRef.current.kill();
      tweenRef.current = null;
    }

    target.style.willChange = "height, opacity";
    target.style.overflow = "hidden";

    if (expanded) {
      // Expand: measure natural height, then animate from 0 to auto
      const naturalHeight = target.scrollHeight;
      const tween = gsap.fromTo(
        target,
        { height: target.offsetHeight, opacity: target.style.opacity === "0" ? 0 : parseFloat(target.style.opacity) || 0 },
        {
          height: naturalHeight,
          opacity: 1,
          duration: 0.2,
          ease: "power2.out",
          onComplete: () => {
            target.style.height = "";
            target.style.overflow = "";
            target.style.willChange = "";
            tweenRef.current = null;
          },
        },
      );
      tweenRef.current = tween;
    } else {
      // Collapse: animate from current height to 0
      const tween = gsap.to(target, {
        height: 0,
        opacity: 0,
        duration: 0.2,
        ease: "power2.in",
        onComplete: () => {
          target.style.willChange = "";
          tweenRef.current = null;
        },
      });
      tweenRef.current = tween;
    }

    return () => {
      if (tweenRef.current) {
        tweenRef.current.kill();
        tweenRef.current = null;
      }
      target.style.willChange = "";
    };
  }, [expanded, prefersReducedMotion]);

  return contentRef;
}

// ---------------------------------------------------------------------------
// Animated Counter — counts from 0 to target value on mount
// ---------------------------------------------------------------------------

export function useAnimatedCounter(target: number, duration = 0.8): number {
  const [display, setDisplay] = useState(0);
  const prefersReducedMotion = usePrefersReducedMotion();
  const counterRef = useRef({ value: 0 });

  useEffect(() => {
    if (prefersReducedMotion || target === 0) {
      setDisplay(target);
      return;
    }

    counterRef.current.value = 0;
    const tween = gsap.to(counterRef.current, {
      value: target,
      duration,
      ease: "power2.out",
      roundProps: "value",
      onUpdate: () => {
        setDisplay(counterRef.current.value);
      },
    });

    return () => { tween.kill(); };
  }, [target, duration, prefersReducedMotion]);

  return display;
}

// ---------------------------------------------------------------------------
// Tab Transition — crossfade between tab panels
// ---------------------------------------------------------------------------

export function useTabTransition<T extends HTMLElement>(activeKey: unknown) {
  const ref = useRef<T | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const target = ref.current;
    if (!target || prefersReducedMotion) {
      return;
    }

    target.style.willChange = "transform, opacity";
    const tween = gsap.from(target, {
      opacity: 0,
      y: 8,
      duration: 0.2,
      ease: "power2.out",
      onComplete: () => {
        target.style.willChange = "";
      },
    });

    return () => {
      target.style.willChange = "";
      tween.kill();
    };
  }, [activeKey, prefersReducedMotion]);

  return ref;
}

// ---------------------------------------------------------------------------
// Toast Notification System
// ---------------------------------------------------------------------------

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  createdAt: number;
}

let toastIdCounter = 0;
const toastListeners: Set<(toasts: ToastItem[]) => void> = new Set();
let toastQueue: ToastItem[] = [];

function notifyListeners() {
  const snapshot = [...toastQueue];
  toastListeners.forEach((listener) => listener(snapshot));
}

export function showToast(message: string, type: ToastType = "info") {
  const toast: ToastItem = {
    id: `toast-${++toastIdCounter}`,
    message,
    type,
    createdAt: Date.now(),
  };
  toastQueue = [...toastQueue, toast];
  notifyListeners();

  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    dismissToast(toast.id);
  }, 4000);
}

export function dismissToast(id: string) {
  toastQueue = toastQueue.filter((t) => t.id !== id);
  notifyListeners();
}

export function useToastStore() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    toastListeners.add(setToasts);
    return () => { toastListeners.delete(setToasts); };
  }, []);

  return toasts;
}

