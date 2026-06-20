import { useState } from "react";
import type { LoadPhase } from "./ShaderLoader";

interface ShaderLoaderFallbackProps {
  progress: number;
  phase: LoadPhase;
}

function formatPhase(phase: LoadPhase): string {
  switch (phase) {
    case "initializing":
      return "Initializing";
    case "loading-catalog":
      return "Loading Catalog";
    case "caching-documents":
      return "Caching Documents";
    case "loading-library":
      return "Loading Library";
    case "finalizing":
      return "Finalizing";
    case "complete":
      return "Complete";
    default:
      return String(phase);
  }
}

const PARTICLE_COUNT = 12;

function generateParticles() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const isBlue = Math.random() > 0.4;
    return {
      id: i,
      left: `${Math.random() * 100}%`,
      size: 1 + Math.random() * 2,
      duration: 4 + Math.random() * 6,
      delay: Math.random() * 8,
      opacity: isBlue ? 0.2 : 0.1,
      color: isBlue ? "#5871ff" : "#f4efe7",
    };
  });
}

export function ShaderLoaderFallback({ progress, phase }: ShaderLoaderFallbackProps) {
  const percent = Math.round(progress * 100);
  const [particles] = useState(generateParticles);

  return (
    <div className="shader-loader-fallback">
      <div className="shader-loader-fallback__bg" />

      {/* Floating particles */}
      <div className="shader-loader-fallback__particles" aria-hidden="true">
        {particles.map((p) => (
          <span
            key={p.id}
            className="shader-loader-fallback__particle"
            style={{
              left: p.left,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              opacity: p.opacity,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      <div className="shader-loader-fallback__content">
        <div className="shader-loader-fallback__phase">
          {formatPhase(phase)}
        </div>

        <div className="shader-loader-fallback__bar-track" style={{ height: "2px" }}>
          <div
            className="shader-loader-fallback__bar-fill"
            style={{ width: `${percent}%` }}
          >
            <div className="shader-loader-fallback__bar-shimmer" />
          </div>
        </div>

        <div className="shader-loader-fallback__percent">
          {percent}%
        </div>
      </div>
    </div>
  );
}
