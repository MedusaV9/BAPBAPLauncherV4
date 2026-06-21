import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RadioManifest } from "../../../shared/manifest";

const electronState = vi.hoisted(() => ({
    userData: "",
    downloads: "",
}));

vi.mock("electron", () => {
    const app = {
        getPath(name: string) {
            if (name === "userData") {
                return electronState.userData;
            }
            if (name === "downloads") {
                return electronState.downloads;
            }
            return electronState.userData;
        },
    };

    return {
        default: { app },
        app,
    };
});

import { RadioService } from "./radio.service";

const tempRoots: string[] = [];

afterEach(async () => {
    await Promise.all(
        tempRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))
    );
});

function createWavBuffer(durationMs: number): Buffer {
    const sampleRate = 8000;
    const channels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = (channels * bitsPerSample) / 8;
    const sampleCount = Math.max(1, Math.round((sampleRate * durationMs) / 1000));
    const dataSize = sampleCount * bytesPerSample;
    const buffer = Buffer.alloc(44 + dataSize);

    buffer.write("RIFF", 0, "ascii");
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write("WAVE", 8, "ascii");
    buffer.write("fmt ", 12, "ascii");
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
    buffer.writeUInt16LE(bytesPerSample, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write("data", 36, "ascii");
    buffer.writeUInt32LE(dataSize, 40);

    return buffer;
}

async function writeAudioFile(root: string, name: string, durationMs = 750): Promise<string> {
    const filePath = path.join(root, name);
    await fs.writeFile(filePath, createWavBuffer(durationMs));
    return filePath;
}

async function readSha256(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(fileBuffer).digest("hex");
}

async function createService(manifest: RadioManifest | null) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bapbap-radio-test-"));
    tempRoots.push(root);
    electronState.userData = path.join(root, "userData");
    electronState.downloads = path.join(root, "downloads");
    await fs.mkdir(electronState.userData, { recursive: true });
    await fs.mkdir(electronState.downloads, { recursive: true });

    const manifests = {
        getRadioManifest: vi.fn(async () => manifest),
    };
    const downloader = {
        downloadFile: vi.fn(async () => undefined),
    };
    const settings = {
        getAll: vi.fn(() => ({
            radioVolume: 0.72,
            radioMuted: false,
            radioCrossfadeMs: 2200,
            radioAutoplayOnLaunch: false,
            radioRememberPlaybackState: true,
        })),
        set: vi.fn(),
    };

    const service = new RadioService(manifests as never, downloader as never, settings as never);
    const store = (service as unknown as { store: { set: (key: string, value: unknown) => void } }).store;
    store.set("cachedManifest", null);
    store.set("trackFiles", {});
    store.set("localImports", {});
    store.set("stationArtworkPath", null);
    store.set("stationArtworkUrl", null);
    store.set("playlists", []);
    store.set("favoriteTrackIds", []);
    store.set("playback", {
        currentTrackId: null,
        isPlaying: false,
        currentTimeMs: 0,
        collection: { kind: "all-tracks" },
        queueTrackIds: [],
        historyTrackIds: [],
        shuffleEnabled: true,
        loopMode: "all",
    });
    store.set("lastSyncedAtUtc", null);
    (service as unknown as { syncState: { status: string } }).syncState = { status: "unconfigured" };
    (service as unknown as { currentState: ReturnType<RadioService["getState"]> }).currentState = service.getState();

    return {
        root,
        service,
        manifests,
    };
}

describe("RadioService imports", () => {
    it("merges imported songs with synced manifest tracks", async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), "bapbap-radio-fixture-"));
        tempRoots.push(root);
        const remoteFile = await writeAudioFile(root, "dojo-stage.wav", 900);
        const importedFile = await writeAudioFile(root, "my-local-song.wav", 600);
        const manifest: RadioManifest = {
            schemaVersion: 1,
            stationName: "BAPBAP Radio",
            stationSubtitle: "Official soundtrack",
            libraryVersion: "test-v1",
            tracks: [
                {
                    id: "dojo-stage",
                    title: "Dojo Stage",
                    artists: ["BAPBAP"],
                    group: "Official soundtrack",
                    durationMs: 900,
                    audioUrl: pathToFileURL(remoteFile).toString(),
                    sha256: await readSha256(remoteFile),
                    order: 0,
                },
            ],
        };
        const { service } = await createService(manifest);

        await service.sync(true);
        await service.importTracks([importedFile]);

        const state = service.getState();
        const importedTrack = state.tracks.find(track => track.source === "local-import");
        expect(state.tracks.map(track => track.id)).toContain("dojo-stage");
        expect(importedTrack).toBeTruthy();
        expect(importedTrack?.title).toBe("My Local Song");
        expect(importedTrack?.localFilePath).toContain(path.join("radio", "imports"));
        expect(state.sync.importedTrackCount).toBe(1);
        expect(state.sync.availableTrackCount).toBe(2);
    });

    it("keeps imported songs, favorites, and playlists intact after sync", async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), "bapbap-radio-fixture-"));
        tempRoots.push(root);
        const remoteFile = await writeAudioFile(root, "dojo-stage.wav", 900);
        const importedFile = await writeAudioFile(root, "boss-rush-custom.wav", 1200);
        const manifest: RadioManifest = {
            schemaVersion: 1,
            stationName: "BAPBAP Radio",
            stationSubtitle: "Official soundtrack",
            libraryVersion: "test-v2",
            tracks: [
                {
                    id: "dojo-stage",
                    title: "Dojo Stage",
                    artists: ["BAPBAP"],
                    group: "Official soundtrack",
                    durationMs: 900,
                    audioUrl: pathToFileURL(remoteFile).toString(),
                    sha256: await readSha256(remoteFile),
                    order: 0,
                },
            ],
        };
        const { service } = await createService(manifest);

        await service.importTracks([importedFile]);
        const importedTrackId = service.getState().tracks.find(track => track.source === "local-import")?.id;
        expect(importedTrackId).toBeTruthy();
        const playlist = service.createPlaylist("Imported picks");
        service.setPlaylistTracks(playlist.id, [importedTrackId!]);
        service.toggleFavorite(importedTrackId!);

        await service.sync(true);

        const nextState = service.getState();
        expect(nextState.tracks.some(track => track.id === importedTrackId)).toBe(true);
        expect(nextState.favoriteTrackIds).toContain(importedTrackId);
        expect(nextState.playlists.find(entry => entry.id === playlist.id)?.trackIds).toContain(importedTrackId);
    });

    it("deduplicates repeated imports of the same file", async () => {
        const { root, service } = await createService(null);
        const importedFile = await writeAudioFile(root, "repeat-me.wav", 500);

        await service.importTracks([importedFile, importedFile]);
        await service.importTracks([importedFile]);

        const state = service.getState();
        expect(state.sync.importedTrackCount).toBe(1);
        expect(state.tracks.filter(track => track.source === "local-import")).toHaveLength(1);
    });
});
