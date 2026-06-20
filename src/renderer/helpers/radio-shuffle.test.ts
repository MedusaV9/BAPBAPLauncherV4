import { describe, expect, it } from "vitest";
import { createEmptyRadioState, type RadioResolvedTrack, type RadioState } from "../../shared/radio";
import { buildNextTrackId, pickSmartShuffleTrack, resolveCollectionTrackIds } from "./radio-shuffle";

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
});
