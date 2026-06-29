import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyRadioState, type RadioState, type RadioSetPlaybackStateInput } from "../../../shared/radio";

// Stateful fake radio backend so clicks round-trip through the real
// RadioWorkspace + radio-shuffle (buildAdvancePlayback) + query cache.
const radio = vi.hoisted(() => ({
    state: null as RadioState | null,
    syncCalls: 0,
    getStateError: null as Error | null,
}));

vi.mock("../../api", () => ({
    api: {
        radio: {
            getState: async () => {
                if (radio.getStateError) throw radio.getStateError;
                return structuredClone(radio.state);
            },
            enqueue: async (trackId: string) => {
                radio.state!.playback.queueTrackIds = [...radio.state!.playback.queueTrackIds, trackId];
                return structuredClone(radio.state);
            },
            removeFromQueue: async (trackId: string) => {
                radio.state!.playback.queueTrackIds = radio.state!.playback.queueTrackIds.filter(id => id !== trackId);
                return structuredClone(radio.state);
            },
            clearQueue: async () => {
                radio.state!.playback.queueTrackIds = [];
                return structuredClone(radio.state);
            },
            setPlaybackState: async (input: RadioSetPlaybackStateInput) => {
                radio.state!.playback = { ...radio.state!.playback, ...input };
                return structuredClone(radio.state);
            },
            toggleFavorite: async () => structuredClone(radio.state),
            sync: async () => {
                radio.syncCalls += 1;
                return structuredClone(radio.state);
            },
            createPlaylist: async () => structuredClone(radio.state),
            deletePlaylist: async (id: string) => {
                radio.state!.playlists = radio.state!.playlists.filter(p => p.id !== id);
                return structuredClone(radio.state);
            },
            renamePlaylist: async (id: string, name: string) => {
                const pl = radio.state!.playlists.find(p => p.id === id);
                if (pl) pl.name = name;
                return structuredClone(radio.state);
            },
            setPlaylistTracks: async (id: string, trackIds: string[]) => {
                const pl = radio.state!.playlists.find(p => p.id === id);
                if (pl) pl.trackIds = trackIds;
                return structuredClone(pl);
            },
        },
    },
}));

import { useRadioPlayerStore } from "../stores/useRadioPlayerStore";
import { RadioWorkspace } from "./RadioWorkspace";

function track(id: string, title: string) {
    return {
        id,
        title,
        artists: ["Artist"],
        durationMs: 90_000,
        audioUrl: `https://x/${id}.ogg`,
        sha256: "sha",
        availableOffline: true,
        playbackUrl: `file:///${id}.ogg`,
        source: "synced" as const,
    };
}

function seed(): RadioState {
    const base = createEmptyRadioState();
    return {
        ...base,
        tracks: [track("a", "Opening Room"), track("b", "Slime Crown"), track("c", "Lobby Drift")],
    };
}

function renderRadio() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(createElement(QueryClientProvider, { client }, createElement(RadioWorkspace)));
}

function upNext(): number {
    const header = screen.queryByText(/Up next \(\d+\)/);
    if (!header) return 0;
    const m = header.textContent?.match(/\((\d+)\)/);
    return m ? Number(m[1]) : 0;
}

beforeEach(() => {
    radio.state = seed();
    radio.getStateError = null;
    useRadioPlayerStore.getState().setErrorMessage(null);
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("RadioWorkspace queue drain (b173544 fix, real clicks)", () => {
    it("shows a retryable error state when the radio backend cannot load", async () => {
        radio.getStateError = new Error("radio state file is unreadable");

        renderRadio();

        expect(await screen.findByText("Radio unavailable")).toBeTruthy();
        expect(screen.getByText(/radio state file is unreadable/i)).toBeTruthy();
        expect(screen.queryByText("Loading station…")).toBeNull();
        expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
    });

    it("enqueues via clicks, then drains the queue head on Next instead of replaying forever", async () => {
        renderRadio();

        // Wait for the real track rows to render from the (faked) backend.
        const enqueueButtons = await screen.findAllByLabelText("Add to queue");
        expect(enqueueButtons.length).toBeGreaterThanOrEqual(3);

        // Click "Add to queue" on two distinct tracks.
        fireEvent.click(enqueueButtons[1]);
        fireEvent.click(enqueueButtons[2]);
        await waitFor(() => expect(upNext()).toBe(2));

        // Next must CONSUME the queue head (the fix), not replay it: 2 -> 1.
        fireEvent.click(screen.getByLabelText("Next track"));
        await waitFor(() => expect(upNext()).toBe(1));

        // A second Next drains the last queued track to 0 — no infinite replay.
        fireEvent.click(screen.getByLabelText("Next track"));
        await waitFor(() => expect(upNext()).toBe(0));
    });

    it("removes a queued track via its X button", async () => {
        renderRadio();
        const enqueueButtons = await screen.findAllByLabelText("Add to queue");

        fireEvent.click(enqueueButtons[1]);
        await waitFor(() => expect(upNext()).toBe(1));

        fireEvent.click(screen.getByLabelText("Remove from queue"));
        await waitFor(() => expect(upNext()).toBe(0));
    });

    it("deletes a playlist via its chip X button", async () => {
        radio.state!.playlists = [{ id: "mix", name: "Late Night", trackIds: [] }];
        renderRadio();

        const del = await screen.findByLabelText("Delete playlist Late Night");
        fireEvent.click(del);

        await waitFor(() =>
            expect(screen.queryByLabelText("Delete playlist Late Night")).toBeNull()
        );
    });

    it("renames a playlist via its chip pencil button", async () => {
        radio.state!.playlists = [{ id: "mix", name: "Late Night", trackIds: [] }];
        renderRadio();

        const rename = await screen.findByLabelText("Rename playlist Late Night");
        fireEvent.click(rename);

        const input = screen.getByPlaceholderText("Playlist name…");
        fireEvent.change(input, { target: { value: "Morning Mix" } });
        fireEvent.keyDown(input, { key: "Enter" });

        await waitFor(() =>
            expect(screen.getByLabelText("Rename playlist Morning Mix")).toBeTruthy()
        );
    });

    it("shows sync status details in the header (RAD-19)", async () => {
        radio.state!.sync = {
            ...radio.state!.sync,
            status: "ready",
            trackCount: 3,
            availableTrackCount: 2,
            lastSyncedAtUtc: "2026-06-23T10:15:00.000Z",
        };
        renderRadio();

        expect(await screen.findByText("Ready")).toBeTruthy();
        expect(screen.getByText(/2\/3 tracks ready/i)).toBeTruthy();
    });

    it("shows audio playback errors instead of silently stopping (RAD-24)", async () => {
        useRadioPlayerStore.getState().setErrorMessage("Unable to load audio source: file:///missing.ogg");
        renderRadio();

        expect(await screen.findByText("Audio could not start")).toBeTruthy();
        expect(screen.getByText(/missing\.ogg/i)).toBeTruthy();
    });

    it("triggers a library sync when the Sync button is clicked (RAD-19)", async () => {
        renderRadio();
        const sync = await screen.findByRole("button", { name: /^sync$/i });
        expect(radio.syncCalls).toBe(0);

        fireEvent.click(sync);
        await waitFor(() => expect(radio.syncCalls).toBe(1));
    });

    it("disables the Sync button while a sync is in progress (RAD-19)", async () => {
        radio.state!.sync = { ...radio.state!.sync, status: "syncing" };
        renderRadio();

        const sync = await screen.findByRole("button", { name: /sync/i });
        expect((sync as HTMLButtonElement).disabled).toBe(true);
    });

    it("adds a track to a playlist via the per-row + picker (RAD-22)", async () => {
        radio.state!.playlists = [{ id: "mix", name: "Late Night", trackIds: [] }];
        renderRadio();

        const addButtons = await screen.findAllByLabelText("Add to playlist");
        fireEvent.click(addButtons[0]);

        // Scope to the picker menu — the playlist name also appears as a chip.
        const menu = await screen.findByRole("menu");
        fireEvent.click(within(menu).getByText("Late Night"));

        await waitFor(() => expect(radio.state!.playlists[0].trackIds.length).toBe(1));
        // First visible track is "a" (Opening Room).
        expect(radio.state!.playlists[0].trackIds[0]).toBe("a");
    });
});
