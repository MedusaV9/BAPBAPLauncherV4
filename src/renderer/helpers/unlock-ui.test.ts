import { describe, expect, it } from "vitest";
import type { TrustedTimeState } from "../../shared/ipc";
import {
    isTrustedTimeReady,
    resolveUnlockUiState,
    getUnlockCountdownLabel,
    formatUnlockLocal,
} from "./unlock-ui";

function trustedTime(overrides: Partial<TrustedTimeState> = {}): TrustedTimeState {
    return {
        status: "ready",
        configured: true,
        available: true,
        trustedEpochMs: 1_700_000_000_000,
        ...overrides,
    };
}

const FUTURE = "2999-01-01T00:00:00.000Z";
const PAST = "2000-01-01T00:00:00.000Z";
const FUTURE_MS = Date.parse(FUTURE);

describe("isTrustedTimeReady", () => {
    it("is true only when available with a finite epoch", () => {
        expect(isTrustedTimeReady(trustedTime())).toBe(true);
    });

    it("is false when unavailable", () => {
        expect(isTrustedTimeReady(trustedTime({ available: false }))).toBe(false);
    });

    it("is false when the epoch is missing", () => {
        expect(isTrustedTimeReady(trustedTime({ trustedEpochMs: undefined }))).toBe(false);
    });

    it("is false for a null state", () => {
        expect(isTrustedTimeReady(null)).toBe(false);
    });
});

describe("resolveUnlockUiState", () => {
    it("reports no unlock when unlockAtUtc is absent", () => {
        const status = resolveUnlockUiState(undefined, trustedTime(), 1_700_000_000_000);
        expect(status.hasUnlock).toBe(false);
        expect(status.locked).toBe(false);
    });

    it("waits for the time source when trusted time is unavailable", () => {
        const status = resolveUnlockUiState(FUTURE, trustedTime({ available: false }), null);
        expect(status.locked).toBe(true);
        expect(status.reason).toBe("waiting-time-source");
    });

    it("counts down when the unlock is in the future", () => {
        const status = resolveUnlockUiState(FUTURE, trustedTime(), FUTURE_MS - 60_000);
        expect(status.locked).toBe(true);
        expect(status.reason).toBe("countdown");
    });

    it("is unlocked once trusted now passes the unlock time", () => {
        const status = resolveUnlockUiState(PAST, trustedTime(), 1_700_000_000_000);
        expect(status.locked).toBe(false);
        expect(status.reason).toBe("unlocked");
    });

    it("marks an unparseable unlock time as invalid+locked", () => {
        const status = resolveUnlockUiState("not-a-date", trustedTime(), 1_700_000_000_000);
        expect(status.locked).toBe(true);
        expect(status.reason).toBe("invalid");
    });
});

describe("getUnlockCountdownLabel", () => {
    it("returns zero label when not locked", () => {
        const status = resolveUnlockUiState(PAST, trustedTime(), 1_700_000_000_000);
        expect(getUnlockCountdownLabel(status, 1_700_000_000_000)).toBe("00:00:00");
    });

    it("returns zero label when trustedNow is not finite", () => {
        const status = resolveUnlockUiState(FUTURE, trustedTime(), FUTURE_MS - 60_000);
        expect(getUnlockCountdownLabel(status, null)).toBe("00:00:00");
    });

    it("formats the remaining time for a locked countdown", () => {
        const status = resolveUnlockUiState(FUTURE, trustedTime(), FUTURE_MS - 3_661_000);
        // 1h 1m 1s remaining.
        expect(getUnlockCountdownLabel(status, FUTURE_MS - 3_661_000)).toBe("01:01:01");
    });

    it("includes a day prefix when more than 24h remains", () => {
        const status = resolveUnlockUiState(FUTURE, trustedTime(), FUTURE_MS - 90_000_000);
        // 90,000,000ms = 1d 1h 0m 0s.
        expect(getUnlockCountdownLabel(status, FUTURE_MS - 90_000_000)).toBe("1d 01:00:00");
    });
});

describe("formatUnlockLocal", () => {
    it("returns a dash for empty input", () => {
        expect(formatUnlockLocal(undefined)).toBe("-");
        expect(formatUnlockLocal("")).toBe("-");
    });

    it("returns the raw value when it cannot be parsed", () => {
        expect(formatUnlockLocal("garbage")).toBe("garbage");
    });

    it("renders a non-empty localized string for a valid date", () => {
        const label = formatUnlockLocal("2026-01-01T00:00:00.000Z");
        expect(typeof label).toBe("string");
        expect(label).not.toBe("-");
        expect(label.length).toBeGreaterThan(0);
    });
});
