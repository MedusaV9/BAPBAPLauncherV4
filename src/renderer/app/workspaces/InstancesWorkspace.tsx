import { useEffect, useMemo, useRef, useState, forwardRef, type KeyboardEvent } from "react";
import { Download, Play, Boxes, Package, Sword, RefreshCw, Pencil, Trash2, FolderOpen } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { FeatureCard } from "../../components/brand/FeatureCard";
import { Progress } from "../../components/ui/progress";
import { cn } from "../lib/utils";
import {
    useInstances,
    useGameVersions,
    useBundles,
    useInstallState,
    useInstallOfficial,
    useInstallBundle,
    useBundleInstallProgress,
    useApplyBundleUpdate,
    useTrustedTime,
    useRemoveInstance,
    useRenameInstance,
    useSettings,
} from "../query/hooks";
import { useShellStore } from "../stores/useShellStore";
import { useT } from "../i18n";
import { api } from "../../api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import {
    INSTANCES_HERO_TRACKS,
    resolvePrimaryOfficialVersionForTrack,
    isOfficialVersionInstalled,
    type InstancesHeroTrack,
} from "../../helpers/official-version-visibility";
import { isTrustedTimeReady } from "../../helpers/unlock-ui";
import { suggestProfileName, getInstallStateLabel, isInstallStateBusy } from "../../helpers/instances-ui";
import { containerVariants, itemUp, EASE_POP } from "../../motion";
import type { BundleSummary } from "../../../shared/ipc";
import type { StringKey } from "../i18n/en";

const BUNDLE_PROGRESS_LABEL: Record<string, StringKey> = {
    resolving: "instances.bundleProgressResolving",
    downloading: "instances.bundleProgressDownloading",
    verifying: "instances.bundleProgressVerifying",
    extracting: "instances.bundleProgressExtracting",
    installing: "instances.bundleProgressInstalling",
};

function suggestBundleProfileName(bundle: BundleSummary, instances: Array<{ profileName: string }>): string {
    const base = bundle.name || "Battle Royale";
    const names = new Set(instances.map(instance => instance.profileName.toLowerCase()));
    if (!names.has(base.toLowerCase())) return base;
    for (let i = 2; i < 100; i += 1) {
        const candidate = `${base} ${i}`;
        if (!names.has(candidate.toLowerCase())) return candidate;
    }
    return `${base} ${instances.length + 1}`;
}

// Per-mode signature accents + display identity for the three-up hero.
const MODE: Record<InstancesHeroTrack, { accent: string; title: string; eyebrow: string; icon: typeof Boxes }> = {
    bapbap: { accent: "#e91e8c", title: "Arena", eyebrow: "Standard BAPBAP", icon: Boxes },
    "boss-rush": { accent: "#22c55e", title: "Boss Rush", eyebrow: "Challenge Mode", icon: Sword },
    bundle: { accent: "#22d3ee", title: "Battle Royale", eyebrow: "Playtest", icon: Boxes },
};

type HeroPanelData = {
    track: InstancesHeroTrack;
    accent: string;
    title: string;
    eyebrow: string;
    versionLabel: string;
    art?: string;
    installed: boolean;
    available: boolean;
    actionLabel: string;
    onAction: () => void;
    secondaryLabel?: string;
    onSecondaryAction?: () => void;
    updateAvailable?: boolean;
    updateLabel?: string;
    onUpdate?: () => void;
};

function ProfileArt({ imageUrl, accent }: { imageUrl?: string; accent: string }) {
    // Key the inner state on the URL so a previously-failed image doesn't stay
    // stuck on the fallback icon when the instance's art changes.
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        setFailed(false);
    }, [imageUrl]);
    const Icon = Package;

    return (
        <div className="relative h-full w-full overflow-hidden bg-[var(--surface-inset)]">
            {imageUrl && !failed ? (
                <img
                    src={imageUrl}
                    alt=""
                    loading="lazy"
                    onError={() => setFailed(true)}
                    className="h-full w-full object-cover"
                />
            ) : (
                <div className="flex h-full w-full items-center justify-center">
                    <Icon size={22} className="text-muted-foreground" />
                </div>
            )}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-0.5 rounded-full" style={{ background: accent }} />
        </div>
    );
}

function ProceduralArt({ accent, glyph }: { accent: string; glyph: string }) {
    return (
        <div
            className="flex h-full w-full items-end justify-start overflow-hidden"
            style={{ background: `linear-gradient(140deg, ${accent}22 0%, var(--surface-inset) 55%, var(--card) 100%)` }}
        >
            <span
                className="select-none font-display leading-none"
                style={{ fontSize: "13rem", color: "#f1f0ea", opacity: 0.06, transform: "translate(-6%, 14%)" }}
            >
                {glyph}
            </span>
        </div>
    );
}

const HeroPanel = forwardRef<HTMLDivElement, {
    data: HeroPanelData;
    expanded: boolean;
    anyExpanded: boolean;
    tabbable: boolean;
    onHover: () => void;
    onHoverEnd: () => void;
    onFocusPanel: () => void;
    onActivate: () => void;
    reduceMotion: boolean;
}>(function HeroPanel({
    data,
    expanded,
    anyExpanded,
    tabbable,
    onHover,
    onHoverEnd,
    onFocusPanel,
    onActivate,
    reduceMotion,
}, forwardedRef) {
    const artRef = useRef<HTMLDivElement>(null);
    const titleRef = useRef<HTMLDivElement>(null);
    const [imgFailed, setImgFailed] = useState(false);
    const t = useT();
    const Icon = MODE[data.track].icon;

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (reduceMotion) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        if (artRef.current) artRef.current.style.transform = `scale(1.03) translate(${px * -6}px, ${py * -4}px)`;
        if (titleRef.current) titleRef.current.style.transform = `translate(${px * 4}px, ${py * 4}px)`;
    };
    const handlePointerLeave = () => {
        if (artRef.current) artRef.current.style.transform = "";
        if (titleRef.current) titleRef.current.style.transform = "";
    };

    return (
        <div
            ref={forwardedRef}
            role="radio"
            tabIndex={tabbable ? 0 : -1}
            aria-checked={expanded}
            onClick={onActivate}
            onKeyDown={(e: KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onActivate();
                }
            }}
            onPointerEnter={onHover}
            onFocus={onFocusPanel}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => {
                onHoverEnd();
                handlePointerLeave();
            }}
            className={cn(
                "group bap-grain relative cursor-pointer overflow-hidden rounded-[1.125rem] border transition-[flex,box-shadow,border-color] duration-[480ms] ease-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                expanded ? "flex-[1.6]" : anyExpanded ? "flex-[0.82]" : "flex-1",
                expanded
                    ? "border-transparent shadow-[0_24px_40px_-12px_rgba(0,0,0,0.7),0_8px_16px_-8px_rgba(0,0,0,0.6)]"
                    : "border-border hover:shadow-[0_24px_40px_-12px_rgba(0,0,0,0.7),0_8px_16px_-8px_rgba(0,0,0,0.6)]"
            )}
            style={
                expanded
                    ? ({
                          borderColor: data.accent,
                          boxShadow: `0 24px 40px -12px rgba(0,0,0,0.7), 0 8px 16px -8px rgba(0,0,0,0.6), inset 0 0 0 1px color-mix(in oklab, ${data.accent} 35%, transparent)`,
                      } as React.CSSProperties)
                    : undefined
            }
        >
            {/* Art layer */}
            <div
                ref={artRef}
                className={cn(
                    "absolute inset-0 origin-center transition-[filter,transform] duration-[280ms] ease-pop",
                    !reduceMotion && "bap-hero-drift"
                )}
                style={{
                    filter: expanded ? "brightness(1) saturate(1.05)" : "brightness(0.62) saturate(0.85)",
                    transform: "scale(1.03)",
                }}
            >
                {data.art && !imgFailed ? (
                    <img
                        src={data.art}
                        alt=""
                        loading="lazy"
                        onError={() => setImgFailed(true)}
                        className="h-full w-full object-cover group-hover:[filter:brightness(0.85)]"
                    />
                ) : (
                    <ProceduralArt accent={data.accent} glyph={data.title.charAt(0)} />
                )}
            </div>

            {/* Tonal overlay (idle dim) */}
            <div
                className="pointer-events-none absolute inset-0 transition-opacity duration-[280ms] ease-pop"
                style={{ background: "#0a0b10", opacity: expanded ? 0 : 0.35 }}
            />
            {/* Vignette */}
            <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 120px -40px rgba(0,0,0,0.55)" }} />
            {/* Bottom scrim for title legibility */}
            <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
                style={{
                    background:
                        "linear-gradient(to top, rgba(10,11,16,0.92) 0%, rgba(10,11,16,0.55) 28%, rgba(10,11,16,0) 60%)",
                }}
            />
            {/* Top accent bar on hover (idle) */}
            {!expanded && (
                <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-[2px] opacity-0 transition-opacity duration-[280ms] ease-pop group-hover:opacity-100"
                    style={{ background: data.accent }}
                />
            )}

            {/* Content — no status pill or version label on hero; those go in the
                profiles grid below where they have room to breathe. */}
            <div ref={titleRef} className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 p-7 transition-transform duration-[200ms] ease-pop">
                <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-2">
                        <span
                            className="font-body text-[0.6875rem] font-semibold uppercase tracking-[0.14em] transition-colors duration-[280ms]"
                            style={{ color: expanded ? data.accent : "#969cab" }}
                        >
                            {data.eyebrow}
                        </span>
                    </span>
                    <h3
                        className="font-display leading-[0.95] text-foreground transition-[font-size] duration-[480ms] ease-pop"
                        style={{ fontSize: expanded ? "clamp(40px,4vw,60px)" : "clamp(28px,2.6vw,40px)" }}
                    >
                        {data.title}
                    </h3>
                </div>

                {/* Play CTA — always rendered in the DOM to keep layout stable
                    during flex-grow animation, but takes zero layout space when
                    collapsed (max-h-0 overflow-hidden) so it doesn't push the
                    title text upward in non-expanded panels. */}
                <div
                    className="flex flex-wrap items-center gap-2 overflow-hidden transition-all duration-[280ms] ease-pop"
                    style={{
                        visibility: expanded ? "visible" : "hidden",
                        maxHeight: expanded ? "80px" : "0",
                        opacity: expanded ? 1 : 0,
                    }}
                >
                    <button
                        type="button"
                        onClick={e => {
                            e.stopPropagation();
                            data.onAction();
                        }}
                        disabled={!data.available && !data.installed}
                        className="mt-1 inline-flex w-fit items-center gap-2 rounded-[0.625rem] px-7 py-3.5 font-body text-sm font-semibold uppercase tracking-[0.08em] transition-[filter,transform] duration-150 ease-pop hover:-translate-y-px hover:brightness-110 disabled:opacity-50"
                        style={{ background: data.accent, color: "#0a0b10" }}
                    >
                        {data.installed ? <Play size={16} /> : <Download size={16} />}
                        {data.actionLabel}
                    </button>
                    {data.secondaryLabel && data.onSecondaryAction && (
                        <button
                            type="button"
                            onClick={e => {
                                e.stopPropagation();
                                data.onSecondaryAction!();
                            }}
                            className="mt-1 inline-flex w-fit items-center gap-2 rounded-[0.625rem] border border-white/15 bg-white/[0.06] px-5 py-3.5 font-body text-sm font-semibold uppercase tracking-[0.08em] text-foreground transition-[filter,transform] duration-150 ease-pop hover:-translate-y-px hover:bg-white/[0.1]"
                        >
                            <Download size={16} />
                            {data.secondaryLabel}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
});

export function InstancesWorkspace() {
    const t = useT();
    const { data: instances = [], isLoading } = useInstances();
    const { data: gameVersions } = useGameVersions();
    const { data: bundles = [] } = useBundles();
    const { data: installState } = useInstallState();
    const { data: trustedTime } = useTrustedTime();
    const installOfficial = useInstallOfficial();
    const installBundle = useInstallBundle();
    const applyBundleUpdate = useApplyBundleUpdate();
    const removeInstance = useRemoveInstance();
    const renameInstance = useRenameInstance();
    const { data: settings } = useSettings();
    const setActiveWorkspace = useShellStore(s => s.setActiveWorkspace);
    const openModsForInstance = useShellStore(s => s.openModsForInstance);
    const reduceMotion = useReducedMotion() ?? false;

    // Create-instance dialog: a track + version to install, plus a freely-chosen
    // name and install folder (defaults to the global instances root).
    const [createDraft, setCreateDraft] = useState<{ versionId: string; name: string; folder: string } | null>(null);
    const [bundleDraft, setBundleDraft] = useState<{ bundleId: string; name: string } | null>(null);
    const [renameDraft, setRenameDraft] = useState<{ id: string; name: string } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

    // Time-gated official builds need a trusted clock to evaluate their unlock
    // window; without a finite trustedNowMs, resolveUnlockStatus treats every
    // gated version as permanently locked.
    const trustedTimeAvailable = isTrustedTimeReady(trustedTime ?? null);
    const trustedNowMs = trustedTimeAvailable ? trustedTime!.trustedEpochMs ?? null : null;

    const versions = useMemo(() => gameVersions?.versions ?? [], [gameVersions]);
    const busy = installState ? isInstallStateBusy(installState) : false;
    const primaryBundle: BundleSummary | undefined = bundles[0];
    const { data: bundleProgress } = useBundleInstallProgress(primaryBundle?.id ?? "");
    const bundleInstalling =
        bundleProgress &&
        bundleProgress.status !== "idle" &&
        bundleProgress.status !== "done" &&
        bundleProgress.status !== "failed";

    const panels = useMemo<HeroPanelData[]>(() => {
        return INSTANCES_HERO_TRACKS.map(track => {
            const mode = MODE[track];
            if (track === "bundle") {
                const installed = primaryBundle?.isInstalled ?? false;
                return {
                    track,
                    accent: mode.accent,
                    title: mode.title,
                    eyebrow: mode.eyebrow,
                    versionLabel: primaryBundle?.isDownloadable ? `v${primaryBundle.version}` : "Unavailable",
                    art: primaryBundle?.imageUrl,
                    installed,
                    available: primaryBundle?.isDownloadable ?? false,
                    actionLabel: installed ? t("instances.playButton") : (primaryBundle?.isDownloadable ? t("instances.installButton") : t("instances.soonLabel")),
                    onAction: () => {
                        if (!primaryBundle || !primaryBundle.isDownloadable) return;
                        if (installed) {
                            setActiveWorkspace("launch");
                        } else {
                            setBundleDraft({ bundleId: primaryBundle.id, name: suggestBundleProfileName(primaryBundle, instances) });
                        }
                    },
                    secondaryLabel: undefined,
                    onSecondaryAction: undefined,
                };
            }
            const version = resolvePrimaryOfficialVersionForTrack(track, versions, instances, trustedNowMs, trustedTimeAvailable);
            const installed = version ? isOfficialVersionInstalled(version, instances) : false;
            return {
                track,
                accent: mode.accent,
                title: mode.title,
                eyebrow: mode.eyebrow,
                versionLabel: version ? version.gameVersion : "Coming soon",
                art: version?.imagePath,
                installed,
                available: Boolean(version),
                actionLabel: installed ? t("instances.playButton") : t("instances.installButton"),
                onAction: () => {
                    if (!version) return;
                    if (installed) setActiveWorkspace("launch");
                    else
                        setCreateDraft({
                            versionId: version.id,
                            name: suggestProfileName(version, track, instances),
                            folder: settings?.instancesRoot ?? "",
                        });
                },
                secondaryLabel: installed ? "Install another" : undefined,
                onSecondaryAction: installed && version
                    ? () =>
                          setCreateDraft({
                              versionId: version.id,
                              name: suggestProfileName(version, track, instances),
                              folder: settings?.instancesRoot ?? "",
                          })
                    : undefined,
            };
        });
    }, [versions, instances, primaryBundle, setActiveWorkspace, settings?.instancesRoot, trustedNowMs, trustedTimeAvailable, t]);

    // Seeds the roving tabindex so one panel is always Tab-reachable at rest.
    const defaultIndex = useMemo(() => {
        const inst = panels.findIndex(p => p.installed);
        if (inst >= 0) return inst;
        const avail = panels.findIndex(p => p.available);
        return avail >= 0 ? avail : 0;
    }, [panels]);
    const [hoveredTrack, setHoveredTrack] = useState<InstancesHeroTrack | null>(null);
    const [focusedTrack, setFocusedTrack] = useState<InstancesHeroTrack | null>(null);
    // Hover wins over keyboard focus; null = equal-size rest state.
    const expandedTrack = hoveredTrack ?? focusedTrack;
    const panelRefs = useRef(new Map<InstancesHeroTrack, HTMLDivElement>());

    const moveSelection = (dir: -1 | 1) => {
        const base = focusedTrack ?? panels[defaultIndex]?.track ?? panels[0]?.track;
        const i = panels.findIndex(p => p.track === base);
        const next = (i + dir + panels.length) % panels.length;
        const nextTrack = panels[next].track;
        setFocusedTrack(nextTrack);
        panelRefs.current.get(nextTrack)?.focus();
    };

    return (
        <div className="bap-glow relative h-full overflow-hidden bg-background">
            {/* Full-page atmosphere behind the scroll, so the background reads as
                the whole page rather than a band clipped to the hero. */}
            <div className="bap-page-ambient pointer-events-none absolute inset-0 z-0" />
            <div className="relative z-[1] h-full overflow-auto px-8 pb-8 pt-24">
            {busy && installState && (
                <div className="bap-card mb-6 p-4">
                    <p className="mb-2 text-sm text-foreground">
                        {getInstallStateLabel(installState)}
                        {installState.profileName ? ` — ${installState.profileName}` : ""}
                    </p>
                    <Progress value={installState.progressPercent ?? 0} />
                </div>
            )}

            {/* Three-up mode-select hero */}
            <div
                className="mb-10"
                role="radiogroup"
                aria-label={t("instances.gameModesSelectorAriaLabel")}
                onKeyDown={(e: KeyboardEvent) => {
                    if (e.key === "ArrowRight") {
                        e.preventDefault();
                        moveSelection(1);
                    } else if (e.key === "ArrowLeft") {
                        e.preventDefault();
                        moveSelection(-1);
                    }
                }}
            >
                <div className="relative z-[1] flex gap-4" style={{ height: "min(80vh, 760px)" }}>
                    {panels.map((panel, idx) => (
                        <HeroPanel
                            key={panel.track}
                            data={panel}
                            expanded={panel.track === expandedTrack}
                            anyExpanded={expandedTrack !== null}
                            tabbable={expandedTrack ? panel.track === expandedTrack : idx === defaultIndex}
                            onHover={() => setHoveredTrack(panel.track)}
                            onHoverEnd={() => setHoveredTrack(prev => (prev === panel.track ? null : prev))}
                            onFocusPanel={() => setFocusedTrack(panel.track)}
                            onActivate={() => panel.onAction()}
                            reduceMotion={reduceMotion}
                            ref={(el: HTMLDivElement | null) => {
                                if (el) panelRefs.current.set(panel.track, el);
                                else panelRefs.current.delete(panel.track);
                            }}
                        />
                    ))}
                </div>
                {bundleInstalling && bundleProgress && (
                    <div className="mt-4 bap-card p-4">
                        <p className="mb-2 text-sm text-foreground">
                            {(BUNDLE_PROGRESS_LABEL[bundleProgress.status] ? t(BUNDLE_PROGRESS_LABEL[bundleProgress.status]) : t("instances.bundleProgressInstalling"))} — {MODE.bundle.title}
                        </p>
                        <Progress value={bundleProgress.progressPercent ?? 0} />
                    </div>
                )}
            </div>

            {/* Installed profiles */}
            <div className="mb-3 flex items-center gap-2">
                <h2 className="font-display text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("instances.yourProfilesHeading")}</h2>
                <span className="rounded-full bg-white/[0.06] px-2 py-0.5 font-mono text-[0.6rem] text-muted-foreground">
                    {instances.length}
                </span>
                <span className="ml-1 h-px flex-1 bg-border" />
            </div>
            {isLoading && <p className="text-sm text-muted-foreground">{t("instances.loadingInstancesMessage")}</p>}
            {instances.length === 0 && !isLoading && (
                <div className="bap-card p-6 text-sm text-muted-foreground">
                    {t("instances.emptyStateMessage")}
                </div>
            )}
            <motion.div
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
                variants={reduceMotion ? undefined : containerVariants}
                initial={reduceMotion ? undefined : "hidden"}
                animate={reduceMotion ? undefined : "show"}
            >
                {instances.map(instance => {
                    const isBundle = instance.instanceType === "bundle";
                    const accent = instance.officialTrack === "boss-rush" ? "#22d3ee" : "#e91e8c";
                    const bundleSummary =
                        isBundle && instance.bundleId
                            ? bundles.find(b => b.id === instance.bundleId)
                            : undefined;
                    const bundleUpdateAvailable =
                        isBundle &&
                        Boolean(bundleSummary?.isUpdateAvailable) &&
                        Boolean(api.bundle.applyUpdate);
                    return (
                        <motion.div key={instance.id} variants={reduceMotion ? undefined : itemUp}>
                            <FeatureCard className="group flex h-full flex-col">
                                <div className="flex flex-1 items-stretch">
                                    <div className="w-20 shrink-0 overflow-hidden">
                                        <ProfileArt imageUrl={instance.imageUrl} accent={accent} />
                                    </div>
                                    <div className="flex flex-1 flex-col justify-center gap-1 p-4">
                                        <h3 className="font-display text-sm uppercase leading-tight text-foreground">
                                            {instance.profileName}
                                        </h3>
                                        {!isBundle && (
                                            <p className="truncate font-mono text-xs text-muted-foreground" title={instance.path}>
                                                {instance.gameVersion || instance.version}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 border-t border-border px-2 py-1.5">
                                    <button
                                        onClick={() => setActiveWorkspace("launch")}
                                        className="focus-ring flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                        title={t("instances.playButton")}
                                    >
                                        <Play size={13} /> {t("instances.playButton")}
                                    </button>
                                    {!isBundle && (
                                        <button
                                            onClick={() => openModsForInstance(instance.id)}
                                            className="focus-ring flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                            title={t("instances.addModsButtonTitle")}
                                        >
                                            <Package size={13} /> {t("instances.modsButton")}
                                        </button>
                                    )}
                                    {bundleUpdateAvailable && (
                                        <button
                                            onClick={() => applyBundleUpdate.mutate(instance.id)}
                                            disabled={applyBundleUpdate.isPending}
                                            className="focus-ring flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                                            title={t("instances.updateButton")}
                                        >
                                            <RefreshCw size={13} />{" "}
                                            {applyBundleUpdate.isPending ? "Updating…" : t("instances.updateButton")}
                                        </button>
                                    )}
                                    <span className="flex-1" />
                                    {!isBundle && (
                                        <>
                                            <button
                                                onClick={() => setRenameDraft({ id: instance.id, name: instance.profileName })}
                                                className="focus-ring rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                                title={t("instances.renameProfileDialogTitle")}
                                                aria-label={t("instances.renameProfileAriaLabel")}
                                            >
                                                <Pencil size={13} />
                                            </button>
                                            <button
                                                onClick={() => setConfirmDelete({ id: instance.id, name: instance.profileName })}
                                                className="focus-ring rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                                title={t("instances.deleteProfileDialogTitle")}
                                                aria-label={t("instances.deleteProfileAriaLabel")}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </FeatureCard>
                        </motion.div>
                    );
                })}
            </motion.div>

            {/* Create instance — choose a name + install folder. */}
            <Dialog open={Boolean(createDraft)} onOpenChange={open => !open && setCreateDraft(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t("instances.newInstanceDialogTitle")}</DialogTitle>
                    </DialogHeader>
                    {createDraft && (
                        <div className="flex flex-col gap-4">
                            <label className="flex flex-col gap-1.5">
                                <span className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground">
                                    {t("instances.nameInputLabel")}
                                </span>
                                <Input
                                    autoFocus
                                    value={createDraft.name}
                                    onChange={e => setCreateDraft({ ...createDraft, name: e.target.value })}
                                    placeholder={t("instances.profileNamePlaceholder")}
                                />
                            </label>
                            <label className="flex flex-col gap-1.5">
                                <span className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground">
                                    {t("instances.installFolderLabel")}
                                </span>
                                <div className="flex items-center gap-2">
                                    <Input
                                        readOnly
                                        value={createDraft.folder}
                                        className="flex-1 font-mono text-xs"
                                        title={createDraft.folder}
                                    />
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        title={t("instances.chooseFolderButtonTitle")}
                                        aria-label={t("instances.chooseFolderAriaLabel")}
                                        onClick={async () => {
                                            const dir = await api.dialog.chooseDirectory({ title: "Choose install folder" });
                                            if (dir) setCreateDraft({ ...createDraft, folder: dir });
                                        }}
                                    >
                                        <FolderOpen size={16} />
                                    </Button>
                                </div>
                            </label>
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setCreateDraft(null)}>
                                    {t("instances.cancelButton")}
                                </Button>
                                <Button
                                    disabled={!createDraft.name.trim() || installOfficial.isPending}
                                    onClick={() => {
                                        installOfficial.mutate({
                                            versionId: createDraft.versionId,
                                            profileName: createDraft.name.trim(),
                                            installPath: createDraft.folder.trim() || undefined,
                                        });
                                        setCreateDraft(null);
                                    }}
                                >
                                    <Download size={15} /> {t("instances.installButton")}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Create bundle profile — bundle service owns the install root, user picks the display name. */}
            <Dialog open={Boolean(bundleDraft)} onOpenChange={open => !open && setBundleDraft(null)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>{t("instances.newBattleRoyaleDialogTitle")}</DialogTitle>
                    </DialogHeader>
                    {bundleDraft && (
                        <div className="flex flex-col gap-4">
                            <label className="flex flex-col gap-1.5">
                                <span className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground">
                                    {t("instances.nameInputLabel")}
                                </span>
                                <Input
                                    autoFocus
                                    value={bundleDraft.name}
                                    onChange={e => setBundleDraft({ ...bundleDraft, name: e.target.value })}
                                    placeholder={t("instances.battleRoyaleProfileNamePlaceholder")}
                                />
                            </label>
                            <div className="flex flex-col gap-2">
                                {installBundle.isError && (
                                    <p className="text-sm text-destructive">
                                        {installBundle.error instanceof Error
                                            ? installBundle.error.message
                                            : String(installBundle.error ?? "Install failed.")}
                                    </p>
                                )}
                                <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setBundleDraft(null)}>
                                    {t("instances.cancelButton")}
                                </Button>
                                <Button
                                    disabled={!bundleDraft.name.trim() || installBundle.isPending}
                                    onClick={async () => {
                                        try {
                                            await installBundle.mutateAsync({ bundleId: bundleDraft.bundleId, profileName: bundleDraft.name.trim() });
                                            setBundleDraft(null);
                                        } catch {
                                            // Error remains on the mutation for the error banner.
                                        }
                                    }}
                                >
                                    <Download size={15} /> {installBundle.isPending ? t("instances.installingLabel") : t("instances.installButton")}
                                </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Rename profile — display name only; the folder stays put. */}
            <Dialog open={Boolean(renameDraft)} onOpenChange={open => !open && setRenameDraft(null)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>{t("instances.renameProfileDialogTitle")}</DialogTitle>
                    </DialogHeader>
                    {renameDraft && (
                        <div className="flex flex-col gap-4">
                            <Input
                                autoFocus
                                value={renameDraft.name}
                                onChange={e => setRenameDraft({ ...renameDraft, name: e.target.value })}
                                onKeyDown={e => {
                                    if (e.key === "Enter" && renameDraft.name.trim()) {
                                        renameInstance.mutate({ instanceId: renameDraft.id, name: renameDraft.name.trim() });
                                        setRenameDraft(null);
                                    }
                                }}
                            />
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setRenameDraft(null)}>
                                    {t("instances.cancelButton")}
                                </Button>
                                <Button
                                    disabled={!renameDraft.name.trim() || renameInstance.isPending}
                                    onClick={() => {
                                        renameInstance.mutate({ instanceId: renameDraft.id, name: renameDraft.name.trim() });
                                        setRenameDraft(null);
                                    }}
                                >
                                    {t("instances.saveButton")}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete confirmation. */}
            <Dialog open={Boolean(confirmDelete)} onOpenChange={open => !open && setConfirmDelete(null)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>{t("instances.deleteProfileDialogTitle")}</DialogTitle>
                    </DialogHeader>
                    {confirmDelete && (
                        <div className="flex flex-col gap-4">
                            <p className="text-sm text-muted-foreground">
                                {t("instances.deleteConfirmationMessage", { profileName: confirmDelete.name })}
                            </p>
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
                                    {t("instances.cancelButton")}
                                </Button>
                                <Button
                                    variant="destructive"
                                    disabled={removeInstance.isPending}
                                    onClick={() => {
                                        removeInstance.mutate(confirmDelete.id);
                                        setConfirmDelete(null);
                                    }}
                                >
                                    <Trash2 size={15} /> {t("instances.deleteButton")}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
            </div>
        </div>
    );
}
