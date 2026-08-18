import { useEffect, useMemo, useRef, useState, forwardRef, type KeyboardEvent } from "react";
import { Download, Play, Boxes, Sword, RefreshCw, FolderOpen } from "lucide-react";
import { useReducedMotion } from "motion/react";
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
    useBundleUpdateState,
    useApplyBundleUpdate,
    useTrustedTime,
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
import { EASE_POP } from "../../motion";
import type { BundleSummary } from "../../../shared/ipc";
import type { StringKey } from "../i18n/en";
import { ArchiveSectionPrototype } from "./ArchiveSectionPrototype";

const BUNDLE_PROGRESS_LABEL: Record<string, StringKey> = {
    resolving: "instances.bundleProgressResolving",
    downloading: "instances.bundleProgressDownloading",
    verifying: "instances.bundleProgressVerifying",
    extracting: "instances.bundleProgressExtracting",
    installing: "instances.bundleProgressInstalling",
};

const BUNDLE_UPDATE_PROGRESS_LABEL: Record<string, StringKey> = {
    checking: "instances.bundleProgressResolving",
    downloading: "instances.bundleProgressDownloading",
    verifying: "instances.bundleProgressVerifying",
    applying: "instances.bundleProgressInstalling",
};

const ACTIVE_BUNDLE_UPDATE_STATUSES = new Set([
    "checking",
    "downloading",
    "verifying",
    "applying",
]);

const FAILED_BUNDLE_UPDATE_STATUSES = new Set([
    "failed",
    "check-failed",
    "signature-mismatch",
    "disk-full",
]);

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
    bundle: { accent: "#eab308", title: "Battle Royale", eyebrow: "Public Playtest", icon: Boxes },
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
    /** When true, primary CTA is Update (no Play) with RefreshCw icon. */
    primaryIsUpdate?: boolean;
    secondaryLabel?: string;
    onSecondaryAction?: () => void;
    updatePending?: boolean;
};

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

    // Reset fail state when art URL changes (avoids permanent ProceduralArt fallback).
    useEffect(() => {
        setImgFailed(false);
    }, [data.art]);

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
                        key={data.art}
                        src={data.art}
                        alt=""
                        decoding="async"
                        fetchPriority="high"
                        onError={() => setImgFailed(true)}
                        className="absolute inset-0 h-full w-full object-cover object-center group-hover:[filter:brightness(0.9)]"
                    />
                ) : (
                    <ProceduralArt accent={data.accent} glyph={data.title.charAt(0)} />
                )}
            </div>

            {/* Tonal overlay (idle dim) — lighter when custom art is present so it reads */}
            <div
                className="pointer-events-none absolute inset-0 transition-opacity duration-[280ms] ease-pop"
                style={{
                    background: "#0a0b10",
                    opacity: expanded ? 0 : data.art && !imgFailed ? 0.18 : 0.35,
                }}
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
                    {data.eyebrow ? (
                        <span className="flex items-center gap-2">
                            <span
                                className="font-body text-[0.6875rem] font-semibold uppercase tracking-[0.14em] transition-colors duration-[280ms]"
                                style={{ color: expanded ? data.accent : "#969cab" }}
                            >
                                {data.eyebrow}
                            </span>
                        </span>
                    ) : null}
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
                        disabled={(!data.available && !data.installed) || data.updatePending}
                        className="mt-1 inline-flex w-fit items-center gap-2 rounded-[0.625rem] px-7 py-3.5 font-body text-sm font-semibold uppercase tracking-[0.08em] transition-[filter,transform] duration-150 ease-pop hover:-translate-y-px hover:brightness-110 disabled:opacity-50"
                        style={{ background: data.accent, color: "#0a0b10" }}
                    >
                        {data.primaryIsUpdate ? (
                            <RefreshCw size={16} className={data.updatePending ? "animate-spin" : undefined} />
                        ) : data.installed ? (
                            <Play size={16} />
                        ) : (
                            <Download size={16} />
                        )}
                        {data.actionLabel}
                    </button>
                    {!data.primaryIsUpdate && data.secondaryLabel && data.onSecondaryAction && (
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
    const { data: instances = [] } = useInstances();
    const { data: gameVersions } = useGameVersions();
    const { data: bundles = [] } = useBundles();
    const { data: installState } = useInstallState();
    const { data: trustedTime } = useTrustedTime();
    const installOfficial = useInstallOfficial();
    const installBundle = useInstallBundle();
    const applyBundleUpdate = useApplyBundleUpdate();
    const { data: settings } = useSettings();
    const setActiveWorkspace = useShellStore(s => s.setActiveWorkspace);
    const reduceMotion = useReducedMotion() ?? false;

    // Create-instance dialog: a track + version to install, plus a freely-chosen
    // name and install folder (defaults to the global instances root).
    const [createDraft, setCreateDraft] = useState<{ versionId: string; name: string; folder: string } | null>(null);
    const [bundleDraft, setBundleDraft] = useState<{ bundleId: string; name: string } | null>(null);

    // Time-gated official builds need a trusted clock to evaluate their unlock
    // window; without a finite trustedNowMs, resolveUnlockStatus treats every
    // gated version as permanently locked.
    const trustedTimeAvailable = isTrustedTimeReady(trustedTime ?? null);
    const trustedNowMs = trustedTimeAvailable ? trustedTime!.trustedEpochMs ?? null : null;

    const versions = useMemo(() => gameVersions?.versions ?? [], [gameVersions]);
    const busy = installState ? isInstallStateBusy(installState) : false;
    const primaryBundle: BundleSummary | undefined = bundles[0];
    const installedBundleInstance = useMemo(
        () =>
            primaryBundle
                ? instances.find(
                      instance =>
                          instance.instanceType === "bundle" && instance.bundleId === primaryBundle.id,
                  )
                : undefined,
        [instances, primaryBundle],
    );
    const { data: bundleProgress } = useBundleInstallProgress(primaryBundle?.id ?? "");
    const { data: bundleUpdateState } = useBundleUpdateState(installedBundleInstance?.id);
    const bundleInstalling =
        bundleProgress &&
        bundleProgress.status !== "idle" &&
        bundleProgress.status !== "done" &&
        bundleProgress.status !== "failed";
    const bundleUpdating =
        Boolean(bundleUpdateState && ACTIVE_BUNDLE_UPDATE_STATUSES.has(bundleUpdateState.status)) ||
        applyBundleUpdate.isPending;
    const bundleUpdateFailed =
        Boolean(bundleUpdateState && FAILED_BUNDLE_UPDATE_STATUSES.has(bundleUpdateState.status));

    const panels = useMemo<HeroPanelData[]>(() => {
        return INSTANCES_HERO_TRACKS.map(track => {
            const mode = MODE[track];
            if (track === "bundle") {
                const installed = primaryBundle?.isInstalled ?? false;
                const canUpdate =
                    installed &&
                    Boolean(primaryBundle?.isUpdateAvailable) &&
                    Boolean(api.bundle.applyUpdate) &&
                    Boolean(installedBundleInstance);
                return {
                    track,
                    accent: mode.accent,
                    title: mode.title,
                    eyebrow: mode.eyebrow,
                    versionLabel: primaryBundle?.isDownloadable ? `v${primaryBundle.version}` : "Unavailable",
                    art: primaryBundle?.imageUrl,
                    installed,
                    available: primaryBundle?.isDownloadable ?? false,
                    primaryIsUpdate: canUpdate,
                    actionLabel: canUpdate
                        ? (applyBundleUpdate.isPending || bundleUpdating ? "Updating…" : t("instances.updateButton"))
                        : installed
                            ? t("instances.playButton")
                            : (primaryBundle?.isDownloadable ? t("instances.installButton") : t("instances.soonLabel")),
                    updatePending: canUpdate && (applyBundleUpdate.isPending || bundleUpdating),
                    onAction: () => {
                        if (!primaryBundle || !primaryBundle.isDownloadable) return;
                        if (canUpdate) {
                            if (!installedBundleInstance) return;
                            applyBundleUpdate.mutate(installedBundleInstance.id);
                            return;
                        }
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
    }, [
        versions,
        instances,
        primaryBundle,
        installedBundleInstance,
        setActiveWorkspace,
        settings?.instancesRoot,
        trustedNowMs,
        trustedTimeAvailable,
        t,
        applyBundleUpdate.isPending,
        applyBundleUpdate.mutate,
        bundleUpdating,
    ]);

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
            <div className="relative z-[1] h-full overflow-auto px-8 pb-36 pt-24">
            {busy && installState && (
                <div className="bap-card mb-6 p-4">
                    <p className="mb-2 text-sm text-foreground">
                        {getInstallStateLabel(installState)}
                        {installState.profileName ? ` — ${installState.profileName}` : ""}
                    </p>
                    <Progress value={installState.progressPercent ?? 0} />
                </div>
            )}

            {/* Three-up mode-select hero — sized so archive below is in view without a toggle */}
            <div
                className="relative mb-8"
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
                <div
                    className="relative z-[1] flex gap-4"
                    style={{ height: "min(86vh, 860px)" }}
                >
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
                {bundleUpdating && bundleUpdateState && (
                    <div className="mt-4 bap-card p-4">
                        <p className="mb-2 text-sm text-foreground">
                            {(BUNDLE_UPDATE_PROGRESS_LABEL[bundleUpdateState.status]
                                ? t(BUNDLE_UPDATE_PROGRESS_LABEL[bundleUpdateState.status])
                                : t("instances.bundleProgressInstalling"))}{" "}
                            — {MODE.bundle.title}
                            {bundleUpdateState.remoteVersion ? ` → v${bundleUpdateState.remoteVersion}` : ""}
                        </p>
                        <Progress value={bundleUpdateState.progressPercent ?? 0} />
                    </div>
                )}
                {bundleUpdateFailed && bundleUpdateState && !bundleUpdating && (
                    <div className="mt-4 bap-card border border-destructive/40 p-4">
                        <p className="text-sm text-destructive">
                            {bundleUpdateState.errorMessage || t("instances.updateButton")} failed
                        </p>
                    </div>
                )}
            </div>

            {/* Always-visible archive catalog (uses remaining vertical space under the hero) */}
            <ArchiveSectionPrototype />

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

            </div>
        </div>
    );
}
