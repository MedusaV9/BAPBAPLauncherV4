import { useEffect, useRef } from "react";
import { primeAudio, playRumble, playCrack, playWhoosh, playBoom, closeAudio } from "./riftSound";

type Crack = {
    angle: number;
    length: number;
    targetLength: number;
    width: number;
    branches: { at: number; angle: number; length: number; targetLength: number }[];
};

type Shard = {
    angle: number;
    speed: number;
    dist: number;
    size: number;
    rot: number;
    spin: number;
};

function riftApi(): { revealMain(): void; done(): void } | null {
    const api = (window as unknown as { v2Api?: { rift?: { revealMain(): void; done(): void } } }).v2Api;
    return api?.rift ?? null;
}

export function RiftIntro({ reduced }: { reduced: boolean }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const finishedRef = useRef(false);

    useEffect(() => {
        const api = riftApi();
        primeAudio();

        // Reduced motion: quick fade, then reveal + done fast, no sound.
        if (reduced) {
            const root = document.getElementById("root");
            if (root) root.style.background = "rgba(8,12,24,0.55)";
            const t1 = window.setTimeout(() => api?.revealMain(), 220);
            const t2 = window.setTimeout(() => {
                api?.done();
                finishedRef.current = true;
            }, 520);
            return () => {
                window.clearTimeout(t1);
                window.clearTimeout(t2);
            };
        }

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            api?.revealMain();
            api?.done();
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        const W = window.innerWidth;
        const H = window.innerHeight;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.scale(dpr, dpr);
        const cx = W / 2;
        const cy = H / 2;

        // Build a set of cracks radiating from the center.
        const crackCount = 11;
        const cracks: Crack[] = [];
        for (let i = 0; i < crackCount; i += 1) {
            const angle = (i / crackCount) * Math.PI * 2 + (i % 2 ? 0.18 : -0.12);
            const targetLength = Math.min(W, H) * (0.45 + (i % 3) * 0.12);
            const branches = [] as Crack["branches"];
            const branchCount = 2 + (i % 2);
            for (let b = 0; b < branchCount; b += 1) {
                branches.push({
                    at: 0.35 + b * 0.22,
                    angle: angle + (b % 2 ? 0.5 : -0.5),
                    length: 0,
                    targetLength: targetLength * (0.28 + (b % 2) * 0.12),
                });
            }
            cracks.push({ angle, length: 0, targetLength, width: 2.6 - (i % 3) * 0.5, branches });
        }

        const shards: Shard[] = [];
        let shardsSpawned = false;
        let raf = 0;
        const start = performance.now();
        // Timeline (ms): rumble 0–500, cracks spread 300–1500, glow 1100–1900,
        // boom/flash 1750, window emerges shortly after, overlay settles out.
        const DUR_REVEAL = 1880;
        const DUR_DONE = 2480;

        let rumbleSoundPlayed = false;
        let crackSoundPlayed = false;
        let whooshPlayed = false;
        let boomPlayed = false;
        let revealFired = false;

        const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

        function drawCrack(angle: number, length: number, width: number) {
            // Jagged line from center outward.
            ctx!.beginPath();
            ctx!.moveTo(cx, cy);
            const segs = 8;
            let px = cx;
            let py = cy;
            for (let s = 1; s <= segs; s += 1) {
                const frac = (s / segs) * length;
                const jitter = (Math.sin(s * 12.9898 + angle * 78.233) * 43758.5453 % 1) * 14 - 7;
                const nx = cx + Math.cos(angle) * frac + Math.cos(angle + Math.PI / 2) * jitter;
                const ny = cy + Math.sin(angle) * frac + Math.sin(angle + Math.PI / 2) * jitter;
                ctx!.lineTo(nx, ny);
                px = nx;
                py = ny;
            }
            void px;
            void py;
            ctx!.lineWidth = width;
            ctx!.stroke();
        }

        function frame(now: number) {
            const elapsed = now - start;
            ctx!.clearRect(0, 0, W, H);

            // Screen shake: builds through the rumble, steady tremor while the
            // cracks spread, then a hard jolt at the boom that decays fast.
            let shakeAmp = 1.5 * Math.min(1, elapsed / 500);
            if (elapsed > 300 && elapsed < 1750) shakeAmp = 3;
            if (elapsed >= 1750) shakeAmp = 22 * Math.max(0, 1 - (elapsed - 1750) / 450);
            const shakeX = (Math.random() * 2 - 1) * shakeAmp;
            const shakeY = (Math.random() * 2 - 1) * shakeAmp;
            ctx!.save();
            ctx!.translate(shakeX, shakeY);

            // Rumble: subtle dark vignette that intensifies.
            const rumble = Math.min(1, elapsed / 500);
            ctx!.fillStyle = `rgba(6,9,18,${0.18 * rumble})`;
            ctx!.fillRect(0, 0, W, H);

            if (!rumbleSoundPlayed) {
                rumbleSoundPlayed = true;
                playRumble(0.9);
            }
            if (elapsed > 220 && !crackSoundPlayed) {
                crackSoundPlayed = true;
                playCrack(0.9);
            }

            // Crack spread.
            const spread = easeOut(Math.max(0, Math.min(1, (elapsed - 300) / 1200)));
            ctx!.strokeStyle = "rgba(15,20,34,0.95)";
            ctx!.lineCap = "round";
            for (const c of cracks) {
                c.length = c.targetLength * spread;
                drawCrack(c.angle, c.length, c.width);
                for (const br of c.branches) {
                    if (spread > br.at) {
                        const bl = br.targetLength * easeOut(Math.min(1, (spread - br.at) / (1 - br.at)));
                        const bx = cx + Math.cos(c.angle) * (c.length * br.at);
                        const by = cy + Math.sin(c.angle) * (c.length * br.at);
                        ctx!.beginPath();
                        ctx!.moveTo(bx, by);
                        ctx!.lineTo(bx + Math.cos(br.angle) * bl, by + Math.sin(br.angle) * bl);
                        ctx!.lineWidth = c.width * 0.6;
                        ctx!.stroke();
                    }
                }
            }

            // Energy glow along fractures.
            if (elapsed > 1100) {
                if (!whooshPlayed) {
                    whooshPlayed = true;
                    playWhoosh(0.8);
                }
                const glow = Math.min(1, (elapsed - 1100) / 800);
                const grad = ctx!.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.55);
                grad.addColorStop(0, `rgba(233,30,140,${0.5 * glow})`);
                grad.addColorStop(0.4, `rgba(120,40,200,${0.32 * glow})`);
                grad.addColorStop(1, "rgba(0,0,0,0)");
                ctx!.fillStyle = grad;
                ctx!.fillRect(0, 0, W, H);

                ctx!.strokeStyle = `rgba(255,120,210,${0.7 * glow})`;
                for (const c of cracks) {
                    drawCrack(c.angle, c.length, c.width * 0.5);
                }
            }

            // Flash + portal opens.
            if (elapsed > 1750) {
                if (!boomPlayed) {
                    boomPlayed = true;
                    playBoom(1);
                }
                if (!shardsSpawned) {
                    shardsSpawned = true;
                    const count = 26;
                    for (let s = 0; s < count; s += 1) {
                        shards.push({
                            angle: (s / count) * Math.PI * 2 + ((s * 2.3) % 1) - 0.5,
                            speed: 6 + ((s * 7.7) % 9),
                            dist: Math.min(W, H) * 0.08,
                            size: 6 + ((s * 5.1) % 16),
                            rot: (s * 1.7) % Math.PI,
                            spin: ((s % 2 ? 1 : -1) * (0.04 + ((s * 3.1) % 0.12))),
                        });
                    }
                }
                const flash = Math.min(1, (elapsed - 1750) / 320);
                const portalR = Math.min(W, H) * 0.62 * easeOut(flash);
                const grad = ctx!.createRadialGradient(cx, cy, 0, cx, cy, portalR);
                // Warm core rather than pure blinding white — softer on the
                // eyes and avoids a full-screen white photosensitivity flash.
                grad.addColorStop(0, `rgba(255,236,250,${0.78 * flash})`);
                grad.addColorStop(0.5, `rgba(255,130,214,${0.55 * flash})`);
                grad.addColorStop(1, "rgba(0,0,0,0)");
                ctx!.fillStyle = grad;
                ctx!.beginPath();
                ctx!.arc(cx, cy, portalR, 0, Math.PI * 2);
                ctx!.fill();
            }

            // Debris shards flung outward from the rift.
            if (shards.length) {
                const shardFade = Math.max(0, 1 - (elapsed - 1750) / 900);
                ctx!.fillStyle = `rgba(18,22,38,${0.9 * shardFade})`;
                ctx!.strokeStyle = `rgba(255,150,220,${0.7 * shardFade})`;
                ctx!.lineWidth = 1;
                for (const sh of shards) {
                    sh.dist += sh.speed;
                    sh.speed *= 0.985;
                    sh.rot += sh.spin;
                    const px = cx + Math.cos(sh.angle) * sh.dist;
                    const py = cy + Math.sin(sh.angle) * sh.dist;
                    ctx!.save();
                    ctx!.translate(px, py);
                    ctx!.rotate(sh.rot);
                    ctx!.beginPath();
                    ctx!.moveTo(0, -sh.size);
                    ctx!.lineTo(sh.size * 0.6, sh.size * 0.5);
                    ctx!.lineTo(-sh.size * 0.5, sh.size * 0.4);
                    ctx!.closePath();
                    ctx!.fill();
                    ctx!.stroke();
                    ctx!.restore();
                }
            }

            if (elapsed > DUR_REVEAL && !revealFired) {
                revealFired = true;
                api?.revealMain();
            }

            ctx!.restore();

            // Fade the overlay out so the real window shows through.
            if (elapsed > DUR_REVEAL) {
                const fade = Math.min(1, (elapsed - DUR_REVEAL) / (DUR_DONE - DUR_REVEAL));
                if (canvas) canvas.style.opacity = String(1 - fade);
            }

            if (elapsed >= DUR_DONE) {
                if (!finishedRef.current) {
                    finishedRef.current = true;
                    api?.done();
                }
                return;
            }
            raf = requestAnimationFrame(frame);
        }

        raf = requestAnimationFrame(frame);

        return () => {
            cancelAnimationFrame(raf);
            if (!finishedRef.current) {
                api?.done();
            }
            closeAudio();
        };
    }, [reduced]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: "fixed",
                inset: 0,
                width: "100vw",
                height: "100vh",
                pointerEvents: "none",
                background: "transparent",
            }}
        />
    );
}
