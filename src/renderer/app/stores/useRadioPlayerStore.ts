import { create } from "zustand";

type RadioPlayerState = {
    currentTrackId: string | null;
    isPlaying: boolean;
    positionSeconds: number;
    durationSeconds: number;
    crossfading: boolean;
    errorMessage: string | null;
    seekHandler: ((seconds: number) => void) | null;

    setCurrentTrack: (trackId: string | null) => void;
    setPlaying: (playing: boolean) => void;
    setPosition: (seconds: number) => void;
    setDuration: (seconds: number) => void;
    setCrossfading: (value: boolean) => void;
    setErrorMessage: (message: string | null) => void;
    setSeekHandler: (handler: ((seconds: number) => void) | null) => void;
};

export const useRadioPlayerStore = create<RadioPlayerState>(set => ({
    currentTrackId: null,
    isPlaying: false,
    positionSeconds: 0,
    durationSeconds: 0,
    crossfading: false,
    errorMessage: null,
    seekHandler: null,

    setCurrentTrack: trackId => set({ currentTrackId: trackId }),
    setPlaying: playing => set({ isPlaying: playing }),
    setPosition: seconds => set({ positionSeconds: seconds }),
    setDuration: seconds => set({ durationSeconds: seconds }),
    setCrossfading: value => set({ crossfading: value }),
    setErrorMessage: message => set({ errorMessage: message }),
    setSeekHandler: handler => set({ seekHandler: handler }),
}));
