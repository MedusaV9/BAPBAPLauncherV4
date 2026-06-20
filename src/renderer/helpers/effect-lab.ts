import type { FxRuntimeMetrics, FxRuntimeSurfaceQuality, FxSurfaceScope, MotionTier } from "../effects/fx-types";

export type EffectLabPreviewKey = "list" | "tile" | "hero";
export type EffectLabCardType = "version" | "package";
export type EffectLabPreviewConfig = {
    key: EffectLabPreviewKey;
    label: string;
    description: string;
    scope: FxSurfaceScope;
    expectedQuality: FxRuntimeSurfaceQuality;
    wrapperClassName: string;
    cardClassName: string;
};

export function createEmptyFxMetrics(tier: MotionTier, scope: FxSurfaceScope, quality: FxRuntimeSurfaceQuality): FxRuntimeMetrics {
    return {
        particleCount: 0,
        cappedSpawns: 0,
        activeEmitters: 0,
        tier,
        threeActive: false,
        threeFallback: false,
        bloomActive: false,
        scope,
        quality,
    };
}

export function describeThreeRuntime(metrics: FxRuntimeMetrics): string {
    if (metrics.threeFallback) {
        return "2D fallback";
    }
    if (metrics.threeActive) {
        return "Three active";
    }
    return "2D only";
}

export function createEffectLabPreviewConfigs(cardType: EffectLabCardType): EffectLabPreviewConfig[] {
    if (cardType === "version") {
        return [
            {
                key: "tile",
                label: "Tile Card",
                description: "Standard card surface for the Instances grid.",
                scope: "card",
                expectedQuality: "tile",
                wrapperClassName: "effect-lab-preview-grid versions-grid",
                cardClassName: "v2-card effect-lab-preview-card version-card",
            },
            {
                key: "hero",
                label: "Hero Preview",
                description: "Lab-scope hero surface with stronger motion and 3D allowance.",
                scope: "lab",
                expectedQuality: "lab",
                wrapperClassName: "effect-lab-preview-grid effect-lab-preview-grid-hero versions-grid hero-layout",
                cardClassName: "v2-card effect-lab-preview-card version-card is-hero",
            },
        ];
    }

    return [
        {
            key: "tile",
            label: "Tile Card",
            description: "Default mod tile surface as shown in the content grid.",
            scope: "card",
            expectedQuality: "tile",
            wrapperClassName: "effect-lab-preview-grid content-grid is-tiles",
            cardClassName: "v2-card effect-lab-preview-card package-card-wrap",
        },
        {
            key: "hero",
            label: "Hero Preview",
            description: "Lab-scope hero surface with the full preview budget.",
            scope: "lab",
            expectedQuality: "lab",
            wrapperClassName: "effect-lab-preview-grid effect-lab-preview-grid-hero content-grid is-tiles",
            cardClassName: "v2-card effect-lab-preview-card package-card-wrap is-hero-preview",
        },
    ];
}
