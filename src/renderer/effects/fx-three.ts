import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { FX_VISUAL_PROFILES } from "./fx-profiles";
import type { FxThreeHandle, FxThreeMode, FxThreeQuality, FxThreeState, FxThreeSurfacePreset, FxToken, FxVisualProfile } from "./fx-types";

type Bounds = {
    left: number;
    top: number;
    width: number;
    height: number;
};

type Viewport = {
    width: number;
    height: number;
};

type Registration = {
    element: HTMLElement;
    token: FxToken;
    mode: FxThreeMode;
    state: FxThreeState;
    handle: FxThreeHandle | null;
    visible: boolean;
    active: boolean;
    qualityCost: number;
    lastBounds: Bounds | null;
};

export type FxBloomPreset = {
    enabled: boolean;
    strength: number;
    radius: number;
    threshold: number;
};

const CARD_BUDGET = {
    high: 8,
    showcase: 12,
} as const;

const DEFAULT_VIEWPORT: Viewport = {
    width: 1,
    height: 1,
};

const BLOOM_DISABLED: FxBloomPreset = {
    enabled: false,
    strength: 0,
    radius: 0,
    threshold: 1,
};

const VERTEX_SHADER = `
    varying vec2 vUv;

    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const NOISE_GLSL = `
    float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
            mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
        );
    }

    float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 5; i++) {
            value += amplitude * noise(p);
            p = p * 2.02 + vec2(10.1, 4.7);
            amplitude *= 0.5;
        }
        return value;
    }
`;

const SINGULARITY_FRAGMENT_SHADER = `
    varying vec2 vUv;
    uniform float uTime;
    uniform float uIntensity;
    uniform float uAspect;
    uniform vec3 uPrimary;
    uniform vec3 uAccent;
    uniform float uLensStrength;
    uniform float uDiskSpeed;
    uniform float uEventRadius;
    ${NOISE_GLSL}

    void main() {
        vec2 uv = vUv * 2.0 - 1.0;
        uv.x *= uAspect;

        float dist = length(uv);
        float angle = atan(uv.y, uv.x);
        float pull = 1.0 - smoothstep(uEventRadius * 0.65, uEventRadius * 3.8, dist);
        float swirl = sin(angle * 7.0 - uTime * uDiskSpeed + dist * 18.0 + fbm(uv * 5.5 + uTime * 0.2) * 1.8);
        float disk = smoothstep(uEventRadius + 0.42, uEventRadius + 0.16, dist) * (1.0 - smoothstep(uEventRadius + 0.72, uEventRadius + 0.4, dist));
        disk *= 0.5 + 0.5 * swirl;
        float horizon = 1.0 - smoothstep(uEventRadius - 0.03, uEventRadius + 0.02, dist);
        float lens = smoothstep(0.95, 0.26, dist) * smoothstep(0.08, 0.26, dist) * uLensStrength;
        vec3 ringColor = mix(uPrimary, uAccent, 0.62 + swirl * 0.18);
        vec3 color = ringColor * disk * (1.1 + uIntensity * 0.5);
        color += mix(uAccent, vec3(1.0), 0.18) * lens * 0.38;
        color = mix(color, vec3(0.01, 0.0, 0.02), horizon * 0.96);
        float alpha = clamp(disk * 0.86 + lens * 0.24 + horizon * 0.72 + pull * 0.08, 0.0, 0.92);
        gl_FragColor = vec4(color, alpha * clamp(0.5 + uIntensity * 0.55, 0.0, 1.0));
    }
`;

const CYBERPUNK_FRAGMENT_SHADER = `
    varying vec2 vUv;
    uniform float uTime;
    uniform float uIntensity;
    uniform float uScanPhase;
    uniform float uGlitchAmount;
    uniform float uNeonMix;
    uniform vec3 uPrimary;
    uniform vec3 uAccent;
    ${NOISE_GLSL}

    float lineMask(float value, float width) {
        return smoothstep(width, 0.0, abs(value));
    }

    void main() {
        vec2 uv = vUv * 2.0 - 1.0;
        float scan = smoothstep(0.18, 0.0, abs(uv.y - uScanPhase));
        float grid = lineMask(fract(vUv.x * 16.0) - 0.5, 0.06) + lineMask(fract(vUv.y * 10.0) - 0.5, 0.08);
        float glitchWindow = step(0.82, noise(vec2(floor(uTime * 1.4), floor(vUv.y * 8.0))));
        vec2 shifted = vUv + vec2((noise(vUv * 8.0 + uTime * 2.4) - 0.5) * 0.05 * uGlitchAmount * glitchWindow, 0.0);
        float bars = smoothstep(0.14, 0.0, abs(fract(shifted.y * 18.0 + uTime * 0.6) - 0.5));
        float field = clamp(grid * 0.45 + scan * 1.2 + bars * 0.34, 0.0, 1.4);
        vec3 color = mix(uPrimary, uAccent, clamp(uNeonMix + glitchWindow * 0.25, 0.0, 1.0));
        color += vec3(0.22, 0.0, 0.14) * glitchWindow;
        float alpha = clamp(field * (0.2 + uIntensity * 0.65), 0.0, 0.82);
        gl_FragColor = vec4(color, alpha);
    }
`;

const INFERNO_FRAGMENT_SHADER = `
    varying vec2 vUv;
    uniform float uTime;
    uniform float uIntensity;
    uniform float uHeatDistortion;
    uniform float uFlameRise;
    uniform float uCoreGlow;
    uniform float uPhase;
    uniform vec3 uBase;
    uniform vec3 uHot;
    ${NOISE_GLSL}

    void main() {
        vec2 uv = vUv;
        vec2 p = vec2((uv.x - 0.5) * 1.85, uv.y);
        float t = uTime * (0.35 + uFlameRise) + uPhase;
        float swirl = fbm(vec2(p.x * 2.1 + sin(t * 0.8) * 0.24, p.y * 2.8 - t * 1.6));
        float flame = smoothstep(1.08, 0.12, p.y + swirl * 0.42 + abs(p.x) * 0.52 - uHeatDistortion * 0.12);
        float ember = smoothstep(0.08, 0.92, uv.y) * smoothstep(0.82, 0.28, abs(p.x));
        vec3 color = mix(uBase, uHot, clamp(flame * 0.9 + ember * 0.35 + uCoreGlow * 0.22, 0.0, 1.0));
        float alpha = clamp(flame * (0.16 + uIntensity * 0.72), 0.0, 0.86);
        gl_FragColor = vec4(color, alpha);
    }
`;

const FROZEN_FRAGMENT_SHADER = `
    varying vec2 vUv;
    uniform float uTime;
    uniform float uIntensity;
    uniform float uAspect;
    uniform float uRefractionStrength;
    uniform float uFresnelBoost;
    uniform float uCrystalSpark;
    uniform vec3 uPrimary;
    uniform vec3 uAccent;
    ${NOISE_GLSL}

    void main() {
        vec2 uv = vUv * 2.0 - 1.0;
        uv.x *= uAspect;
        float dist = length(uv);
        float edge = smoothstep(0.26, 1.0, dist);
        float cracks = fbm(uv * 5.8 + vec2(0.0, uTime * 0.08));
        float refractBand = smoothstep(0.22, 0.86, cracks + edge * 0.22 - uRefractionStrength * 0.18);
        float frost = smoothstep(0.46, 0.95, dist + cracks * 0.16);
        vec3 color = mix(uPrimary, uAccent, clamp(refractBand * 0.8 + uCrystalSpark * 0.18, 0.0, 1.0));
        color += vec3(0.82, 0.95, 1.0) * frost * uFresnelBoost * 0.12;
        float alpha = clamp(0.12 + frost * 0.3 + edge * 0.22, 0.0, 0.72) * clamp(0.52 + uIntensity * 0.42, 0.0, 1.0);
        gl_FragColor = vec4(color, alpha);
    }
`;

const SHINY_FRAGMENT_SHADER = `
    varying vec2 vUv;
    uniform float uTime;
    uniform float uIntensity;
    uniform float uSheenAngle;
    uniform float uSpecularBoost;
    uniform float uGoldMix;
    uniform vec3 uBase;
    uniform vec3 uGold;

    void main() {
        vec2 uv = vUv * 2.0 - 1.0;
        float band = abs(uv.x + uv.y * 0.72 - sin(uTime * 0.55 + uSheenAngle) * 0.65);
        float sheen = smoothstep(0.42, 0.0, band);
        float rim = smoothstep(0.88, 0.28, length(uv));
        vec3 color = mix(uBase, uGold, clamp(uGoldMix * 0.7 + rim * 0.15, 0.0, 1.0));
        color += uGold * sheen * uSpecularBoost;
        float alpha = clamp(0.18 + sheen * (0.22 + uIntensity * 0.16) + rim * 0.08, 0.0, 0.74);
        gl_FragColor = vec4(color, alpha);
    }
`;

const RADIANT_FRAGMENT_SHADER = `
    varying vec2 vUv;
    uniform float uTime;
    uniform float uIntensity;
    uniform float uHaloStrength;
    uniform float uRadiance;
    uniform float uSpecularBoost;
    uniform vec3 uBase;
    uniform vec3 uGold;

    void main() {
        vec2 uv = vUv * 2.0 - 1.0;
        float dist = length(uv);
        float halo = smoothstep(0.95, 0.22, dist) * (1.0 - smoothstep(0.3, 0.86, dist));
        float band = abs(uv.x + uv.y * 0.68 - sin(uTime * 0.65) * 0.72);
        float sheen = smoothstep(0.34, 0.0, band);
        vec3 color = mix(uBase, uGold, clamp(uRadiance * 0.72 + halo * 0.28, 0.0, 1.0));
        color += uGold * sheen * uSpecularBoost;
        color += vec3(1.0, 0.96, 0.82) * halo * uHaloStrength * 0.45;
        float alpha = clamp(0.18 + halo * 0.22 + sheen * (0.24 + uIntensity * 0.22), 0.0, 0.88);
        gl_FragColor = vec4(color, alpha);
    }
`;

function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(Math.max(value, min), max);
}

function createShaderMaterial(params: Omit<THREE.ShaderMaterialParameters, "vertexShader">): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        ...params,
    });
}

function createScenePosition(bounds: Bounds, viewport: Viewport): { x: number; y: number } {
    return {
        x: bounds.left + bounds.width / 2 - viewport.width / 2,
        y: viewport.height / 2 - (bounds.top + bounds.height / 2),
    };
}

function disposeObjectTree(object: THREE.Object3D): void {
    object.traverse(node => {
        const geometry = (node as THREE.Mesh).geometry;
        if (geometry && typeof geometry.dispose === "function") {
            geometry.dispose();
        }
        const material = (node as THREE.Mesh).material;
        if (Array.isArray(material)) {
            material.forEach(entry => entry?.dispose?.());
        } else {
            material?.dispose?.();
        }
    });
}

function createOrbitalPoints(count: number, colors: string[]): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const vertexColors = new Float32Array(count * 3);

    for (let index = 0; index < count; index += 1) {
        const radius = THREE.MathUtils.lerp(0.18, 0.48, Math.random());
        const angle = Math.random() * Math.PI * 2;
        positions[index * 3 + 0] = Math.cos(angle) * radius;
        positions[index * 3 + 1] = Math.sin(angle) * radius * THREE.MathUtils.lerp(0.55, 0.9, Math.random());
        positions[index * 3 + 2] = THREE.MathUtils.lerp(-0.08, 0.08, Math.random());
        const color = new THREE.Color(colors[index % colors.length]);
        vertexColors[index * 3 + 0] = color.r;
        vertexColors[index * 3 + 1] = color.g;
        vertexColors[index * 3 + 2] = color.b;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(vertexColors, 3));

    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 3.4,
        vertexColors: true,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        sizeAttenuation: false,
    });

    return new THREE.Points(geometry, material);
}

function createEmberPoints(count: number, colors: string[]): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const vertexColors = new Float32Array(count * 3);

    for (let index = 0; index < count; index += 1) {
        positions[index * 3 + 0] = THREE.MathUtils.lerp(-0.45, 0.45, Math.random());
        positions[index * 3 + 1] = THREE.MathUtils.lerp(-0.28, 0.1, Math.random());
        positions[index * 3 + 2] = THREE.MathUtils.lerp(0.0, 0.16, Math.random());
        const color = new THREE.Color(colors[index % colors.length]);
        vertexColors[index * 3 + 0] = color.r;
        vertexColors[index * 3 + 1] = color.g;
        vertexColors[index * 3 + 2] = color.b;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(vertexColors, 3));

    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 3.1,
        vertexColors: true,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        sizeAttenuation: false,
    });

    return new THREE.Points(geometry, material);
}

function createCyberFrame(scaleX: number, scaleY: number, z: number, color: string): THREE.LineSegments {
    const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.58, 0.08));
    const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.scale.set(scaleX, scaleY, 0.08);
    lines.position.z = z;
    return lines;
}

function createCrystalField(count: number, color: string): { mesh: THREE.InstancedMesh; transforms: Array<{ position: THREE.Vector3; scale: number; rotation: number; offset: number }> } {
    const geometry = new THREE.OctahedronGeometry(0.05, 0);
    const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.36,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const transforms: Array<{ position: THREE.Vector3; scale: number; rotation: number; offset: number }> = [];
    const dummy = new THREE.Object3D();

    for (let index = 0; index < count; index += 1) {
        const edgeBand = index % 4;
        const edgeOffset = THREE.MathUtils.lerp(-0.42, 0.42, Math.random());
        let x = edgeOffset;
        let y = edgeOffset * 0.3;
        if (edgeBand === 0) {
            x = -0.44;
            y = edgeOffset;
        } else if (edgeBand === 1) {
            x = 0.44;
            y = edgeOffset;
        } else if (edgeBand === 2) {
            x = edgeOffset;
            y = -0.32;
        } else {
            x = edgeOffset;
            y = 0.32;
        }
        const scale = THREE.MathUtils.lerp(0.7, 1.4, Math.random());
        const rotation = Math.random() * Math.PI;
        const offset = Math.random() * Math.PI * 2;
        const position = new THREE.Vector3(x, y, THREE.MathUtils.lerp(0.03, 0.18, Math.random()));
        transforms.push({ position, scale, rotation, offset });
        dummy.position.copy(position);
        dummy.rotation.set(rotation * 0.45, rotation, rotation * 0.3);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
    }

    return { mesh, transforms };
}

function createScaledHandle(
    kind: FxThreeMode,
    root: THREE.Object3D,
    options: {
        overflowX?: number;
        overflowY?: number;
        aspectUniforms?: Array<{ value: number }>;
        update: (time: number, state: FxThreeState) => void;
        requiresBloom?: (state: FxThreeState) => boolean;
        dispose?: () => void;
    }
): FxThreeHandle {
    const overflowX = options.overflowX ?? 1;
    const overflowY = options.overflowY ?? 1;
    const aspectUniforms = options.aspectUniforms ?? [];

    return {
        kind,
        object: root,
        update: (time, state) => options.update(time, state),
        resize: (bounds, viewport) => {
            const position = createScenePosition(bounds, viewport);
            root.position.set(position.x, position.y, root.position.z);
            root.scale.set(bounds.width * overflowX, bounds.height * overflowY, 1);
            const aspect = bounds.width / Math.max(bounds.height, 1);
            aspectUniforms.forEach(uniform => {
                uniform.value = aspect;
            });
        },
        dispose: () => {
            options.dispose?.();
            disposeObjectTree(root);
        },
        requiresBloom: options.requiresBloom,
    };
}

function getThreeProfile(mode: FxThreeMode): NonNullable<FxVisualProfile["three"]> {
    const profile = FX_VISUAL_PROFILES[mode];
    if (!profile?.three) {
        throw new Error(`Three.js profile missing for token "${mode}".`);
    }
    return profile.three;
}

function getThreeSurfacePreset(mode: FxThreeMode, quality: FxThreeQuality): FxThreeSurfacePreset {
    return getThreeProfile(mode).surfacePresets[quality];
}

function countFromPreset(preset: FxThreeSurfacePreset, base: number, minimum: number, maximum: number): number {
    return clampNumber(Math.round(base * preset.geometryDensity * Math.max(0.55, preset.particleDensity)), minimum, maximum);
}

export function resolveBloomPreset(mode: FxThreeMode, state: FxThreeState, allowsBloom: boolean): FxBloomPreset {
    if (!allowsBloom || state.quality === "list") {
        return BLOOM_DISABLED;
    }

    switch (mode) {
        case "shiny":
            if (state.scope === "card") {
                return BLOOM_DISABLED;
            }
            return {
                enabled: true,
                strength: state.tier === "showcase" ? 0.2 : 0.14,
                radius: 0.45,
                threshold: 0.8,
            };
        case "radiant":
            if (state.scope === "card") {
                return {
                    enabled: state.tier === "high" || state.tier === "showcase",
                    strength: state.tier === "showcase" ? 0.24 : 0.16,
                    radius: 0.5,
                    threshold: 0.76,
                };
            }
            return {
                enabled: true,
                strength: state.tier === "showcase" ? 0.42 : 0.28,
                radius: 0.6,
                threshold: 0.72,
            };
        case "inferno":
            if (state.scope === "card") {
                return {
                    enabled: state.quality === "tile" && (state.tier === "high" || state.tier === "showcase"),
                    strength: state.tier === "showcase" ? 0.2 : 0.14,
                    radius: 0.46,
                    threshold: 0.78,
                };
            }
            return {
                enabled: true,
                strength: state.tier === "showcase" ? 0.34 : 0.22,
                radius: 0.52,
                threshold: 0.74,
            };
        case "cyberpunk":
            return {
                enabled: state.scope !== "card",
                strength: state.tier === "showcase" ? 0.16 : 0.1,
                radius: 0.36,
                threshold: 0.82,
            };
        case "singularity":
            return {
                enabled: state.scope !== "card",
                strength: state.tier === "showcase" ? 0.12 : 0.08,
                radius: 0.34,
                threshold: 0.86,
            };
        case "frozen":
        default:
            return BLOOM_DISABLED;
    }
}

function createSingularityHandle(state: FxThreeState): FxThreeHandle {
    const profile = FX_VISUAL_PROFILES.singularity;
    const preset = getThreeSurfacePreset("singularity", state.quality);
    const root = new THREE.Group();
    const uniforms = {
        uTime: { value: 0 },
        uIntensity: { value: 1 },
        uAspect: { value: 1 },
        uPrimary: { value: new THREE.Color(profile.colors.primary) },
        uAccent: { value: new THREE.Color(profile.colors.accent) },
        uLensStrength: { value: 0.28 + preset.distortionStrength * 0.12 },
        uDiskSpeed: { value: 0.72 + preset.motionScale * 0.38 },
        uEventRadius: { value: 0.16 - (preset.geometryDensity - 1) * 0.018 },
    };
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1, 48, 48),
        createShaderMaterial({
            uniforms,
            fragmentShader: SINGULARITY_FRAGMENT_SHADER,
            blending: THREE.NormalBlending,
        })
    );
    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.24, 0.05, 22, 96),
        new THREE.MeshBasicMaterial({
            color: profile.colors.sheen,
            transparent: true,
            opacity: 0.18,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
        })
    );
    ring.rotation.x = Math.PI * 0.44;
    ring.position.z = 0.08;
    const particles = createOrbitalPoints(countFromPreset(preset, 34, 16, 72), [profile.colors.accent, profile.colors.sheen]);
    particles.position.z = 0.05;
    particles.renderOrder = 2;
    root.add(plane, ring, particles);

    return createScaledHandle("singularity", root, {
        overflowX: preset.overflowX,
        overflowY: preset.overflowY,
        aspectUniforms: [uniforms.uAspect],
        update: (time, currentState) => {
            const intensity = clampNumber(currentState.intensity, 0.32, 1.45);
            uniforms.uTime.value = time;
            uniforms.uIntensity.value = intensity;
            uniforms.uLensStrength.value = (currentState.scope === "card" ? 0.22 : 0.3) + preset.distortionStrength * 0.12 + currentState.accentLevel * 0.08;
            uniforms.uDiskSpeed.value = (currentState.scope === "card" ? 0.58 : 0.88) * preset.motionScale + intensity * 0.08;
            uniforms.uEventRadius.value = clampNumber(0.2 - preset.geometryDensity * 0.035, 0.12, 0.2);
            particles.rotation.z = time * (0.08 + preset.motionScale * 0.12 + intensity * 0.04);
            particles.rotation.x = 0.2;
            ring.rotation.z = time * (currentState.scope === "card" ? 0.1 : 0.16);
            ring.scale.setScalar(0.9 + preset.motionScale * 0.12 + Math.sin(time * 0.5) * 0.02);
            (ring.material as THREE.MeshBasicMaterial).opacity = clampNumber(0.08 + preset.emissionStrength * 0.08 + currentState.accentLevel * 0.06, 0.08, 0.26);
            const material = particles.material as THREE.PointsMaterial;
            material.opacity = clampNumber(0.06 + preset.emissionStrength * 0.08 + currentState.accentLevel * 0.12, 0.08, 0.3);
        },
        requiresBloom: currentState => currentState.scope !== "card" && currentState.quality !== "list",
    });
}

function createCyberpunkHandle(state: FxThreeState): FxThreeHandle {
    const profile = FX_VISUAL_PROFILES.cyberpunk;
    const preset = getThreeSurfacePreset("cyberpunk", state.quality);
    const root = new THREE.Group();
    const uniforms = {
        uTime: { value: 0 },
        uIntensity: { value: 1 },
        uScanPhase: { value: -0.8 },
        uGlitchAmount: { value: 0.08 + preset.distortionStrength * 0.1 },
        uNeonMix: { value: 0.4 + preset.emissionStrength * 0.12 },
        uPrimary: { value: new THREE.Color(profile.colors.primary) },
        uAccent: { value: new THREE.Color(profile.colors.accent) },
    };
    const scanPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1, 1, 1),
        createShaderMaterial({
            uniforms,
            fragmentShader: CYBERPUNK_FRAGMENT_SHADER,
            blending: THREE.AdditiveBlending,
        })
    );
    scanPlane.position.z = -0.04;
    const gridPlane = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.9, 0.58, 5, 4)),
        new THREE.LineBasicMaterial({
            color: profile.colors.secondary,
            transparent: true,
            opacity: 0.14,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
        })
    );
    gridPlane.position.z = 0.02;

    const frameCount = countFromPreset(preset, 2, 1, 3);
    const frames = Array.from({ length: frameCount }, (_, index) =>
        createCyberFrame(0.82 - index * 0.08, 0.82 - index * 0.12, index * 0.05, index % 2 === 0 ? profile.colors.accent : profile.colors.rim)
    );
    frames.forEach(frame => root.add(frame));
    root.add(scanPlane, gridPlane);

    return createScaledHandle("cyberpunk", root, {
        overflowX: preset.overflowX,
        overflowY: preset.overflowY,
        update: (time, currentState) => {
            const intensity = clampNumber(currentState.intensity, 0.36, 1.45);
            uniforms.uTime.value = time;
            uniforms.uIntensity.value = intensity;
            uniforms.uScanPhase.value = Math.sin(time * (0.44 + preset.motionScale * 0.22)) * (0.28 + preset.motionScale * 0.32);
            uniforms.uGlitchAmount.value = clampNumber(0.04 + preset.distortionStrength * 0.12 + currentState.accentLevel * 0.1, 0.04, currentState.scope === "card" ? 0.18 : 0.28);
            uniforms.uNeonMix.value = clampNumber(0.36 + preset.emissionStrength * 0.16 + currentState.accentLevel * 0.06, 0.36, 0.74);
            gridPlane.position.y = Math.sin(time * (0.3 + preset.motionScale * 0.12)) * 0.01 * preset.motionScale;
            gridPlane.rotation.z = currentState.scope === "card" ? 0 : Math.sin(time * 0.16) * 0.01;
            (gridPlane.material as THREE.LineBasicMaterial).opacity = clampNumber(0.08 + preset.emissionStrength * 0.06 + currentState.accentLevel * 0.04, 0.08, 0.24);
            frames.forEach((frame, index) => {
                frame.position.y = Math.sin(time * (0.46 + preset.motionScale * 0.24) + index * 1.4) * 0.012 * preset.motionScale * intensity;
                frame.position.x = Math.cos(time * (0.3 + preset.motionScale * 0.16) + index * 0.8) * 0.008 * preset.motionScale;
                frame.rotation.z = currentState.scope === "card" ? 0 : Math.sin(time * 0.2 + index) * 0.012 * preset.motionScale;
                (frame.material as THREE.LineBasicMaterial).opacity = clampNumber(0.16 + preset.emissionStrength * 0.08 + index * 0.05 + currentState.accentLevel * 0.08, 0.16, 0.46);
            });
        },
        requiresBloom: currentState => currentState.quality !== "list",
    });
}

function createInfernoHandle(state: FxThreeState): FxThreeHandle {
    const profile = FX_VISUAL_PROFILES.inferno;
    const preset = getThreeSurfacePreset("inferno", state.quality);
    const root = new THREE.Group();
    const planeCount = countFromPreset(preset, 2, 1, 3);
    const planeUniforms = Array.from({ length: planeCount }, (_, index) => ({
        uTime: { value: 0 },
        uIntensity: { value: 1 },
        uHeatDistortion: { value: 0.08 + preset.distortionStrength * 0.16 },
        uFlameRise: { value: 0.72 + preset.motionScale * 0.24 },
        uCoreGlow: { value: 0.34 + preset.emissionStrength * 0.18 },
        uPhase: { value: index * 0.8 },
        uBase: { value: new THREE.Color(index % 2 === 0 ? profile.colors.secondary : profile.colors.accent) },
        uHot: { value: new THREE.Color(profile.colors.rim) },
    }));
    const planes = planeUniforms.map((uniforms, index) => {
        const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1, 1, 1),
            createShaderMaterial({
                uniforms,
                fragmentShader: INFERNO_FRAGMENT_SHADER,
                blending: THREE.AdditiveBlending,
            })
        );
        plane.position.z = -0.08 + index * 0.04;
        plane.scale.set(0.94 + index * 0.05, 1.02 + index * 0.08, 1);
        plane.rotation.z = index === 1 ? 0.08 : index === 2 ? -0.07 : 0;
        return plane;
    });
    planes.forEach(plane => root.add(plane));

    const core = new THREE.Mesh(
        new THREE.CircleGeometry(0.22, 48),
        new THREE.MeshBasicMaterial({
            color: profile.colors.rim,
            transparent: true,
            opacity: 0.18,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
        })
    );
    core.position.set(0, -0.08, 0.18);
    root.add(core);
    const heatVeil = new THREE.Mesh(
        new THREE.PlaneGeometry(1.05, 1.12, 1, 1),
        new THREE.MeshBasicMaterial({
            color: profile.colors.secondary,
            transparent: true,
            opacity: 0.08,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
        })
    );
    heatVeil.position.z = -0.14;
    root.add(heatVeil);

    const emberCount = preset.particleDensity <= 0.2 ? 0 : countFromPreset(preset, 24, 12, 42);
    const embers = emberCount > 0 ? createEmberPoints(emberCount, [profile.colors.accent, profile.colors.rim, profile.colors.sheen]) : null;
    if (embers) {
        embers.position.z = 0.22;
        root.add(embers);
    }

    return createScaledHandle("inferno", root, {
        overflowX: preset.overflowX,
        overflowY: preset.overflowY,
        update: (time, currentState) => {
            const intensity = clampNumber(currentState.intensity, 0.35, 1.52);
            planeUniforms.forEach((uniforms, index) => {
                uniforms.uTime.value = time;
                uniforms.uIntensity.value = intensity;
                uniforms.uHeatDistortion.value = clampNumber(0.06 + preset.distortionStrength * 0.18 + currentState.accentLevel * 0.1, 0.06, currentState.scope === "card" ? 0.2 : 0.3);
                uniforms.uFlameRise.value = 0.66 + preset.motionScale * 0.24 + index * 0.08;
                uniforms.uCoreGlow.value = clampNumber(0.22 + preset.emissionStrength * 0.22 + currentState.accentLevel * 0.12, 0.22, 0.72);
            });
            core.scale.setScalar(1 + Math.sin(time * (0.8 + preset.motionScale * 0.38)) * 0.04 + intensity * 0.04 * preset.motionScale);
            (core.material as THREE.MeshBasicMaterial).opacity = clampNumber(0.06 + preset.emissionStrength * 0.1 + currentState.accentLevel * 0.08, 0.06, 0.28);
            heatVeil.scale.set(1 + preset.distortionStrength * 0.08, 1 + preset.distortionStrength * 0.12, 1);
            heatVeil.position.y = -0.02 + Math.sin(time * (0.36 + preset.motionScale * 0.16)) * 0.015;
            (heatVeil.material as THREE.MeshBasicMaterial).opacity = clampNumber(0.03 + preset.emissionStrength * 0.05 + currentState.accentLevel * 0.05, 0.03, 0.16);
            if (embers) {
                embers.rotation.z = -time * (0.06 + preset.motionScale * 0.08);
                const emberMaterial = embers.material as THREE.PointsMaterial;
                emberMaterial.opacity = clampNumber(0.08 + preset.particleDensity * 0.08 + currentState.accentLevel * 0.06, 0.08, 0.22);
            }
        },
        requiresBloom: currentState => currentState.quality !== "list",
    });
}

function createFrozenHandle(state: FxThreeState): FxThreeHandle {
    const profile = FX_VISUAL_PROFILES.frozen;
    const preset = getThreeSurfacePreset("frozen", state.quality);
    const root = new THREE.Group();
    const uniforms = {
        uTime: { value: 0 },
        uIntensity: { value: 1 },
        uAspect: { value: 1 },
        uRefractionStrength: { value: 0.08 + preset.distortionStrength * 0.12 },
        uFresnelBoost: { value: 0.28 + preset.emissionStrength * 0.12 },
        uCrystalSpark: { value: 0.14 + preset.particleDensity * 0.1 },
        uPrimary: { value: new THREE.Color(profile.colors.primary) },
        uAccent: { value: new THREE.Color(profile.colors.accent) },
    };
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1, 1, 1),
        createShaderMaterial({
            uniforms,
            fragmentShader: FROZEN_FRAGMENT_SHADER,
            blending: THREE.NormalBlending,
        })
    );
    plane.position.z = -0.04;
    root.add(plane);
    const frostRing = new THREE.Mesh(
        new THREE.RingGeometry(0.28, 0.42, 64),
        new THREE.MeshBasicMaterial({
            color: profile.colors.sheen,
            transparent: true,
            opacity: 0.1,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
        })
    );
    frostRing.position.z = 0.08;
    root.add(frostRing);

    const crystalCount = countFromPreset(preset, 10, 6, 18);
    const crystals = createCrystalField(crystalCount, profile.colors.sheen);
    root.add(crystals.mesh);
    const crystalDummy = new THREE.Object3D();

    return createScaledHandle("frozen", root, {
        overflowX: preset.overflowX,
        overflowY: preset.overflowY,
        aspectUniforms: [uniforms.uAspect],
        update: (time, currentState) => {
            const intensity = clampNumber(currentState.intensity, 0.34, 1.24);
            uniforms.uTime.value = time;
            uniforms.uIntensity.value = intensity;
            uniforms.uRefractionStrength.value = clampNumber(0.06 + preset.distortionStrength * 0.12 + currentState.accentLevel * 0.08, 0.06, currentState.scope === "card" ? 0.18 : 0.24);
            uniforms.uFresnelBoost.value = 0.26 + preset.emissionStrength * 0.16 + (currentState.scope === "card" ? 0 : 0.06);
            uniforms.uCrystalSpark.value = clampNumber(0.08 + preset.particleDensity * 0.08 + currentState.accentLevel * 0.08, 0.08, 0.3);
            frostRing.rotation.z = currentState.scope === "card" ? 0 : time * 0.05;
            (frostRing.material as THREE.MeshBasicMaterial).opacity = clampNumber(0.05 + preset.emissionStrength * 0.05 + currentState.accentLevel * 0.04, 0.05, 0.16);

            crystals.transforms.forEach((entry, index) => {
                crystalDummy.position.copy(entry.position);
                const twinkle = 1 + Math.sin(time * (0.34 + preset.motionScale * 0.18) + entry.offset) * 0.08;
                crystalDummy.rotation.set(entry.rotation * 0.28, entry.rotation + time * 0.04 * preset.motionScale, entry.rotation * 0.16);
                crystalDummy.scale.setScalar(entry.scale * twinkle);
                crystalDummy.updateMatrix();
                crystals.mesh.setMatrixAt(index, crystalDummy.matrix);
            });
            crystals.mesh.instanceMatrix.needsUpdate = true;
        },
        requiresBloom: () => false,
    });
}

function createShinyHandle(state: FxThreeState): FxThreeHandle {
    const profile = FX_VISUAL_PROFILES.shiny;
    const preset = getThreeSurfacePreset("shiny", state.quality);
    const root = new THREE.Group();
    const uniforms = {
        uTime: { value: 0 },
        uIntensity: { value: 1 },
        uSheenAngle: { value: 0 },
        uSpecularBoost: { value: 0.18 + preset.emissionStrength * 0.14 },
        uGoldMix: { value: 0.46 + preset.emissionStrength * 0.08 },
        uBase: { value: new THREE.Color(profile.colors.primary) },
        uGold: { value: new THREE.Color(profile.colors.rim) },
    };
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1, 1, 1),
        createShaderMaterial({
            uniforms,
            fragmentShader: SHINY_FRAGMENT_SHADER,
            blending: THREE.NormalBlending,
        })
    );
    root.add(plane);

    return createScaledHandle("shiny", root, {
        overflowX: preset.overflowX,
        overflowY: preset.overflowY,
        update: (time, currentState) => {
            const intensity = clampNumber(currentState.intensity, 0.28, 1.18);
            uniforms.uTime.value = time;
            uniforms.uIntensity.value = intensity;
            uniforms.uSheenAngle.value = time * (0.08 + preset.motionScale * 0.1);
            uniforms.uSpecularBoost.value = clampNumber(0.12 + preset.emissionStrength * 0.16 + currentState.accentLevel * 0.08, 0.12, 0.48);
            uniforms.uGoldMix.value = clampNumber(0.42 + preset.emissionStrength * 0.1 + (currentState.scope === "card" ? 0 : 0.04), 0.42, 0.66);
        },
        requiresBloom: currentState => currentState.scope !== "card" && currentState.quality !== "list",
    });
}

function createRadiantHandle(state: FxThreeState): FxThreeHandle {
    const profile = FX_VISUAL_PROFILES.radiant;
    const preset = getThreeSurfacePreset("radiant", state.quality);
    const root = new THREE.Group();
    const uniforms = {
        uTime: { value: 0 },
        uIntensity: { value: 1 },
        uHaloStrength: { value: 0.22 + preset.emissionStrength * 0.18 },
        uRadiance: { value: 0.52 + preset.emissionStrength * 0.14 },
        uSpecularBoost: { value: 0.2 + preset.emissionStrength * 0.16 },
        uBase: { value: new THREE.Color(profile.colors.secondary) },
        uGold: { value: new THREE.Color(profile.colors.rim) },
    };
    const basePlane = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1, 1, 1),
        createShaderMaterial({
            uniforms,
            fragmentShader: RADIANT_FRAGMENT_SHADER,
            blending: THREE.NormalBlending,
        })
    );
    const haloPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1, 1, 1),
        createShaderMaterial({
            uniforms: {
                uTime: uniforms.uTime,
                uIntensity: uniforms.uIntensity,
                uHaloStrength: uniforms.uHaloStrength,
                uRadiance: uniforms.uRadiance,
                uSpecularBoost: uniforms.uSpecularBoost,
                uBase: uniforms.uBase,
                uGold: uniforms.uGold,
            },
            fragmentShader: RADIANT_FRAGMENT_SHADER,
            blending: THREE.AdditiveBlending,
        })
    );
    haloPlane.scale.set(1.12, 1.12, 1);
    haloPlane.position.z = -0.03;
    const haloRing = new THREE.Mesh(
        new THREE.RingGeometry(0.22, 0.34, 64),
        new THREE.MeshBasicMaterial({
            color: profile.colors.rim,
            transparent: true,
            opacity: 0.18,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
        })
    );
    haloRing.position.z = 0.12;
    const outerHaloRing = new THREE.Mesh(
        new THREE.RingGeometry(0.36, 0.46, 72),
        new THREE.MeshBasicMaterial({
            color: profile.colors.sheen,
            transparent: true,
            opacity: 0.08,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
        })
    );
    outerHaloRing.position.z = 0.06;
    root.add(haloPlane, basePlane, haloRing, outerHaloRing);

    return createScaledHandle("radiant", root, {
        overflowX: preset.overflowX,
        overflowY: preset.overflowY,
        update: (time, currentState) => {
            const intensity = clampNumber(currentState.intensity, 0.34, 1.5);
            uniforms.uTime.value = time;
            uniforms.uIntensity.value = intensity;
            uniforms.uHaloStrength.value = clampNumber(0.14 + preset.emissionStrength * 0.18 + currentState.accentLevel * 0.12, 0.14, currentState.scope === "card" ? 0.42 : 0.62);
            uniforms.uRadiance.value = clampNumber(0.46 + preset.emissionStrength * 0.16 + (currentState.scope === "card" ? 0.02 : 0.1), 0.46, 0.88);
            uniforms.uSpecularBoost.value = clampNumber(0.14 + preset.emissionStrength * 0.14 + currentState.accentLevel * 0.1, 0.14, 0.52);
            haloRing.rotation.z = currentState.scope === "card" ? 0 : time * (0.05 + preset.motionScale * 0.05);
            outerHaloRing.rotation.z = currentState.scope === "card" ? 0 : -time * (0.03 + preset.motionScale * 0.03);
            (haloRing.material as THREE.MeshBasicMaterial).opacity = clampNumber(0.06 + preset.emissionStrength * 0.08 + currentState.accentLevel * 0.06, 0.06, 0.24);
            (outerHaloRing.material as THREE.MeshBasicMaterial).opacity = clampNumber(0.04 + preset.emissionStrength * 0.05 + currentState.accentLevel * 0.04, 0.04, 0.14);
        },
        requiresBloom: currentState => currentState.quality !== "list" && currentState.tier !== "medium",
    });
}

function createHandleForToken(mode: FxThreeMode, state: FxThreeState): FxThreeHandle {
    switch (mode) {
        case "singularity":
            return createSingularityHandle(state);
        case "cyberpunk":
            return createCyberpunkHandle(state);
        case "inferno":
            return createInfernoHandle(state);
        case "frozen":
            return createFrozenHandle(state);
        case "shiny":
            return createShinyHandle(state);
        case "radiant":
            return createRadiantHandle(state);
        default:
            throw new Error(`Unsupported Three.js token mode: ${mode as string}`);
    }
}

class FxWebGLManagerSingleton {
    private container: HTMLElement | null = null;
    private renderer: THREE.WebGLRenderer | null = null;
    private scene: THREE.Scene | null = null;
    private camera: THREE.OrthographicCamera | null = null;
    private composer: EffectComposer | null = null;
    private renderPass: RenderPass | null = null;
    private bloomPass: UnrealBloomPass | null = null;
    private observer: IntersectionObserver | null = null;
    private registrations = new Map<HTMLElement, Registration>();
    private animationId = 0;
    private isRunning = false;
    private viewport: Viewport = { ...DEFAULT_VIEWPORT };
    private webglDisabled = false;
    private suspended = false;

    public init(container: HTMLElement): void {
        this.container = container;
        if (this.webglDisabled) {
            return;
        }
        if (this.renderer && this.renderer.domElement.parentElement !== container) {
            container.appendChild(this.renderer.domElement);
        }
        if (this.renderer) {
            this.start();
            return;
        }

        try {
            const renderer = new THREE.WebGLRenderer({
                alpha: true,
                antialias: true,
                powerPreference: "high-performance",
                premultipliedAlpha: true,
            });
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            renderer.setClearColor(0x000000, 0);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.domElement.style.position = "absolute";
            renderer.domElement.style.top = "0";
            renderer.domElement.style.left = "0";
            renderer.domElement.style.width = "100%";
            renderer.domElement.style.height = "100%";
            renderer.domElement.style.display = "block";
            renderer.domElement.style.background = "transparent";
            renderer.domElement.style.pointerEvents = "none";
            renderer.domElement.addEventListener("webglcontextlost", this.handleContextLost as EventListener, false);
            container.replaceChildren(renderer.domElement);

            const scene = new THREE.Scene();
            scene.background = null;
            const camera = new THREE.OrthographicCamera(-window.innerWidth / 2, window.innerWidth / 2, window.innerHeight / 2, -window.innerHeight / 2, -4000, 4000);
            camera.position.z = 1000;
            const composer = new EffectComposer(renderer);
            const renderPass = new RenderPass(scene, camera);
            const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0, 0.4, 0.85);
            bloomPass.enabled = false;
            composer.addPass(renderPass);
            composer.addPass(bloomPass);

            this.renderer = renderer;
            this.scene = scene;
            this.camera = camera;
            this.composer = composer;
            this.renderPass = renderPass;
            this.bloomPass = bloomPass;
            this.viewport = { width: window.innerWidth, height: window.innerHeight };
            this.createObserver();
            this.registrations.forEach(registration => {
                this.observeElement(registration.element);
                this.ensureHandle(registration);
            });

            window.addEventListener("resize", this.handleResize);
            document.addEventListener("visibilitychange", this.handleDocumentVisibility);
            this.start();
        } catch (error) {
            this.failAndFallback(error);
        }
    }

    public registerSurface(element: HTMLElement, token: FxToken, state: FxThreeState): void {
        const profile = FX_VISUAL_PROFILES[token];
        if (!profile.three) {
            return;
        }
        if (this.webglDisabled) {
            this.applyFallbackToElement(element);
            return;
        }

        const existing = this.registrations.get(element);
        if (existing) {
            const nextMode = profile.three.mode;
            const modeChanged = existing.mode !== nextMode;
            const needsRebuild =
                existing.state.quality !== state.quality ||
                existing.state.scope !== state.scope ||
                existing.state.tier !== state.tier ||
                modeChanged;
            existing.token = token;
            existing.mode = nextMode;
            existing.qualityCost = profile.three.qualityCost;
            existing.state = state;
            existing.visible = existing.visible || this.isElementVisible(element);
            this.clearFallbackMarker(element);
            if (needsRebuild) {
                this.disposeHandle(existing);
            }
            this.ensureHandle(existing);
            this.start();
            return;
        }

        const registration: Registration = {
            element,
            token,
            mode: profile.three.mode,
            state,
            handle: null,
            visible: this.isElementVisible(element),
            active: false,
            qualityCost: profile.three.qualityCost,
            lastBounds: null,
        };
        this.registrations.set(element, registration);
        this.clearFallbackMarker(element);
        this.observeElement(element);
        this.ensureHandle(registration);
        this.start();
    }

    public updateSurfaceState(element: HTMLElement, state: FxThreeState): void {
        const registration = this.registrations.get(element);
        if (!registration) {
            return;
        }
        const needsRebuild =
            registration.state.quality !== state.quality ||
            registration.state.scope !== state.scope ||
            registration.state.tier !== state.tier;
        registration.state = state;
        registration.visible = registration.visible || this.isElementVisible(element);
        this.clearFallbackMarker(element);
        if (needsRebuild) {
            this.disposeHandle(registration);
            this.ensureHandle(registration);
        }
    }

    public unregisterSurface(element: HTMLElement): void {
        const registration = this.registrations.get(element);
        if (!registration) {
            delete element.dataset.fxThreeFallback;
            delete element.dataset.fxThreeBloom;
            return;
        }
        if (this.observer) {
            this.observer.unobserve(element);
        }
        this.disposeHandle(registration);
        this.registrations.delete(element);
        delete element.dataset.fxThreeFallback;
        delete element.dataset.fxThreeBloom;
    }

    public setSuspended(nextSuspended: boolean): void {
        if (this.suspended === nextSuspended) {
            return;
        }
        this.suspended = nextSuspended;
        if (nextSuspended) {
            this.stop();
            return;
        }
        if (this.registrations.size > 0 || this.renderer) {
            this.start();
        }
    }

    public stop(): void {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = 0;
        }
        this.registrations.forEach(registration => {
            if (registration.handle) {
                registration.handle.object.visible = false;
            }
            delete registration.element.dataset.fxThreeBloom;
        });
    }

    private start(): void {
        if (this.isRunning || this.webglDisabled || this.suspended || !this.renderer || document.hidden) {
            return;
        }
        this.isRunning = true;
        this.animationId = window.requestAnimationFrame(this.tick);
    }

    private tick = (): void => {
        if (!this.isRunning || !this.renderer || !this.scene || !this.camera) {
            return;
        }

        const time = performance.now() * 0.001;
        const activeRegistrations = this.resolveActiveRegistrations();
        activeRegistrations.forEach(registration => {
            if (!registration.handle || !registration.lastBounds) {
                return;
            }
            registration.handle.object.visible = true;
            registration.handle.resize(registration.lastBounds, this.viewport);
            registration.handle.update(time, registration.state);
        });

        this.registrations.forEach(registration => {
            if (!registration.active && registration.handle) {
                registration.handle.object.visible = false;
            }
            if (!registration.active) {
                delete registration.element.dataset.fxThreeBloom;
            }
        });

        try {
            const bloomPreset = this.resolveActiveBloomPreset(activeRegistrations);
            if (bloomPreset.enabled && this.composer && this.bloomPass) {
                this.bloomPass.enabled = true;
                this.bloomPass.strength = bloomPreset.strength;
                this.bloomPass.radius = bloomPreset.radius;
                this.bloomPass.threshold = bloomPreset.threshold;
                this.composer.render();
            } else {
                if (this.bloomPass) {
                    this.bloomPass.enabled = false;
                }
                this.renderer.render(this.scene, this.camera);
            }
        } catch (error) {
            this.failAndFallback(error);
            return;
        }

        this.animationId = window.requestAnimationFrame(this.tick);
    };

    private resolveActiveRegistrations(): Registration[] {
        const active: Registration[] = [];
        const visibleCards: Registration[] = [];

        this.registrations.forEach(registration => {
            if (!registration.handle) {
                this.ensureHandle(registration);
            }
            if (!registration.handle) {
                registration.active = false;
                return;
            }
            if (!registration.visible || !registration.element.isConnected) {
                registration.active = false;
                registration.lastBounds = null;
                registration.handle.object.visible = false;
                return;
            }
            const bounds = this.measureBounds(registration.element);
            if (!bounds) {
                registration.active = false;
                registration.lastBounds = null;
                registration.handle.object.visible = false;
                return;
            }
            registration.lastBounds = bounds;
            if (registration.state.scope === "card") {
                visibleCards.push(registration);
                return;
            }
            registration.active = true;
            active.push(registration);
        });

        visibleCards.sort((left, right) => {
            const leftBounds = left.lastBounds ?? ({ top: 0, left: 0 } as Bounds);
            const rightBounds = right.lastBounds ?? ({ top: 0, left: 0 } as Bounds);
            if (leftBounds.top !== rightBounds.top) {
                return leftBounds.top - rightBounds.top;
            }
            return leftBounds.left - rightBounds.left;
        });

        const cardBudget = visibleCards.some(entry => entry.state.tier === "showcase") ? CARD_BUDGET.showcase : CARD_BUDGET.high;
        let usedBudget = 0;
        visibleCards.forEach(registration => {
            const nextBudget = usedBudget + registration.qualityCost;
            if (nextBudget > cardBudget) {
                registration.active = false;
                if (registration.handle) {
                    registration.handle.object.visible = false;
                }
                return;
            }
            usedBudget = nextBudget;
            registration.active = true;
            active.push(registration);
        });

        return active;
    }

    private resolveActiveBloomPreset(activeRegistrations: Registration[]): FxBloomPreset {
        let strongest = BLOOM_DISABLED;
        activeRegistrations.forEach(registration => {
            if (!registration.handle) {
                delete registration.element.dataset.fxThreeBloom;
                return;
            }
            const preset = resolveBloomPreset(registration.mode, registration.state, registration.handle.requiresBloom?.(registration.state) ?? false);
            if (!preset.enabled) {
                delete registration.element.dataset.fxThreeBloom;
                return;
            }
            registration.element.dataset.fxThreeBloom = "1";
            if (!strongest.enabled || preset.strength > strongest.strength) {
                strongest = preset;
            }
        });
        return strongest;
    }

    private ensureHandle(registration: Registration): void {
        if (this.webglDisabled || registration.handle || !this.scene) {
            return;
        }
        try {
            const handle = createHandleForToken(registration.mode, registration.state);
            handle.object.visible = false;
            this.scene.add(handle.object);
            registration.handle = handle;
            this.clearFallbackMarker(registration.element);
        } catch (error) {
            this.failAndFallback(error);
        }
    }

    private disposeHandle(registration: Registration): void {
        if (!registration.handle) {
            return;
        }
        if (this.scene) {
            this.scene.remove(registration.handle.object);
        }
        registration.handle.dispose();
        registration.handle = null;
        registration.active = false;
    }

    private createObserver(): void {
        if (this.observer || typeof IntersectionObserver === "undefined") {
            return;
        }
        this.observer = new IntersectionObserver(
            entries => {
                entries.forEach(entry => {
                    const registration = this.registrations.get(entry.target as HTMLElement);
                    if (!registration) {
                        return;
                    }
                    registration.visible = entry.isIntersecting && entry.intersectionRatio > 0.02;
                });
            },
            { threshold: [0, 0.02, 0.12] }
        );
    }

    private observeElement(element: HTMLElement): void {
        if (this.observer) {
            this.observer.observe(element);
        }
    }

    private measureBounds(element: HTMLElement): Bounds | null {
        const rect = element.getBoundingClientRect();
        if (rect.width < 6 || rect.height < 6) {
            return null;
        }
        if (rect.bottom < 0 || rect.top > this.viewport.height || rect.right < 0 || rect.left > this.viewport.width) {
            return null;
        }
        return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
        };
    }

    private handleResize = (): void => {
        this.viewport = {
            width: window.innerWidth,
            height: window.innerHeight,
        };
        if (!this.renderer || !this.camera) {
            return;
        }
        this.renderer.setSize(this.viewport.width, this.viewport.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        this.composer?.setSize(this.viewport.width, this.viewport.height);
        this.camera.left = -this.viewport.width / 2;
        this.camera.right = this.viewport.width / 2;
        this.camera.top = this.viewport.height / 2;
        this.camera.bottom = -this.viewport.height / 2;
        this.camera.updateProjectionMatrix();
        this.bloomPass?.setSize(this.viewport.width, this.viewport.height);
    };

    private handleDocumentVisibility = (): void => {
        if (document.hidden) {
            this.stop();
            return;
        }
        this.start();
    };

    private handleContextLost = (event: Event): void => {
        event.preventDefault();
        this.failAndFallback(new Error("WebGL context lost"));
    };

    private isElementVisible(element: HTMLElement): boolean {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
    }

    private clearFallbackMarker(element: HTMLElement): void {
        delete element.dataset.fxThreeFallback;
    }

    private applyFallbackToElement(element: HTMLElement): void {
        delete element.dataset.fxThreeActive;
        delete element.dataset.fxThreeToken;
        delete element.dataset.fxThreeBloom;
        element.dataset.fxThreeFallback = "1";
    }

    private failAndFallback(error: unknown): void {
        if (this.webglDisabled) {
            return;
        }
        console.warn("[FxWebGLManager] Disabling Three.js FX and falling back to 2D.", error);
        this.webglDisabled = true;
        this.stop();
        this.registrations.forEach(registration => {
            this.applyFallbackToElement(registration.element);
            this.disposeHandle(registration);
        });
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.renderer) {
            this.renderer.domElement.removeEventListener("webglcontextlost", this.handleContextLost as EventListener, false);
            this.renderer.dispose();
            this.renderer.domElement.remove();
        }
        window.removeEventListener("resize", this.handleResize);
        document.removeEventListener("visibilitychange", this.handleDocumentVisibility);
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.composer = null;
        this.renderPass = null;
        this.bloomPass = null;
    }
}

export const FxWebGLManager = new FxWebGLManagerSingleton();
