import { describe, expect, it } from "vitest";
import { createEmptyRadioState, type RadioResolvedTrack, type RadioState } from "../../shared/radio";
import { buildAdvancePlayback, buildNextTrackId, buildPlayTrackPlayback, buildPreviousPlayback, pickSmartShuffleTrack, resolveCollectionTrackIds } from "./radio-shuffle";

function track(overrides: Partial<RadioResolvedTrack>): RadioResolvedTrack {
    return {
        id: "track",
        title: "Track",
        artists: ["Artist"],
        durationMs: 90_000,
        audioUrl: "https://example.test/track.ogg",
        sha256: "sha",
        availableOffline: true,
        playbackUrl: "file:///track.ogg",
        source: "synced",
        ...overrides,
    };
}

function state(overrides: Partial<RadioState>): RadioState {
    return {
        ...createEmptyRadioState(),
        tracks: [],
        ...overrides,
    };
}

describe("radio shuffle", () => {
    it("resolves playlist collections", () => {
        const value = state({
            tracks: [track({ id: "a" }), track({ id: "b" }), track({ id: "c" })],
            playlists: [{ id: "mix", name: "Mix", trackIds: ["b", "c"] }],
            playback: {
                ...createEmptyRadioState().playback,
                collection: { kind: "playlist", playlistId: "mix" },
            },
        });

        expect(resolveCollectionTrackIds(value)).toEqual(["b", "c"]);
    });

    it("avoids direct repeats when enough candidates exist", () => {
        const result = pickSmartShuffleTrack({
            tracks: [
                track({ id: "a", group: "g1", artists: ["one"] }),
                track({ id: "b", group: "g1", artists: ["one"] }),
                track({ id: "c", group: "g2", artists: ["two"] }),
            ],
            poolTrackIds: ["a", "b", "c"],
            currentTrackId: "a",
            historyTrackIds: ["a"],
            favoriteTrackIds: [],
            random: () => 0.95,
        });

        expect(result).toBe("c");
    });

    it("falls back to queue first for next track", () => {
        const value = state({
            tracks: [track({ id: "a" }), track({ id: "b" })],
            playback: {
                ...createEmptyRadioState().playback,
                currentTrackId: "a",
                queueTrackIds: ["b"],
            },
        });

        expect(buildNextTrackId(value)).toBe("b");
    });

    it("advance consumes the queue head and records history", () => {
        const value = state({
            tracks: [track({ id: "a" }), track({ id: "b" }), track({ id: "c" })],
            playback: {
                ...createEmptyRadioState().playback,
                currentTrackId: "a",
                queueTrackIds: ["b", "c"],
                historyTrackIds: [],
            },
        });

        const delta = buildAdvancePlayback(value);
        expect(delta).toEqual({
            currentTrackId: "b",
            currentTimeMs: 0,
            isPlaying: true,
            queueTrackIds: ["c"],
            historyTrackIds: ["a"],
        });
    });

    it("advance does not loop forever on a single queued track", () => {
        let value = state({
            tracks: [track({ id: "a" }), track({ id: "b" })],
            playback: {
                ...createEmptyRadioState().playback,
                currentTrackId: "a",
                queueTrackIds: ["b"],
                historyTrackIds: [],
            },
        });

        const first = buildAdvancePlayback(value)!;
        expect(first.currentTrackId).toBe("b");
        expect(first.queueTrackIds).toEqual([]);

        // Apply the delta, then advance again — the queue is now empty so it must
        // fall through to the pool (sequential) rather than replay "b".
        value = state({
            tracks: value.tracks,
            playback: { ...value.playback, ...first },
        });
        const second = buildAdvancePlayback(value)!;
        expect(second.currentTrackId).not.toBe("b");
        expect(second.currentTrackId).toBe("a");
    });

    it("advance leaves the queue intact when next comes from the pool", () => {
        const value = state({
            tracks: [track({ id: "a" }), track({ id: "b" })],
            playback: {
                ...createEmptyRadioState().playback,
                currentTrackId: "a",
                queueTrackIds: [],
                historyTrackIds: [],
            },
        });

        const delta = buildAdvancePlayback(value)!;
        expect(delta.currentTrackId).toBe("b");
        expect(delta.queueTrackIds).toEqual([]);
        expect(delta.historyTrackIds).toEqual(["a"]);
    });

    it("previous pops the most recent history entry", () => {
        const value = state({
            tracks: [track({ id: "a" }), track({ id: "b" }), track({ id: "c" })],
            playback: {
                ...createEmptyRadioState().playback,
                currentTrackId: "c",
                historyTrackIds: ["a", "b"],
            },
        });

        const delta = buildPreviousPlayback(value);
        expect(delta).toEqual({
            currentTrackId: "b",
            currentTimeMs: 0,
            isPlaying: true,
            historyTrackIds: ["a"],
        });
    });

    it("previous returns null with empty history", () => {
        const value = state({
            tracks: [track({ id: "a" })],
            playback: { ...createEmptyRadioState().playback, currentTrackId: "a", historyTrackIds: [] },
        });
        expect(buildPreviousPlayback(value)).toBeNull();
    });

    it("manual play records history but keeps the queue", () => {
        const value = state({
            tracks: [track({ id: "a" }), track({ id: "b" }), track({ id: "c" })],
            playback: {
                ...createEmptyRadioState().playback,
                currentTrackId: "a",
                queueTrackIds: ["c"],
                historyTrackIds: [],
            },
        });

        const delta = buildPlayTrackPlayback(value, "b");
        expect(delta.currentTrackId).toBe("b");
        expect(delta.historyTrackIds).toEqual(["a"]);
        expect(delta).not.toHaveProperty("queueTrackIds");
    });

    it("manual play of the current track does not duplicate it into history", () => {
        const value = state({
            tracks: [track({ id: "a" })],
            playback: {
                ...createEmptyRadioState().playback,
                currentTrackId: "a",
                historyTrackIds: [],
            },
        });

        const delta = buildPlayTrackPlayback(value, "a");
        expect(delta.historyTrackIds).toEqual([]);
    });

    it("loop 'off' stops at the end of the collection", () => {
        const value = state({
            tracks: [track({ id: "a" }), track({ id: "b" })],
            playback: {
                ...createEmptyRadioState().playback,
                currentTrackId: "b",
                shuffleEnabled: false,
                loopMode: "off",
            },
        });
        expect(buildNextTrackId(value)).toBeNull();
        expect(buildAdvancePlayback(value)).toBeNull();
    });

    it("loop 'all' wraps around to the first track at the end", () => {
        const value = state({
            tracks: [track({ id: "a" }), track({ id: "b" })],
            playback: {
                ...createEmptyRadioState().playback,
                currentTrackId: "b",
                shuffleEnabled: false,
                loopMode: "all",
            },
        });
        expect(buildNextTrackId(value)).toBe("a");
    });
});
