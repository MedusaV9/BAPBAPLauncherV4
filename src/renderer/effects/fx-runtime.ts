import { animate } from "animejs";
import type { JSAnimation } from "animejs";
import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { FX_VISUAL_PROFILES, resolveCardEffectProfile } from "./fx-profiles";
import { mountFxParticles } from "./fx-particles-canvas";
import { FxWebGLManager } from "./fx-three";
import {
    FX_TOKENS,
    type FxRuntimeMetrics,
    type FxRuntimeSurfaceQuality,
    type FxSurfaceScope,
    type FxThreeQuality,
    type FxThreeState,
    type FxToken,
    type FxVisualProfile,
    type MotionTier,
    type MotionTierProfile,
} from "./fx-types";

type FxSurfaceRuntimeOptions = {
    token: FxToken | null;
    motionEnabled: boolean;
    tierProfile: MotionTierProfile;
    scope: FxSurfaceScope;
    intensityScale?: number;
    onMetrics?: (metrics: FxRuntimeMetrics) => void;
};

type TokenChannelPolicy = {
    allowPulse: boolean;
    allowAccent: boolean;
    allowDualSweep: boolean;
    particleIntensityMultiplier: number;
    particleCapMultiplier: number;
};

type ScopeChannelPolicy = {
    allowPulse: boolean;
    allowAccent: boolean;
    allowModeVars: boolean;
    allowParticles: boolean;
    particleIntensityMultiplier: number;
    particleCapMultiplier: number;
};

const SCOPE_INTENSITY: Record<FxSurfaceScope, number> = {
    card: 1.58,
    overlay: 1.76,
    onboarding: 1.82,
    lab: 1.92,
};

function buildRuntimeMetrics(
    tier: MotionTier,
    scope: FxSurfaceScope,
    quality: FxRuntimeSurfaceQuality,
    values?: Partial<Pick<FxRuntimeMetrics, "particleCount" | "cappedSpawns" | "activeEmitters" | "threeActive" | "threeFallback" | "bloomActive">>
): FxRuntimeMetrics {
    return {
        particleCount: values?.particleCount ?? 0,
        cappedSpawns: values?.cappedSpawns ?? 0,
        activeEmitters: values?.activeEmitters ?? 0,
        tier,
        threeActive: values?.threeActive ?? false,
        threeFallback: values?.threeFallback ?? false,
        bloomActive: values?.bloomActive ?? false,
        scope,
        quality,
    };
}

export function useFxSurfaceRuntime(
    ref: RefObject<HTMLElement | null>,
    options: FxSurfaceRuntimeOptions
): void {
    const metricsDebounceRef = useRef<number>(0);
    const metricsCallbackRef = useRef<FxSurfaceRuntimeOptions["onMetrics"]>(options.onMetrics);

    useEffect(() => {
        metricsCallbackRef.current = options.onMetrics;
    }, [options.onMetrics]);

    useEffect(() => {
        const host = ref.current;
        if (!host) {
            return;
        }
        const emitMetrics = (metrics: FxRuntimeMetrics): void => {
            host.dataset.fxMetricTier = metrics.tier;
            host.dataset.fxMetricQuality = metrics.quality;
            host.dataset.fxMetricParticles = String(metrics.particleCount);
            host.dataset.fxMetricEmitters = String(metrics.activeEmitters);
            host.dataset.fxMetricThree = metrics.threeActive ? "1" : "0";
            host.dataset.fxMetricBloom = metrics.bloomActive ? "1" : "0";
            metricsCallbackRef.current?.(metrics);
        };

        host.classList.add("fx-surface");
        for (const token of FX_TOKENS) {
            host.classList.remove(`fx-token-${token}`);
        }

        if (!options.token) {
            clearFxVars(host);
            emitMetrics(buildRuntimeMetrics(options.tierProfile.tier, options.scope, "none"));
            return;
        }

        const profile = FX_VISUAL_PROFILES[options.token];
        const cardEffectProfile = resolveCardEffectProfile(profile);
        const channelPolicy = resolveTokenChannelPolicy(options.token, profile.motionMode, options.tierProfile.tier);
        const isPackageCardSurface = options.scope === "card" && host.classList.contains("package-card-wrap");
        const scopePolicy = resolveScopeChannelPolicy(options.scope, isPackageCardSurface);
        const intensityScale = clampNumber(options.intensityScale ?? 1, 0.35, 1.95);
        const baseBoost = options.scope === "card" ? cardEffectProfile.baseBoost : cardEffectProfile.heroBaseBoost;
        const accentBoost = options.scope === "card" ? cardEffectProfile.accentBoost : cardEffectProfile.heroAccentBoost;
        const particleBoost = options.scope === "card" ? cardEffectProfile.particleBoost : cardEffectProfile.heroParticleBoost;
        const scaledStrength = options.tierProfile.effectStrength * intensityScale * baseBoost;
        const scaledOutline = options.tierProfile.outlineBoost * intensityScale * ((baseBoost + accentBoost) / 2);
        const baseOpacity = clampNumber(0.62 + scaledStrength * 0.14, 0.58, options.scope === "card" ? 0.96 : 0.98);
        const accentOpacity = clampNumber((0.28 + scaledStrength * 0.4) * accentBoost, 0.28, options.scope === "card" ? 0.98 : 1);
        host.classList.add(`fx-token-${options.token}`);
        host.dataset.fxMotionMode = profile.motionMode;
        host.dataset.fxSheenStyle = options.tierProfile.sheenStyle;
        host.style.setProperty("--fx-primary", profile.colors.primary);
        host.style.setProperty("--fx-secondary", profile.colors.secondary);
        host.style.setProperty("--fx-accent", profile.colors.accent);
        host.style.setProperty("--fx-rim", profile.colors.rim);
        host.style.setProperty("--fx-sheen-color", profile.colors.sheen);
        host.style.setProperty("--fx-strength", String(scaledStrength));
        host.style.setProperty("--fx-outline", String(scaledOutline));
        host.style.setProperty("--fx-base-opacity", String(baseOpacity));
        host.style.setProperty("--fx-accent-opacity", String(accentOpacity));
        host.style.setProperty("--fx-particle-boost", String(particleBoost));
        host.style.setProperty("--fx-border-opacity", options.tierProfile.features.border ? "1" : "0");
        host.style.setProperty(
            "--fx-pulse-enabled",
            options.tierProfile.features.pulse && channelPolicy.allowPulse && scopePolicy.allowPulse ? "1" : "0"
        );
        host.style.setProperty("--fx-dual-sweep", options.tierProfile.features.dualSweep && channelPolicy.allowDualSweep ? "1" : "0");
        host.style.setProperty(
            "--fx-burst-enabled",
            options.tierProfile.features.accentBurst && channelPolicy.allowAccent && scopePolicy.allowAccent ? "1" : "0"
        );

        const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        const runMotion = options.motionEnabled && !reduceMotion;
        const animations: JSAnimation[] = [];
        let particleHandle: { destroy: () => void } | null = null;
        const strength = scaledStrength * SCOPE_INTENSITY[options.scope];
        const accentLayer = host.querySelector<HTMLElement>(".fx-layer-accent");
        const listMode = host.closest(".versions-grid.is-list, .content-grid.is-list") !== null;
        const threeQuality = resolveThreeSurfaceQuality(options.scope, listMode);
        const wantsThree = runMotion && shouldEnableThreeEffect(profile, options.tierProfile.tier, options.scope);

        if (wantsThree) {
            const threeState = resolveThreeSurfaceState(options.tierProfile.tier, options.scope, listMode, strength, options.tierProfile.accentOpacity);
            host.dataset.fxThreeActive = "1";
            host.dataset.fxThreeToken = options.token;
            host.dataset.fxThreeQuality = threeQuality;
            host.dataset.fxThreeScope = options.scope;
            FxWebGLManager.registerSurface(host, options.token, threeState);
            FxWebGLManager.updateSurfaceState(host, threeState);
        } else {
            delete host.dataset.fxThreeActive;
            delete host.dataset.fxThreeToken;
            delete host.dataset.fxThreeQuality;
            delete host.dataset.fxThreeScope;
            FxWebGLManager.unregisterSurface(host);
        }

        const resolveThreeFlags = (): Pick<FxRuntimeMetrics, "threeActive" | "threeFallback" | "bloomActive"> => ({
            threeActive: host.dataset.fxThreeActive === "1",
            threeFallback: host.dataset.fxThreeFallback === "1",
            bloomActive: host.dataset.fxThreeBloom === "1",
        });
        const threeFlags = resolveThreeFlags();
        emitMetrics(
            buildRuntimeMetrics(options.tierProfile.tier, options.scope, threeQuality, {
                ...threeFlags,
            })
        );

        if (runMotion && channelPolicy.allowAccent && scopePolicy.allowAccent && accentLayer) {
            buildCustomTokenTimelines(
                host,
                accentLayer,
                profile,
                options.tierProfile,
                scopePolicy.allowModeVars,
                strength,
                animations,
                isPackageCardSurface
            );
        }

        if (
            runMotion &&
            scopePolicy.allowParticles &&
            options.tierProfile.features.particles &&
            options.tierProfile.particleEnabled &&
            channelPolicy.particleIntensityMultiplier > 0
        ) {
            const localCap = Math.max(
                0,
                Math.round(
                    resolveScopeCap(options.scope, options.tierProfile) *
                        channelPolicy.particleCapMultiplier *
                        scopePolicy.particleCapMultiplier *
                        particleBoost
                )
            );
            const globalCap = Math.max(
                0,
                Math.round(
                    options.tierProfile.particleCaps.globalTotal *
                        channelPolicy.particleCapMultiplier *
                        scopePolicy.particleCapMultiplier *
                        particleBoost
                )
            );
            if (localCap === 0 || globalCap === 0) {
                emitMetrics(
                    buildRuntimeMetrics(options.tierProfile.tier, options.scope, threeQuality, {
                        ...threeFlags,
                    })
                );
            } else {
                particleHandle = mountFxParticles(host, profile.particle, {
                    intensity: Math.max(
                        0,
                        options.tierProfile.particleDensity *
                            SCOPE_INTENSITY[options.scope] *
                            channelPolicy.particleIntensityMultiplier *
                            scopePolicy.particleIntensityMultiplier *
                            particleBoost *
                            intensityScale
                    ),
                    localMax: localCap,
                    globalMax: globalCap,
                    tier: options.tierProfile.tier,
                    onMetrics: metrics => {
                        const now = performance.now();
                        if (now - metricsDebounceRef.current > 180) {
                            emitMetrics(
                                buildRuntimeMetrics(options.tierProfile.tier, options.scope, threeQuality, {
                                    particleCount: metrics.particleCount,
                                    cappedSpawns: metrics.cappedSpawns,
                                    activeEmitters: metrics.activeEmitters,
                                    ...resolveThreeFlags(),
                                })
                            );
                            metricsDebounceRef.current = now;
                        }
                    },
                });
            }
        } else {
            emitMetrics(
                buildRuntimeMetrics(options.tierProfile.tier, options.scope, threeQuality, {
                    ...threeFlags,
                })
            );
        }

        return () => {
            animations.forEach(animation => animation.revert());
            particleHandle?.destroy();
            clearFxVars(host);
            FxWebGLManager.unregisterSurface(host);
        };
    }, [options.intensityScale, options.motionEnabled, options.scope, options.tierProfile, options.token, ref]);
}

function resolveScopeCap(scope: FxSurfaceScope, tierProfile: MotionTierProfile): number {
    if (scope === "overlay") {
        return tierProfile.particleCaps.perOverlay;
    }
    if (scope === "onboarding") {
        return tierProfile.particleCaps.onboardingPanel;
    }
    return tierProfile.particleCaps.perCard;
}

export function shouldEnableThreeEffect(profile: FxVisualProfile, tier: MotionTier, scope: FxSurfaceScope): boolean {
    const requiredTier = profile.three?.minTierByScope[scope];
    if (!requiredTier) {
        return false;
    }
    return getTierRank(tier) >= getTierRank(requiredTier);
}

export function resolveThreeSurfaceQuality(scope: FxSurfaceScope, listMode: boolean): FxThreeQuality {
    if (scope === "overlay") {
        return "overlay";
    }
    if (scope === "onboarding") {
        return "onboarding";
    }
    if (scope === "lab") {
        return "lab";
    }
    return listMode ? "list" : "tile";
}

function resolveThreeSurfaceState(
    tier: MotionTier,
    scope: FxSurfaceScope,
    listMode: boolean,
    intensity: number,
    accentLevel: number
): FxThreeState {
    return {
        intensity,
        accentLevel,
        tier,
        scope,
        quality: resolveThreeSurfaceQuality(scope, listMode),
        listMode,
    };
}

function getTierRank(tier: MotionTier): number {
    switch (tier) {
        case "showcase":
            return 4;
        case "high":
            return 3;
        case "medium":
            return 2;
        default:
            return 1;
    }
}



function buildCustomTokenTimelines(
    host: HTMLElement,
    accentLayer: HTMLElement,
    profile: FxVisualProfile,
    tier: MotionTierProfile,
    allowModeVars: boolean,
    strength: number,
    animations: JSAnimation[],
    denseCardGridSurface = false
): void {
    const duration = Math.max(520, Math.round(tier.previewSweepDuration * (denseCardGridSurface ? 1.4 : 1.08)));
    const pushAnimation = (target: HTMLElement, keyframes: Record<string, unknown>): void => {
        animations.push(
            animate(target, {
                ...keyframes,
                loop: true,
            })
        );
    };
    const pushHostVars = (vars: Record<string, unknown>, localDuration: number, ease: string): void => {
        if (!allowModeVars) {
            return;
        }
        pushAnimation(host, {
            ...vars,
            duration: localDuration,
            ease,
        });
    };

    if (denseCardGridSurface) {
        switch (profile.motionMode) {
            case "cyberpunk":
            case "glitch":
            case "matrix":
                pushAnimation(accentLayer, {
                    translateX: ["-3%", "3%", "-3%"],
                    opacity: [0.04, 0.11 + strength * 0.11, 0.04],
                    duration: Math.round(duration * 1.08),
                    ease: "inOutQuad",
                });
                return;
            case "singularity":
            case "vampiric":
            case "storm":
                pushAnimation(accentLayer, {
                    scale: [0.992, 1.016 + strength * 0.014, 0.992],
                    opacity: [0.04, 0.1 + strength * 0.12, 0.04],
                    duration: Math.round(duration * 1.18),
                    ease: "inOutSine",
                });
                return;
            default:
                pushAnimation(accentLayer, {
                    translateY: ["2%", "-2%", "2%"],
                    opacity: [0.04, 0.1 + strength * 0.11, 0.04],
                    duration: Math.round(duration * 1.16),
                    ease: "inOutQuad",
                });
                return;
        }
    }

    switch (profile.motionMode) {
        case "sheen":
            pushAnimation(accentLayer, {
                translateX: ["-120%", "135%"],
                opacity: [0, 0.18 + strength * 0.18, 0],
                duration: Math.round(duration * 1.18),
                ease: "inOutQuad",
            });
            break;
        case "pulse":
            pushAnimation(accentLayer, {
                scale: [0.985, 1.02 + strength * 0.03, 0.985],
                opacity: [0.08, 0.2 + strength * 0.28, 0.08],
                duration: Math.round(duration * 0.82),
                ease: "inOutQuad",
            });
            pushHostVars({ "--fx-pulse": [0.08, 0.42 * strength, 0.08] }, Math.round(duration * 0.82), "inOutQuad");
            break;
        case "freeze":
            pushAnimation(accentLayer, {
                translateX: ["-3%", "3%", "-3%"],
                rotate: ["-1deg", "1deg", "-1deg"],
                opacity: [0.08, 0.16 + strength * 0.18, 0.08],
                duration: Math.round(duration * 1.42),
                ease: "inOutQuad",
            });
            pushHostVars(
                {
                    "--fx-ice-shift": [0, 1, 0],
                    "--fx-frost-breath": [0.1, 0.28 + strength * 0.22, 0.1],
                },
                Math.round(duration * 1.42),
                "inOutQuad"
            );
            break;
        case "flame":
            pushAnimation(accentLayer, {
                translateY: ["8%", "-10%", "8%"],
                rotate: ["-2deg", "3deg", "-2deg"],
                opacity: [0.08, 0.22 + strength * 0.26, 0.08],
                duration: Math.round(duration * 0.72),
                ease: "outExpo",
            });
            pushHostVars(
                {
                    "--fx-warp": [0.06 * strength, 0.26 * strength, 0.08 * strength],
                    "--fx-flicker": [0.12, 0.52 + strength * 0.28, 0.16],
                },
                Math.round(duration * 0.72),
                "inOutQuad"
            );
            break;
        case "storm":
            pushAnimation(accentLayer, {
                translateX: ["-8%", "10%", "-8%"],
                translateY: ["-8%", "6%", "-8%"],
                opacity: [0, 0.18 + strength * 0.18, 0, 0.24 + strength * 0.26, 0],
                duration: Math.round(duration * 0.76),
                ease: "inOutQuad",
            });
            pushHostVars(
                {
                    "--fx-rain-shift": [0, 1],
                    "--fx-lightning": [0, 1, 0, 0, 1, 0, 0],
                },
                Math.round(duration * 0.76),
                "inOutQuad"
            );
            break;
        case "matrix":
            pushAnimation(accentLayer, {
                translateY: ["-16%", "12%", "-16%"],
                opacity: [0.08, 0.18 + strength * 0.18, 0.08],
                duration: Math.round(duration * 0.84),
                ease: "outCubic",
            });
            pushHostVars(
                {
                    "--fx-matrix-shift": [0, 1],
                    "--fx-matrix-pulse": [0.1, 0.26 + strength * 0.22, 0.1],
                },
                Math.round(duration * 0.84),
                "outCubic"
            );
            break;
        case "glitch":
            pushAnimation(accentLayer, {
                translateX: ["0%", "2%", "-1.5%", "0%"],
                opacity: [0, 0.22 + strength * 0.26, 0, 0.2 + strength * 0.22, 0],
                duration: Math.round(duration * 0.52),
                ease: "steps(7)",
            });
            pushHostVars({ "--fx-glitch": [0, 1, 0, 0, 1, 0, 0] }, Math.round(duration * 0.52), "steps(7)");
            break;
        case "aurora":
            pushAnimation(accentLayer, {
                translateX: ["-5%", "5%", "-5%"],
                scale: [1, 1.03 + strength * 0.03, 1],
                opacity: [0.08, 0.18 + strength * 0.16, 0.08],
                duration: Math.round(duration * 1.72),
                ease: "inOutSine",
            });
            pushHostVars(
                {
                    "--fx-aurora-shift": [0, 1],
                    "--fx-aurora-spin": [0, 1],
                },
                Math.round(duration * 1.72),
                "inOutQuad"
            );
            break;
        case "plasma":
            pushAnimation(accentLayer, {
                translateX: ["-6%", "6%", "-6%"],
                rotate: ["-2deg", "2deg", "-2deg"],
                opacity: [0.08, 0.24 + strength * 0.28, 0.08],
                duration: Math.round(duration * 0.7),
                ease: "outExpo",
            });
            pushHostVars(
                {
                    "--fx-plasma": [0.12, 0.34 + strength * 0.34, 0.14],
                    "--fx-plasma-spin": [0, 1],
                },
                Math.round(duration * 0.7),
                "outExpo"
            );
            break;
        case "mist":
            pushAnimation(accentLayer, {
                translateX: ["-9%", "9%", "-9%"],
                opacity: [0.06, 0.16 + strength * 0.18, 0.06],
                duration: Math.round(duration * 1.46),
                ease: "inOutSine",
            });
            pushHostVars(
                {
                    "--fx-mist-shift": [0, 1],
                    "--fx-mist-breath": [0.08, 0.22 + strength * 0.2, 0.08],
                },
                Math.round(duration * 1.46),
                "inOutQuad"
            );
            break;
        case "singularity":
            pushAnimation(accentLayer, {
                translateX: ["-4%", "0%", "4%", "0%"],
                scale: [1, 0.88, 1.08, 1],
                opacity: [0.04, 0.16 + strength * 0.24, 0.28 + strength * 0.24, 0.04],
                duration: Math.round(duration * 1.84),
                ease: "outExpo",
            });
            pushHostVars(
                {
                    "--fx-singularity-pull": [0, 1, 0],
                    "--fx-singularity-burst": [0, 0, 1, 0],
                },
                Math.round(duration * 1.84),
                "inOutQuad"
            );
            break;
        case "vampiric":
            pushAnimation(accentLayer, {
                translateX: ["8%", "-10%", "6%"],
                translateY: ["3%", "-4%", "2%"],
                rotate: ["-4deg", "4deg", "-3deg", "2deg", "-4deg"],
                opacity: [0.08, 0.22 + strength * 0.32, 0.14, 0.2 + strength * 0.28, 0.08],
                duration: Math.round(duration * 0.98),
                ease: "steps(6)",
            });
            pushHostVars({ "--fx-vamp-flutter": [0, 1, 0.2, 0.95, 0] }, Math.round(duration * 0.98), "steps(6)");
            break;
        case "cyberpunk":
            pushAnimation(accentLayer, {
                translateX: ["-10%", "12%", "-10%"],
                translateY: ["-6%", "4%", "-6%"],
                opacity: [0, 0.26 + strength * 0.32, 0.1, 0.24 + strength * 0.28, 0],
                duration: Math.round(duration * 0.72),
                ease: "steps(8)",
            });
            pushHostVars(
                {
                    "--fx-cyber-scan": [0, 1],
                    "--fx-cyber-flicker": [0, 1, 0.25, 1, 0],
                },
                Math.round(duration * 0.72),
                "steps(8)"
            );
            break;
        case "cosmic":
            pushAnimation(accentLayer, {
                translateX: ["-5%", "7%", "-5%"],
                translateY: ["-5%", "5%", "-5%"],
                opacity: [0.04, 0.14 + strength * 0.18, 0.04],
                duration: Math.round(duration * 1.58),
                ease: "inOutQuad",
            });
            pushHostVars(
                {
                    "--fx-cosmic-orbit": [0, 1],
                    "--fx-cosmic-breath": [0.1, 0.26 + strength * 0.26, 0.1],
                },
                Math.round(duration * 1.58),
                "inOutQuad"
            );
            break;
        default:
            pushAnimation(accentLayer, {
                opacity: [0.06, 0.18 + strength * 0.18, 0.06],
                duration,
                ease: "inOutQuad",
            });
            break;
    }
}


export function resolveTokenChannelPolicy(
    token: FxToken,
    mode: FxVisualProfile["motionMode"],
    tier: MotionTierProfile["tier"]
): TokenChannelPolicy {
    void mode;
    void tier;
    if (token !== "shiny") {
        return {
            allowPulse: true,
            allowAccent: true,
            allowDualSweep: false,
            particleIntensityMultiplier: 1,
            particleCapMultiplier: 1,
        };
    }

    return {
        allowPulse: false,
        allowAccent: true,
        allowDualSweep: false,
        particleIntensityMultiplier: 0.82,
        particleCapMultiplier: 0.74,
    };
}

function resolveScopeChannelPolicy(scope: FxSurfaceScope, isDenseCardGridSurface = false): ScopeChannelPolicy {
    if (scope === "card") {
        return {
            allowPulse: false,
            allowAccent: true,
            allowModeVars: !isDenseCardGridSurface,
            allowParticles: true,
            particleIntensityMultiplier: isDenseCardGridSurface ? 2.18 : 2.86,
            particleCapMultiplier: isDenseCardGridSurface ? 1.72 : 2.08,
        };
    }

    return {
        allowPulse: true,
        allowAccent: true,
        allowModeVars: true,
        allowParticles: true,
        particleIntensityMultiplier: 1,
        particleCapMultiplier: 1,
    };
}

function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(Math.max(value, min), max);
}

function clearFxVars(host: HTMLElement): void {
    host.style.removeProperty("--fx-primary");
    host.style.removeProperty("--fx-secondary");
    host.style.removeProperty("--fx-accent");
    host.style.removeProperty("--fx-rim");
    host.style.removeProperty("--fx-sheen-color");
    host.style.removeProperty("--fx-strength");
    host.style.removeProperty("--fx-outline");
    host.style.removeProperty("--fx-base-opacity");
    host.style.removeProperty("--fx-accent-opacity");
    host.style.removeProperty("--fx-particle-boost");
    host.style.removeProperty("--fx-border-opacity");
    host.style.removeProperty("--fx-pulse-enabled");
    host.style.removeProperty("--fx-dual-sweep");
    host.style.removeProperty("--fx-burst-enabled");
    delete host.dataset.fxMotionMode;
    delete host.dataset.fxSheenStyle;
    delete host.dataset.fxThreeActive;
    delete host.dataset.fxThreeToken;
    delete host.dataset.fxThreeFallback;
    delete host.dataset.fxThreeQuality;
    delete host.dataset.fxThreeScope;
    delete host.dataset.fxThreeBloom;
    delete host.dataset.fxMetricTier;
    delete host.dataset.fxMetricQuality;
    delete host.dataset.fxMetricParticles;
    delete host.dataset.fxMetricEmitters;
    delete host.dataset.fxMetricThree;
    delete host.dataset.fxMetricBloom;
    const accentLayer = host.querySelector<HTMLElement>(".fx-layer-accent");
    if (accentLayer) {
        accentLayer.style.opacity = "";
        accentLayer.style.transform = "";
    }
}
