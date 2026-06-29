// Procedurally synthesized rift sounds via the Web Audio API.
// No audio assets required — crack/whoosh/boom are generated from
// oscillator sweeps and filtered noise bursts.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        ctx = new Ctor();
    }
    return ctx;
}

export function primeAudio(): void {
    const ac = getCtx();
    if (ac && ac.state === "suspended") {
        void ac.resume();
    }
}

function makeNoiseBuffer(ac: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(ac.sampleRate * seconds);
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
        data[i] = Math.random() * 2 - 1;
    }
    return buffer;
}

// Low building drone — the ground rumbling before the crack.
export function playRumble(volume = 1): void {
    const ac = getCtx();
    if (!ac) return;
    const now = ac.currentTime;

    const osc = ac.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(34, now);
    osc.frequency.linearRampToValueAtTime(52, now + 1.4);

    const lowpass = ac.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 140;

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.45 * volume, now + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);

    osc.connect(lowpass).connect(gain).connect(ac.destination);
    osc.start(now);
    osc.stop(now + 1.55);
}

// Sharp, bright transient — the screen cracking.
export function playCrack(volume = 1): void {
    const ac = getCtx();
    if (!ac) return;
    const now = ac.currentTime;

    const noise = ac.createBufferSource();
    noise.buffer = makeNoiseBuffer(ac, 0.4);

    const bandpass = ac.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(2600, now);
    bandpass.frequency.exponentialRampToValueAtTime(700, now + 0.3);
    bandpass.Q.value = 0.8;

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.9 * volume, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    noise.connect(bandpass).connect(gain).connect(ac.destination);
    noise.start(now);
    noise.stop(now + 0.4);

    // A quick descending zap on top of the noise for the "snap".
    const osc = ac.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.18);
    const oscGain = ac.createGain();
    oscGain.gain.setValueAtTime(0.4 * volume, now);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc.connect(oscGain).connect(ac.destination);
    osc.start(now);
    osc.stop(now + 0.22);
}

// Rising airy sweep — energy gathering before the portal opens.
export function playWhoosh(volume = 1): void {
    const ac = getCtx();
    if (!ac) return;
    const now = ac.currentTime;

    const noise = ac.createBufferSource();
    noise.buffer = makeNoiseBuffer(ac, 1.2);

    const lowpass = ac.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(300, now);
    lowpass.frequency.exponentialRampToValueAtTime(5200, now + 0.9);
    lowpass.Q.value = 6;

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.5 * volume, now + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);

    noise.connect(lowpass).connect(gain).connect(ac.destination);
    noise.start(now);
    noise.stop(now + 1.2);
}

// Deep impact — the launcher bursts through.
export function playBoom(volume = 1): void {
    const ac = getCtx();
    if (!ac) return;
    const now = ac.currentTime;

    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.6);

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(1.0 * volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

    osc.connect(gain).connect(ac.destination);
    osc.start(now);
    osc.stop(now + 0.95);

    // Low-frequency noise rumble layered under the sine.
    const noise = ac.createBufferSource();
    noise.buffer = makeNoiseBuffer(ac, 0.9);
    const lowpass = ac.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 220;
    const noiseGain = ac.createGain();
    noiseGain.gain.setValueAtTime(0.6 * volume, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    noise.connect(lowpass).connect(noiseGain).connect(ac.destination);
    noise.start(now);
    noise.stop(now + 0.9);
}

export function closeAudio(): void {
    if (ctx) {
        void ctx.close();
        ctx = null;
    }
}
