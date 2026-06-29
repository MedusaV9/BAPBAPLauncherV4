import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import { useRadioState } from "../query/hooks";
import { qk } from "../query/queryKeys";
import { useRadioPlayerStore } from "../stores/useRadioPlayerStore";
import { buildAdvancePlayback } from "../../helpers/radio-shuffle";
import { AudioEngine } from "./audioEngine";

/**
 * Mounts the two-deck audio engine and reconciles it with the backend's
 * persisted radio playback state. Lives at shell level so playback continues
 * across workspace switches. The engine is the source of truth for *audio*;
 * the backend RadioState is the source of truth for *intent* (what should
 * play, at what volume). This hook bridges the two.
 */
export function useAudioEngine() {
    const { data: radioState } = useRadioState();
    const qc = useQueryClient();
    const engineRef = useRef<AudioEngine | null>(null);
    const lastPersistedTimeRef = useRef(0);

    const setPosition = useRadioPlayerStore(s => s.setPosition);
    const setPlaying = useRadioPlayerStore(s => s.setPlaying);
    const setCurrentTrack = useRadioPlayerStore(s => s.setCurrentTrack);
    const setErrorMessage = useRadioPlayerStore(s => s.setErrorMessage);
    const setSeekHandler = useRadioPlayerStore(s => s.setSeekHandler);

    // Keep the latest radio state available to engine callbacks without
    // re-subscribing the engine on every state change.
    const stateRef = useRef(radioState);
    stateRef.current = radioState;

    useEffect(() => {
        // Create the engine inside the mount effect (not lazily in render) so a
        // StrictMode mount→unmount→mount cycle — whose cleanup disposes the engine
        // and nulls the ref — gets a fresh engine on the second mount instead of
        // leaving audio permanently dead.
        const engine = new AudioEngine();
        engineRef.current = engine;

        engine.setCallbacks({
            onEnded: () => {
                const state = stateRef.current;
                if (!state) return;
                // Push the resulting state into the query cache (not just the
                // backend) so the reconcile effect below actually fires for the
                // new track. Calling the raw api bypassed the cache, leaving the
                // engine paused while the server advanced.
                const applyState = (next: import("../../../shared/radio").RadioState) =>
                    qc.setQueryData(qk.radio, next);
                // Loop "one": replay the current track from the top instead of
                // advancing. Done on the engine directly since the reconcile
                // effect only re-plays on a track-id change.
                if (state.playback.loopMode === "one" && state.playback.currentTrackId) {
                    engine.seek(0);
                    void engine
                        .resume(state.playback.volume, state.playback.muted, state.playback.crossfadeMs)
                        .catch(() => undefined);
                    void api.radio.setPlaybackState({ currentTimeMs: 0 }).then(applyState).catch(() => undefined);
                    return;
                }
                const delta = buildAdvancePlayback(state);
                void api.radio
                    .setPlaybackState(delta ?? { isPlaying: false })
                    .then(applyState)
                    .catch(() => undefined);
            },
            onTime: ms => {
                setPosition(ms / 1000);
                if (Math.abs(ms - lastPersistedTimeRef.current) >= 4000) {
                    lastPersistedTimeRef.current = ms;
                    void api.radio.setPlaybackState({ currentTimeMs: ms }).catch(() => undefined);
                }
            },
            onError: message => {
                setErrorMessage(message || "The selected track could not be played.");
                void api.radio.setPlaybackState({ isPlaying: false }).catch(() => undefined);
            },
        });

        setSeekHandler((seconds: number) => {
            const ms = Math.max(0, Math.round(seconds * 1000));
            engine.seek(ms);
            setPosition(seconds);
            lastPersistedTimeRef.current = ms;
            void api.radio.setPlaybackState({ currentTimeMs: ms }).catch(() => undefined);
        });

        return () => {
            engine.dispose();
            engineRef.current = null;
            setSeekHandler(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Reconcile engine with desired playback whenever intent changes.
    const playback = radioState?.playback;
    const tracks = radioState?.tracks;
    const currentTrack = tracks?.find(t => t.id === playback?.currentTrackId) ?? null;

    useEffect(() => {
        const engine = engineRef.current;
        if (!engine || !playback) return;

        const targetVolume = playback.muted ? 0 : playback.volume;

        if (!currentTrack?.playbackUrl) {
            engine.stop();
            setCurrentTrack(null);
            setPlaying(false);
            return;
        }

        setCurrentTrack(currentTrack.id);
        setPlaying(playback.isPlaying);
        if (playback.isPlaying) setErrorMessage(null);

        const alreadyOnTrack = engine.getCurrentTrackId() === currentTrack.id;

        if (alreadyOnTrack) {
            if (playback.isPlaying) {
                void engine.resume(playback.volume, playback.muted, playback.crossfadeMs);
            } else {
                engine.pause();
                engine.setVolume(targetVolume, playback.muted);
            }
            return;
        }

        if (playback.isPlaying) {
            void engine.playTrack({
                trackId: currentTrack.id,
                playbackUrl: currentTrack.playbackUrl,
                startAtMs: playback.currentTimeMs,
                volume: playback.volume,
                muted: playback.muted,
                crossfadeMs: playback.crossfadeMs,
            });
        }
    }, [
        currentTrack?.id,
        currentTrack?.playbackUrl,
        playback?.isPlaying,
        playback?.volume,
        playback?.muted,
        playback?.crossfadeMs,
        setCurrentTrack,
        setErrorMessage,
        setPlaying,
    ]);
}
