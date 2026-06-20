import type { RadioCollection, RadioResolvedTrack, RadioSetPlaybackStateInput, RadioState } from "../../shared/radio";

const MAX_HISTORY = 24;

type ShuffleParams = {
    tracks: RadioResolvedTrack[];
    poolTrackIds: string[];
    currentTrackId: string | null;
    historyTrackIds: string[];
    favoriteTrackIds: string[];
    random?: () => number;
};

export function resolveCollectionTrackIds(state: RadioState, collection = state.playback.collection): string[] {
    switch (collection.kind) {
        case "favorites": {
            const favoriteTrackIds = new Set(state.favoriteTrackIds);
            return state.tracks
                .filter(track => favoriteTrackIds.has(track.id))
                .map(track => track.id);
        }
        case "playlist": {
            const playlist = state.playlists.find(item => item.id === collection.playlistId);
            return playlist?.trackIds || [];
        }
        case "all-tracks":
        default:
            return state.tracks.map(track => track.id);
    }
}

export function pickSmartShuffleTrack(params: ShuffleParams): string | null {
    const {
        tracks,
        poolTrackIds,
        currentTrackId,
        historyTrackIds,
        favoriteTrackIds,
        random = Math.random,
    } = params;
    const trackMap = new Map(tracks.map(track => [track.id, track]));
    const uniquePool = Array.from(new Set(poolTrackIds)).filter(trackId => trackMap.has(trackId));
    if (!uniquePool.length) {
        return null;
    }

    const recentTen = historyTrackIds.slice(-10);
    const recentThree = historyTrackIds.slice(-3);
    const recentTwo = historyTrackIds.slice(-2);

    let candidates = uniquePool.filter(trackId => trackId !== currentTrackId && !recentTen.includes(trackId));
    if (!candidates.length) {
        candidates = uniquePool.filter(trackId => trackId !== currentTrackId);
    }
    if (!candidates.length) {
        candidates = uniquePool;
    }

    const favoriteTrackIdsSet = new Set(favoriteTrackIds);
    const weighted = candidates.map(trackId => {
        const track = trackMap.get(trackId)!;
        let weight = Math.max(0.08, track.shuffleWeight ?? 1);
        if (favoriteTrackIdsSet.has(trackId)) {
            weight *= 1.12;
        }
        if (sharesAlbumCluster(track, recentThree, trackMap)) {
            weight *= 0.18;
        }
        if (sharesArtistCluster(track, recentTwo, trackMap)) {
            weight *= 0.44;
        }
        return { trackId, weight };
    });

    const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) {
        return weighted[0]?.trackId || null;
    }

    let cursor = random() * totalWeight;
    for (const entry of weighted) {
        cursor -= entry.weight;
        if (cursor <= 0) {
            return entry.trackId;
        }
    }

    return weighted[weighted.length - 1]?.trackId || null;
}

function sharesAlbumCluster(track: RadioResolvedTrack, recentTrackIds: string[], trackMap: Map<string, RadioResolvedTrack>): boolean {
    const leftGroup = normalize(track.group || track.album);
    if (!leftGroup) {
        return false;
    }
    return recentTrackIds.some(trackId => normalize(trackMap.get(trackId)?.group || trackMap.get(trackId)?.album) === leftGroup);
}

function sharesArtistCluster(track: RadioResolvedTrack, recentTrackIds: string[], trackMap: Map<string, RadioResolvedTrack>): boolean {
    const leftArtists = new Set((track.artists || []).map(normalize).filter(Boolean));
    if (!leftArtists.size) {
        return false;
    }
    return recentTrackIds.some(trackId => {
        const rightTrack = trackMap.get(trackId);
        return (rightTrack?.artists || []).some(artist => leftArtists.has(normalize(artist)));
    });
}

function normalize(value?: string | null): string {
    return String(value || "").trim().toLowerCase();
}

export function buildNextTrackId(state: RadioState): string | null {
    if (state.playback.queueTrackIds.length > 0) {
        return state.playback.queueTrackIds[0] || null;
    }

    const poolTrackIds = resolveCollectionTrackIds(state);
    if (!poolTrackIds.length) {
        return null;
    }

    if (!state.playback.shuffleEnabled) {
        const currentIndex = poolTrackIds.findIndex(trackId => trackId === state.playback.currentTrackId);
        if (currentIndex === -1) {
            return poolTrackIds[0];
        }
        return poolTrackIds[(currentIndex + 1) % poolTrackIds.length] || null;
    }

    return pickSmartShuffleTrack({
        tracks: state.tracks,
        poolTrackIds,
        currentTrackId: state.playback.currentTrackId,
        historyTrackIds: state.playback.historyTrackIds,
        favoriteTrackIds: state.favoriteTrackIds,
    });
}

/**
 * Full playback delta for advancing to the next track: consumes the queue head
 * (so an enqueued track plays once, not forever) and pushes the outgoing track
 * onto history (so smart-shuffle repeat-avoidance and Previous have data).
 */
export function buildAdvancePlayback(state: RadioState): RadioSetPlaybackStateInput | null {
    const nextId = buildNextTrackId(state);
    if (!nextId) {
        return null;
    }
    const { currentTrackId, queueTrackIds, historyTrackIds } = state.playback;
    const consumedFromQueue = queueTrackIds.length > 0 && queueTrackIds[0] === nextId;
    const nextQueue = consumedFromQueue ? queueTrackIds.slice(1) : queueTrackIds;
    const nextHistory = currentTrackId
        ? [...historyTrackIds, currentTrackId].slice(-MAX_HISTORY)
        : historyTrackIds;
    return {
        currentTrackId: nextId,
        currentTimeMs: 0,
        isPlaying: true,
        queueTrackIds: nextQueue,
        historyTrackIds: nextHistory,
    };
}

/**
 * Full playback delta for stepping back: pops the most recent history entry and
 * plays it. Returns null when there is nothing to go back to.
 */
export function buildPreviousPlayback(state: RadioState): RadioSetPlaybackStateInput | null {
    const history = state.playback.historyTrackIds;
    if (!history.length) {
        return null;
    }
    return {
        currentTrackId: history[history.length - 1],
        currentTimeMs: 0,
        isPlaying: true,
        historyTrackIds: history.slice(0, -1),
    };
}

/**
 * Full playback delta for a direct (manual) track selection. Keeps the queue
 * intact — clicking a track in the list does not consume the queue — but pushes
 * the outgoing track onto history so Previous works after manual selection.
 */
export function buildPlayTrackPlayback(state: RadioState, trackId: string): RadioSetPlaybackStateInput {
    const { currentTrackId, historyTrackIds } = state.playback;
    const nextHistory =
        currentTrackId && currentTrackId !== trackId
            ? [...historyTrackIds, currentTrackId].slice(-MAX_HISTORY)
            : historyTrackIds;
    return {
        currentTrackId: trackId,
        currentTimeMs: 0,
        isPlaying: true,
        historyTrackIds: nextHistory,
    };
}

export function describeCollection(collection: RadioCollection, state: RadioState): string {
    switch (collection.kind) {
        case "favorites":
            return "Favorites";
        case "playlist":
            return state.playlists.find(item => item.id === collection.playlistId)?.name || "Playlist";
        case "all-tracks":
        default:
            return "All tracks";
    }
}
