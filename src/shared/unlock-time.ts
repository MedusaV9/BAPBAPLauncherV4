export type UnlockStatus =
    | { hasUnlock: false; unlockAtUtc?: undefined; unlockMs: null; locked: false; reason: "none" }
    | { hasUnlock: true; unlockAtUtc: string; unlockMs: null; locked: true; reason: "invalid" }
    | { hasUnlock: true; unlockAtUtc: string; unlockMs: number; locked: boolean; reason: "countdown" | "waiting-time-source" | "unlocked" };

export function parseUnlockAtUtc(value?: string | null): number | null {
    const trimmed = `${value || ""}`.trim();
    if (!trimmed) {
        return null;
    }
    const timestamp = Date.parse(trimmed);
    return Number.isFinite(timestamp) ? timestamp : null;
}

export function resolveUnlockStatus(
    unlockAtUtc: string | null | undefined,
    trustedNowMs?: number | null,
    trustedTimeAvailable = true
): UnlockStatus {
    const trimmed = `${unlockAtUtc || ""}`.trim();
    if (!trimmed) {
        return {
            hasUnlock: false,
            unlockMs: null,
            locked: false,
            reason: "none",
        };
    }

    const unlockMs = parseUnlockAtUtc(trimmed);
    if (unlockMs === null) {
        return {
            hasUnlock: true,
            unlockAtUtc: trimmed,
            unlockMs: null,
            locked: true,
            reason: "invalid",
        };
    }

    if (!trustedTimeAvailable || !Number.isFinite(trustedNowMs)) {
        return {
            hasUnlock: true,
            unlockAtUtc: trimmed,
            unlockMs,
            locked: true,
            reason: "waiting-time-source",
        };
    }

    if ((trustedNowMs as number) < unlockMs) {
        return {
            hasUnlock: true,
            unlockAtUtc: trimmed,
            unlockMs,
            locked: true,
            reason: "countdown",
        };
    }

    return {
        hasUnlock: true,
        unlockAtUtc: trimmed,
        unlockMs,
        locked: false,
        reason: "unlocked",
    };
}

export function formatCountdownParts(remainingMs: number): { days: number; hours: number; minutes: number; seconds: number } {
    const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return { days, hours, minutes, seconds };
}

export function formatCountdownLabel(remainingMs: number): string {
    const { days, hours, minutes, seconds } = formatCountdownParts(remainingMs);
    const hh = String(hours).padStart(2, "0");
    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");
    if (days > 0) {
        return `${days}d ${hh}:${mm}:${ss}`;
    }
    return `${hh}:${mm}:${ss}`;
}
