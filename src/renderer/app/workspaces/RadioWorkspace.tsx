import { Play, Pause, SkipForward, SkipBack, Heart, RefreshCw, ListPlus, X, ListMusic, Plus } from "lucide-react";
import { useState } from "react";
import { SectionHeading } from "../../components/brand/SectionHeading";
import { BapCard } from "../../components/brand/BapCard";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ScrollArea } from "../../components/ui/scroll-area";
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
} from "../query/hooks";
import { buildNextTrackId, buildPreviousTrackId, resolveCollectionTrackIds } from "../../helpers/radio-shuffle";
import type { RadioCollection } from "../../../shared/radio";

function CollectionChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "focus-ring flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
        >
            <ListMusic size={12} className={active ? "text-accent" : ""} />
            {label}
        </button>
    );
}

export function RadioWorkspace() {
    const { data: radio, isLoading } = useRadioState();
    const setPlayback = useSetRadioPlayback();
    const toggleFavorite = useToggleFavorite();
    const syncRadio = useSyncRadio();
    const enqueueTrack = useEnqueueTrack();
    const removeFromQueue = useRemoveFromQueue();
    const clearQueue = useClearQueue();
    const createPlaylist = useCreatePlaylist();
    const [creatingPlaylist, setCreatingPlaylist] = useState(false);
    const [playlistName, setPlaylistName] = useState("");

    if (isLoading || !radio) {
        return (
            <div className="p-8">
                <p className="text-sm text-muted-foreground">Loading station…</p>
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

    function playTrack(trackId: string) {
        setPlayback.mutate({ currentTrackId: trackId, currentTimeMs: 0, isPlaying: true });
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
        const id = buildNextTrackId(radio!);
        if (id) playTrack(id);
    }

    function previous() {
        const id = buildPreviousTrackId(radio!);
        if (id) playTrack(id);
    }

    return (
        <div className="bap-glow flex h-full flex-col overflow-hidden p-8">
            <div className="mb-4 flex items-center justify-between gap-4">
                <SectionHeading eyebrow="Station" className="mb-0" subtitle={radio.sync.stationSubtitle ?? "Soundtrack station"}>
                    {radio.sync.stationName}
                </SectionHeading>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncRadio.mutate(false)}
                    disabled={syncRadio.isPending || radio.sync.status === "syncing"}
                >
                    <RefreshCw size={14} className={cn(radio.sync.status === "syncing" && "animate-spin")} /> Sync
                </Button>
            </div>

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
                {playlists.map(pl => (
                    <CollectionChip
                        key={pl.id}
                        label={pl.name}
                        active={collection.kind === "playlist" && collection.playlistId === pl.id}
                        onClick={() => selectCollection({ kind: "playlist", playlistId: pl.id })}
                    />
                ))}
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
                        className="focus-ring flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title="New playlist"
                    >
                        <Plus size={13} /> Playlist
                    </button>
                )}
            </div>

            {/* Track list */}
            <ScrollArea className="min-h-0 flex-1">
                <div className="flex flex-col gap-1 pr-2">
                    {visibleTracks.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                            {tracks.length === 0
                                ? "No tracks yet — sync the station to load the library."
                                : "Nothing in this collection yet."}
                        </p>
                    )}
                    {visibleTracks.map(track => {
                        const active = track.id === playback.currentTrackId;
                        const fav = favoriteTrackIds.includes(track.id);
                        return (
                            <div
                                key={track.id}
                                onClick={() => playTrack(track.id)}
                                className={cn(
                                    "focus-ring flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors",
                                    active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                                )}
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{track.title}</p>
                                    {track.artists.length > 0 && (
                                        <p className={cn("truncate text-xs", active ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                            {track.artists.join(", ")}
                                        </p>
                                    )}
                                </div>
                                {!track.availableOffline && (
                                    <span className={cn("text-xs", active ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                        not downloaded
                                    </span>
                                )}
                                <button
                                    onClick={e => {
                                        e.stopPropagation();
                                        enqueueTrack.mutate(track.id);
                                    }}
                                    className="focus-ring shrink-0 rounded p-1 transition-colors hover:bg-muted"
                                    title="Add to queue"
                                >
                                    <ListPlus
                                        size={16}
                                        className={active ? "text-primary-foreground/70" : "text-muted-foreground"}
                                    />
                                </button>
                                <button
                                    onClick={e => {
                                        e.stopPropagation();
                                        toggleFavorite.mutate(track.id);
                                    }}
                                    className="focus-ring shrink-0 rounded p-1 transition-colors hover:bg-muted"
                                    title={fav ? "Remove favorite" : "Add favorite"}
                                >
                                    <Heart
                                        size={16}
                                        className={cn(fav ? "fill-accent text-accent" : active ? "text-primary-foreground/70" : "text-muted-foreground")}
                                    />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </ScrollArea>

            {/* Queue */}
            {queueTracks.length > 0 && (
                <BapCard className="mt-4 flex max-h-44 flex-col overflow-hidden p-0">
                    <div className="flex items-center justify-between border-b border-border px-4 py-2">
                        <span className="font-display text-xs text-foreground">Up next ({queueTracks.length})</span>
                        <button
                            onClick={() => clearQueue.mutate()}
                            className="focus-ring rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                        >
                            Clear
                        </button>
                    </div>
                    <ScrollArea className="flex-1">
                        <div className="flex flex-col gap-1 p-2">
                            {queueTracks.map((track, index) => (
                                <div
                                    key={`${track.id}-${index}`}
                                    className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted"
                                >
                                    <span className="min-w-0 flex-1 truncate text-foreground">{track.title}</span>
                                    <button
                                        onClick={() => removeFromQueue.mutate(track.id)}
                                        className="focus-ring shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                                        title="Remove from queue"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </BapCard>
            )}

            {/* Player bar */}
            <BapCard className="mt-4 flex items-center gap-4 bg-popover p-4">
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                        {currentTrack ? (
                            <span className="text-gradient font-display">{currentTrack.title}</span>
                        ) : (
                            <span className="text-muted-foreground">Nothing playing</span>
                        )}
                    </p>
                    {currentTrack && currentTrack.artists.length > 0 && (
                        <p className="truncate text-xs text-muted-foreground">{currentTrack.artists.join(", ")}</p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={previous} title="Previous" className="text-foreground hover:bg-muted">
                        <SkipBack size={18} />
                    </Button>
                    <Button variant="default" size="icon" onClick={togglePlay} title={playback.isPlaying ? "Pause" : "Play"}>
                        {playback.isPlaying ? <Pause size={18} /> : <Play size={18} />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={next} title="Next" className="text-foreground hover:bg-muted">
                        <SkipForward size={18} />
                    </Button>
                </div>
            </BapCard>
        </div>
    );
}
