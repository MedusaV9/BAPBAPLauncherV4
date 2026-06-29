/**
 * Framework-free two-deck audio engine extracted from V2's App.tsx.
 * Owns two HTMLAudioElement "decks" and crossfades between them on track
 * change. Play-request invalidation (a monotonically increasing counter)
 * guards against the browser's async play()/pause() race conditions.
 *
 * The engine knows nothing about React or the radio store — callers wire it
 * up via the `onEnded` / `onTime` callbacks and the imperative methods.
 */

function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(value, min), max);
}

function normalizeMediaUrl(value: string): string {
    try {
        return new URL(value).toString();
    } catch {
        return value;
    }
}

function isBenignMediaPlayInterruption(error: unknown): boolean {
    const name = typeof error === "object" && error && "name" in error ? String((error as { name?: unknown }).name || "") : "";
    const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
    return (
        name === "AbortError" ||
        message.includes("interrupted by a call to pause") ||
        message.includes("interrupted by a new load request")
    );
}

export type AudioEngineCallbacks = {
    /** Fires when the active deck reaches the end of its track. */
    onEnded?: () => void;
    /** Fires ~4x/sec with the active deck's position in ms while playing. */
    onTime?: (currentTimeMs: number) => void;
    /** Fires when a play() attempt hard-fails (not a benign interruption). */
    onError?: (message: string) => void;
};

export type PlayTrackParams = {
    trackId: string;
    playbackUrl: string;
    startAtMs?: number;
    volume: number;
    muted: boolean;
    crossfadeMs: number;
};

export class AudioEngine {
    private readonly decks: [HTMLAudioElement, HTMLAudioElement];
    private activeIndex = 0;
    private currentTrackId: string | null = null;
    private playRequestId = 0;
    private fadeCancel: (() => void) | null = null;
    private timeInterval: ReturnType<typeof setInterval> | null = null;
    private callbacks: AudioEngineCallbacks = {};

    constructor(createAudio: () => HTMLAudioElement = () => new Audio()) {
        const left = createAudio();
        const right = createAudio();
        for (const deck of [left, right]) {
            deck.preload = "auto";
            deck.volume = 0;
        }
        this.decks = [left, right];
        const handleEnded = (event: Event) => {
            if (event.currentTarget !== this.decks[this.activeIndex]) return;
            this.callbacks.onEnded?.();
        };
        left.addEventListener("ended", handleEnded);
        right.addEventListener("ended", handleEnded);
        this.timeInterval = setInterval(() => {
            const deck = this.decks[this.activeIndex];
            if (!deck.paused && this.currentTrackId) {
                this.callbacks.onTime?.(Math.round(deck.currentTime * 1000));
            }
        }, 250);
    }

    setCallbacks(callbacks: AudioEngineCallbacks): void {
        this.callbacks = callbacks;
    }

    getCurrentTrackId(): string | null {
        return this.currentTrackId;
    }

    private stopFade(): void {
        this.fadeCancel?.();
        this.fadeCancel = null;
    }

    private async waitForDeckReady(deck: HTMLAudioElement, playbackUrl: string): Promise<void> {
        const normalizedCurrent = normalizeMediaUrl(deck.currentSrc || deck.src);
        const normalizedNext = normalizeMediaUrl(playbackUrl);
        if (normalizedCurrent !== normalizedNext) {
            deck.src = playbackUrl;
        }
        deck.load();
        if (deck.readyState >= HTMLMediaElement.HAVE_METADATA) return;
        await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                deck.removeEventListener("loadedmetadata", onReady);
                deck.removeEventListener("canplay", onReady);
                deck.removeEventListener("error", onError);
            };
            const onReady = () => {
                cleanup();
                resolve();
            };
            const onError = () => {
                cleanup();
                reject(new Error(`Unable to load audio source: ${playbackUrl}`));
            };
            deck.addEventListener("loadedmetadata", onReady);
            deck.addEventListener("canplay", onReady);
            deck.addEventListener("error", onError);
        });
    }

    private async tryPlay(deck: HTMLAudioElement, requestId: number): Promise<"started" | "interrupted" | "failed"> {
        try {
            await deck.play();
            return requestId !== this.playRequestId ? "interrupted" : "started";
        } catch (error) {
            if (requestId !== this.playRequestId || isBenignMediaPlayInterruption(error)) {
                return "interrupted";
            }
            this.callbacks.onError?.(error instanceof Error ? error.message : String(error));
            return "failed";
        }
    }

    private crossfade(fromDeck: HTMLAudioElement | null, toDeck: HTMLAudioElement, targetVolume: number, durationMs: number): void {
        this.stopFade();
        const fromStart = fromDeck ? (Number.isFinite(fromDeck.volume) ? fromDeck.volume : 0) : 0;
        const toStart = Number.isFinite(toDeck.volume) ? toDeck.volume : 0;
        const clampedTarget = clampNumber(targetVolume, 0, 1);
        const totalDuration = Math.max(1, Math.round(durationMs));
        const startedAt = performance.now();
        let frameId = 0;
        const step = (now: number) => {
            const progress = Math.min(1, (now - startedAt) / totalDuration);
            if (fromDeck) fromDeck.volume = fromStart * (1 - progress);
            toDeck.volume = toStart + (clampedTarget - toStart) * progress;
            if (progress < 1) {
                frameId = requestAnimationFrame(step);
                return;
            }
            if (fromDeck) {
                fromDeck.volume = 0;
                fromDeck.pause();
            }
            toDeck.volume = clampedTarget;
            this.fadeCancel = null;
        };
        frameId = requestAnimationFrame(step);
        this.fadeCancel = () => cancelAnimationFrame(frameId);
    }

    private invalidatePlayRequests(): number {
        this.playRequestId += 1;
        return this.playRequestId;
    }

    /** Load + play a new track, crossfading out the previously active deck. */
    async playTrack(params: PlayTrackParams): Promise<void> {
        const targetVolume = params.muted ? 0 : clampNumber(params.volume, 0, 1);
        const crossfadeMs = Math.max(180, Math.round(params.crossfadeMs));
        const activeDeck = this.decks[this.activeIndex];
        const nextIndex = this.activeIndex === 0 ? 1 : 0;
        const nextDeck = this.decks[nextIndex];
        const requestId = this.invalidatePlayRequests();

        this.stopFade();
        nextDeck.pause();
        nextDeck.muted = params.muted;
        try {
            await this.waitForDeckReady(nextDeck, params.playbackUrl);
        } catch (error) {
            if (requestId === this.playRequestId) {
                // The requested track failed to load and no newer request has
                // superseded us — stop the outgoing track so the old song does
                // not keep playing, then surface the error.
                activeDeck.pause();
                this.currentTrackId = null;
                this.callbacks.onError?.(error instanceof Error ? error.message : String(error));
            }
            return;
        }
        if (requestId !== this.playRequestId) return;
        try {
            nextDeck.currentTime = Math.max(0, (params.startAtMs ?? 0) / 1000);
        } catch {
            nextDeck.currentTime = 0;
        }
        nextDeck.volume = 0;
        const result = await this.tryPlay(nextDeck, requestId);
        if (result !== "started") {
            // When play() failed (not just interrupted by a newer request),
            // stop the outgoing active deck so the old track does not keep
            // playing audibly while the UI shows a paused/error state.
            if (result === "failed" && this.currentTrackId) {
                activeDeck.pause();
                this.currentTrackId = null;
            }
            return;
        }
        this.crossfade(this.currentTrackId ? activeDeck : null, nextDeck, targetVolume, crossfadeMs);
        this.activeIndex = nextIndex;
        this.currentTrackId = params.trackId;
    }

    /** Resume the active deck without reloading. */
    async resume(volume: number, muted: boolean, crossfadeMs: number): Promise<void> {
        const deck = this.decks[this.activeIndex];
        deck.muted = muted;
        const requestId = this.invalidatePlayRequests();
        const result = await this.tryPlay(deck, requestId);
        if (result === "started") {
            this.crossfade(null, deck, muted ? 0 : volume, Math.max(100, crossfadeMs));
        }
    }

    pause(): void {
        this.invalidatePlayRequests();
        this.decks[this.activeIndex].pause();
    }

    seek(timeMs: number): void {
        const deck = this.decks[this.activeIndex];
        try {
            deck.currentTime = Math.max(0, timeMs) / 1000;
        } catch {
            // ignore invalid seek
        }
    }

    setVolume(volume: number, muted: boolean): void {
        const deck = this.decks[this.activeIndex];
        deck.muted = muted;
        deck.volume = muted ? 0 : clampNumber(volume, 0, 1);
    }

    stop(): void {
        this.invalidatePlayRequests();
        this.stopFade();
        this.currentTrackId = null;
        for (const deck of this.decks) {
            deck.pause();
            deck.volume = 0;
        }
    }

    dispose(): void {
        this.stop();
        if (this.timeInterval) clearInterval(this.timeInterval);
        this.timeInterval = null;
    }
}
