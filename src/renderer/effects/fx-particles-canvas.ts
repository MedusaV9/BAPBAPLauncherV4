import type { FxRuntimeMetrics, MotionTier, ParticleEmitterPattern, ParticlePreset } from "./fx-types";

type ParticleRuntimeMetrics = Pick<FxRuntimeMetrics, "particleCount" | "cappedSpawns" | "activeEmitters" | "tier">;

type Particle = {
    alive: boolean;
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
    alpha: number;
    color: string;
    rotation: number;
    rotationSpeed: number;
    glyph: string;
    anchorX: number;
    anchorY: number;
    orbitRadius: number;
    orbitAngle: number;
    orbitSpeed: number;
    exploded: boolean;
};

type ParticleHandle = {
    destroy: () => void;
};

type ParticleMountOptions = {
    intensity: number;
    localMax: number;
    globalMax: number;
    tier: MotionTier;
    paused?: boolean;
    onMetrics?: (metrics: ParticleRuntimeMetrics) => void;
};

const GLYPHS = ["0", "1", "A", "7", "#", "x", "*", "+", "b", "p"];

const GLOBAL_PARTICLE_STATE = {
    nextEmitterId: 1,
    totalAlive: 0,
    emitterCounts: new Map<string, number>(),
};

function setEmitterAliveCount(emitterId: string, nextCount: number): void {
    const prev = GLOBAL_PARTICLE_STATE.emitterCounts.get(emitterId) ?? 0;
    GLOBAL_PARTICLE_STATE.totalAlive += nextCount - prev;
    GLOBAL_PARTICLE_STATE.totalAlive = Math.max(0, GLOBAL_PARTICLE_STATE.totalAlive);
    GLOBAL_PARTICLE_STATE.emitterCounts.set(emitterId, nextCount);
}

function releaseEmitter(emitterId: string): void {
    const prev = GLOBAL_PARTICLE_STATE.emitterCounts.get(emitterId) ?? 0;
    GLOBAL_PARTICLE_STATE.totalAlive -= prev;
    GLOBAL_PARTICLE_STATE.totalAlive = Math.max(0, GLOBAL_PARTICLE_STATE.totalAlive);
    GLOBAL_PARTICLE_STATE.emitterCounts.delete(emitterId);
}

function getActiveEmitterCount(): number {
    return GLOBAL_PARTICLE_STATE.emitterCounts.size;
}

export function mountFxParticles(host: HTMLElement, preset: ParticlePreset, options: ParticleMountOptions): ParticleHandle {
    const intensity = clamp(options.intensity, 0, 3.2);
    const localMax = Math.max(0, Math.round(options.localMax));
    const globalMax = Math.max(0, Math.round(options.globalMax));
    if (intensity <= 0.01 || options.paused || localMax <= 0 || globalMax <= 0) {
        return { destroy: () => undefined };
    }

    const emitterId = `fx-emitter-${GLOBAL_PARTICLE_STATE.nextEmitterId++}`;
    setEmitterAliveCount(emitterId, 0);

    const canvas = document.createElement("canvas");
    canvas.className = "fx-particle-canvas";
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);
    const context = canvas.getContext("2d");
    if (!context) {
        releaseEmitter(emitterId);
        canvas.remove();
        return { destroy: () => undefined };
    }
    const ctx = context;

    const particleBudget = Math.max(8, Math.min(localMax, Math.round(preset.maxParticles * intensity)));
    const particles: Particle[] = new Array(particleBudget).fill(null).map(() => createDeadParticle());
    let running = true;
    let frameId = 0;
    let lastFrame = performance.now();
    let spawnAccumulator = 0;
    let width = 1;
    let height = 1;
    let pixelRatio = 1;
    let metricsTick = 0;
    let cappedSpawns = 0;
    const steadyParticleFloor = Math.min(
        localMax,
        Math.max(8, Math.round(particleBudget * clamp(0.24 + intensity * 0.05, 0.22, 0.38)))
    );

    const resizeObserver = new ResizeObserver(() => {
        resize();
    });
    resizeObserver.observe(host);
    resize();

    function getAliveCount(): number {
        let aliveCount = 0;
        for (const particle of particles) {
            if (particle.alive) {
                aliveCount += 1;
            }
        }
        return aliveCount;
    }

    function reportMetrics(aliveCount: number): void {
        setEmitterAliveCount(emitterId, aliveCount);
        options.onMetrics?.({
            particleCount: aliveCount,
            cappedSpawns,
            activeEmitters: getActiveEmitterCount(),
            tier: options.tier,
        });
    }

    function resize(): void {
        const rect = host.getBoundingClientRect();
        width = Math.max(1, Math.floor(rect.width));
        height = Math.max(1, Math.floor(rect.height));
        pixelRatio = clamp(window.devicePixelRatio || 1, 1, 2);
        canvas.width = Math.max(1, Math.floor(width * pixelRatio));
        canvas.height = Math.max(1, Math.floor(height * pixelRatio));
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(pixelRatio, pixelRatio);
    }

    function spawnParticle(): boolean {
        if (document.hidden) {
            return false;
        }
        if (GLOBAL_PARTICLE_STATE.totalAlive >= globalMax) {
            cappedSpawns += 1;
            return false;
        }

        const slot = particles.find(item => !item.alive);
        if (!slot) {
            return false;
        }
        const aliveCount = particles.reduce((count, particle) => count + (particle.alive ? 1 : 0), 0);
        if (aliveCount >= localMax) {
            cappedSpawns += 1;
            return false;
        }

        const { x, y } = spawnPosition(preset.zone, width, height);

        const speedMultiplierY = Math.max(1, height / 220); // Scale up speed for tall version cards
        const speedMultiplierX = Math.max(1, width / 280); // Slight boost for very wide list cards

        slot.alive = true;
        slot.x = x;
        slot.y = y;
        slot.vx = randomInRange(preset.speedX[0], preset.speedX[1]) * speedMultiplierX;
        slot.vy = randomInRange(preset.speedY[0], preset.speedY[1]) * speedMultiplierY;
        slot.maxLife = randomInRange(preset.lifeMs[0], preset.lifeMs[1]);
        slot.life = slot.maxLife;
        slot.size = randomInRange(preset.size[0], preset.size[1]);
        slot.alpha = randomInRange(preset.alpha[0], preset.alpha[1]);
        slot.color = preset.colors[Math.floor(Math.random() * preset.colors.length)];
        slot.rotation = randomInRange(0, Math.PI * 2);
        slot.rotationSpeed = randomInRange(-0.07, 0.07);
        slot.glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        slot.anchorX = x;
        slot.anchorY = y;
        slot.orbitRadius = randomInRange(20, Math.max(24, Math.min(width, height) * 0.3));
        slot.orbitAngle = randomInRange(0, Math.PI * 2);
        slot.orbitSpeed = randomInRange(0.4, 1.7);
        slot.exploded = false;
        return true;
    }

    function updateParticle(p: Particle, dt: number): void {
        const phaseT = 1 - p.life / p.maxLife;
        applyPatternMotion(p, preset.pattern, dt, phaseT, preset, width, height);
        p.x += p.vx * dt * 0.001;
        p.y += p.vy * dt * 0.001;
        p.rotation += p.rotationSpeed;
    }

    function drawParticle(p: Particle): void {
        const lifeT = 1 - p.life / p.maxLife;
        const fade = lifeT < 0.2 ? lifeT / 0.2 : lifeT > 0.82 ? (1 - lifeT) / 0.18 : 1;
        const alpha = p.alpha * fade;
        if (alpha <= 0.001) {
            return;
        }
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.strokeStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        switch (preset.shape) {
            case "dot":
                ctx.beginPath();
                ctx.arc(0, 0, p.size, 0, Math.PI * 2);
                ctx.fill();
                break;
            case "square":
                ctx.fillRect(-p.size * 0.6, -p.size * 0.6, p.size * 1.2, p.size * 1.2);
                break;
            case "diamond":
                ctx.beginPath();
                ctx.moveTo(0, -p.size);
                ctx.lineTo(p.size * 0.75, 0);
                ctx.lineTo(0, p.size);
                ctx.lineTo(-p.size * 0.75, 0);
                ctx.closePath();
                ctx.fill();
                break;
            case "line":
                ctx.lineWidth = Math.max(1, p.size * 0.55);
                ctx.beginPath();
                ctx.moveTo(0, -p.size * 1.8);
                ctx.lineTo(0, p.size * 1.8);
                ctx.stroke();
                break;
            case "glyph":
                ctx.font = `${Math.max(8, p.size * 3.2)}px Consolas, monospace`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(p.glyph, 0, 0);
                break;
            case "flake":
                ctx.lineWidth = Math.max(1, p.size * 0.22);
                ctx.beginPath();
                ctx.moveTo(-p.size, 0);
                ctx.lineTo(p.size, 0);
                ctx.moveTo(0, -p.size);
                ctx.lineTo(0, p.size);
                ctx.moveTo(-p.size * 0.72, -p.size * 0.72);
                ctx.lineTo(p.size * 0.72, p.size * 0.72);
                ctx.moveTo(-p.size * 0.72, p.size * 0.72);
                ctx.lineTo(p.size * 0.72, -p.size * 0.72);
                ctx.stroke();
                break;
            case "spark":
                ctx.lineWidth = Math.max(1, p.size * 0.3);
                ctx.beginPath();
                ctx.moveTo(-p.size, 0);
                ctx.lineTo(p.size, 0);
                ctx.moveTo(0, -p.size);
                ctx.lineTo(0, p.size);
                ctx.stroke();
                break;
            default:
                break;
        }
        ctx.restore();
    }

    function tick(now: number): void {
        if (!running) {
            return;
        }
        const dt = Math.min(50, now - lastFrame);
        lastFrame = now;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        ctx.globalCompositeOperation = preset.blendMode;

        const shouldSpawn = !document.hidden;
        if (shouldSpawn) {
            let aliveCount = getAliveCount();
            if (aliveCount < steadyParticleFloor) {
                let topUpBudget = Math.max(2, Math.min(steadyParticleFloor - aliveCount, Math.round(preset.spawnRate * 0.22)));
                while (topUpBudget > 0) {
                    if (!spawnParticle()) {
                        break;
                    }
                    topUpBudget -= 1;
                    aliveCount += 1;
                }
            }
            spawnAccumulator += (preset.spawnRate * intensity * dt) / 1000;
            while (spawnAccumulator >= 1) {
                spawnAccumulator -= 1;
                spawnParticle();
            }
        }

        let aliveCount = 0;
        for (const particle of particles) {
            if (!particle.alive) {
                continue;
            }
            particle.life -= dt;
            if (particle.life <= 0) {
                particle.alive = false;
                continue;
            }

            updateParticle(particle, dt);
            if (particle.x < -80 || particle.x > width + 80 || particle.y < -120 || particle.y > height + 120) {
                particle.alive = false;
                continue;
            }

            drawParticle(particle);
            aliveCount += 1;
        }

        setEmitterAliveCount(emitterId, aliveCount);
        metricsTick += dt;
        if (options.onMetrics && metricsTick >= 260) {
            options.onMetrics({
                particleCount: aliveCount,
                cappedSpawns,
                activeEmitters: getActiveEmitterCount(),
                tier: options.tier,
            });
            metricsTick = 0;
        }

        frameId = window.requestAnimationFrame(tick);
    }

    if (!document.hidden) {
        const initialBurst = Math.min(
            localMax,
            Math.max(6, Math.round(Math.min(particleBudget, Math.max(steadyParticleFloor, preset.spawnRate * intensity * 0.24))))
        );
        for (let index = 0; index < initialBurst; index += 1) {
            if (!spawnParticle()) {
                break;
            }
        }
        reportMetrics(getAliveCount());
    } else {
        reportMetrics(0);
    }

    frameId = window.requestAnimationFrame(tick);

    return {
        destroy: () => {
            running = false;
            if (frameId) {
                window.cancelAnimationFrame(frameId);
            }
            resizeObserver.disconnect();
            releaseEmitter(emitterId);
            canvas.remove();
        },
    };
}

function applyPatternMotion(
    particle: Particle,
    pattern: ParticleEmitterPattern,
    dt: number,
    phaseT: number,
    preset: ParticlePreset,
    width: number,
    height: number
): void {
    switch (pattern) {
        case "orbital":
            particle.orbitAngle += particle.orbitSpeed * dt * 0.0012;
            particle.orbitRadius += Math.sin((performance.now() * 0.001 + particle.orbitAngle) * 1.2) * 0.04;
            particle.x = particle.anchorX + Math.cos(particle.orbitAngle) * particle.orbitRadius;
            particle.y = particle.anchorY + Math.sin(particle.orbitAngle) * (particle.orbitRadius * 0.65);
            particle.vx = 0;
            particle.vy = 0;
            break;
        case "swarm":
            particle.vx += randomInRange(-1.8, 1.8) * dt * 0.015;
            particle.vy += randomInRange(-1.1, preset.zone === "full" ? 1.1 : 0.4) * dt * 0.02;
            particle.vy -= (preset.zone === "full" ? 4.5 : 10) * dt * 0.001;
            particle.rotationSpeed += randomInRange(-0.002, 0.002);
            break;
        case "implosion": {
            const centerX = width * 0.5;
            const centerY = height * 0.5;
            const pull = preset.centerPull ?? 1;
            if (phaseT < 0.6) {
                particle.vx += (centerX - particle.x) * 0.0015 * pull * (dt / 16);
                particle.vy += (centerY - particle.y) * 0.0015 * pull * (dt / 16);
                particle.vx *= 0.98;
                particle.vy *= 0.98;
            } else if (!particle.exploded) {
                const angle = Math.atan2(particle.y - centerY, particle.x - centerX) + randomInRange(-0.4, 0.4);
                const burstForce = randomInRange(160, 380);
                particle.vx = Math.cos(angle) * burstForce;
                particle.vy = Math.sin(angle) * burstForce;
                particle.exploded = true;
            }
            break;
        }
        case "rain":
            particle.vy += 16 * dt * 0.001;
            particle.vx += Math.sin((particle.y + performance.now() * 0.003) * 0.02) * (preset.drift * dt * 0.0009);
            break;
        case "matrix-fall":
            particle.vy += 10 * dt * 0.001;
            particle.vx += Math.sin((particle.x + performance.now() * 0.0018) * 0.04) * 0.22;
            particle.rotation = 0;
            break;
        case "burst-grid":
            particle.vx += randomInRange(-2.4, 2.4) * dt * 0.018;
            particle.vy += randomInRange(-2.4, 2.4) * dt * 0.018;
            particle.rotationSpeed += randomInRange(-0.01, 0.01);
            break;
        case "drift":
        default:
            particle.vx += Math.sin((particle.y + performance.now() * 0.003) * 0.02) * (preset.drift * dt * 0.00055);
            break;
    }
}

function createDeadParticle(): Particle {
    return {
        alive: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 1,
        alpha: 0.6,
        color: "transparent",
        rotation: 0,
        rotationSpeed: 0,
        glyph: "0",
        anchorX: 0,
        anchorY: 0,
        orbitRadius: 0,
        orbitAngle: 0,
        orbitSpeed: 0,
        exploded: false,
    };
}

function spawnPosition(zone: ParticlePreset["zone"], width: number, height: number): { x: number; y: number } {
    switch (zone) {
        case "top":
            return { x: Math.random() * width, y: -8 };
        case "bottom":
            return { x: Math.random() * width, y: height + 8 };
        case "edge": {
            const edge = Math.random();
            if (edge < 0.25) {
                return { x: -8, y: Math.random() * height };
            }
            if (edge < 0.5) {
                return { x: width + 8, y: Math.random() * height };
            }
            if (edge < 0.75) {
                return { x: Math.random() * width, y: -8 };
            }
            return { x: Math.random() * width, y: height + 8 };
        }
        case "center":
            return { x: width * 0.5 + randomInRange(-width * 0.18, width * 0.18), y: height * 0.5 + randomInRange(-height * 0.18, height * 0.18) };
        case "full":
        default:
            return { x: Math.random() * width, y: Math.random() * height };
    }
}

function randomInRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
