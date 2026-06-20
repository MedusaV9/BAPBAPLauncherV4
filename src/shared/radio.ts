import type { RadioTrack } from "./manifest";

export type RadioCollection =
    | { kind: "all-tracks" }
    | { kind: "favorites" }
    | { kind: "playlist"; playlistId: string };

export type RadioLoopMode = "off" | "all" | "one";

export type RadioPlaylist = {
    id: string;
    name: string;
    trackIds: string[];
};

export type RadioTrackSource = "synced" | "local-import";

export type RadioResolvedTrack = RadioTrack & {
    artworkUrl?: string;
    playbackUrl?: string;
    availableOffline: boolean;
    source: RadioTrackSource;
    importedAtUtc?: string;
    localFilePath?: string;
};

export type RadioSyncStatus = "idle" | "syncing" | "ready" | "error" | "unconfigured";

export type RadioSyncState = {
    status: RadioSyncStatus;
    stationName: string;
    stationSubtitle?: string;
    stationArtworkUrl?: string;
    libraryVersion?: string;
    trackCount: number;
    availableTrackCount: number;
    storagePath?: string;
    importsPath?: string;
    importedTrackCount: number;
    lastSyncedAtUtc?: string;
    downloadedBytes?: number;
    totalBytes?: number;
    progressPercent?: number;
    error?: string;
};

export type RadioPlaybackState = {
    currentTrackId: string | null;
    isPlaying: boolean;
    currentTimeMs: number;
    volume: number;
    muted: boolean;
    crossfadeMs: number;
    autoplayOnLaunch: boolean;
    rememberPlaybackState: boolean;
    collection: RadioCollection;
    queueTrackIds: string[];
    historyTrackIds: string[];
    shuffleEnabled: boolean;
    loopMode: RadioLoopMode;
};

export type RadioState = {
    sync: RadioSyncState;
    tracks: RadioResolvedTrack[];
    playlists: RadioPlaylist[];
    favoriteTrackIds: string[];
    playback: RadioPlaybackState;
};

export type RadioSetPlaybackStateInput = Partial<RadioPlaybackState>;

export function createEmptyRadioState(): RadioState {
    return {
        sync: {
            status: "unconfigured",
            stationName: "BAPBAP Radio",
            stationSubtitle: "Soundtrack station",
            trackCount: 0,
            availableTrackCount: 0,
            importedTrackCount: 0,
        },
        tracks: [],
        playlists: [],
        favoriteTrackIds: [],
        playback: {
            currentTrackId: null,
            isPlaying: false,
            currentTimeMs: 0,
            volume: 0.72,
            muted: false,
            crossfadeMs: 2200,
            autoplayOnLaunch: false,
            rememberPlaybackState: true,
            collection: { kind: "all-tracks" },
            queueTrackIds: [],
            historyTrackIds: [],
            shuffleEnabled: true,
            loopMode: "all",
        },
    };
}
