import { create } from "zustand";

type RadioPlayerState = {
    currentTrackId: string | null;
    isPlaying: boolean;
    positionSeconds: number;
    durationSeconds: number;
    crossfading: boolean;

    setCurrentTrack: (trackId: string | null) => void;
    setPlaying: (playing: boolean) => void;
    setPosition: (seconds: number) => void;
    setDuration: (seconds: number) => void;
    setCrossfading: (value: boolean) => void;
};

export const useRadioPlayerStore = create<RadioPlayerState>(set => ({
    currentTrackId: null,
    isPlaying: false,
    positionSeconds: 0,
    durationSeconds: 0,
    crossfading: false,

    setCurrentTrack: trackId => set({ currentTrackId: trackId }),
    setPlaying: playing => set({ isPlaying: playing }),
    setPosition: seconds => set({ positionSeconds: seconds }),
    setDuration: seconds => set({ durationSeconds: seconds }),
    setCrossfading: value => set({ crossfading: value }),
}));
