import gsap from "gsap";
import { useEffect, useRef, useState } from "react";

/**
 * Wraps the ShaderLoader with premium entry/exit GSAP transitions.
 *
 * Entry: Scale from 0.8 + blur dissolve (12px → 0) over 600ms with back.out easing,
 *        plus a pulsing glow ring (box-shadow).
 * Exit:  "Shatter" outward — white flash, scale to 1.15, motion blur 0→8px,
 *        opacity fade, over 500ms total.
 */
export function ShaderTransitionWrapper({
  children,
  show,
  onExitComplete,
}: {
  children: React.ReactNode;
  show: boolean;
  onExitComplete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(show);

  // Keep mounted while animating out
  useEffect(() => {
    if (show) {
      setMounted(true);
    }
  }, [show]);

  // Entry animation
  useEffect(() => {
    if (show && ref.current) {
      const tl = gsap.timeline();

      // Main entry: scale up from 0.8, blur dissolve from 12px to 0
      tl.fromTo(
        ref.current,
        { opacity: 0, scale: 0.8, filter: "blur(12px)" },
        {
          opacity: 1,
          scale: 1,
          filter: "blur(0px)",
          duration: 0.6,
          ease: "back.out(1.4)",
        }
      );

      // Glow ring pulse on entry (box-shadow)
      tl.fromTo(
        ref.current,
        { boxShadow: "0 0 0px 0px rgba(255, 255, 255, 0)" },
        {
          boxShadow: "0 0 60px 15px rgba(255, 255, 255, 0.4)",
          duration: 0.3,
          ease: "power2.out",
        },
        0.1 // start slightly after entry begins
      );
      tl.to(
        ref.current,
        {
          boxShadow: "0 0 0px 0px rgba(255, 255, 255, 0)",
          duration: 0.4,
          ease: "power2.inOut",
        },
        0.4
      );
    }
  }, [show]);

  // Exit animation
  useEffect(() => {
    if (!show && mounted && ref.current) {
      const tl = gsap.timeline({
        onComplete: () => {
          setMounted(false);
          onExitComplete();
        },
      });

      // 0ms: White flash overlay pulses (0 → 0.3 → 0 over 150ms)
      if (flashRef.current) {
        tl.fromTo(
          flashRef.current,
          { opacity: 0 },
          { opacity: 0.3, duration: 0.075, ease: "power2.out" },
          0
        );
        tl.to(
          flashRef.current,
          { opacity: 0, duration: 0.075, ease: "power2.in" },
          0.075
        );
      }

      // 50ms: Scale starts expanding (1.0 → 1.15), blur starts (0 → 8px)
      tl.to(
        ref.current,
        {
          scale: 1.15,
          filter: "blur(8px)",
          duration: 0.45,
          ease: "power2.in",
        },
        0.05
      );

      // 300ms: Opacity starts dropping (1 → 0)
      tl.to(
        ref.current,
        {
          opacity: 0,
          duration: 0.2,
          ease: "power2.in",
        },
        0.3
      );
    }
  }, [show, mounted, onExitComplete]);

  if (!mounted) return null;

  return (
    <div ref={ref} style={{ position: "fixed", inset: 0, zIndex: 9999 }}>
      {children}
      {/* White flash overlay for exit animation */}
      <div
        ref={flashRef}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "#ffffff",
          opacity: 0,
          pointerEvents: "none",
          zIndex: 10000,
        }}
      />
    </div>
  );
}
