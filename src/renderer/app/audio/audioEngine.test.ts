import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "./audioEngine";

/**
 * Minimal HTMLAudioElement stand-in. readyState defaults to HAVE_METADATA (1)
 * so waitForDeckReady resolves synchronously; set it to 0 to exercise the
 * deferred-load path (resolve later by emitting "canplay").
 */
class FakeAudio {
    src = "";
    currentSrc = "";
    volume = 0;
    muted = false;
    currentTime = 0;
    paused = true;
    preload = "";
    readyState = 1;
    playCount = 0;
    pauseCount = 0;
    private listeners: Record<string, Array<(e: Event) => void>> = {};

    play = async () => {
        this.paused = false;
        this.playCount += 1;
    };
    pause = () => {
        this.paused = true;
        this.pauseCount += 1;
    };
    load = () => {};
    addEventListener(type: string, cb: (e: Event) => void) {
        (this.listeners[type] ||= []).push(cb);
    }
    removeEventListener(type: string, cb: (e: Event) => void) {
        this.listeners[type] = (this.listeners[type] || []).filter(l => l !== cb);
    }
    emit(type: string) {
        const event = { type, currentTarget: this } as unknown as Event;
        (this.listeners[type] || []).slice().forEach(l => l(event));
    }
}

function makeEngine() {
    const decks: FakeAudio[] = [];
    const engine = new AudioEngine(() => {
        const deck = new FakeAudio();
        decks.push(deck);
        return deck as unknown as HTMLAudioElement;
    });
    return { engine, decks };
}

let active: AudioEngine | null = null;
afterEach(() => {
    active?.dispose();
    active = null;
});

const TRACK = { volume: 0.8, muted: false, crossfadeMs: 200 };

describe("AudioEngine", () => {
    it("starts with no current track", () => {
        const { engine } = makeEngine();
        active = engine;
        expect(engine.getCurrentTrackId()).toBeNull();
    });

    it("plays a new track on the inactive deck and records it as current", async () => {
        const { engine, decks } = makeEngine();
        active = engine;
        await engine.playTrack({ trackId: "a", playbackUrl: "file:///a.mp3", ...TRACK });
        expect(engine.getCurrentTrackId()).toBe("a");
        // active starts at deck 0, so the first track plays on deck 1
        expect(decks[1].playCount).toBe(1);
        expect(decks[0].playCount).toBe(0);
    });

    it("alternates decks across consecutive tracks", async () => {
        const { engine, decks } = makeEngine();
        active = engine;
        await engine.playTrack({ trackId: "a", playbackUrl: "file:///a.mp3", ...TRACK });
        await engine.playTrack({ trackId: "b", playbackUrl: "file:///b.mp3", ...TRACK });
        expect(engine.getCurrentTrackId()).toBe("b");
        expect(decks[1].playCount).toBe(1); // track a
        expect(decks[0].playCount).toBe(1); // track b
    });

    it("stop() clears the current track and pauses both decks", async () => {
        const { engine, decks } = makeEngine();
        active = engine;
        await engine.playTrack({ trackId: "a", playbackUrl: "file:///a.mp3", ...TRACK });
        engine.stop();
        expect(engine.getCurrentTrackId()).toBeNull();
        expect(decks[0].paused).toBe(true);
        expect(decks[1].paused).toBe(true);
    });

    it("a stale play that resolves after stop() does not set the current track", async () => {
        const { engine, decks } = makeEngine();
        active = engine;
        // deck 1 (the target) is not ready, so waitForDeckReady will block
        decks[1].readyState = 0;
        const pending = engine.playTrack({ trackId: "a", playbackUrl: "file:///a.mp3", ...TRACK });
        // invalidate the in-flight request before the deck becomes ready
        engine.stop();
        decks[1].emit("canplay");
        await pending;
        expect(engine.getCurrentTrackId()).toBeNull();
        expect(decks[1].playCount).toBe(0);
    });

    it("fires onEnded only for the active deck", async () => {
        const { engine, decks } = makeEngine();
        active = engine;
        const onEnded = vi.fn();
        engine.setCallbacks({ onEnded });
        await engine.playTrack({ trackId: "a", playbackUrl: "file:///a.mp3", ...TRACK });
        // active deck is now deck 1
        decks[0].emit("ended");
        expect(onEnded).not.toHaveBeenCalled();
        decks[1].emit("ended");
        expect(onEnded).toHaveBeenCalledTimes(1);
    });
});
