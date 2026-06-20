import React, { useEffect, useRef, useState } from "react";
import { animate, type JSAnimation } from "animejs";
import { FX_VISUAL_PROFILES, resolveChipEffectProfile } from "../effects/fx-profiles";
import { resolveEffectTag } from "../effects/fx-resolver";
import { useFxSurfaceRuntime } from "../effects/fx-runtime";
import type { FxChipScope, FxRuntimeMetrics, FxSurfaceScope, FxToken, MotionTierProfile, RibbonResolved } from "../effects/fx-types";
import type { TrustedTimeState } from "../../shared/ipc";
import { formatUnlockLocal, getUnlockCountdownLabel, resolveUnlockUiState } from "../helpers/unlock-ui";
import { UI_EASING } from "../helpers/ui-motion-easing";

export function FxSurfaceContainer(props: {
    as?: "div" | "article";
    surfaceClassName?: string;
    className?: string;
    contentClassName?: string;
    token: FxToken | null;
    motionEnabled: boolean;
    motionTierProfile: MotionTierProfile;
    scope: "card" | "overlay" | "onboarding" | "lab";
    ribbon?: RibbonResolved | null;
    ribbonClassName?: string;
    ribbonPlacement?: "shell" | "host";
    onMetrics?: (metrics: FxRuntimeMetrics) => void;
    layoutItem?: boolean;
    intensityScale?: number;
    children: React.ReactNode;
}): React.JSX.Element {
    const {
        as = "div",
        surfaceClassName = "",
        className = "",
        contentClassName = "fx-content",
        token,
        motionEnabled,
        motionTierProfile,
        scope,
        ribbon = null,
        ribbonClassName = "",
        ribbonPlacement = "shell",
        onMetrics,
        layoutItem = false,
        intensityScale,
        children,
    } = props;
    const ref = useRef<HTMLElement | null>(null);
    const ContentTag = as;

    useFxSurfaceRuntime(ref, {
        token,
        motionEnabled,
        tierProfile: motionTierProfile,
        scope,
        intensityScale,
        onMetrics,
    });

    return (
        <div className={`fx-surface-shell ${surfaceClassName}`.trim()} data-layout-item={layoutItem ? "" : undefined}>
            <div ref={ref as React.RefObject<HTMLDivElement>} className={`fx-surface-host ${className}`.trim()}>
                <div className="fx-layer fx-layer-base" aria-hidden="true" />
                <div className="fx-layer fx-layer-accent" aria-hidden="true" />
                {ribbon && ribbonPlacement === "host" ? (
                    <div className={`fx-ribbon fx-ribbon-${ribbon.tag} ${ribbonClassName}`.trim()} title={ribbon.label}>
                        <span className="fx-ribbon-text">{ribbon.label}</span>
                    </div>
                ) : null}
                <ContentTag className={contentClassName}>{children}</ContentTag>
            </div>
            {ribbon && ribbonPlacement !== "host" ? (
                <div className={`fx-ribbon fx-ribbon-${ribbon.tag} ${ribbonClassName}`.trim()} title={ribbon.label}>
                    <span className="fx-ribbon-text">{ribbon.label}</span>
                </div>
            ) : null}
        </div>
    );
}

export function EffectTagChip(props: {
    tag: string;
    motionEnabled: boolean;
    motionTierProfile: MotionTierProfile;
    scope: FxChipScope;
    effectTagCount: number;
}): React.JSX.Element {
    const { tag, motionEnabled, motionTierProfile, scope, effectTagCount } = props;
    const resolved = resolveEffectTag(tag);
    if (!resolved) {
        return <span className="pill neutral">{tag}</span>;
    }

    const profile = FX_VISUAL_PROFILES[resolved.token];
    const chipFx = resolveChipEffectProfile(profile);
    const motionActive = motionEnabled && motionTierProfile.tier !== "low";
    const chipDensityScale = effectTagCount > 3 ? 0.62 : effectTagCount > 2 ? 0.74 : effectTagCount > 1 ? 0.86 : 1;
    const scopeScale = scope === "lab" ? 1.08 : 0.94;
    const chipIntensity = chipFx.intensity * chipDensityScale * scopeScale;
    const particleCount = motionActive
        ? Math.max(1, Math.min(4, Math.round(chipFx.particleCount * chipDensityScale * (scope === "lab" ? 1.06 : 0.9))))
        : 0;
    const chipStyle = {
        "--fx-chip-primary": profile.colors.primary,
        "--fx-chip-secondary": profile.colors.secondary,
        "--fx-chip-accent": profile.colors.accent,
        "--fx-chip-rim": profile.colors.rim,
        "--fx-chip-sheen": profile.colors.sheen,
        "--fx-chip-intensity": `${chipIntensity}`,
        "--fx-chip-sheen-duration": `${chipFx.sheenDurationMs}ms`,
    } as React.CSSProperties;

    return (
        <span
            className={`pill neutral fx-tag-chip fx-tag-chip-${resolved.token} ${motionActive ? "is-animated" : "is-static"}`}
            data-chip-scope={scope}
            data-chip-variant={chipFx.variant}
            style={chipStyle}
            title={resolved.token}
        >
            <span className="fx-tag-chip-layer fx-tag-chip-layer-base" aria-hidden="true" />
            <span className="fx-tag-chip-layer fx-tag-chip-layer-accent" aria-hidden="true" />
            <span className="fx-tag-chip-layer fx-tag-chip-layer-sheen" aria-hidden="true" />
            {Array.from({ length: particleCount }, (_, index) => (
                <span
                    key={`${resolved.token}-${tag}-${index}`}
                    className="fx-tag-chip-particle"
                    aria-hidden="true"
                    style={
                        {
                            "--fx-chip-px": `${18 + ((index * 27 + resolved.token.length * 9) % 64)}%`,
                            "--fx-chip-py": `${22 + ((index * 19 + resolved.token.length * 7) % 44)}%`,
                            "--fx-chip-delay": `${index * -180}ms`,
                            "--fx-chip-scale": `${0.82 + (index % 3) * 0.16}`,
                        } as React.CSSProperties
                    }
                />
            ))}
            <span className="fx-tag-chip-label">{tag}</span>
        </span>
    );
}

export function UnlockStateOverlay(props: {
    id: string;
    unlockAtUtc?: string;
    trustedTimeState: TrustedTimeState | null;
    trustedNowMs?: number | null;
    motionEnabled: boolean;
    motionDuration: (base: number) => number;
    compact?: boolean;
}): React.JSX.Element | null {
    const { id, unlockAtUtc, trustedTimeState, trustedNowMs, motionEnabled, motionDuration, compact = false } = props;
    const unlockState = resolveUnlockUiState(unlockAtUtc, trustedTimeState, trustedNowMs);
    const overlayRef = useRef<HTMLDivElement | null>(null);
    const wasLockedRef = useRef(unlockState.locked);
    const [visible, setVisible] = useState(unlockState.locked);

    useEffect(() => {
        setVisible(unlockState.locked);
    }, [id, unlockState.locked]);

    useEffect(() => {
        const overlay = overlayRef.current;
        if (!overlay) {
            wasLockedRef.current = unlockState.locked;
            return;
        }

        if (wasLockedRef.current && !unlockState.locked && visible) {
            if (!motionEnabled) {
                setVisible(false);
                wasLockedRef.current = false;
                return;
            }

            const panels = overlay.querySelectorAll<HTMLElement>(".unlock-overlay-panel");
            const animations: JSAnimation[] = [
                animate(overlay, {
                    opacity: [1, 0],
                    filter: ["blur(0px)", "blur(8px)"],
                    duration: motionDuration(260),
                    ease: UI_EASING.enter,
                }),
            ];

            if (panels.length) {
                animations.push(
                    animate(panels, {
                        translateX: (_target: unknown, index: number) => (index === 0 ? -42 : 42),
                        translateY: (_target: unknown, index: number) => (index === 0 ? -18 : 18),
                        rotate: (_target: unknown, index: number) => (index === 0 ? -11 : 11),
                        opacity: [1, 0],
                        duration: motionDuration(300),
                        ease: UI_EASING.hero,
                    })
                );
            }

            Promise.all(animations.map(animation => animation.then(() => undefined).catch(() => undefined))).finally(() => {
                setVisible(false);
            });
        }

        wasLockedRef.current = unlockState.locked;
    }, [motionDuration, motionEnabled, trustedNowMs, unlockState.locked, visible]);

    if (!visible) {
        return null;
    }

    const title = unlockState.reason === "waiting-time-source" ? "Waiting for trusted time source" : "Locked";
    const body =
        unlockState.reason === "waiting-time-source"
            ? "This release stays sealed until trusted network time is available."
            : "Unlocks when the trusted network clock reaches the scheduled release time.";
    const countdown = getUnlockCountdownLabel(unlockState, trustedNowMs);

    return (
        <div ref={overlayRef} className={`unlock-overlay ${compact ? "is-compact" : ""}`} aria-hidden="true">
            <div className="unlock-overlay-panel unlock-overlay-panel-left" />
            <div className="unlock-overlay-panel unlock-overlay-panel-right" />
            <div className="unlock-overlay-copy">
                <span className="unlock-overlay-eyebrow">{title}</span>
                {unlockState.reason === "waiting-time-source" ? (
                    <strong className="unlock-overlay-waiting">Waiting for trusted time source</strong>
                ) : (
                    <strong className="unlock-overlay-countdown">{countdown}</strong>
                )}
                {unlockState.hasUnlock ? <span className="unlock-overlay-time">{formatUnlockLocal(unlockState.unlockAtUtc)}</span> : null}
                {!compact ? <p>{body}</p> : null}
            </div>
        </div>
    );
}
