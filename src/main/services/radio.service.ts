import crypto from "node:crypto";
import fsSync from "node:fs";
import { createReadStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, URL } from "node:url";
import electron from "electron";
import Store from "electron-store";
import type { RadioManifest } from "../../shared/manifest";
import {
    createEmptyRadioState,
    type RadioCollection,
    type RadioLoopMode,
    type RadioPlaylist,
    type RadioResolvedTrack,
    type RadioSetPlaybackStateInput,
    type RadioState,
    type RadioSyncState,
} from "../../shared/radio";
import { ArchiveDownloadService } from "./archive-download.service";
import { ManifestClient } from "./manifest-client";
import { SettingsStoreService } from "./settings-store";

const { app } = electron;
const LEGACY_LOCAL_RADIO_IMPORT_DIR = path.join(app.getPath("downloads"), "font", "bapbap sound assets");
const SUPPORTED_AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"]);

type PersistedTrackFile = {
    audioPath?: string;
    audioSha256?: string;
    audioUrl?: string;
    artworkPath?: string;
    artworkUrl?: string;
    updatedAtUtc?: string;
};

type PersistedLocalImportTrack = {
    id: string;
    title: string;
    artists: string[];
    group?: string;
    durationMs: number;
    fileName: string;
    audioPath: string;
    audioSha256: string;
    importedAtUtc: string;
};

type PersistedPlayback = {
    currentTrackId: string | null;
    isPlaying: boolean;
    currentTimeMs: number;
    collection: RadioCollection;
    queueTrackIds: string[];
    historyTrackIds: string[];
    shuffleEnabled: boolean;
    loopMode: RadioLoopMode;
};

type RadioStoreSchema = {
    cachedManifest: RadioManifest | null;
    trackFiles: Record<string, PersistedTrackFile>;
    localImports: Record<string, PersistedLocalImportTrack>;
    stationArtworkPath: string | null;
    stationArtworkUrl: string | null;
    playlists: RadioPlaylist[];
    favoriteTrackIds: string[];
    playback: PersistedPlayback;
    lastSyncedAtUtc: string | null;
};

type SyncProgressState = Omit<
    RadioSyncState,
    "stationName" | "stationSubtitle" | "stationArtworkUrl" | "libraryVersion" | "trackCount" | "availableTrackCount" | "storagePath" | "importsPath" | "importedTrackCount"
>;

const DEFAULT_PLAYBACK: PersistedPlayback = {
    currentTrackId: null,
    isPlaying: false,
    currentTimeMs: 0,
    collection: { kind: "all-tracks" },
    queueTrackIds: [],
    historyTrackIds: [],
    shuffleEnabled: true,
    loopMode: "all",
};

export class RadioService {
    private readonly manifests: ManifestClient;
    private readonly downloader: ArchiveDownloadService;
    private readonly settings: SettingsStoreService;
    private readonly libraryRoot: string;
    private readonly audioRoot: string;
    private readonly artworkRoot: string;
    private readonly importsRoot: string;
    private readonly importAudioRoot: string;
    private readonly store: Store<RadioStoreSchema>;
    private readonly listeners = new Set<(state: RadioState) => void>();
    private currentState: RadioState;
    private syncState: SyncProgressState;
    private previewManifest: RadioManifest | null = null;

    constructor(manifests: ManifestClient, downloader: ArchiveDownloadService, settings: SettingsStoreService) {
        this.manifests = manifests;
        this.downloader = downloader;
        this.settings = settings;
        this.libraryRoot = path.join(app.getPath("userData"), "radio", "library");
        this.audioRoot = path.join(this.libraryRoot, "audio");
        this.artworkRoot = path.join(this.libraryRoot, "artwork");
        this.importsRoot = path.join(app.getPath("userData"), "radio", "imports");
        this.importAudioRoot = path.join(this.importsRoot, "audio");
        sanitizeStoreJsonFile(path.join(app.getPath("userData"), "bapbap-launcher-v2-radio.json"));
        this.store = new Store<RadioStoreSchema>({
            name: "bapbap-launcher-v2-radio",
            defaults: {
                cachedManifest: null,
                trackFiles: {},
                localImports: {},
                stationArtworkPath: null,
                stationArtworkUrl: null,
                playlists: [],
                favoriteTrackIds: [],
                playback: DEFAULT_PLAYBACK,
                lastSyncedAtUtc: null,
            },
        });
        this.normalizePlaybackForSessionStart();
        this.syncState = {
            status: this.hasAnyLibrarySource() ? "ready" : "unconfigured",
        };
        this.currentState = this.buildState();
    }

    getState(): RadioState {
        this.currentState = this.buildState();
        return clone(this.currentState);
    }

    onStateChanged(listener: (state: RadioState) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    async sync(force = false): Promise<RadioState> {
        this.syncState = {
            status: "syncing",
            error: undefined,
            progressPercent: 0,
            downloadedBytes: 0,
            totalBytes: undefined,
        };
        this.emit();

        try {
            await this.importLegacyLibraryIfPresent();
            const manifest = await this.manifests.getRadioManifest(force);
            if (!manifest) {
                this.previewManifest = null;
                this.syncState = {
                    status: this.hasAnyLibrarySource() ? "ready" : "unconfigured",
                    error: undefined,
                    progressPercent: undefined,
                    downloadedBytes: undefined,
                    totalBytes: undefined,
                    lastSyncedAtUtc: this.store.get("lastSyncedAtUtc") || undefined,
                };
                this.emit();
                return this.getState();
            }

            await fs.mkdir(this.audioRoot, { recursive: true });
            await fs.mkdir(this.artworkRoot, { recursive: true });

            this.previewManifest = manifest;
            this.emit();

            const existingFiles = { ...this.store.get("trackFiles") };
            const nextFiles: Record<string, PersistedTrackFile> = {};
            const enabledTracks = manifest.tracks.filter(track => track.enabled !== false);
            const tasks = buildSyncTasks(manifest, enabledTracks);
            let completedTasks = 0;
            const totalTasks = Math.max(tasks.length, 1);
            let stationArtworkPath = this.store.get("stationArtworkPath");
            let stationArtworkUrl = this.store.get("stationArtworkUrl");

            const updateProgress = (partialPercent = 0): void => {
                const completedPercent = (completedTasks + partialPercent) / totalTasks;
                this.syncState = {
                    status: "syncing",
                    progressPercent: Math.max(0, Math.min(100, Math.round(completedPercent * 100))),
                    downloadedBytes: undefined,
                    totalBytes: undefined,
                };
                this.emit();
            };

            if (manifest.stationArtworkPath) {
                const stationExt = extensionFromUrl(manifest.stationArtworkPath, ".png");
                const nextStationPath = path.join(this.artworkRoot, `station${stationExt}`);
                if (force || manifest.stationArtworkPath !== stationArtworkUrl || !existsSync(nextStationPath)) {
                    await this.copyOrDownloadFile(manifest.stationArtworkPath, nextStationPath);
                }
                stationArtworkPath = nextStationPath;
                stationArtworkUrl = manifest.stationArtworkPath;
                completedTasks += 1;
                updateProgress();
            } else {
                stationArtworkPath = null;
                stationArtworkUrl = null;
            }

            for (const track of enabledTracks) {
                const existing = existingFiles[track.id];
                const audioExt = extensionFromUrl(track.audioUrl, ".ogg");
                const nextAudioPath = path.join(this.audioRoot, `${safeSegment(track.id)}${audioExt}`);
                const nextTrackFile: PersistedTrackFile = {
                    audioPath: nextAudioPath,
                    audioSha256: track.sha256,
                    audioUrl: track.audioUrl,
                    artworkPath: existing?.artworkPath,
                    artworkUrl: existing?.artworkUrl,
                    updatedAtUtc: new Date().toISOString(),
                };

                const audioNeedsDownload =
                    force ||
                    !existing?.audioPath ||
                    existing.audioSha256?.toLowerCase() !== track.sha256.toLowerCase() ||
                    existing.audioUrl !== track.audioUrl ||
                    !existsSync(nextAudioPath);

                if (audioNeedsDownload) {
                    await this.copyOrDownloadFile(track.audioUrl, nextAudioPath, track.sha256, progress => updateProgress((progress.progressPercent ?? 0) / 100));
                }
                nextTrackFile.audioPath = nextAudioPath;
                completedTasks += 1;
                updateProgress();

                if (track.artworkPath) {
                    const artworkExt = extensionFromUrl(track.artworkPath, ".png");
                    const nextArtworkPath = path.join(this.artworkRoot, `${safeSegment(track.id)}${artworkExt}`);
                    const artworkNeedsDownload =
                        force ||
                        existing?.artworkUrl !== track.artworkPath ||
                        !existing?.artworkPath ||
                        !existsSync(nextArtworkPath);
                    if (artworkNeedsDownload) {
                        await this.copyOrDownloadFile(track.artworkPath, nextArtworkPath);
                    }
                    nextTrackFile.artworkPath = nextArtworkPath;
                    nextTrackFile.artworkUrl = track.artworkPath;
                    completedTasks += 1;
                    updateProgress();
                } else {
                    nextTrackFile.artworkPath = undefined;
                    nextTrackFile.artworkUrl = undefined;
                }

                nextFiles[track.id] = nextTrackFile;
            }

            const staleIds = Object.keys(existingFiles).filter(trackId => !enabledTracks.some(track => track.id === trackId));
            await Promise.all(
                staleIds.map(async trackId => {
                    const stale = existingFiles[trackId];
                    await removeIfExists(stale?.audioPath);
                    await removeIfExists(stale?.artworkPath);
                })
            );

            this.store.set("cachedManifest", manifest);
            this.store.set("trackFiles", nextFiles);
            this.store.set("stationArtworkPath", stationArtworkPath);
            this.store.set("stationArtworkUrl", stationArtworkUrl);
            this.store.set("lastSyncedAtUtc", new Date().toISOString());
            this.sanitizeStoreReferences(this.resolveAllTrackIds());
            this.previewManifest = null;

            this.syncState = {
                status: "ready",
                error: undefined,
                progressPercent: 100,
                lastSyncedAtUtc: this.store.get("lastSyncedAtUtc") || undefined,
            };
            this.emit();
            return this.getState();
        } catch (error) {
            this.previewManifest = null;
            this.syncState = {
                status: "error",
                error: toErrorMessage(error),
                lastSyncedAtUtc: this.store.get("lastSyncedAtUtc") || undefined,
            };
            this.emit();
            return this.getState();
        }
    }

    async importTracks(filePaths: string[]): Promise<RadioState> {
        const candidates = Array.from(new Set(filePaths.map(filePath => filePath.trim()).filter(Boolean)));
        if (!candidates.length) {
            return this.getState();
        }

        await fs.mkdir(this.importAudioRoot, { recursive: true });
        const existingImports = { ...this.store.get("localImports") };
        const importsBySha = new Map(Object.values(existingImports).map(entry => [entry.audioSha256.toLowerCase(), entry]));
        let changed = false;

        for (const filePath of candidates) {
            if (!existsSync(filePath)) {
                continue;
            }
            const extension = path.extname(filePath).toLowerCase();
            if (!SUPPORTED_AUDIO_EXTENSIONS.has(extension)) {
                continue;
            }

            const sha256 = await computeFileSha256(filePath);
            const existing = importsBySha.get(sha256.toLowerCase());
            if (existing?.audioPath && existsSync(existing.audioPath)) {
                continue;
            }

            const sourceName = path.basename(filePath, extension);
            const baseName = safeSegment(sourceName) || "track";
            const storedFileName = `${baseName}-${sha256.slice(0, 10)}${extension}`;
            const outputPath = path.join(this.importAudioRoot, storedFileName);
            if (!existsSync(outputPath)) {
                await fs.copyFile(filePath, outputPath);
            }

            const track: PersistedLocalImportTrack = {
                id: existing?.id || `import-${baseName}-${sha256.slice(0, 10)}`,
                title: humanizeTrackName(sourceName),
                artists: existing?.artists?.length ? existing.artists : ["Local import"],
                group: existing?.group || inferLocalTrackGroup(sourceName),
                durationMs: await readAudioDurationMs(outputPath),
                fileName: path.basename(filePath),
                audioPath: outputPath,
                audioSha256: sha256,
                importedAtUtc: existing?.importedAtUtc || new Date().toISOString(),
            };

            existingImports[track.id] = track;
            importsBySha.set(sha256.toLowerCase(), track);
            changed = true;
        }

        if (changed) {
            this.store.set("localImports", existingImports);
            this.sanitizeStoreReferences(this.resolveAllTrackIds());
            this.syncState = {
                ...this.syncState,
                status: this.hasAnyLibrarySource() ? "ready" : this.syncState.status,
            };
            this.emit();
        }

        return this.getState();
    }

    createPlaylist(name: string): RadioPlaylist {
        const playlist: RadioPlaylist = {
            id: `playlist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            name: sanitizePlaylistName(name),
            trackIds: [],
        };
        this.store.set("playlists", [...this.store.get("playlists"), playlist]);
        this.emit();
        return clone(playlist);
    }

    renamePlaylist(id: string, name: string): RadioPlaylist {
        const playlists = this.store.get("playlists").map(playlist =>
            playlist.id === id ? { ...playlist, name: sanitizePlaylistName(name) } : playlist
        );
        this.store.set("playlists", playlists);
        this.emit();
        return clone(playlists.find(playlist => playlist.id === id) || { id, name: sanitizePlaylistName(name), trackIds: [] });
    }

    deletePlaylist(id: string): void {
        this.store.set(
            "playlists",
            this.store.get("playlists").filter(playlist => playlist.id !== id)
        );
        const playback = this.store.get("playback");
        if (playback.collection.kind === "playlist" && playback.collection.playlistId === id) {
            this.store.set("playback", {
                ...playback,
                collection: { kind: "all-tracks" },
            });
        }
        this.emit();
    }

    setPlaylistTracks(id: string, trackIds: string[]): RadioPlaylist {
        const validTrackIds = new Set(this.resolveValidTrackIds());
        const sanitizedTrackIds = trackIds.filter(trackId => validTrackIds.has(trackId));
        const playlists = this.store.get("playlists").map(playlist =>
            playlist.id === id ? { ...playlist, trackIds: sanitizedTrackIds } : playlist
        );
        this.store.set("playlists", playlists);
        this.emit();
        return clone(playlists.find(playlist => playlist.id === id) || { id, name: "Playlist", trackIds: sanitizedTrackIds });
    }

    toggleFavorite(trackId: string): RadioState {
        const favorites = new Set(this.store.get("favoriteTrackIds"));
        if (favorites.has(trackId)) {
            favorites.delete(trackId);
        } else if (this.resolveValidTrackIds().includes(trackId)) {
            favorites.add(trackId);
        }
        this.store.set("favoriteTrackIds", Array.from(favorites));
        this.emit();
        return this.getState();
    }

    setQueue(trackIds: string[]): RadioState {
        this.updatePlayback({
            queueTrackIds: trackIds.filter(trackId => this.resolveValidTrackIds().includes(trackId)),
        });
        return this.getState();
    }

    enqueue(trackId: string): RadioState {
        if (!this.resolveValidTrackIds().includes(trackId)) {
            return this.getState();
        }
        const playback = this.store.get("playback");
        this.store.set("playback", {
            ...playback,
            queueTrackIds: [...playback.queueTrackIds, trackId],
        });
        this.emit();
        return this.getState();
    }

    removeFromQueue(trackId: string): RadioState {
        const playback = this.store.get("playback");
        this.store.set("playback", {
            ...playback,
            queueTrackIds: playback.queueTrackIds.filter(id => id !== trackId),
        });
        this.emit();
        return this.getState();
    }

    clearQueue(): RadioState {
        const playback = this.store.get("playback");
        this.store.set("playback", {
            ...playback,
            queueTrackIds: [],
        });
        this.emit();
        return this.getState();
    }

    setPlaybackState(input: RadioSetPlaybackStateInput): RadioState {
        this.updatePlayback(input);
        return this.getState();
    }

    private async importLegacyLibraryIfPresent(): Promise<void> {
        if (!existsSync(LEGACY_LOCAL_RADIO_IMPORT_DIR)) {
            return;
        }
        const entries = await fs.readdir(LEGACY_LOCAL_RADIO_IMPORT_DIR, { withFileTypes: true }).catch(() => []);
        const audioFiles = entries
            .filter(entry => entry.isFile() && SUPPORTED_AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
            .map(entry => path.join(LEGACY_LOCAL_RADIO_IMPORT_DIR, entry.name))
            .sort((left, right) => left.localeCompare(right));
        if (!audioFiles.length) {
            return;
        }
        await this.importTracks(audioFiles);
    }

    private async copyOrDownloadFile(
        sourceUrl: string,
        outputPath: string,
        sha256?: string,
        onProgress?: (progress: { progressPercent?: number }) => void
    ): Promise<void> {
        if (sourceUrl.startsWith("file://")) {
            const sourcePath = fileUrlToPath(sourceUrl);
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            await fs.copyFile(sourcePath, outputPath);
            if (sha256) {
                const copiedSha = await computeFileSha256(outputPath);
                if (copiedSha.toLowerCase() !== sha256.toLowerCase()) {
                    throw new Error(`SHA256 mismatch. Expected ${sha256}, got ${copiedSha}.`);
                }
            }
            onProgress?.({ progressPercent: 100 });
            return;
        }

        await this.downloader.downloadFile({
            url: sourceUrl,
            outputPath,
            sha256,
            onProgress,
        });
    }

    private updatePlayback(input: RadioSetPlaybackStateInput): void {
        const playback = this.store.get("playback");
        const validTrackIds = new Set(this.resolveValidTrackIds());
        const nextPlayback: PersistedPlayback = {
            ...playback,
            ...("currentTrackId" in input
                ? { currentTrackId: input.currentTrackId && validTrackIds.has(input.currentTrackId) ? input.currentTrackId : null }
                : {}),
            ...("isPlaying" in input ? { isPlaying: Boolean(input.isPlaying) } : {}),
            ...("currentTimeMs" in input ? { currentTimeMs: clampNumber(input.currentTimeMs ?? 0, 0, Number.MAX_SAFE_INTEGER) } : {}),
            ...("collection" in input ? { collection: sanitizeCollection(input.collection ?? playback.collection, this.store.get("playlists")) } : {}),
            ...("queueTrackIds" in input ? { queueTrackIds: (input.queueTrackIds ?? []).filter(trackId => validTrackIds.has(trackId)) } : {}),
            ...("historyTrackIds" in input ? { historyTrackIds: (input.historyTrackIds ?? []).filter(trackId => validTrackIds.has(trackId)).slice(-24) } : {}),
            ...("shuffleEnabled" in input ? { shuffleEnabled: Boolean(input.shuffleEnabled) } : {}),
            ...("loopMode" in input ? { loopMode: sanitizeLoopMode(input.loopMode) } : {}),
        };

        if ("volume" in input && typeof input.volume === "number") {
            this.settings.set("radioVolume", clampNumber(input.volume, 0, 1));
        }
        if ("muted" in input && typeof input.muted === "boolean") {
            this.settings.set("radioMuted", input.muted);
        }
        if ("crossfadeMs" in input && typeof input.crossfadeMs === "number") {
            this.settings.set("radioCrossfadeMs", clampNumber(input.crossfadeMs, 0, 6000));
        }
        if ("autoplayOnLaunch" in input && typeof input.autoplayOnLaunch === "boolean") {
            this.settings.set("radioAutoplayOnLaunch", input.autoplayOnLaunch);
        }
        if ("rememberPlaybackState" in input && typeof input.rememberPlaybackState === "boolean") {
            this.settings.set("radioRememberPlaybackState", input.rememberPlaybackState);
        }

        this.store.set("playback", nextPlayback);
        this.emit();
    }

    private normalizePlaybackForSessionStart(): void {
        const settings = this.settings.getAll();
        const playback = this.store.get("playback");
        let nextPlayback = playback;
        let changed = false;

        if (!settings.radioRememberPlaybackState) {
            nextPlayback = {
                ...nextPlayback,
                currentTrackId: null,
                currentTimeMs: 0,
                isPlaying: false,
            };
            changed = true;
        } else if (!settings.radioAutoplayOnLaunch && playback.isPlaying) {
            nextPlayback = {
                ...nextPlayback,
                isPlaying: false,
            };
            changed = true;
        }

        if (changed) {
            this.store.set("playback", nextPlayback);
        }
    }

    private buildState(): RadioState {
        const settings = this.settings.getAll();
        const cachedManifest = this.store.get("cachedManifest");
        const manifestSource = this.previewManifest || cachedManifest;
        const trackFiles = this.store.get("trackFiles");
        const localImports = this.store.get("localImports");
        const stationArtworkPath = this.store.get("stationArtworkPath");
        const resolvedTracks = this.buildResolvedTracks(manifestSource, trackFiles, localImports);
        const validTrackIds = resolvedTracks.map(track => track.id);
        const validTrackIdSet = new Set(validTrackIds);
        const playlists = sanitizePlaylists(this.store.get("playlists"), validTrackIds);
        const favoriteTrackIds = this.store
            .get("favoriteTrackIds")
            .filter(trackId => validTrackIdSet.has(trackId));
        const persistedPlayback = this.store.get("playback");
        const sanitizedPlayback = {
            ...persistedPlayback,
            currentTrackId: persistedPlayback.currentTrackId && validTrackIdSet.has(persistedPlayback.currentTrackId) ? persistedPlayback.currentTrackId : null,
            queueTrackIds: persistedPlayback.queueTrackIds.filter(trackId => validTrackIdSet.has(trackId)),
            historyTrackIds: persistedPlayback.historyTrackIds.filter(trackId => validTrackIdSet.has(trackId)).slice(-24),
            collection: sanitizeCollection(persistedPlayback.collection, playlists),
            loopMode: sanitizeLoopMode(persistedPlayback.loopMode),
        };

        const playback = {
            ...createEmptyRadioState().playback,
            ...sanitizedPlayback,
            volume: settings.radioVolume,
            muted: settings.radioMuted,
            crossfadeMs: settings.radioCrossfadeMs,
            autoplayOnLaunch: settings.radioAutoplayOnLaunch,
            rememberPlaybackState: settings.radioRememberPlaybackState,
        };

        const fallback = createEmptyRadioState();
        const sync: RadioSyncState = {
            status: this.syncState.status,
            stationName: manifestSource?.stationName || fallback.sync.stationName,
            stationSubtitle: manifestSource?.stationSubtitle || fallback.sync.stationSubtitle,
            stationArtworkUrl: stationArtworkPath && existsSync(stationArtworkPath)
                ? pathToFileURL(stationArtworkPath).toString()
                : manifestSource?.stationArtworkPath,
            libraryVersion: manifestSource?.libraryVersion,
            trackCount: resolvedTracks.length,
            availableTrackCount: resolvedTracks.filter(track => track.availableOffline).length,
            storagePath: this.libraryRoot,
            importsPath: this.importsRoot,
            importedTrackCount: Object.keys(localImports).length,
            lastSyncedAtUtc: this.syncState.lastSyncedAtUtc || this.store.get("lastSyncedAtUtc") || undefined,
            downloadedBytes: this.syncState.downloadedBytes,
            totalBytes: this.syncState.totalBytes,
            progressPercent: this.syncState.progressPercent,
            error: this.syncState.error,
        };

        return {
            sync,
            tracks: resolvedTracks,
            playlists,
            favoriteTrackIds,
            playback,
        };
    }

    private sanitizeStoreReferences(validTrackIds: string[]): void {
        const validTrackIdSet = new Set(validTrackIds);
        const playlists = sanitizePlaylists(this.store.get("playlists"), validTrackIds);
        this.store.set("playlists", playlists);
        this.store.set("favoriteTrackIds", this.store.get("favoriteTrackIds").filter(trackId => validTrackIdSet.has(trackId)));
        const playback = this.store.get("playback");
        this.store.set("playback", {
            ...playback,
            currentTrackId: playback.currentTrackId && validTrackIdSet.has(playback.currentTrackId) ? playback.currentTrackId : null,
            queueTrackIds: playback.queueTrackIds.filter(trackId => validTrackIdSet.has(trackId)),
            historyTrackIds: playback.historyTrackIds.filter(trackId => validTrackIdSet.has(trackId)).slice(-24),
            collection: sanitizeCollection(playback.collection, playlists),
        });
    }

    private resolveValidTrackIds(): string[] {
        return this.resolveAllTrackIds();
    }

    private hasAnyLibrarySource(): boolean {
        return Boolean(this.store.get("cachedManifest") || Object.keys(this.store.get("localImports")).length);
    }

    private resolveAllTrackIds(): string[] {
        return this.buildResolvedTracks(this.store.get("cachedManifest"), this.store.get("trackFiles"), this.store.get("localImports"))
            .map(track => track.id);
    }

    private buildResolvedTracks(
        manifestSource: RadioManifest | null,
        trackFiles: Record<string, PersistedTrackFile>,
        localImports: Record<string, PersistedLocalImportTrack>
    ): RadioResolvedTrack[] {
        const syncedTracks: RadioResolvedTrack[] = (manifestSource?.tracks || [])
            .filter(track => track.enabled !== false)
            .map(track => {
                const fileState = trackFiles[track.id];
                const localAudioPath = fileState?.audioPath && existsSync(fileState.audioPath) ? fileState.audioPath : undefined;
                const localArtworkPath = fileState?.artworkPath && existsSync(fileState.artworkPath) ? fileState.artworkPath : undefined;
                return {
                    ...track,
                    artworkUrl: localArtworkPath ? pathToFileURL(localArtworkPath).toString() : track.artworkPath,
                    playbackUrl: localAudioPath ? pathToFileURL(localAudioPath).toString() : track.audioUrl,
                    availableOffline: Boolean(localAudioPath),
                    source: "synced",
                };
            });

        const importedTracks: RadioResolvedTrack[] = Object.values(localImports)
            .filter(track => track.audioPath && existsSync(track.audioPath))
            .sort((left, right) => left.importedAtUtc.localeCompare(right.importedAtUtc))
            .map((track, index) => ({
                id: track.id,
                title: track.title,
                artists: track.artists,
                group: track.group,
                durationMs: track.durationMs,
                audioUrl: pathToFileURL(track.audioPath).toString(),
                sha256: track.audioSha256,
                order: syncedTracks.length + index,
                playbackUrl: pathToFileURL(track.audioPath).toString(),
                availableOffline: true,
                source: "local-import",
                importedAtUtc: track.importedAtUtc,
                localFilePath: track.audioPath,
            }));

        return [...syncedTracks, ...importedTracks];
    }

    private emit(): void {
        this.currentState = this.buildState();
        const snapshot = clone(this.currentState);
        for (const listener of this.listeners) {
            listener(snapshot);
        }
    }
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeStoreJsonFile(filePath: string): void {
    if (!fsSync.existsSync(filePath)) {
        return;
    }
    const raw = fsSync.readFileSync(filePath, "utf8");
    const sanitized = raw.replace(/^\uFEFF/, "");
    if (sanitized !== raw) {
        fsSync.writeFileSync(filePath, sanitized, "utf8");
    }
}

function buildSyncTasks(manifest: RadioManifest, enabledTracks: RadioManifest["tracks"]): string[] {
    const tasks: string[] = [];
    if (manifest.stationArtworkPath) {
        tasks.push("station-artwork");
    }
    for (const track of enabledTracks) {
        tasks.push(`audio:${track.id}`);
        if (track.artworkPath) {
            tasks.push(`artwork:${track.id}`);
        }
    }
    return tasks;
}

function sanitizePlaylistName(value: string): string {
    return value.trim().replace(/\s+/g, " ").slice(0, 48) || "New playlist";
}

function sanitizePlaylists(playlists: RadioPlaylist[], validTrackIds: string[]): RadioPlaylist[] {
    const allowed = new Set(validTrackIds);
    return playlists.map(playlist => ({
        ...playlist,
        name: sanitizePlaylistName(playlist.name),
        trackIds: playlist.trackIds.filter(trackId => allowed.has(trackId)),
    }));
}

function sanitizeCollection(collection: RadioCollection, playlists: RadioPlaylist[]): RadioCollection {
    if (collection.kind === "playlist") {
        return playlists.some(playlist => playlist.id === collection.playlistId)
            ? collection
            : { kind: "all-tracks" };
    }
    return collection;
}

function sanitizeLoopMode(loopMode: RadioLoopMode | undefined): RadioLoopMode {
    if (loopMode === "one" || loopMode === "all") {
        return loopMode;
    }
    return "off";
}

function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(Math.max(value, min), max);
}

function safeSegment(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/-+/g, "-");
}

function extensionFromUrl(value: string, fallback: string): string {
    try {
        const parsed = new URL(value);
        const extension = path.extname(parsed.pathname);
        return extension || fallback;
    } catch {
        return fallback;
    }
}

async function removeIfExists(targetPath?: string | null): Promise<void> {
    if (!targetPath) {
        return;
    }
    try {
        await fs.rm(targetPath, { force: true });
    } catch {
        // ignore cleanup failures
    }
}

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

function fileUrlToPath(value: string): string {
    const parsed = new URL(value);
    return decodeURIComponent(parsed.pathname.replace(/^\//, ""));
}

function humanizeTrackName(value: string): string {
    return value
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, match => match.toUpperCase())
        .replace(/\bBapbap\b/g, "BAPBAP")
        .replace(/\bV2\b/g, "V2");
}

function inferLocalTrackGroup(value: string): string {
    const normalized = value.toLowerCase();
    if (normalized.includes("lobby")) {
        return "Lobby soundtrack";
    }
    if (normalized.includes("tutorial")) {
        return "Tutorial soundtrack";
    }
    if (normalized.includes("slime")) {
        return "Boss Rush soundtrack";
    }
    if (normalized.includes("dojo")) {
        return "Dojo soundtrack";
    }
    if (normalized.includes("cave")) {
        return "Cave soundtrack";
    }
    if (normalized.includes("atlantis")) {
        return "Atlantis soundtrack";
    }
    if (normalized.includes("sincity")) {
        return "Sin City soundtrack";
    }
    if (normalized.includes("floating island")) {
        return "Floating Island soundtrack";
    }
    if (normalized.includes("worksite")) {
        return "Worksite soundtrack";
    }
    if (normalized.includes("cantina") || normalized.includes("rigtown") || normalized.includes("barrio")) {
        return "Rigtown soundtrack";
    }
    return "Official soundtrack";
}

async function computeFileSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha256");
        const stream = createReadStream(filePath);
        stream.on("data", chunk => hash.update(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(hash.digest("hex")));
    });
}

async function readAudioDurationMs(filePath: string): Promise<number> {
    if (path.extname(filePath).toLowerCase() !== ".wav") {
        return 0;
    }
    const handle = await fs.open(filePath, "r");
    try {
        const stats = await handle.stat();
        const header = Buffer.alloc(Math.min(stats.size, 1024 * 1024));
        await handle.read(header, 0, header.length, 0);

        if (header.toString("ascii", 0, 4) !== "RIFF" || header.toString("ascii", 8, 12) !== "WAVE") {
            return 0;
        }

        let offset = 12;
        let byteRate = 0;
        let dataSize = 0;

        while (offset + 8 <= header.length) {
            const chunkId = header.toString("ascii", offset, offset + 4);
            const chunkSize = header.readUInt32LE(offset + 4);
            const chunkStart = offset + 8;
            const nextOffset = chunkStart + chunkSize + (chunkSize % 2);

            if (chunkId === "fmt " && chunkStart + 16 <= header.length) {
                byteRate = header.readUInt32LE(chunkStart + 8);
            }
            if (chunkId === "data") {
                dataSize = chunkSize;
                break;
            }

            if (nextOffset <= offset) {
                break;
            }
            offset = nextOffset;
        }

        if (!byteRate || !dataSize) {
            return 0;
        }

        return Math.round((dataSize / byteRate) * 1000);
    } catch {
        return 0;
    } finally {
        await handle.close();
    }
}
