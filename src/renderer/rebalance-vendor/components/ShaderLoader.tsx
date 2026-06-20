import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useRef, useMemo, useEffect, useState, useCallback } from "react";
import * as THREE from "three";

export type LoadPhase =
  | "initializing"
  | "loading-catalog"
  | "caching-documents"
  | "loading-library"
  | "finalizing"
  | "complete";

interface ShaderLoaderProps {
  progress: number;
  phase: LoadPhase;
  onComplete: () => void;
  onError?: () => void;
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uProgress;
  uniform vec2 uResolution;
  uniform float uDissolve;

  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / uResolution.y;
    vec2 centeredUv = (uv - 0.5) * vec2(aspect, 1.0);
    float dist = length(centeredUv);

    vec3 bgColor = vec3(0.016, 0.031, 0.071);
    vec3 accentBlue = vec3(0.345, 0.443, 1.0);
    vec3 accentCyan = vec3(0.3, 0.7, 1.0);
    vec3 brightColor = vec3(0.957, 0.937, 0.906);

    // === LAYER 1: Hex grid pattern (subtle background structure) ===
    vec2 hexUv = centeredUv * 8.0;
    vec2 hexId = floor(hexUv);
    vec2 hexF = fract(hexUv) - 0.5;
    float hexDist = max(abs(hexF.x), abs(hexF.y) * 0.866 + abs(hexF.x) * 0.5);
    float hexBorder = smoothstep(0.48, 0.5, hexDist);
    float hexVisible = step(0.5, hash(hexId * 0.37)) * uProgress;
    float hexGrid = (1.0 - hexBorder) * hexVisible * 0.08;

    // === LAYER 2: Flowing energy lines (diagonal streams) ===
    float streams = 0.0;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float angle = fi * 0.785 + uTime * 0.2;
      vec2 rotUv = vec2(
        centeredUv.x * cos(angle) - centeredUv.y * sin(angle),
        centeredUv.x * sin(angle) + centeredUv.y * cos(angle)
      );
      float stream = noise(rotUv * 5.0 + vec2(uTime * (0.5 + fi * 0.2), 0.0));
      stream = pow(stream, 3.0) * smoothstep(0.7, 0.0, dist);
      streams += stream * 0.25;
    }
    streams *= uProgress;

    // === LAYER 3: Orbiting data points ===
    float orbitPoints = 0.0;
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float orbitRadius = 0.15 + fi * 0.05;
      float orbitSpeed = uTime * (1.5 - fi * 0.15);
      vec2 pointPos = vec2(cos(orbitSpeed + fi * 1.047), sin(orbitSpeed + fi * 1.047)) * orbitRadius;
      float pointDist = length(centeredUv - pointPos);
      float point = smoothstep(0.015, 0.0, pointDist);
      // Trail behind the point
      float trailAngle = orbitSpeed + fi * 1.047;
      for (int t = 1; t < 4; t++) {
        float ft = float(t);
        vec2 trailPos = vec2(cos(trailAngle - ft * 0.15), sin(trailAngle - ft * 0.15)) * orbitRadius;
        float trailDist = length(centeredUv - trailPos);
        point += smoothstep(0.01, 0.0, trailDist) * (1.0 - ft * 0.25);
      }
      orbitPoints += point;
    }
    orbitPoints *= uProgress * 0.6;

    // === LAYER 4: Central energy vortex ===
    float vortexAngle = atan(centeredUv.y, centeredUv.x);
    float spiral = sin(vortexAngle * 4.0 - dist * 20.0 + uTime * 3.0) * 0.5 + 0.5;
    float vortex = spiral * smoothstep(0.35, 0.0, dist) * uProgress * uProgress;

    // === LAYER 5: Progress ring (circular arc) ===
    float ringRadius = 0.3;
    float ringThickness = 0.004;
    float ringDist = abs(dist - ringRadius);
    float ring = smoothstep(ringThickness * 2.0, 0.0, ringDist);
    float ringAngle = (vortexAngle + 3.14159) / 6.28318;
    ring *= step(ringAngle, uProgress) * 0.7;

    // Second outer ring (thinner, slower fill)
    float outerRing = smoothstep(0.003, 0.0, abs(dist - 0.38));
    outerRing *= step(ringAngle, uProgress * 0.7) * 0.3;

    // === COMPOSE ===
    vec3 color = bgColor;

    // Background hex grid
    color += accentBlue * hexGrid;

    // Energy streams
    color += mix(accentBlue, accentCyan, 0.5) * streams;

    // Orbit points
    color += brightColor * orbitPoints;

    // Vortex
    color += accentBlue * vortex * 0.5;

    // Progress rings
    color += accentCyan * ring;
    color += accentBlue * outerRing;

    // Center glow (intensifies with progress)
    float centerGlow = smoothstep(0.3, 0.0, dist) * pow(uProgress, 1.5);
    color = mix(color, brightColor, centerGlow * 0.5);

    // Overall subtle breathing
    color *= 1.0 + 0.03 * sin(uTime * 1.5);

    // === DISSOLVE ===
    float alpha = 1.0;
    if (uDissolve > 0.01) {
      float dissolveFront = uDissolve * 2.0;
      float dissolveNoise = noise(centeredUv * 10.0 + uTime) * 0.3;
      float noisyDist = dist + dissolveNoise;
      alpha = smoothstep(dissolveFront - 0.2, dissolveFront + 0.05, noisyDist);
      // Bright edge at dissolve front
      float edge = smoothstep(dissolveFront - 0.05, dissolveFront, noisyDist) *
                   smoothstep(dissolveFront + 0.15, dissolveFront, noisyDist);
      color += brightColor * edge * 3.0;
    }

    gl_FragColor = vec4(color, alpha);
  }
`;

function ShaderPlane({
  progress,
  onDissolveComplete,
  onContextLost,
}: {
  progress: number;
  onDissolveComplete: () => void;
  onContextLost?: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { gl } = useThree();
  const dissolveRef = useRef(0);
  const completeFiredRef = useRef(false);
  const unmountedRef = useRef(false);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uDissolve: { value: 0 },
    }),
    []
  );

  // Handle WebGL context loss at runtime
  useEffect(() => {
    const canvas = gl.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      onContextLost?.();
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
    };
  }, [gl, onContextLost]);

  // Track unmount to prevent callbacks after disposal
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  useFrame((state, delta) => {
    if (unmountedRef.current) return;

    // Update resolution every frame to handle resize
    const { width, height } = state.size;
    uniforms.uResolution.value.set(width, height);

    uniforms.uTime.value += delta;
    uniforms.uProgress.value = progress;

    if (progress >= 1.0) {
      dissolveRef.current = Math.min(dissolveRef.current + delta * 1.2, 1.0);
      uniforms.uDissolve.value = dissolveRef.current;

      if (dissolveRef.current >= 1.0 && !completeFiredRef.current) {
        completeFiredRef.current = true;
        onDissolveComplete();
      }
    }
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
      />
    </mesh>
  );
}

const PHASE_LABELS: Record<LoadPhase, string> = {
  initializing: "Initializing",
  "loading-catalog": "Loading Catalog",
  "caching-documents": "Caching Documents",
  "loading-library": "Loading Library",
  finalizing: "Finalizing",
  complete: "Complete",
};

export function ShaderLoader({
  progress,
  phase,
  onComplete,
  onError,
}: ShaderLoaderProps) {
  const [webglFailed, setWebglFailed] = useState(false);
  const [displayedPhase, setDisplayedPhase] = useState<LoadPhase>(phase);
  const [phaseOpacity, setPhaseOpacity] = useState(1);

  // Fade between phase labels instead of snapping
  useEffect(() => {
    if (phase !== displayedPhase) {
      setPhaseOpacity(0);
      const timeout = setTimeout(() => {
        setDisplayedPhase(phase);
        setPhaseOpacity(1);
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [phase, displayedPhase]);

  const handleCreated = useCallback(
    (state: { gl: THREE.WebGLRenderer }) => {
      if (state.gl.getContext().isContextLost()) {
        setWebglFailed(true);
        onError?.();
      }
    },
    [onError]
  );

  const handleError = useCallback(() => {
    setWebglFailed(true);
    onError?.();
  }, [onError]);

  const handleDissolveComplete = useCallback(() => {
    onComplete();
  }, [onComplete]);

  const handleContextLost = useCallback(() => {
    setWebglFailed(true);
    onError?.();
  }, [onError]);

  if (webglFailed) {
    return null;
  }

  const percentage = Math.round(progress * 100);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 9999,
        background: "#040812",
        overflow: "hidden",
      }}
    >
      <Canvas
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 0, 1] }}
        onCreated={handleCreated}
        onError={handleError}
        resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <ShaderPlane
          progress={progress}
          onDissolveComplete={handleDissolveComplete}
          onContextLost={handleContextLost}
        />
      </Canvas>

      {/* Phase label + percentage overlay */}
      <div
        style={{
          position: "absolute",
          bottom: "24px",
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
          color: "#f4efe7",
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: "13px",
          letterSpacing: "0.04em",
          opacity: progress >= 1.0 ? 0 : 1,
          transition: "opacity 0.3s ease",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {/* Phase label with fade transition */}
        <div
          style={{
            marginBottom: "4px",
            color: "#a4aec6",
            opacity: phaseOpacity,
            transition: "opacity 0.2s ease",
          }}
        >
          {PHASE_LABELS[displayedPhase]}
        </div>

        {/* Percentage with scale-pulse and progressive glow */}
        <div
          style={{
            fontSize: "18px",
            fontWeight: 600,
            position: "relative",
          }}
        >
          <span
            key={percentage}
            style={{
              display: "inline-block",
              position: "relative",
              animation: "scalePulse 200ms ease-out",
              textShadow:
                progress <= 0
                  ? "none"
                  : `0 0 ${4 + progress * 12}px rgba(88, 113, 255, ${progress * 0.8}), 0 0 ${8 + progress * 20}px rgba(88, 113, 255, ${progress * 0.4})`,
            }}
          >
            {percentage}%
          </span>
          {/* Inline keyframes for scale-pulse */}
          <style>{`
            @keyframes scalePulse {
              0% { transform: scale(1.0); }
              50% { transform: scale(1.1); }
              100% { transform: scale(1.0); }
            }
          `}</style>
        </div>

        {/* Thin progress bar */}
        <div
          style={{
            marginTop: "10px",
            width: "120px",
            height: "2px",
            background: "rgba(88, 113, 255, 0.15)",
            borderRadius: "1px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${percentage}%`,
              height: "100%",
              background: "#5871ff",
              borderRadius: "1px",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default ShaderLoader;
