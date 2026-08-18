import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Square, Terminal, Boxes, Star, Copy, ArrowDownToLine, Clock3, ChevronUp, ChevronDown, ArrowLeftRight, Package, Search, Trophy, RefreshCw, Settings2, Pencil, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { SectionHeading } from "../../components/brand/SectionHeading";
import { BapCard } from "../../components/brand/BapCard";
import { BapButton } from "../../components/brand/BapButton";
import { StatusChip, type StatusTone } from "../../components/brand/StatusChip";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { cn } from "../lib/utils";
import { useShellStore } from "../stores/useShellStore";
import { useT } from "../i18n";
import {
    useInstances,
    useRuntimeState,
    useRuntimeLog,
    useStartLaunch,
    useStopLaunch,
    useSettings,
    useSetSetting,
    useBundles,
    useRenameInstance,
    useRemoveInstance,
} from "../query/hooks";
import { getLaunchRuntimeLabel, resolveModeVideoKey, type ModeVideoKey } from "../../helpers/launch-ui";
import { api } from "../../api";
import standardVideo from "../../assets/videos/launcher-standard.mp4";
import bossRushVideo from "../../assets/videos/launcher-boss-rush.mp4";
import battleRoyaleVideo from "../../assets/videos/launcher-battle-royale.mp4";

const MODE_VIDEOS: Record<ModeVideoKey, string> = {
    standard: standardVideo,
    "boss-rush": bossRushVideo,
    "battle-royale": battleRoyaleVideo,
};

// Last playback position per video, kept at module scope so it survives the
// component unmounting on tab switches and the <video> remounting on track
// change — without it every return to the Start tab restarts the clip at 0.
const videoPositions = new Map<ModeVideoKey, number>();

const LAUNCH_ACCENT = "#22d3ee";
const STOP_ACCENT = "#ff5a5a";
const CANVAS = "#0a0b10";

const STREAM_RAIL: Record<string, string> = {
    stderr: "#ff5a5a",
    system: "#22d3ee",
    stdout: "transparent",
};

type LaunchBackdropProps = {
    showVideo: boolean;
    videoSrc: string;
    videoKey: ModeVideoKey;
    videoPaused: boolean;
    imageUrl?: string;
    imageKey?: string;
    reduceMotion: boolean;
};

// Isolated, memoized so unrelated parent state (e.g. the Switch-instance modal)
// never re-renders or re-animates the full-bleed <video>. The video uses a plain
// ref + a keyed remount with a CSS fade rather than AnimatePresence, which both
// removes the "ref is not a prop" warning and stops the entrance animation from
// replaying on every parent render.
const LaunchBackdrop = memo(function LaunchBackdrop({
    showVideo,
    videoSrc,
    videoKey,
    videoPaused,
    imageUrl,
    imageKey,
    reduceMotion,
}: LaunchBackdropProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        if (videoPaused) {
            v.pause();
        } else {
            // play() returns undefined in jsdom; only a real Promise has .catch.
            const playback = v.play();
            if (playback && typeof playback.catch === "function") playback.catch(() => undefined);
        }
    }, [videoPaused, videoKey]);

    return (
        <div className="absolute inset-0">
            {showVideo && videoSrc ? (
                <video
                    key={videoKey}
                    ref={videoRef}
                    src={videoSrc}
                    autoPlay={!videoPaused}
                    muted
                    loop
                    playsInline
                    onLoadedMetadata={e => {
                        // Resume from where this clip last played instead of
                        // restarting at 0 on remount (track switch / tab return).
                        // On first play-in-session, start at a random offset so
                        // every visit feels fresh rather than always at 0:00.
                        const saved = videoPositions.get(videoKey);
                        if (saved !== undefined && saved < e.currentTarget.duration) {
                            e.currentTarget.currentTime = saved;
                        } else if (e.currentTarget.duration > 5) {
                            e.currentTarget.currentTime =
                                Math.random() * (e.currentTarget.duration - 5);
                        }
                    }}
                    onTimeUpdate={e => videoPositions.set(videoKey, e.currentTarget.currentTime)}
                    className={cn("absolute inset-0 h-full w-full object-cover", !reduceMotion && "bap-fade-in")}
                />
            ) : imageUrl ? (
                <img
                    key={imageKey}
                    src={imageUrl}
                    alt=""
                    className={cn("h-full w-full object-cover", !reduceMotion && "bap-hero-drift bap-fade-in")}
                />
            ) : (
                <div className="h-full w-full bg-secondary" />
            )}
        </div>
    );
});

export function LaunchWorkspace() {
    const t = useT();
    const { data: instances } = useInstances();
    const { data: bundles = [] } = useBundles();
    const { data: runtime } = useRuntimeState();
    const { data: log } = useRuntimeLog();
    const { data: settings } = useSettings();
    const startLaunch = useStartLaunch();
    const stopLaunch = useStopLaunch();
    const setSetting = useSetSetting();
    const renameInstance = useRenameInstance();
    const removeInstance = useRemoveInstance();
    const setActiveWorkspace = useShellStore(s => s.setActiveWorkspace);
    const activeWorkspace = useShellStore(s => s.activeWorkspace);
    const openModsForInstance = useShellStore(s => s.openModsForInstance);
    const reduceMotion = useReducedMotion();

    const defaultProfileId = settings?.launchDefaultProfileId ?? null;
    const [selectedId, setSelectedId] = useState<string | null>(defaultProfileId);
    const [switcherOpen, setSwitcherOpen] = useState(false);
    const [switcherQuery, setSwitcherQuery] = useState("");
    /** Which row's gear menu is open in the switcher (instance id). */
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [renameDraft, setRenameDraft] = useState<{ id: string; name: string } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

    useEffect(() => {
        if (!selectedId && instances && instances.length > 0) {
            setSelectedId(defaultProfileId ?? instances[0].id);
        }
    }, [instances, defaultProfileId, selectedId]);

    // Drop a stale selection when the profile was deleted elsewhere (e.g.
    // from the Instances tab) so launch does not target a missing instance.
    useEffect(() => {
        if (!instances || !selectedId) {
            return;
        }
        if (instances.some(instance => instance.id === selectedId)) {
            return;
        }
        const fallback =
            (defaultProfileId && instances.some(instance => instance.id === defaultProfileId)
                ? defaultProfileId
                : instances[0]?.id) ?? null;
        setSelectedId(fallback);
    }, [instances, selectedId, defaultProfileId]);

    const status = runtime?.status ?? "idle";
    const isBusy = status === "launching" || status === "stopping";
    const isRunning = status === "running";
    const statusTone: StatusTone = isRunning ? "active" : isBusy ? "busy" : status === "failed" ? "error" : "idle";
    const selectedInstance = instances?.find(instance => instance.id === selectedId) ?? null;
    const selectedBundleNeedsUpdate = Boolean(
        selectedInstance?.instanceType === "bundle" &&
            selectedInstance.bundleId &&
            bundles.find(bundle => bundle.id === selectedInstance.bundleId)?.isUpdateAvailable,
    );

    // Background video, mapped to the selected instance's track. Honors the
    // launchAutoplayVideos setting and OS reduced-motion (both fall back to the
    // static cover image).
    const videoKey = resolveModeVideoKey(selectedInstance?.track);
    const videoSrc = MODE_VIDEOS[videoKey];
    const autoplayVideos = settings?.launchAutoplayVideos !== false;
    const showVideo = autoplayVideos && !reduceMotion;
    const [videoPaused, setVideoPaused] = useState(false);
    const workspaceActive = activeWorkspace === "launch";
    const effectiveVideoPaused = videoPaused || !workspaceActive;

    const logViewport = useRef<HTMLDivElement>(null);
    const [autoscroll, setAutoscroll] = useState(true);
    const [logExpanded, setLogExpanded] = useState(false);
    useEffect(() => {
        if (!autoscroll) return;
        const el = logViewport.current?.querySelector("[data-radix-scroll-area-viewport]");
        if (el) el.scrollTop = el.scrollHeight;
    }, [log, autoscroll]);

    // Surface live output automatically once a session is in flight,
    // and collapse it again when the game fully exits.
    useEffect(() => {
        if (isRunning || isBusy) setLogExpanded(true);
        else if (!status.includes("launch") && !status.includes("stop")) setLogExpanded(false);
    }, [isRunning, isBusy, status]);

    const lineCount = log?.length ?? 0;

    function scrollToBottom() {
        const el = logViewport.current?.querySelector("[data-radix-scroll-area-viewport]");
        if (el) el.scrollTop = el.scrollHeight;
        setAutoscroll(true);
    }

    function copyLog() {
        const text = (log ?? []).map(e => e.message).join("\n");
        if (text) void navigator.clipboard?.writeText(text);
    }

    function handleLaunch() {
        if (!selectedId) return;
        startLaunch.mutate({
            instanceId: selectedId,
            showMelonConsole: settings?.launchShowMelonConsole ?? false,
        });
    }

    const runtimeLabel = useMemo(() => getLaunchRuntimeLabel(runtime ?? { status: "idle" }), [runtime]);

    if (instances && instances.length === 0) {
        return (
            <div className="flex h-full flex-col overflow-hidden px-8 pb-8 pt-16">
                <SectionHeading eyebrow={t("launch.eyebrow")} subtitle={t("launch.subtitle")}>
                    {t("launch.heading")}
                </SectionHeading>
                <div className="flex min-h-0 flex-1 items-center justify-center">
                    <BapCard className="flex max-w-md flex-col items-center gap-4 p-10 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-secondary">
                            <Boxes size={26} className="text-muted-foreground" />
                        </div>
                        <div>
                            <h2 className="font-display text-lg text-foreground">{t("launch.emptyStateHeading")}</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {t("launch.emptyStateDescription")}
                            </p>
                        </div>
                        <BapButton onClick={() => setActiveWorkspace("instances")} icon={Boxes} showChevron={false}>
                            {t("launch.goToInstancesButton")}
                        </BapButton>
                    </BapCard>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col overflow-hidden">
            {/* Cinematic launch stage */}
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                {/* Full-bleed background — cross-fading mode video, or static cover
                    art when autoplay is off / reduced-motion is set. Isolated in a
                    memoized child so opening the Switch-instance modal (parent state)
                    doesn't re-render or re-animate the video. */}
                <LaunchBackdrop
                    showVideo={showVideo}
                    videoSrc={videoSrc}
                    videoKey={videoKey}
                    videoPaused={effectiveVideoPaused}
                    imageUrl={selectedInstance?.imageUrl}
                    imageKey={selectedInstance?.id}
                    reduceMotion={Boolean(reduceMotion)}
                />
                {/* Directional + bottom scrim that dissolves into the canvas (no glow) */}
                <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                        background: `linear-gradient(180deg, rgba(10,11,16,.55) 0%, rgba(10,11,16,.12) 30%, rgba(10,11,16,.78) 76%, ${CANVAS} 100%)`,
                    }}
                />
                <div
                    className="pointer-events-none absolute inset-0"
                    style={{ background: "linear-gradient(90deg, rgba(10,11,16,.85) 0%, rgba(10,11,16,.4) 42%, transparent 76%)" }}
                />
                <div className="bap-grain pointer-events-none absolute inset-0" />
                <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 140px -40px rgba(0,0,0,.7)" }} />

                {showVideo && videoSrc && (
                    <button
                        onClick={() => setVideoPaused(p => !p)}
                        className="focus-ring absolute right-6 bottom-6 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/40 text-foreground backdrop-blur transition-colors hover:border-accent/60 hover:bg-black/55"
                        title={videoPaused ? t("launch.playBackgroundVideo") : t("launch.pauseBackgroundVideo")}
                        aria-label={videoPaused ? t("launch.playBackgroundVideo") : t("launch.pauseBackgroundVideo")}
                    >
                        {videoPaused ? <Play size={15} className="translate-x-0.5" /> : <Pause size={15} />}
                    </button>
                )}

                {/* Foreground content */}
                <div className="relative z-10 flex min-h-0 flex-1 flex-col px-8 pb-7 pt-16">
                    {/* Live status */}
                    {status !== "idle" && (
                        <div className="flex items-start justify-end gap-3">
                            <StatusChip
                                tone={statusTone}
                                label={runtimeLabel}
                                pulse={isRunning || isBusy}
                                className="shrink-0"
                            />
                        </div>
                    )}

                    <div className="flex-1" />

                    {/* Hero identity + primary action */}
                    <div className="flex max-w-[920px] flex-col gap-5 pb-8">
                        <div className="flex flex-col gap-1.5">
                            <h1 className="font-display text-[clamp(3.25rem,7vw,6.5rem)] uppercase leading-[0.9] text-foreground">
                                {selectedInstance?.profileName ?? "Select a profile"}
                            </h1>
                            <span className="font-mono text-sm text-muted-foreground">
                                {selectedInstance?.instanceType === "bundle"
                                    ? (selectedInstance.bundleVersion || selectedInstance.version || selectedInstance.gameVersion)
                                    : selectedInstance?.versionId}
                            </span>
                        </div>

                        {selectedInstance?.melonLoaderFirstRunPending && (
                            <div className="flex w-fit gap-2 rounded-[0.625rem] border border-gold/35 bg-gold/10 p-2 text-xs leading-relaxed text-gold">
                                <Clock3 size={14} className="mt-0.5 shrink-0" />
                                <span>{t("launch.melonLoaderWarning")}</span>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-4">
                            {isRunning || isBusy ? (
                                <BapButton
                                    onClick={() => stopLaunch.mutate()}
                                    icon={Square}
                                    accentColor={STOP_ACCENT}
                                    showChevron={false}
                                    disabled={status !== "running"}
                                    size="xl"
                                >
                                    {t("launch.stopButton")}
                                </BapButton>
                            ) : selectedBundleNeedsUpdate ? (
                                <BapButton
                                    onClick={() => setActiveWorkspace("instances")}
                                    icon={RefreshCw}
                                    accentColor={LAUNCH_ACCENT}
                                    showChevron={false}
                                    disabled={!selectedId}
                                    size="xl"
                                    magnetic
                                    glow
                                >
                                    {t("instances.updateButton")}
                                </BapButton>
                            ) : (
                                <BapButton
                                    onClick={handleLaunch}
                                    icon={Play}
                                    accentColor={LAUNCH_ACCENT}
                                    showChevron={false}
                                    disabled={!selectedId}
                                    size="xl"
                                    magnetic
                                    glow
                                >
                                    {t("launch.launchButton")}
                                </BapButton>
                            )}
                            {selectedInstance?.officialTrack === "boss-rush" && (
                                <BapButton
                                    onClick={() => {
                                        api.shell.openExternal("https://www.speedrun.com/BAPBAP").catch(() => window.open("https://www.speedrun.com/BAPBAP", "_blank"));
                                    }}
                                    icon={Trophy}
                                    accentColor="#22c55e"
                                    showChevron={false}
                                    size="xl"
                                    magnetic
                                    glow
                                >
                                    {t("launch.leaderboardButton")}
                                </BapButton>
                            )}
                            {selectedId && defaultProfileId !== selectedId && (
                                <button
                                    onClick={() =>
                                        setSetting.mutate({ key: "launchDefaultProfileId", value: selectedId })
                                    }
                                    className="focus-ring flex items-center gap-1.5 text-sm text-muted-foreground hover:text-accent"
                                >
                                    <Star size={13} /> {t("launch.setDefaultProfileButton")}
                                </button>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={() => setSwitcherOpen(true)}
                                className="focus-ring flex items-center gap-2 rounded-full border border-border bg-card/90 px-5 py-3 text-base text-foreground transition-colors hover:border-accent/60"
                            >
                                <ArrowLeftRight size={16} /> {t("launch.switchInstanceButton")}
                            </button>
                            {selectedId && selectedInstance?.instanceType !== "bundle" && (
                                <button
                                    onClick={() => openModsForInstance(selectedId)}
                                    className="focus-ring flex items-center gap-2 rounded-full border border-border bg-card/90 px-5 py-3 text-base text-foreground transition-colors hover:border-accent/60"
                                >
                                    <Package size={14} /> {t("launch.addModsButton")}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Runtime log dock (collapsible) */}
            <div className="shrink-0 border-t border-border bg-popover">
                <div className="flex items-center gap-2 px-4 py-2.5">
                    <button
                        onClick={() => setLogExpanded(v => !v)}
                        className="focus-ring flex flex-1 items-center gap-2 text-left"
                        aria-expanded={logExpanded}
                    >
                        <Terminal size={15} className="text-accent" />
                        <span className="font-display text-xs text-foreground">{t("launch.runtimeLogLabel")}</span>
                        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
                            {lineCount} {lineCount === 1 ? t("launch.lineSingular") : t("launch.linePlural")}
                        </span>
                    </button>
                    <div className="flex items-center gap-1">
                        {logExpanded && (
                            <>
                                <button
                                    onClick={() => setAutoscroll(v => !v)}
                                    className={cn(
                                        "focus-ring rounded-md px-2 py-1 font-mono text-[0.6rem] uppercase tracking-wide transition-colors",
                                        autoscroll ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground"
                                    )}
                                    title="Toggle autoscroll"
                                >
                                    {t("launch.autoButton")}
                                </button>
                                <button
                                    onClick={copyLog}
                                    className="focus-ring rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                                    title={t("launch.copyLogButton")}
                                    aria-label={t("launch.copyLogButton")}
                                >
                                    <Copy size={14} />
                                </button>
                            </>
                        )}
                        <button
                            onClick={() => setLogExpanded(v => !v)}
                            className="focus-ring rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                            aria-label={logExpanded ? t("launch.collapseRuntimeLog") : t("launch.expandRuntimeLog")}
                        >
                            {logExpanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                        </button>
                    </div>
                </div>

                <AnimatePresence initial={false}>
                    {logExpanded && (
                        <motion.div
                            key="runtime-log"
                            className="relative overflow-hidden border-t border-border"
                            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                            animate={reduceMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }}
                            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                            transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <ScrollArea ref={logViewport} className="h-[clamp(160px,32vh,320px)] bg-background">
                                <div className="p-4 font-mono text-[0.78rem] leading-[1.55] text-muted-foreground">
                                    {lineCount === 0 && <p className="text-muted-foreground">{t("launch.noOutput")}</p>}
                                    {log?.map(entry => (
                                        <div
                                            key={entry.id}
                                            className="flex gap-2 whitespace-pre-wrap py-px"
                                            style={{ borderLeft: `2px solid ${STREAM_RAIL[entry.stream] ?? "transparent"}`, paddingLeft: 8 }}
                                        >
                                            <span
                                                className={cn(
                                                    entry.stream === "stderr" && "text-destructive",
                                                    entry.stream === "system" && "text-cyan",
                                                    entry.stream === "stdout" && "text-foreground"
                                                )}
                                            >
                                                {entry.message}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                            {!autoscroll && (
                                <button
                                    onClick={scrollToBottom}
                                    className="focus-ring absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground shadow-soft-lg"
                                >
                                    <ArrowDownToLine size={14} /> {t("launch.jumpToLatest")}
                                </button>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <Dialog
                open={switcherOpen}
                onOpenChange={open => {
                    setSwitcherOpen(open);
                    if (!open) {
                        setMenuOpenId(null);
                        setSwitcherQuery("");
                    }
                }}
            >
                <DialogContent className="max-w-2xl sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{t("launch.switchInstanceButton")}</DialogTitle>
                    </DialogHeader>
                    {(instances?.length ?? 0) > 4 && (
                        <div className="relative">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={switcherQuery}
                                onChange={e => setSwitcherQuery(e.target.value)}
                                placeholder={t("launch.searchInstancesPlaceholder")}
                                aria-label={t("launch.searchInstancesAriaLabel")}
                                className="pl-9"
                                autoFocus
                            />
                        </div>
                    )}
                    <div className="-mx-1 flex max-h-[min(72vh,560px)] flex-col gap-1.5 overflow-auto px-1">
                        {(instances ?? [])
                            .filter(i => {
                                const q = switcherQuery.trim().toLowerCase();
                                return (
                                    !q ||
                                    i.profileName.toLowerCase().includes(q) ||
                                    (i.versionId ?? "").toLowerCase().includes(q)
                                );
                            })
                            .map(instance => {
                                const active = selectedId === instance.id;
                                const isDefault = defaultProfileId === instance.id;
                                const menuOpen = menuOpenId === instance.id;
                                return (
                                    <div
                                        key={instance.id}
                                        className={cn(
                                            "relative flex items-center gap-1 rounded-[0.625rem] border transition-colors",
                                            active
                                                ? "border-accent/50 bg-accent/10"
                                                : "border-border bg-card hover:bg-secondary"
                                        )}
                                    >
                                        {active && (
                                            <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" />
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedId(instance.id);
                                                setSwitcherOpen(false);
                                                setSwitcherQuery("");
                                                setMenuOpenId(null);
                                            }}
                                            className="focus-ring flex min-w-0 flex-1 items-center gap-3.5 rounded-[0.625rem] px-3.5 py-3 text-left"
                                        >
                                            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[0.625rem] border border-border bg-secondary">
                                                {instance.imageUrl ? (
                                                    <img
                                                        src={instance.imageUrl}
                                                        alt=""
                                                        className="h-full w-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="flex h-full w-full items-center justify-center">
                                                        <Boxes size={22} className="text-muted-foreground" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    {isDefault && (
                                                        <Star size={12} className="shrink-0 fill-gold text-gold" />
                                                    )}
                                                    <span className="truncate font-display text-[0.95rem] uppercase text-foreground">
                                                        {instance.profileName}
                                                    </span>
                                                </div>
                                                <span className="font-mono text-sm text-muted-foreground">
                                                    {instance.instanceType === "bundle"
                                                        ? instance.bundleVersion ||
                                                          instance.version ||
                                                          instance.gameVersion
                                                        : instance.versionId}
                                                </span>
                                            </div>
                                        </button>

                                        {/* Gear — rename / delete (right side) */}
                                        <div className="relative shrink-0 pr-1.5">
                                            <button
                                                type="button"
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    setMenuOpenId(prev =>
                                                        prev === instance.id ? null : instance.id
                                                    );
                                                }}
                                                className="focus-ring flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
                                                aria-label={`Manage ${instance.profileName}`}
                                                aria-expanded={menuOpen}
                                            >
                                                <Settings2 size={15} />
                                            </button>
                                            {menuOpen && (
                                                <div
                                                    className="absolute right-0 top-[calc(100%+4px)] z-20 min-w-[9.5rem] overflow-hidden rounded-[0.625rem] border border-border bg-popover py-1 shadow-soft-lg"
                                                    role="menu"
                                                >
                                                    <button
                                                        type="button"
                                                        role="menuitem"
                                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            setMenuOpenId(null);
                                                            setRenameDraft({
                                                                id: instance.id,
                                                                name: instance.profileName,
                                                            });
                                                        }}
                                                    >
                                                        <Pencil size={13} className="text-muted-foreground" />
                                                        {t("instances.renameProfileDialogTitle")}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        role="menuitem"
                                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            setMenuOpenId(null);
                                                            setConfirmDelete({
                                                                id: instance.id,
                                                                name: instance.profileName,
                                                            });
                                                        }}
                                                    >
                                                        <Trash2 size={13} />
                                                        {t("instances.deleteButton")}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                    <button
                        onClick={() => {
                            setSwitcherOpen(false);
                            setActiveWorkspace("instances");
                        }}
                        className="focus-ring flex items-center justify-center gap-1.5 rounded-[0.625rem] border border-dashed border-border py-2.5 text-sm text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
                    >
                        <Boxes size={14} /> {t("launch.newInstanceButton")}
                    </button>
                </DialogContent>
            </Dialog>

            {/* Rename from switcher gear */}
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
                                        renameInstance.mutate({
                                            instanceId: renameDraft.id,
                                            name: renameDraft.name.trim(),
                                        });
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
                                        renameInstance.mutate({
                                            instanceId: renameDraft.id,
                                            name: renameDraft.name.trim(),
                                        });
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

            {/* Delete from switcher gear */}
            <Dialog open={Boolean(confirmDelete)} onOpenChange={open => !open && setConfirmDelete(null)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>{t("instances.deleteProfileDialogTitle")}</DialogTitle>
                    </DialogHeader>
                    {confirmDelete && (
                        <div className="flex flex-col gap-4">
                            <p className="text-sm text-muted-foreground">
                                {t("instances.deleteConfirmationMessage", {
                                    profileName: confirmDelete.name,
                                })}
                            </p>
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
                                    {t("instances.cancelButton")}
                                </Button>
                                <Button
                                    variant="destructive"
                                    disabled={removeInstance.isPending}
                                    onClick={() => {
                                        const id = confirmDelete.id;
                                        removeInstance.mutate(id);
                                        if (selectedId === id) setSelectedId(null);
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
    );
}
