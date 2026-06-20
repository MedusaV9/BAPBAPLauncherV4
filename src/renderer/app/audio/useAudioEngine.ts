import { useEffect, useRef } from "react";
import { api } from "../../api";
import { useRadioState } from "../query/hooks";
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
    const engineRef = useRef<AudioEngine | null>(null);
    const lastPersistedTimeRef = useRef(0);

    const setPosition = useRadioPlayerStore(s => s.setPosition);
    const setPlaying = useRadioPlayerStore(s => s.setPlaying);
    const setCurrentTrack = useRadioPlayerStore(s => s.setCurrentTrack);

    // Lazily create the singleton engine on first mount.
    if (!engineRef.current && typeof window !== "undefined") {
        engineRef.current = new AudioEngine();
    }

    // Keep the latest radio state available to engine callbacks without
    // re-subscribing the engine on every state change.
    const stateRef = useRef(radioState);
    stateRef.current = radioState;

    useEffect(() => {
        const engine = engineRef.current;
        if (!engine) return;

        engine.setCallbacks({
            onEnded: () => {
                const state = stateRef.current;
                if (!state) return;
                const delta = buildAdvancePlayback(state);
                void api.radio
                    .setPlaybackState(delta ?? { isPlaying: false })
                    .catch(() => undefined);
            },
            onTime: ms => {
                setPosition(ms / 1000);
                if (Math.abs(ms - lastPersistedTimeRef.current) >= 4000) {
                    lastPersistedTimeRef.current = ms;
                    void api.radio.setPlaybackState({ currentTimeMs: ms }).catch(() => undefined);
                }
            },
            onError: () => {
                void api.radio.setPlaybackState({ isPlaying: false }).catch(() => undefined);
            },
        });

        return () => {
            engine.dispose();
            engineRef.current = null;
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
        setPlaying,
    ]);
}
