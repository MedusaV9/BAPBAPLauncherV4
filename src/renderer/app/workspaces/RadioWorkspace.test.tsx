import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyRadioState, type RadioState, type RadioSetPlaybackStateInput } from "../../../shared/radio";

// Stateful fake radio backend so clicks round-trip through the real
// RadioWorkspace + radio-shuffle (buildAdvancePlayback) + query cache.
const radio = vi.hoisted(() => ({ state: null as RadioState | null }));

vi.mock("../../api", () => ({
    api: {
        radio: {
            getState: async () => structuredClone(radio.state),
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
            sync: async () => structuredClone(radio.state),
            createPlaylist: async () => structuredClone(radio.state),
        },
    },
}));

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
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("RadioWorkspace queue drain (b173544 fix, real clicks)", () => {
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
});
