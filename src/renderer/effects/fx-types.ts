import type { Object3D } from "three";

export const FX_TOKENS = [
    "shiny",
    "frozen",
    "singularity",
    "vampiric",
    "cyberpunk",
    "inferno",
    "ember",
    "frost",
    "holo",
    "neon",
    "prism",
    "glitch",
    "aurora",
    "plasma",
    "toxic",
    "cosmic",
    "vapor",
    "storm",
    "matrix",
    "ghost",
    "crystal",
    "chrome",
    "noir",
    "sunset",
    "void",
    "candy",
    "velvet",
    "radiant",
] as const;

export type FxToken = typeof FX_TOKENS[number];
export type FxSurfaceScope = "card" | "overlay" | "onboarding" | "lab";
export type MotionTier = "low" | "medium" | "high" | "showcase";
export type FxThreeQuality = "list" | "tile" | "overlay" | "lab" | "onboarding";
export type FxThreeMode = "singularity" | "cyberpunk" | "inferno" | "frozen" | "shiny" | "radiant";
export type FxRuntimeSurfaceQuality = FxThreeQuality | "none";
export type FxChipScope = "card" | "lab";

export const RIBBON_TAGS = ["recommended", "sneakpeek", "hot", "beta", "new", "experimental", "featured", "secret", "hostonly", "updateavailable"] as const;
export type RibbonTag = typeof RIBBON_TAGS[number];

export type FxResolvedToken = {
    token: FxToken;
    hidden: boolean;
    rawTag: string;
};

export type FxChipEffectVariant =
    | "sheen"
    | "halo"
    | "ember"
    | "frost"
    | "orbit"
    | "cyber"
    | "glitch"
    | "prism"
    | "mist"
    | "toxic"
    | "matrix"
    | "storm"
    | "vampiric";

export type RibbonResolved = {
    tag: RibbonTag;
    label: string;
    priority: number;
};

export type ParticleShape = "dot" | "diamond" | "line" | "square" | "glyph" | "flake" | "spark";
export type ParticleZone = "full" | "top" | "bottom" | "edge" | "center";
export type ParticleEmitterPattern = "drift" | "orbital" | "swarm" | "implosion" | "rain" | "burst-grid" | "matrix-fall";

export type ParticlePreset = {
    spawnRate: number;
    maxParticles: number;
    lifeMs: [number, number];
    size: [number, number];
    speedX: [number, number];
    speedY: [number, number];
    drift: number;
    alpha: [number, number];
    colors: string[];
    shape: ParticleShape;
    zone: ParticleZone;
    blendMode: GlobalCompositeOperation;
    pattern: ParticleEmitterPattern;
    burstWindowMs?: [number, number];
    settleMs?: [number, number];
    centerPull?: number;
};

export type MotionTierFeatures = {
    border: boolean;
    pulse: boolean;
    dualSweep: boolean;
    particles: boolean;
    accentBurst: boolean;
};

export type ParticleCapProfile = {
    perCard: number;
    perOverlay: number;
    onboardingPanel: number;
    globalTotal: number;
};

export type MotionTierProfile = {
    tier: MotionTier;
    speedMultiplier: number;
    translateDistance: number;
    panelGlow: number;
    panelSweepDuration: number;
    panelPulseDuration: number;
    previewSweepDuration: number;
    previewPulseScale: number;
    accentOpacity: number;
    effectStrength: number;
    sheenCount: number;
    particleDensity: number;
    particleEnabled: boolean;
    outlineBoost: number;
    sheenStyle: "single" | "dual";
    features: MotionTierFeatures;
    particleCaps: ParticleCapProfile;
};

export type FxVisualProfile = {
    token: FxToken;
    description: string;
    motionMode:
        | "sheen"
        | "freeze"
        | "flame"
        | "storm"
        | "matrix"
        | "glitch"
        | "aurora"
        | "plasma"
        | "mist"
        | "pulse"
        | "singularity"
        | "vampiric"
        | "cyberpunk"
        | "cosmic";
    colors: {
        primary: string;
        secondary: string;
        accent: string;
        rim: string;
        sheen: string;
    };
    particle: ParticlePreset;
    cardFx?: FxCardEffectProfile;
    chipFx?: FxChipEffectProfile;
    three?: {
        mode: FxThreeMode;
        minTierByScope: Partial<Record<FxSurfaceScope, MotionTier>>;
        supportsBloom: boolean;
        qualityCost: number;
        calmCardMotion?: boolean;
        heroScopes?: FxSurfaceScope[];
        surfacePresets: Record<FxThreeQuality, FxThreeSurfacePreset>;
    };
};

export type FxCardEffectProfile = {
    baseBoost: number;
    accentBoost: number;
    particleBoost: number;
    heroBaseBoost: number;
    heroAccentBoost: number;
    heroParticleBoost: number;
};

export type FxChipEffectProfile = {
    variant: FxChipEffectVariant;
    intensity: number;
    particleCount: number;
    sheenDurationMs: number;
};

export type FxRuntimeMetrics = {
    particleCount: number;
    cappedSpawns: number;
    activeEmitters: number;
    tier: MotionTier;
    threeActive: boolean;
    threeFallback: boolean;
    bloomActive: boolean;
    scope: FxSurfaceScope;
    quality: FxRuntimeSurfaceQuality;
};

export type FxThreeSurfacePreset = {
    geometryDensity: number;
    overflowX: number;
    overflowY: number;
    motionScale: number;
    emissionStrength: number;
    distortionStrength: number;
    particleDensity: number;
};

export type FxThreeState = {
    intensity: number;
    accentLevel: number;
    tier: MotionTier;
    scope: FxSurfaceScope;
    quality: FxThreeQuality;
    listMode: boolean;
};

export type FxThreeHandle = {
    kind: FxThreeMode;
    object: Object3D;
    update: (time: number, state: FxThreeState) => void;
    resize: (bounds: { left: number; top: number; width: number; height: number }, viewport: { width: number; height: number }) => void;
    dispose: () => void;
    requiresBloom?: (state: FxThreeState) => boolean;
};
