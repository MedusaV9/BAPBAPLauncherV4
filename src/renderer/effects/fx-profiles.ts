import type {
    FxCardEffectProfile,
    FxChipEffectProfile,
    FxChipEffectVariant,
    FxThreeSurfacePreset,
    FxToken,
    FxVisualProfile,
    MotionTier,
    MotionTierProfile,
    ParticlePreset,
} from "./fx-types";

const CARD_THREE_SCOPE = {
    card: "medium",
    overlay: "medium",
    onboarding: "medium",
    lab: "medium",
} as const;

const DEFAULT_PARTICLE: ParticlePreset = {
    spawnRate: 5,
    maxParticles: 52,
    lifeMs: [700, 1400],
    size: [1.6, 3.6],
    speedX: [-12, 12],
    speedY: [-22, -8],
    drift: 8,
    alpha: [0.3, 0.85],
    colors: ["#b9d2ff", "#8ea9ff"],
    shape: "dot",
    zone: "full",
    blendMode: "screen",
    pattern: "drift",
};

function particlePreset(overrides: Partial<ParticlePreset>): ParticlePreset {
    return {
        ...DEFAULT_PARTICLE,
        ...overrides,
    };
}

const BASE_THREE_SURFACE_PRESET: FxThreeSurfacePreset = {
    geometryDensity: 1,
    overflowX: 1.06,
    overflowY: 1.06,
    motionScale: 1,
    emissionStrength: 1,
    distortionStrength: 1,
    particleDensity: 1,
};

function threeSurfacePreset(overrides: Partial<FxThreeSurfacePreset>): FxThreeSurfacePreset {
    return {
        ...BASE_THREE_SURFACE_PRESET,
        ...overrides,
    };
}

function buildThreeSurfacePresets(presets: {
    list: Partial<FxThreeSurfacePreset>;
    tile: Partial<FxThreeSurfacePreset>;
    overlay: Partial<FxThreeSurfacePreset>;
    lab?: Partial<FxThreeSurfacePreset>;
    onboarding?: Partial<FxThreeSurfacePreset>;
}): Record<"list" | "tile" | "overlay" | "lab" | "onboarding", FxThreeSurfacePreset> {
    const overlay = threeSurfacePreset(presets.overlay);
    return {
        list: threeSurfacePreset(presets.list),
        tile: threeSurfacePreset(presets.tile),
        overlay,
        lab: threeSurfacePreset(presets.lab ?? presets.overlay),
        onboarding: threeSurfacePreset(presets.onboarding ?? presets.overlay),
    };
}

const BASE_TIER_PROFILES: Record<MotionTier, MotionTierProfile> = {
    low: {
        tier: "low",
        speedMultiplier: 0.72,
        translateDistance: 5,
        panelGlow: 0.16,
        panelSweepDuration: 4300,
        panelPulseDuration: 3200,
        previewSweepDuration: 2600,
        previewPulseScale: 1.004,
        accentOpacity: 0.12,
        effectStrength: 0.34,
        sheenCount: 1,
        particleDensity: 0,
        particleEnabled: false,
        outlineBoost: 0.14,
        sheenStyle: "single",
        features: {
            border: false,
            pulse: false,
            dualSweep: false,
            particles: false,
            accentBurst: false,
        },
        particleCaps: {
            perCard: 0,
            perOverlay: 0,
            onboardingPanel: 0,
            globalTotal: 0,
        },
    },
    medium: {
        tier: "medium",
        speedMultiplier: 1,
        translateDistance: 10,
        panelGlow: 0.76,
        panelSweepDuration: 1940,
        panelPulseDuration: 1540,
        previewSweepDuration: 1100,
        previewPulseScale: 1.036,
        accentOpacity: 0.8,
        effectStrength: 1.2,
        sheenCount: 1,
        particleDensity: 1.9,
        particleEnabled: true,
        outlineBoost: 1.04,
        sheenStyle: "single",
        features: {
            border: true,
            pulse: true,
            dualSweep: false,
            particles: true,
            accentBurst: true,
        },
        particleCaps: {
            perCard: 228,
            perOverlay: 280,
            onboardingPanel: 360,
            globalTotal: 920,
        },
    },
    high: {
        tier: "high",
        speedMultiplier: 1.38,
        translateDistance: 17,
        panelGlow: 0.86,
        panelSweepDuration: 1540,
        panelPulseDuration: 1260,
        previewSweepDuration: 860,
        previewPulseScale: 1.05,
        accentOpacity: 0.88,
        effectStrength: 1.34,
        sheenCount: 2,
        particleDensity: 2.16,
        particleEnabled: true,
        outlineBoost: 1.2,
        sheenStyle: "single",
        features: {
            border: true,
            pulse: true,
            dualSweep: false,
            particles: true,
            accentBurst: true,
        },
        particleCaps: {
            perCard: 312,
            perOverlay: 390,
            onboardingPanel: 480,
            globalTotal: 1180,
        },
    },
    showcase: {
        tier: "showcase",
        speedMultiplier: 1.8,
        translateDistance: 24,
        panelGlow: 1.18,
        panelSweepDuration: 1040,
        panelPulseDuration: 900,
        previewSweepDuration: 620,
        previewPulseScale: 1.095,
        accentOpacity: 1,
        effectStrength: 1.52,
        sheenCount: 2,
        particleDensity: 2.52,
        particleEnabled: true,
        outlineBoost: 1.48,
        sheenStyle: "single",
        features: {
            border: true,
            pulse: true,
            dualSweep: false,
            particles: true,
            accentBurst: true,
        },
        particleCaps: {
            perCard: 430,
            perOverlay: 540,
            onboardingPanel: 660,
            globalTotal: 1640,
        },
    },
};

export function resolveMotionTierProfile(tier: MotionTier, maximalFx: boolean): MotionTierProfile {
    const base = BASE_TIER_PROFILES[tier] ?? BASE_TIER_PROFILES.medium;
    if (maximalFx) {
        return base;
    }

    const reducedCaps = {
        perCard: Math.round(base.particleCaps.perCard * 0.72),
        perOverlay: Math.round(base.particleCaps.perOverlay * 0.72),
        onboardingPanel: Math.round(base.particleCaps.onboardingPanel * 0.72),
        globalTotal: Math.round(base.particleCaps.globalTotal * 0.72),
    };

    return {
        ...base,
        speedMultiplier: clamp(base.speedMultiplier * 0.82, 0.6, 1.6),
        translateDistance: Math.max(4, Math.round(base.translateDistance * 0.8)),
        panelGlow: base.panelGlow * 0.74,
        panelSweepDuration: Math.round(base.panelSweepDuration * 1.18),
        panelPulseDuration: Math.round(base.panelPulseDuration * 1.14),
        previewSweepDuration: Math.round(base.previewSweepDuration * 1.16),
        previewPulseScale: 1 + (base.previewPulseScale - 1) * 0.72,
        accentOpacity: base.accentOpacity * 0.72,
        effectStrength: base.effectStrength * 0.78,
        particleDensity: base.particleDensity * 0.62,
        outlineBoost: base.outlineBoost * 0.7,
        particleCaps: reducedCaps,
    };
}

export const FX_VISUAL_PROFILES: Record<FxToken, FxVisualProfile> = {
    shiny: {
        token: "shiny",
        description: "Clean specular shimmer with restrained premium spark accents.",
        motionMode: "sheen",
        colors: { primary: "#10182c", secondary: "#1f2f52", accent: "#ffd282", rim: "#ffd57e", sheen: "#ffeab5" },
        cardFx: { baseBoost: 1.3, accentBoost: 1.18, particleBoost: 1.42, heroBaseBoost: 1.42, heroAccentBoost: 1.28, heroParticleBoost: 1.56 },
        three: {
            mode: "shiny",
            minTierByScope: CARD_THREE_SCOPE,
            supportsBloom: true,
            qualityCost: 1,
            calmCardMotion: true,
            heroScopes: ["overlay", "lab", "onboarding"],
            surfacePresets: buildThreeSurfacePresets({
                list: { geometryDensity: 1, overflowX: 1.08, overflowY: 1.08, motionScale: 0.76, emissionStrength: 1.08, distortionStrength: 0.2, particleDensity: 0.28 },
                tile: { geometryDensity: 1.34, overflowX: 1.14, overflowY: 1.14, motionScale: 0.98, emissionStrength: 1.38, distortionStrength: 0.32, particleDensity: 0.48 },
                overlay: { geometryDensity: 1.48, overflowX: 1.16, overflowY: 1.16, motionScale: 1.18, emissionStrength: 1.54, distortionStrength: 0.42, particleDensity: 0.58 },
                lab: { geometryDensity: 1.56, overflowX: 1.18, overflowY: 1.18, motionScale: 1.24, emissionStrength: 1.62, distortionStrength: 0.48, particleDensity: 0.64 },
                onboarding: { geometryDensity: 1.52, overflowX: 1.16, overflowY: 1.16, motionScale: 1.22, emissionStrength: 1.58, distortionStrength: 0.44, particleDensity: 0.6 },
            }),
        },
        particle: particlePreset({
            spawnRate: 34,
            maxParticles: 188,
            colors: ["#fff0b3", "#ffe59a", "#fffdf2"],
            shape: "spark",
            zone: "full",
            lifeMs: [380, 900],
            size: [1.4, 3.8],
            speedX: [-12, 12],
            speedY: [-16, -2],
            alpha: [0.42, 0.94],
            pattern: "drift",
        }),
    },
    radiant: {
        token: "radiant",
        description: "Bright energetic glow with light sweeps.",
        motionMode: "pulse",
        colors: { primary: "#1d1c18", secondary: "#3a3628", accent: "#ffcf3a", rim: "#ffec8b", sheen: "#ffdf70" },
        cardFx: { baseBoost: 1.46, accentBoost: 1.72, particleBoost: 2.24, heroBaseBoost: 1.64, heroAccentBoost: 2.02, heroParticleBoost: 2.58 },
        three: {
            mode: "radiant",
            minTierByScope: CARD_THREE_SCOPE,
            supportsBloom: true,
            qualityCost: 2,
            calmCardMotion: true,
            heroScopes: ["overlay", "lab", "onboarding"],
            surfacePresets: buildThreeSurfacePresets({
                list: { geometryDensity: 1.04, overflowX: 1.1, overflowY: 1.1, motionScale: 0.82, emissionStrength: 1.16, distortionStrength: 0.24, particleDensity: 0.34 },
                tile: { geometryDensity: 1.3, overflowX: 1.16, overflowY: 1.16, motionScale: 1.02, emissionStrength: 1.42, distortionStrength: 0.34, particleDensity: 0.56 },
                overlay: { geometryDensity: 1.5, overflowX: 1.2, overflowY: 1.2, motionScale: 1.22, emissionStrength: 1.72, distortionStrength: 0.44, particleDensity: 0.68 },
                lab: { geometryDensity: 1.58, overflowX: 1.22, overflowY: 1.22, motionScale: 1.3, emissionStrength: 1.84, distortionStrength: 0.5, particleDensity: 0.78 },
                onboarding: { geometryDensity: 1.54, overflowX: 1.2, overflowY: 1.2, motionScale: 1.26, emissionStrength: 1.78, distortionStrength: 0.46, particleDensity: 0.72 },
            }),
        },
        particle: particlePreset({
            spawnRate: 64,
            maxParticles: 400,
            colors: ["#ffdf70", "#ffec8b", "#ffd54f"],
            shape: "spark",
            zone: "full",
            lifeMs: [560, 1260],
            size: [1.8, 4.8],
            speedX: [-14, 14],
            speedY: [-16, -2],
            alpha: [0.42, 0.94],
            pattern: "drift",
        }),
    },
    frozen: {
        token: "frozen",
        description: "Icy rim, crystal flakes and sharp cool glints.",
        motionMode: "freeze",
        colors: { primary: "#0c1730", secondary: "#1e365e", accent: "#7cc8ff", rim: "#9bd6ff", sheen: "#b3eaff" },
        cardFx: { baseBoost: 1.4, accentBoost: 1.62, particleBoost: 2.1, heroBaseBoost: 1.54, heroAccentBoost: 1.86, heroParticleBoost: 2.38 },
        three: {
            mode: "frozen",
            minTierByScope: CARD_THREE_SCOPE,
            supportsBloom: false,
            qualityCost: 1,
            calmCardMotion: true,
            heroScopes: ["overlay", "lab", "onboarding"],
            surfacePresets: buildThreeSurfacePresets({
                list: { geometryDensity: 0.98, overflowX: 1.1, overflowY: 1.1, motionScale: 0.62, emissionStrength: 1.04, distortionStrength: 0.42, particleDensity: 0.38 },
                tile: { geometryDensity: 1.28, overflowX: 1.14, overflowY: 1.14, motionScale: 0.82, emissionStrength: 1.32, distortionStrength: 0.68, particleDensity: 0.58 },
                overlay: { geometryDensity: 1.48, overflowX: 1.18, overflowY: 1.18, motionScale: 1.1, emissionStrength: 1.5, distortionStrength: 0.86, particleDensity: 0.72 },
                lab: { geometryDensity: 1.56, overflowX: 1.2, overflowY: 1.2, motionScale: 1.16, emissionStrength: 1.6, distortionStrength: 0.94, particleDensity: 0.82 },
                onboarding: { geometryDensity: 1.52, overflowX: 1.2, overflowY: 1.2, motionScale: 1.14, emissionStrength: 1.56, distortionStrength: 0.9, particleDensity: 0.78 },
            }),
        },
        particle: particlePreset({
            spawnRate: 62,
            maxParticles: 420,
            colors: ["#d7f3ff", "#9bd8ff", "#70bfff"],
            shape: "flake",
            zone: "full",
            lifeMs: [1020, 2240],
            size: [2, 5.6],
            speedX: [-14, 14],
            speedY: [-22, -4],
            drift: 28,
            alpha: [0.34, 0.92],
            pattern: "drift",
        }),
    },
    singularity: {
        token: "singularity",
        description: "Implosion to center followed by supernova-like blast.",
        motionMode: "singularity",
        colors: { primary: "#0b0818", secondary: "#1b1035", accent: "#8a2be2", rim: "#ff0058", sheen: "#d8b5ff" },
        cardFx: { baseBoost: 1.54, accentBoost: 1.94, particleBoost: 2.46, heroBaseBoost: 1.74, heroAccentBoost: 2.22, heroParticleBoost: 2.82 },
        three: {
            mode: "singularity",
            minTierByScope: CARD_THREE_SCOPE,
            supportsBloom: true,
            qualityCost: 2,
            calmCardMotion: true,
            heroScopes: ["overlay", "lab", "onboarding"],
            surfacePresets: buildThreeSurfacePresets({
                list: { geometryDensity: 0.98, overflowX: 1.34, overflowY: 1.34, motionScale: 0.72, emissionStrength: 1.1, distortionStrength: 0.78, particleDensity: 0.58 },
                tile: { geometryDensity: 1.34, overflowX: 1.54, overflowY: 1.54, motionScale: 1.02, emissionStrength: 1.42, distortionStrength: 1.26, particleDensity: 0.84 },
                overlay: { geometryDensity: 1.58, overflowX: 1.6, overflowY: 1.6, motionScale: 1.28, emissionStrength: 1.64, distortionStrength: 1.44, particleDensity: 1.04 },
                lab: { geometryDensity: 1.68, overflowX: 1.66, overflowY: 1.66, motionScale: 1.38, emissionStrength: 1.74, distortionStrength: 1.54, particleDensity: 1.16 },
                onboarding: { geometryDensity: 1.62, overflowX: 1.64, overflowY: 1.64, motionScale: 1.34, emissionStrength: 1.68, distortionStrength: 1.48, particleDensity: 1.08 },
            }),
        },
        particle: particlePreset({
            spawnRate: 84,
            maxParticles: 620,
            colors: ["#8a2be2", "#ff0058", "#d8b5ff"],
            shape: "dot",
            zone: "full",
            lifeMs: [560, 1960],
            size: [2.2, 6.8],
            speedX: [-58, 58],
            speedY: [-58, 58],
            alpha: [0.42, 0.96],
            pattern: "implosion",
            centerPull: 1.55,
            burstWindowMs: [280, 560],
            settleMs: [780, 1360],
        }),
    },
    vampiric: {
        token: "vampiric",
        description: "Erratic blood-red swarm with flicker and upward drain.",
        motionMode: "vampiric",
        colors: { primary: "#15080a", secondary: "#2c0f14", accent: "#b4002a", rim: "#ff335f", sheen: "#ff7096" },
        particle: particlePreset({
            spawnRate: 24,
            maxParticles: 200,
            colors: ["#8b0000", "#ff0000", "#4a0000"],
            shape: "spark",
            zone: "bottom",
            lifeMs: [520, 1900],
            size: [1.6, 4.6],
            speedX: [-28, 28],
            speedY: [-64, -12],
            drift: 34,
            pattern: "swarm",
            burstWindowMs: [220, 420],
        }),
    },
    cyberpunk: {
        token: "cyberpunk",
        description: "Neon grid bursts and stepped glitch scans.",
        motionMode: "cyberpunk",
        colors: { primary: "#0e1122", secondary: "#1c2040", accent: "#00ffff", rim: "#ff003c", sheen: "#f8e000" },
        cardFx: { baseBoost: 1.5, accentBoost: 1.94, particleBoost: 2.38, heroBaseBoost: 1.66, heroAccentBoost: 2.18, heroParticleBoost: 2.7 },
        three: {
            mode: "cyberpunk",
            minTierByScope: CARD_THREE_SCOPE,
            supportsBloom: true,
            qualityCost: 2,
            calmCardMotion: true,
            heroScopes: ["overlay", "lab", "onboarding"],
            surfacePresets: buildThreeSurfacePresets({
                list: { geometryDensity: 1.02, overflowX: 1.08, overflowY: 1.1, motionScale: 0.78, emissionStrength: 1.12, distortionStrength: 0.42, particleDensity: 0.4 },
                tile: { geometryDensity: 1.34, overflowX: 1.14, overflowY: 1.16, motionScale: 1.04, emissionStrength: 1.42, distortionStrength: 0.76, particleDensity: 0.62 },
                overlay: { geometryDensity: 1.54, overflowX: 1.18, overflowY: 1.2, motionScale: 1.24, emissionStrength: 1.62, distortionStrength: 0.96, particleDensity: 0.76 },
                lab: { geometryDensity: 1.62, overflowX: 1.2, overflowY: 1.22, motionScale: 1.34, emissionStrength: 1.72, distortionStrength: 1.06, particleDensity: 0.86 },
                onboarding: { geometryDensity: 1.58, overflowX: 1.18, overflowY: 1.2, motionScale: 1.28, emissionStrength: 1.66, distortionStrength: 1, particleDensity: 0.8 },
            }),
        },
        particle: particlePreset({
            spawnRate: 78,
            maxParticles: 500,
            colors: ["#fcee0a", "#ff003c", "#00ffff"],
            shape: "square",
            zone: "full",
            lifeMs: [280, 940],
            size: [2.2, 7.2],
            speedX: [-56, 56],
            speedY: [-40, 40],
            alpha: [0.36, 0.9],
            pattern: "burst-grid",
            burstWindowMs: [180, 360],
            settleMs: [320, 720],
        }),
    },
    inferno: {
        token: "inferno",
        description: "Aggressive heat warp with hot flame sparks.",
        motionMode: "flame",
        colors: { primary: "#2a0d0b", secondary: "#4a1b12", accent: "#ff6b1d", rim: "#ff9e45", sheen: "#ffaf5f" },
        cardFx: { baseBoost: 1.58, accentBoost: 2.04, particleBoost: 2.56, heroBaseBoost: 1.76, heroAccentBoost: 2.3, heroParticleBoost: 2.9 },
        three: {
            mode: "inferno",
            minTierByScope: CARD_THREE_SCOPE,
            supportsBloom: true,
            qualityCost: 2,
            calmCardMotion: true,
            heroScopes: ["overlay", "lab", "onboarding"],
            surfacePresets: buildThreeSurfacePresets({
                list: { geometryDensity: 1.02, overflowX: 1.18, overflowY: 1.22, motionScale: 0.76, emissionStrength: 1.14, distortionStrength: 0.56, particleDensity: 0.44 },
                tile: { geometryDensity: 1.4, overflowX: 1.24, overflowY: 1.3, motionScale: 1.06, emissionStrength: 1.5, distortionStrength: 0.9, particleDensity: 0.74 },
                overlay: { geometryDensity: 1.6, overflowX: 1.3, overflowY: 1.36, motionScale: 1.28, emissionStrength: 1.74, distortionStrength: 1.16, particleDensity: 0.92 },
                lab: { geometryDensity: 1.7, overflowX: 1.34, overflowY: 1.4, motionScale: 1.38, emissionStrength: 1.84, distortionStrength: 1.24, particleDensity: 1.04 },
                onboarding: { geometryDensity: 1.64, overflowX: 1.32, overflowY: 1.38, motionScale: 1.34, emissionStrength: 1.78, distortionStrength: 1.2, particleDensity: 0.98 },
            }),
        },
        particle: particlePreset({
            spawnRate: 92,
            maxParticles: 620,
            colors: ["#ff5a1f", "#ffbe3d", "#ff892f"],
            shape: "spark",
            zone: "full",
            lifeMs: [420, 1280],
            size: [2.2, 6],
            speedX: [-36, 36],
            speedY: [-84, -22],
            drift: 22,
            alpha: [0.44, 0.96],
            pattern: "swarm",
        }),
    },
    ember: {
        token: "ember",
        description: "Warm ember bloom with intermittent flickers.",
        motionMode: "flame",
        colors: { primary: "#25130c", secondary: "#412117", accent: "#ff8d41", rim: "#ffad63", sheen: "#ffb470" },
        particle: particlePreset({
            spawnRate: 18,
            maxParticles: 140,
            colors: ["#ff8a3a", "#ffd08c", "#ff6d3d"],
            shape: "dot",
            zone: "bottom",
            lifeMs: [560, 1300],
            speedX: [-12, 12],
            speedY: [-36, -10],
            pattern: "drift",
        }),
    },
    frost: {
        token: "frost",
        description: "Matte cold fog with tiny crystal specks.",
        motionMode: "freeze",
        colors: { primary: "#0f1f33", secondary: "#223955", accent: "#a8deff", rim: "#d2efff", sheen: "#b0e0ff" },
        particle: particlePreset({
            spawnRate: 16,
            maxParticles: 130,
            colors: ["#d5ecff", "#9ad0ff", "#c2eaff"],
            shape: "dot",
            zone: "full",
            lifeMs: [900, 1900],
            speedX: [-8, 8],
            speedY: [-12, -3],
            drift: 16,
            pattern: "drift",
        }),
    },
    holo: {
        token: "holo",
        description: "Iridescent chroma drift with spectral wobble.",
        motionMode: "aurora",
        colors: { primary: "#161a35", secondary: "#2b2e55", accent: "#7af5ff", rim: "#cf9cff", sheen: "#a3cfff" },
        particle: particlePreset({
            spawnRate: 18,
            maxParticles: 140,
            colors: ["#7af8ff", "#d4a5ff", "#6cc0ff"],
            shape: "diamond",
            zone: "full",
            lifeMs: [700, 1500],
            speedX: [-18, 18],
            speedY: [-10, 10],
            drift: 26,
            pattern: "orbital",
        }),
    },
    neon: {
        token: "neon",
        description: "Cyber edge scan with hard pulse peaks.",
        motionMode: "pulse",
        colors: { primary: "#0b1020", secondary: "#13253a", accent: "#2efcff", rim: "#ff5ac8", sheen: "#3af2ff" },
        particle: particlePreset({
            spawnRate: 20,
            maxParticles: 156,
            colors: ["#2df7ff", "#ff4fd8", "#9e7dff"],
            shape: "line",
            zone: "edge",
            lifeMs: [500, 980],
            size: [1.8, 4.2],
            speedX: [-24, 24],
            speedY: [-20, -4],
            pattern: "burst-grid",
        }),
    },
    prism: {
        token: "prism",
        description: "Angular rainbow refractions across the panel.",
        motionMode: "sheen",
        colors: { primary: "#121632", secondary: "#27345e", accent: "#ff7adc", rim: "#7ac4ff", sheen: "#ffb4ea" },
        particle: particlePreset({
            spawnRate: 18,
            maxParticles: 140,
            colors: ["#ff7fcd", "#7ad0ff", "#ffe27a"],
            shape: "diamond",
            zone: "full",
            lifeMs: [700, 1300],
            speedX: [-22, 22],
            speedY: [-16, -2],
            pattern: "orbital",
        }),
    },
    glitch: {
        token: "glitch",
        description: "Sparse RGB split bursts with quiet pauses.",
        motionMode: "glitch",
        colors: { primary: "#101118", secondary: "#20253a", accent: "#f84ca8", rim: "#6fd6ff", sheen: "#f06db5" },
        particle: particlePreset({
            spawnRate: 16,
            maxParticles: 130,
            colors: ["#ff4aa8", "#65e6ff", "#9c7bff"],
            shape: "square",
            zone: "full",
            lifeMs: [260, 520],
            speedX: [-46, 46],
            speedY: [-20, 20],
            drift: 32,
            pattern: "burst-grid",
            burstWindowMs: [160, 340],
            settleMs: [460, 920],
        }),
    },
    aurora: {
        token: "aurora",
        description: "Wide polar-light flow with slow roll.",
        motionMode: "aurora",
        colors: { primary: "#0b1b26", secondary: "#163743", accent: "#40ffbb", rim: "#71ffd0", sheen: "#64f5c0" },
        particle: particlePreset({
            spawnRate: 16,
            maxParticles: 140,
            colors: ["#49ffbf", "#7be8ff", "#a5ffe7"],
            shape: "dot",
            zone: "top",
            lifeMs: [820, 1700],
            speedX: [-14, 14],
            speedY: [2, 18],
            drift: 24,
            pattern: "orbital",
        }),
    },
    plasma: {
        token: "plasma",
        description: "Energetic ion arcs and electric cores.",
        motionMode: "plasma",
        colors: { primary: "#1b102f", secondary: "#2f1f57", accent: "#39f0ff", rim: "#9d7cff", sheen: "#6ce4ff" },
        particle: particlePreset({
            spawnRate: 28,
            maxParticles: 228,
            colors: ["#34eeff", "#9a78ff", "#f95eff"],
            shape: "spark",
            zone: "full",
            lifeMs: [320, 760],
            speedX: [-34, 34],
            speedY: [-28, 28],
            pattern: "burst-grid",
        }),
    },
    toxic: {
        token: "toxic",
        description: "Acid haze pulses with bubbling motes.",
        motionMode: "mist",
        colors: { primary: "#12240f", secondary: "#28451d", accent: "#95ff37", rim: "#c6ff69", sheen: "#adff4f" },
        particle: particlePreset({
            spawnRate: 24,
            maxParticles: 196,
            colors: ["#bbff5b", "#8dff2e", "#f4ff95"],
            shape: "dot",
            zone: "full",
            lifeMs: [760, 1500],
            speedX: [-8, 8],
            speedY: [-18, -3],
            drift: 22,
            pattern: "drift",
        }),
    },
    cosmic: {
        token: "cosmic",
        description: "Deep-space orbital dust with parallax drift.",
        motionMode: "cosmic",
        colors: { primary: "#0c0f27", secondary: "#1b2142", accent: "#7b8dff", rim: "#b8c7ff", sheen: "#95a5ff" },
        particle: particlePreset({
            spawnRate: 20,
            maxParticles: 160,
            colors: ["#95a6ff", "#d7deff", "#7ed4ff"],
            shape: "dot",
            zone: "center",
            lifeMs: [1200, 2800],
            size: [1.2, 2.8],
            speedX: [-6, 6],
            speedY: [-6, 6],
            drift: 14,
            pattern: "orbital",
        }),
    },
    vapor: {
        token: "vapor",
        description: "Dense chroma fog waves with soft blur.",
        motionMode: "mist",
        colors: { primary: "#251833", secondary: "#3a2652", accent: "#ff81d8", rim: "#9fa2ff", sheen: "#ff91e4" },
        particle: particlePreset({
            spawnRate: 16,
            maxParticles: 140,
            colors: ["#ff8cde", "#b38fff", "#ffe2f9"],
            shape: "dot",
            zone: "full",
            lifeMs: [1000, 2100],
            size: [2.2, 5.6],
            speedX: [-7, 7],
            speedY: [-8, 8],
            drift: 20,
            pattern: "drift",
        }),
    },
    storm: {
        token: "storm",
        description: "Rain streaks with occasional lightning snaps.",
        motionMode: "storm",
        colors: { primary: "#0d1627", secondary: "#1f2f49", accent: "#9ad7ff", rim: "#c7ecff", sheen: "#8dc6ff" },
        particle: particlePreset({
            spawnRate: 26,
            maxParticles: 200,
            colors: ["#8ed0ff", "#d4f1ff", "#76b9ff"],
            shape: "line",
            zone: "top",
            lifeMs: [420, 940],
            size: [2.2, 7.4],
            speedX: [-6, 6],
            speedY: [28, 70],
            drift: 10,
            pattern: "rain",
        }),
    },
    matrix: {
        token: "matrix",
        description: "Falling glyph rain and green scan pulse.",
        motionMode: "matrix",
        colors: { primary: "#08180d", secondary: "#0f2b17", accent: "#45ff70", rim: "#8dff9f", sheen: "#65ff89" },
        particle: particlePreset({
            spawnRate: 22,
            maxParticles: 160,
            colors: ["#52ff72", "#8dff9e", "#bbffbf"],
            shape: "glyph",
            zone: "top",
            lifeMs: [540, 1300],
            speedX: [-3, 3],
            speedY: [28, 62],
            drift: 4,
            pattern: "matrix-fall",
        }),
    },
    ghost: {
        token: "ghost",
        description: "Transparent trails and whisper-like glows.",
        motionMode: "mist",
        colors: { primary: "#1a1d2c", secondary: "#2a3044", accent: "#d0d9ff", rim: "#edf1ff", sheen: "#bac5ff" },
        particle: particlePreset({
            spawnRate: 14,
            maxParticles: 110,
            colors: ["#edf1ff", "#bac5ff", "#94a8ff"],
            shape: "dot",
            zone: "center",
            lifeMs: [1000, 2200],
            size: [1.6, 4.6],
            speedX: [-5, 5],
            speedY: [-5, 5],
            drift: 28,
            pattern: "drift",
        }),
    },
    crystal: {
        token: "crystal",
        description: "Facet glints and angular crystal sparkles.",
        motionMode: "sheen",
        colors: { primary: "#132139", secondary: "#224b67", accent: "#78e3ff", rim: "#abf0ff", sheen: "#8fdcff" },
        particle: particlePreset({
            spawnRate: 20,
            maxParticles: 160,
            colors: ["#84e8ff", "#e1fcff", "#9ecfff"],
            shape: "diamond",
            zone: "edge",
            lifeMs: [560, 1200],
            speedX: [-16, 16],
            speedY: [-18, 6],
            pattern: "orbital",
        }),
    },
    chrome: {
        token: "chrome",
        description: "Metallic sweeps and hard specular flashes.",
        motionMode: "pulse",
        colors: { primary: "#1b1f2a", secondary: "#2d3444", accent: "#b7c6dc", rim: "#e8f1ff", sheen: "#9cb1cc" },
        particle: particlePreset({
            spawnRate: 22,
            maxParticles: 172,
            colors: ["#f8fbff", "#cad8eb", "#98a9bf"],
            shape: "line",
            zone: "full",
            lifeMs: [320, 860],
            speedX: [-18, 18],
            speedY: [-10, 10],
            pattern: "drift",
        }),
    },
    noir: {
        token: "noir",
        description: "Monochrome grain and subtle wipe lighting.",
        motionMode: "pulse",
        colors: { primary: "#111217", secondary: "#21242e", accent: "#a8adbb", rim: "#d5d9e5", sheen: "#858c9b" },
        particle: particlePreset({
            spawnRate: 12,
            maxParticles: 100,
            colors: ["#d7dae4", "#969cab", "#f2f4fa"],
            shape: "square",
            zone: "full",
            lifeMs: [700, 1800],
            size: [1.1, 2.2],
            speedX: [-5, 5],
            speedY: [-5, 5],
            drift: 12,
            pattern: "drift",
        }),
    },
    sunset: {
        token: "sunset",
        description: "Warm horizon gradient with flare specks.",
        motionMode: "aurora",
        colors: { primary: "#2a1530", secondary: "#52304d", accent: "#ff8f5f", rim: "#ffd083", sheen: "#ffbc7a" },
        particle: particlePreset({
            spawnRate: 18,
            maxParticles: 140,
            colors: ["#ff9f72", "#ffdc98", "#ff77b0"],
            shape: "dot",
            zone: "edge",
            lifeMs: [620, 1400],
            speedX: [-14, 14],
            speedY: [-14, 8],
            drift: 16,
            pattern: "drift",
        }),
    },
    void: {
        token: "void",
        description: "Dark vignette with sparse distant stars.",
        motionMode: "mist",
        colors: { primary: "#070811", secondary: "#121528", accent: "#7b88c9", rim: "#a6b4ed", sheen: "#5f6ca8" },
        particle: particlePreset({
            spawnRate: 10,
            maxParticles: 80,
            colors: ["#98a8e8", "#dbe4ff", "#6a7fd6"],
            shape: "dot",
            zone: "center",
            lifeMs: [1300, 2800],
            size: [1.1, 2.4],
            speedX: [-2, 2],
            speedY: [-2, 2],
            drift: 8,
            pattern: "orbital",
        }),
    },
    candy: {
        token: "candy",
        description: "Playful pastel sparks with bounce sweeps.",
        motionMode: "pulse",
        colors: { primary: "#2c1635", secondary: "#4a2359", accent: "#ff8cc7", rim: "#ffb3e0", sheen: "#ff6cba" },
        particle: particlePreset({
            spawnRate: 24,
            maxParticles: 180,
            colors: ["#ff94ce", "#94d8ff", "#ffe49a"],
            shape: "spark",
            zone: "full",
            lifeMs: [500, 1020],
            speedX: [-24, 24],
            speedY: [-24, 10],
            drift: 22,
            pattern: "burst-grid",
        }),
    },
    velvet: {
        token: "velvet",
        description: "Luxury dark shimmer with subtle slow drift.",
        motionMode: "mist",
        colors: { primary: "#1f1024", secondary: "#321a39", accent: "#c57eff", rim: "#e0b6ff", sheen: "#9a4edd" },
        particle: particlePreset({
            spawnRate: 12,
            maxParticles: 100,
            colors: ["#d1a8ff", "#f2ddff", "#9a71cc"],
            shape: "dot",
            zone: "center",
            lifeMs: [1200, 2600],
            size: [1.4, 3],
            speedX: [-3, 3],
            speedY: [-3, 3],
            drift: 10,
            pattern: "drift",
        }),
    },
};

export const LEGACY_TOKEN_ALIASES: Record<string, FxToken> = {
    ice: "frozen",
    fire: "inferno",
    flame: "inferno",
    rainbow: "prism",
    cyber: "cyberpunk",
    cyberpunk: "cyberpunk",
    blackhole: "singularity",
    singularity: "singularity",
    swarm: "vampiric",
    bloodswarm: "vampiric",
    glitchy: "glitch",
    cold: "frost",
    hot: "inferno",
};

function chipProfile(variant: FxChipEffectVariant, intensity: number, particleCount: number, sheenDurationMs: number): FxChipEffectProfile {
    return {
        variant,
        intensity,
        particleCount,
        sheenDurationMs,
    };
}

export function resolveCardEffectProfile(profile: FxVisualProfile): FxCardEffectProfile {
    if (profile.cardFx) {
        return profile.cardFx;
    }

    switch (profile.token) {
        case "inferno":
        case "ember":
            return { baseBoost: 1.32, accentBoost: 1.56, particleBoost: 1.84, heroBaseBoost: 1.42, heroAccentBoost: 1.72, heroParticleBoost: 2.08 };
        case "cyberpunk":
        case "neon":
        case "holo":
            return { baseBoost: 1.24, accentBoost: 1.5, particleBoost: 1.76, heroBaseBoost: 1.34, heroAccentBoost: 1.66, heroParticleBoost: 2 };
        case "singularity":
        case "cosmic":
        case "void":
            return { baseBoost: 1.28, accentBoost: 1.54, particleBoost: 1.9, heroBaseBoost: 1.4, heroAccentBoost: 1.72, heroParticleBoost: 2.14 };
        case "frozen":
        case "frost":
        case "crystal":
            return { baseBoost: 1.24, accentBoost: 1.4, particleBoost: 1.68, heroBaseBoost: 1.34, heroAccentBoost: 1.54, heroParticleBoost: 1.9 };
        case "radiant":
        case "sunset":
        case "candy":
            return { baseBoost: 1.28, accentBoost: 1.48, particleBoost: 1.76, heroBaseBoost: 1.4, heroAccentBoost: 1.64, heroParticleBoost: 2 };
        case "shiny":
        case "chrome":
            return { baseBoost: 1.14, accentBoost: 1.18, particleBoost: 1.18, heroBaseBoost: 1.22, heroAccentBoost: 1.28, heroParticleBoost: 1.3 };
        case "glitch":
            return { baseBoost: 1.12, accentBoost: 1.4, particleBoost: 1.4, heroBaseBoost: 1.2, heroAccentBoost: 1.52, heroParticleBoost: 1.56 };
        case "matrix":
            return { baseBoost: 1.14, accentBoost: 1.28, particleBoost: 1.44, heroBaseBoost: 1.22, heroAccentBoost: 1.42, heroParticleBoost: 1.6 };
        case "storm":
            return { baseBoost: 1.16, accentBoost: 1.34, particleBoost: 1.5, heroBaseBoost: 1.24, heroAccentBoost: 1.48, heroParticleBoost: 1.68 };
        case "toxic":
            return { baseBoost: 1.16, accentBoost: 1.3, particleBoost: 1.48, heroBaseBoost: 1.22, heroAccentBoost: 1.42, heroParticleBoost: 1.62 };
        case "vampiric":
            return { baseBoost: 1.18, accentBoost: 1.38, particleBoost: 1.54, heroBaseBoost: 1.24, heroAccentBoost: 1.5, heroParticleBoost: 1.74 };
        default:
            return { baseBoost: 1.12, accentBoost: 1.22, particleBoost: 1.32, heroBaseBoost: 1.18, heroAccentBoost: 1.34, heroParticleBoost: 1.48 };
    }
}

export function resolveChipEffectProfile(profile: FxVisualProfile): FxChipEffectProfile {
    if (profile.chipFx) {
        return profile.chipFx;
    }

    switch (profile.token) {
        case "inferno":
        case "ember":
            return chipProfile("ember", 1, 3, 1460);
        case "frozen":
        case "frost":
        case "crystal":
            return chipProfile("frost", 0.98, 3, 1760);
        case "singularity":
        case "cosmic":
        case "void":
            return chipProfile("orbit", 1.02, 3, 1980);
        case "cyberpunk":
        case "neon":
        case "holo":
            return chipProfile("cyber", 1.04, 3, 1320);
        case "radiant":
        case "sunset":
        case "candy":
            return chipProfile("halo", 1, 3, 1620);
        case "shiny":
        case "chrome":
            return chipProfile("sheen", 0.84, 2, 1680);
        case "glitch":
            return chipProfile("glitch", 1, 3, 1180);
        case "prism":
        case "aurora":
        case "plasma":
            return chipProfile("prism", 1.04, 3, 1560);
        case "matrix":
            return chipProfile("matrix", 1, 3, 1240);
        case "storm":
            return chipProfile("storm", 0.96, 3, 1420);
        case "toxic":
            return chipProfile("toxic", 0.96, 3, 1500);
        case "vampiric":
            return chipProfile("vampiric", 1, 3, 1480);
        case "ghost":
        case "vapor":
        case "velvet":
        case "noir":
            return chipProfile("mist", 0.88, 2, 1760);
        default:
            return chipProfile("sheen", 0.8, 2, 1680);
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
