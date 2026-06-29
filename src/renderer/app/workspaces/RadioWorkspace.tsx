import { Play, Pause, SkipForward, SkipBack, Heart, RefreshCw, ListPlus, X, ListMusic, Plus, Music, Shuffle, Repeat, Repeat1, Volume2, VolumeX, Pencil, Check, Radio } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { SectionHeading } from "../../components/brand/SectionHeading";
import { BapCard } from "../../components/brand/BapCard";
import { Row } from "../../components/brand/Row";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ScrollArea } from "../../components/ui/scroll-area";
import { useRadioPlayerStore } from "../stores/useRadioPlayerStore";
import { cn } from "../lib/utils";
import {
    useRadioState,
    useSetRadioPlayback,
    useToggleFavorite,
    useSyncRadio,
    useEnqueueTrack,
    useRemoveFromQueue,
    useClearQueue,
    useCreatePlaylist,
    useDeletePlaylist,
    useRenamePlaylist,
    useSetPlaylistTracks,
} from "../query/hooks";
import { buildAdvancePlayback, buildPreviousPlayback, buildPlayTrackPlayback, resolveCollectionTrackIds } from "../../helpers/radio-shuffle";
import type { RadioCollection, RadioPlaylist } from "../../../shared/radio";

function AddToPlaylistMenu({
    playlists,
    pos,
    onAdd,
    onCreate,
    onClose,
}: {
    playlists: RadioPlaylist[];
    pos: { x: number; y: number };
    onAdd: (playlistId: string) => void;
    onCreate: (name: string) => void;
    onClose: () => void;
}) {
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState("");
    return (
        <>
            <div className="fixed inset-0 z-40" onClick={onClose} />
            <div
                className="fixed z-50 w-48 rounded-lg border border-border bg-popover p-1 shadow-soft-lg"
                style={{ left: pos.x, top: pos.y }}
                role="menu"
            >
                <p className="px-2 py-1 font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
                    Add to playlist
                </p>
                {playlists.length === 0 && !creating && (
                    <p className="px-2 py-1 text-xs text-muted-foreground">No playlists yet</p>
                )}
                {playlists.map(pl => (
                    <button
                        key={pl.id}
                        onClick={() => onAdd(pl.id)}
                        className="focus-ring flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                    >
                        <ListMusic size={13} className="shrink-0 text-muted-foreground" />
                        <span className="truncate">{pl.name}</span>
                    </button>
                ))}
                <div className="my-1 h-px bg-border" />
                {creating ? (
                    <Input
                        autoFocus
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === "Enter") {
                                const n = name.trim();
                                if (n) onCreate(n);
                            }
                            if (e.key === "Escape") {
                                setName("");
                                setCreating(false);
                            }
                        }}
                        placeholder="New playlist…"
                        className="h-7 text-xs"
                    />
                ) : (
                    <button
                        onClick={() => setCreating(true)}
                        className="focus-ring flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <Plus size={13} className="shrink-0" /> New playlist…
                    </button>
                )}
            </div>
        </>
    );
}

function CollectionChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "focus-ring flex items-center gap-1 rounded-full border px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.1em] transition-all duration-200 ease-pop",
                active ? "border-accent bg-accent/12 text-foreground" : "border-border bg-popover text-muted-foreground hover:border-white/20 hover:text-foreground"
            )}
        >
            <ListMusic size={12} className={active ? "text-accent" : ""} />
            {label}
        </button>
    );
}

function Equalizer({ playing }: { playing: boolean }) {
    return (
        <div className="flex h-4 items-end gap-0.5" aria-hidden>
            {[0, 1, 2, 3].map(i => (
                <span
                    key={i}
                    className={cn("w-0.5 rounded-full bg-accent", playing ? "bap-eq-bar" : "")}
                    style={{
                        height: playing ? undefined : "30%",
                        animationDelay: `${i * 0.15}s`,
                    }}
                />
            ))}
        </div>
    );
}

function formatTime(seconds: number): string {
    const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function formatSyncTime(value?: string): string {
    if (!value) return "Never synced";
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return "Sync time unknown";
    return `Synced ${d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
}

function syncStatusLabel(status: string): string {
    switch (status) {
        case "syncing":
            return "Syncing";
        case "ready":
            return "Ready";
        case "error":
            return "Sync error";
        case "unconfigured":
            return "Not configured";
        default:
            return "Idle";
    }
}

function SeekBar({ durationSeconds }: { durationSeconds: number }) {
    const positionSeconds = useRadioPlayerStore(s => s.positionSeconds);
    const seekHandler = useRadioPlayerStore(s => s.seekHandler);
    const trackRef = useRef<HTMLDivElement>(null);
    const [scrub, setScrub] = useState<number | null>(null);

    const duration = durationSeconds > 0 ? durationSeconds : 0;
    const display = scrub ?? positionSeconds;
    const pct = duration > 0 ? Math.min(100, (display / duration) * 100) : 0;

    function secondsFromEvent(e: React.PointerEvent): number {
        const el = trackRef.current;
        if (!el || duration <= 0) return 0;
        const rect = el.getBoundingClientRect();
        const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        return frac * duration;
    }

    return (
        <div className="flex items-center gap-3">
            <span className="w-9 shrink-0 text-right font-mono text-xs text-muted-foreground">{formatTime(display)}</span>
            <div
                ref={trackRef}
                role="slider"
                aria-label="Seek"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration)}
                aria-valuenow={Math.round(display)}
                tabIndex={duration > 0 ? 0 : -1}
                className="group relative h-1 flex-1 cursor-pointer rounded-full bg-[var(--surface-inset)]"
                onPointerDown={e => {
                    if (duration <= 0) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setScrub(secondsFromEvent(e));
                }}
                onPointerMove={e => {
                    if (scrub === null) return;
                    setScrub(secondsFromEvent(e));
                }}
                onPointerUp={e => {
                    if (scrub === null) return;
                    seekHandler?.(secondsFromEvent(e));
                    setScrub(null);
                }}
                onKeyDown={e => {
                    if (duration <= 0) return;
                    if (e.key === "ArrowRight") seekHandler?.(Math.min(duration, positionSeconds + 5));
                    else if (e.key === "ArrowLeft") seekHandler?.(Math.max(0, positionSeconds - 5));
                }}
            >
                <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${pct}%` }} />
                <div
                    className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground transition-opacity duration-150"
                    style={{ left: `${pct}%`, opacity: scrub !== null ? 1 : undefined }}
                />
            </div>
            <span className="w-9 shrink-0 font-mono text-xs text-muted-foreground">{formatTime(duration)}</span>
        </div>
    );
}

function NowPlayingStage({
    title,
    artist,
    art,
    kicker,
    isPlaying,
    durationSeconds,
    canPlay,
    shuffleEnabled,
    loopMode,
    volume,
    muted,
    audioError,
    onTogglePlay,
    onPrev,
    onNext,
    onToggleShuffle,
    onCycleLoop,
    onVolume,
    onToggleMute,
}: {
    title: string;
    artist: string;
    art?: string;
    kicker: string;
    isPlaying: boolean;
    durationSeconds: number;
    canPlay: boolean;
    shuffleEnabled: boolean;
    loopMode: "off" | "all" | "one";
    volume: number;
    muted: boolean;
    audioError: string | null;
    onTogglePlay: () => void;
    onPrev: () => void;
    onNext: () => void;
    onToggleShuffle: () => void;
    onCycleLoop: () => void;
    onVolume: (v: number) => void;
    onToggleMute: () => void;
}) {
    const [artFailed, setArtFailed] = useState(false);
    const showArt = art && !artFailed;

    return (
        <div className="bap-grain relative mb-4 shrink-0 overflow-hidden rounded-[1.125rem] border border-border bg-card">
            {/* Blurred art backdrop */}
            <div className="absolute inset-0">
                {showArt ? (
                    <img src={art} alt="" className="h-full w-full object-cover" style={{ filter: "blur(36px) saturate(1.3) brightness(0.9)", transform: "scale(1.12)" }} />
                ) : (
                    <div className="h-full w-full" style={{ background: "linear-gradient(120deg, color-mix(in oklab, var(--accent) 22%, var(--card)) 0%, var(--surface-inset) 60%, var(--card) 100%)" }} />
                )}
            </div>
            <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,11,16,0.18) 0%, rgba(10,11,16,0.42) 100%)" }} />
            <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 100px -50px rgba(0,0,0,0.5)" }} />

            <div className="relative z-10 flex flex-col gap-5 p-6 sm:flex-row sm:items-stretch">
                {/* Crisp album art with spine */}
                <div
                    className="bap-spine relative shrink-0 self-center overflow-hidden rounded-[14px] border border-border sm:self-auto"
                    style={{ width: "clamp(150px, 18vw, 220px)", aspectRatio: "1 / 1" }}
                >
                    {showArt ? (
                        <img src={art} alt="" onError={() => setArtFailed(true)} className="h-full w-full object-cover" />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[var(--surface-inset)]">
                            <Music size={40} className="text-muted-foreground" />
                        </div>
                    )}
                </div>

                {/* Copy + controls */}
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
                    <div className="flex flex-col gap-1">
                        <span className="font-display text-[0.6875rem] uppercase tracking-[0.16em] text-accent">{kicker}</span>
                        <h2 className="line-clamp-2 font-display uppercase leading-[0.92] text-foreground" style={{ fontSize: "clamp(28px, 3.4vw, 48px)" }}>
                            {title}
                        </h2>
                        <p className="truncate text-sm text-muted-foreground sm:text-base">{artist}</p>
                    </div>

                    {audioError && (
                        <div className="rounded-[0.625rem] border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            <p className="font-display uppercase tracking-[0.12em]">Audio could not start</p>
                            <p className="mt-1 break-words font-mono text-[0.7rem] text-destructive/90">{audioError}</p>
                            <p className="mt-1 text-destructive/80">Try another track or sync the station again.</p>
                        </div>
                    )}

                    <SeekBar durationSeconds={durationSeconds} />

                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={onToggleShuffle}
                                title="Shuffle"
                                aria-label="Toggle shuffle"
                                aria-pressed={shuffleEnabled}
                                className={cn(
                                    "focus-ring flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                                    shuffleEnabled ? "text-cyan" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <Shuffle size={17} />
                            </button>
                            <button
                                onClick={onPrev}
                                title="Previous"
                                aria-label="Previous track"
                                className="focus-ring flex h-10 w-10 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-accent/60"
                            >
                                <SkipBack size={18} />
                            </button>
                            <button
                                onClick={onTogglePlay}
                                disabled={!canPlay}
                                title={isPlaying ? "Pause" : "Play"}
                                aria-label={isPlaying ? "Pause" : "Play"}
                                className="focus-ring flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-foreground transition-transform duration-150 ease-pop hover:scale-[1.04] active:scale-95 disabled:opacity-50"
                            >
                                {isPlaying ? <Pause size={26} /> : <Play size={26} className="translate-x-0.5" />}
                            </button>
                            <button
                                onClick={onNext}
                                title="Next"
                                aria-label="Next track"
                                className="focus-ring flex h-10 w-10 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-accent/60"
                            >
                                <SkipForward size={18} />
                            </button>
                            <button
                                onClick={onCycleLoop}
                                title={`Loop: ${loopMode}`}
                                aria-label="Cycle loop mode"
                                aria-pressed={loopMode !== "off"}
                                className={cn(
                                    "focus-ring flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                                    loopMode !== "off" ? "text-cyan" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {loopMode === "one" ? <Repeat1 size={17} /> : <Repeat size={17} />}
                            </button>
                        </div>

                        <div className="ml-auto flex items-center gap-2">
                            <button
                                onClick={onToggleMute}
                                title={muted ? "Unmute" : "Mute"}
                                aria-label={muted ? "Unmute" : "Mute"}
                                className="focus-ring flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                            >
                                {muted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
                            </button>
                            <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.01}
                                value={muted ? 0 : volume}
                                onChange={e => onVolume(Number(e.target.value))}
                                aria-label="Volume"
                                className="h-1 w-24 cursor-pointer accent-[#e91e8c]"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function RadioWorkspace() {
    const { data: radio, isLoading, isError, error, refetch, isFetching } = useRadioState();
    const audioError = useRadioPlayerStore(s => s.errorMessage);
    const setPlayback = useSetRadioPlayback();
    const toggleFavorite = useToggleFavorite();
    const syncRadio = useSyncRadio();
    const enqueueTrack = useEnqueueTrack();
    const removeFromQueue = useRemoveFromQueue();
    const clearQueue = useClearQueue();
    const createPlaylist = useCreatePlaylist();
    const deletePlaylist = useDeletePlaylist();
    const renamePlaylist = useRenamePlaylist();
    const setPlaylistTracks = useSetPlaylistTracks();
    const [creatingPlaylist, setCreatingPlaylist] = useState(false);
    const [playlistName, setPlaylistName] = useState("");
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [addToPlaylist, setAddToPlaylist] = useState<{ trackId: string; x: number; y: number } | null>(null);

    if (isLoading) {
        return (
            <div className="p-8">
                <p className="text-sm text-muted-foreground">Loading station…</p>
            </div>
        );
    }

    if (isError || !radio) {
        const message = error instanceof Error ? error.message : "The radio library could not be loaded.";
        return (
            <div className="bap-glow flex h-full items-center justify-center p-8">
                <BapCard className="flex max-w-md flex-col items-center gap-4 p-8 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary">
                        <Radio size={24} className="text-muted-foreground" />
                    </div>
                    <div>
                        <h2 className="font-display text-base uppercase text-foreground">Radio unavailable</h2>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                            The station state could not be loaded. Check the local radio data and try again.
                        </p>
                        <p className="mt-2 break-words font-mono text-xs text-destructive/90">{message}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
                        <RefreshCw size={14} className={cn(isFetching && "animate-spin")} /> Retry
                    </Button>
                </BapCard>
            </div>
        );
    }

    const { playback, tracks, favoriteTrackIds, playlists } = radio;
    const currentTrack = tracks.find(t => t.id === playback.currentTrackId) ?? null;
    const queueTracks = playback.queueTrackIds
        .map(id => tracks.find(t => t.id === id))
        .filter((t): t is (typeof tracks)[number] => Boolean(t));

    const collection = playback.collection;
    const visibleTrackIds = new Set(resolveCollectionTrackIds(radio, collection));
    const visibleTracks = collection.kind === "all-tracks" ? tracks : tracks.filter(t => visibleTrackIds.has(t.id));

    function selectCollection(next: RadioCollection) {
        setPlayback.mutate({ collection: next });
    }

    function submitCreatePlaylist() {
        const name = playlistName.trim();
        if (!name) {
            setCreatingPlaylist(false);
            return;
        }
        createPlaylist.mutate(name, {
            onSuccess: () => {
                setPlaylistName("");
                setCreatingPlaylist(false);
            },
        });
    }

    function submitRenamePlaylist(id: string) {
        const name = renameValue.trim();
        if (!name) {
            setRenamingId(null);
            return;
        }
        renamePlaylist.mutate({ id, name }, { onSuccess: () => setRenamingId(null) });
    }

    function playTrack(trackId: string) {
        setPlayback.mutate(buildPlayTrackPlayback(radio!, trackId));
    }

    function togglePlay() {
        if (!playback.currentTrackId) {
            const first = resolveCollectionTrackIds(radio!)[0] ?? tracks[0]?.id;
            if (first) playTrack(first);
            return;
        }
        setPlayback.mutate({ isPlaying: !playback.isPlaying });
    }

    function next() {
        const delta = buildAdvancePlayback(radio!);
        if (delta) setPlayback.mutate(delta);
    }

    function previous() {
        const delta = buildPreviousPlayback(radio!);
        if (delta) setPlayback.mutate(delta);
    }

    function cycleLoop() {
        const order: Array<"off" | "all" | "one"> = ["off", "all", "one"];
        const idx = order.indexOf(playback.loopMode);
        setPlayback.mutate({ loopMode: order[(idx + 1) % order.length] });
    }

    const stageTitle = currentTrack?.title ?? "Nothing playing";
    const stageArtist = currentTrack?.artists.length ? currentTrack.artists.join(", ") : "Pick a track to start the station";
    const sync = radio.sync;
    const syncProgress = sync.progressPercent ?? 0;
    const syncDetail = sync.status === "syncing"
        ? `${syncProgress}% · ${sync.availableTrackCount}/${sync.trackCount} tracks ready`
        : `${sync.availableTrackCount}/${sync.trackCount} tracks ready · ${formatSyncTime(sync.lastSyncedAtUtc)}`;

    return (
        <div className="bap-glow flex h-full flex-col overflow-hidden px-8 pb-8 pt-16">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <SectionHeading className="mb-0">
                        {sync.stationName}
                    </SectionHeading>
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[0.875rem] border border-border bg-card/85 px-3 py-2 text-xs text-muted-foreground">
                        <span className={cn(
                            "inline-flex items-center gap-1.5 font-display uppercase tracking-[0.12em]",
                            sync.status === "error" ? "text-destructive" : sync.status === "syncing" ? "text-accent" : "text-foreground"
                        )}>
                            <RefreshCw size={13} className={cn(sync.status === "syncing" && "animate-spin")} />
                            {syncStatusLabel(sync.status)}
                        </span>
                        <span className="h-3 w-px bg-border" />
                        <span className="font-mono">{syncDetail}</span>
                        {sync.error && <span className="break-words font-mono text-destructive">· {sync.error}</span>}
                    </div>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncRadio.mutate(false)}
                    disabled={syncRadio.isPending || sync.status === "syncing"}
                >
                    <RefreshCw size={14} className={cn(sync.status === "syncing" && "animate-spin")} /> Sync
                </Button>
            </div>

            {/* Stage + side list: cinematic two-column composition */}
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
                {/* Left column: now-playing stage */}
                <div className="flex min-h-0 flex-col justify-center">
                    <NowPlayingStage
                        title={stageTitle}
                        artist={stageArtist}
                        art={currentTrack?.artworkUrl ?? radio.sync.stationArtworkUrl}
                        kicker={playback.isPlaying ? "Now playing" : "Paused"}
                        isPlaying={playback.isPlaying}
                        durationSeconds={(currentTrack?.durationMs ?? 0) / 1000}
                        canPlay={tracks.length > 0}
                        shuffleEnabled={playback.shuffleEnabled}
                        loopMode={playback.loopMode}
                        volume={playback.volume}
                        muted={playback.muted}
                        audioError={audioError}
                        onTogglePlay={togglePlay}
                        onPrev={previous}
                        onNext={next}
                        onToggleShuffle={() => setPlayback.mutate({ shuffleEnabled: !playback.shuffleEnabled })}
                        onCycleLoop={cycleLoop}
                        onVolume={v => setPlayback.mutate({ volume: v, muted: false })}
                        onToggleMute={() => setPlayback.mutate({ muted: !playback.muted })}
                    />
                </div>

                {/* Right column: up-next queue (top) + scrollable track list (below) */}
                <div className="flex min-h-0 flex-col gap-4">
                    {/* Up next */}
                    {queueTracks.length > 0 && (
                        <BapCard className="flex max-h-[38%] shrink-0 flex-col overflow-hidden p-0">
                            <div className="flex items-center justify-between border-b border-border px-4 py-2">
                                <span className="font-display text-xs uppercase tracking-[0.12em] text-foreground">Up next ({queueTracks.length})</span>
                                <button
                                    onClick={() => clearQueue.mutate()}
                                    className="focus-ring rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                                >
                                    Clear
                                </button>
                            </div>
                            <ScrollArea className="min-h-0 flex-1">
                                <div className="flex flex-col gap-0.5 p-2">
                                    {queueTracks.map((track, index) => (
                                        <Row key={`${track.id}-${index}`} className="group py-1.5">
                                            <span className="font-mono text-[0.65rem] text-muted-foreground">{index + 1}</span>
                                            <span className="min-w-0 flex-1 truncate text-xs text-foreground">{track.title}</span>
                                            <button
                                                onClick={() => removeFromQueue.mutate(track.id)}
                                                className="focus-ring shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
                                                title="Remove from queue"
                                                aria-label="Remove from queue"
                                            >
                                                <X size={14} />
                                            </button>
                                        </Row>
                                    ))}
                                </div>
                            </ScrollArea>
                        </BapCard>
                    )}

                    {/* Tracks */}
                    <div className="flex min-h-0 flex-1 flex-col">
                        <span className="mb-2 font-display text-xs uppercase tracking-[0.16em] text-muted-foreground">Tracks</span>

                        {/* Collection switcher */}
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                            <CollectionChip
                                label="All tracks"
                                active={collection.kind === "all-tracks"}
                                onClick={() => selectCollection({ kind: "all-tracks" })}
                            />
                            <CollectionChip
                                label="Favorites"
                                active={collection.kind === "favorites"}
                                onClick={() => selectCollection({ kind: "favorites" })}
                            />
                            {playlists.map(pl =>
                                renamingId === pl.id ? (
                                    <Input
                                        key={pl.id}
                                        autoFocus
                                        value={renameValue}
                                        onChange={e => setRenameValue(e.target.value)}
                                        onBlur={() => submitRenamePlaylist(pl.id)}
                                        onKeyDown={e => {
                                            if (e.key === "Enter") submitRenamePlaylist(pl.id);
                                            if (e.key === "Escape") setRenamingId(null);
                                        }}
                                        placeholder="Playlist name…"
                                        className="h-8 w-40"
                                    />
                                ) : (
                                    <div key={pl.id} className="group/pl relative inline-flex items-center">
                                        <CollectionChip
                                            label={pl.name}
                                            active={collection.kind === "playlist" && collection.playlistId === pl.id}
                                            onClick={() => selectCollection({ kind: "playlist", playlistId: pl.id })}
                                        />
                                        <button
                                            onClick={e => {
                                                e.stopPropagation();
                                                setRenamingId(pl.id);
                                                setRenameValue(pl.name);
                                            }}
                                            className="focus-ring absolute -left-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-popover text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/pl:opacity-100"
                                            title={`Rename playlist ${pl.name}`}
                                            aria-label={`Rename playlist ${pl.name}`}
                                        >
                                            <Pencil size={9} />
                                        </button>
                                        <button
                                            onClick={e => {
                                                e.stopPropagation();
                                                deletePlaylist.mutate(pl.id);
                                            }}
                                            className="focus-ring absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-popover text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/pl:opacity-100"
                                            title={`Delete playlist ${pl.name}`}
                                            aria-label={`Delete playlist ${pl.name}`}
                                        >
                                            <X size={10} />
                                        </button>
                                    </div>
                                )
                            )}
                            {creatingPlaylist ? (
                                <Input
                                    autoFocus
                                    value={playlistName}
                                    onChange={e => setPlaylistName(e.target.value)}
                                    onBlur={submitCreatePlaylist}
                                    onKeyDown={e => {
                                        if (e.key === "Enter") submitCreatePlaylist();
                                        if (e.key === "Escape") {
                                            setPlaylistName("");
                                            setCreatingPlaylist(false);
                                        }
                                    }}
                                    placeholder="Playlist name…"
                                    className="h-8 w-40"
                                />
                            ) : (
                                <button
                                    onClick={() => setCreatingPlaylist(true)}
                                    className="focus-ring flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                    title="New playlist"
                                >
                                    <Plus size={13} /> Playlist
                                </button>
                            )}
                        </div>

                        {/* Track list */}
                        <ScrollArea className="min-h-0 flex-1">
                            <div className="flex flex-col gap-0.5 pr-2">
                                {visibleTracks.length === 0 && (
                                    <p className="text-sm text-muted-foreground">
                                        {tracks.length === 0
                                            ? "No tracks yet — sync the station to load the library."
                                            : "Nothing in this collection yet."}
                                    </p>
                                )}
                                {visibleTracks.map((track, index) => {
                                    const active = track.id === playback.currentTrackId;
                                    const fav = favoriteTrackIds.includes(track.id);
                                    return (
                                        <Row key={track.id} active={active} onClick={() => playTrack(track.id)} className="group">
                                            <div className="flex w-5 shrink-0 items-center justify-center">
                                                {active ? (
                                                    <Equalizer playing={playback.isPlaying} />
                                                ) : (
                                                    <span className="font-mono text-xs text-muted-foreground group-hover:hidden">
                                                        {index + 1}
                                                    </span>
                                                )}
                                                {!active && (
                                                    <Play size={14} className="hidden text-foreground group-hover:block" />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className={cn("truncate text-sm font-medium", active ? "text-accent" : "text-foreground")}>
                                                    {track.title}
                                                </p>
                                                {track.artists.length > 0 && (
                                                    <p className="truncate text-xs text-muted-foreground">{track.artists.join(", ")}</p>
                                                )}
                                            </div>
                                            {!track.availableOffline && (
                                                <span className="shrink-0 font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
                                                    not downloaded
                                                </span>
                                            )}
                                            <button
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    const r = e.currentTarget.getBoundingClientRect();
                                                    setAddToPlaylist({ trackId: track.id, x: r.right - 192, y: r.bottom + 4 });
                                                }}
                                                className="focus-ring shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-all hover:text-foreground group-hover:opacity-100"
                                                title="Add to playlist"
                                                aria-label="Add to playlist"
                                            >
                                                <Plus size={16} />
                                            </button>
                                            <button
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    enqueueTrack.mutate(track.id);
                                                }}
                                                className="focus-ring shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-all hover:text-foreground group-hover:opacity-100"
                                                title="Add to queue"
                                                aria-label="Add to queue"
                                            >
                                                <ListPlus size={16} />
                                            </button>
                                            <button
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    toggleFavorite.mutate(track.id);
                                                }}
                                                className={cn(
                                                    "focus-ring shrink-0 rounded p-1 transition-all hover:text-foreground",
                                                    fav ? "opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100"
                                                )}
                                                title={fav ? "Remove favorite" : "Add favorite"}
                                                aria-label={fav ? "Remove favorite" : "Add favorite"}
                                            >
                                                <Heart size={16} className={cn(fav && "fill-accent text-accent")} />
                                            </button>
                                        </Row>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            </div>

            {addToPlaylist && (
                <AddToPlaylistMenu
                    playlists={playlists}
                    pos={{ x: addToPlaylist.x, y: addToPlaylist.y }}
                    onAdd={playlistId => {
                        const pl = playlists.find(p => p.id === playlistId);
                        const next = Array.from(new Set([...(pl?.trackIds ?? []), addToPlaylist.trackId]));
                        setPlaylistTracks.mutate({ id: playlistId, trackIds: next });
                        setAddToPlaylist(null);
                    }}
                    onCreate={name => {
                        const trackId = addToPlaylist.trackId;
                        createPlaylist.mutate(name, {
                            onSuccess: pl => setPlaylistTracks.mutate({ id: pl.id, trackIds: [trackId] }),
                        });
                        setAddToPlaylist(null);
                    }}
                    onClose={() => setAddToPlaylist(null)}
                />
            )}
        </div>
    );
}
