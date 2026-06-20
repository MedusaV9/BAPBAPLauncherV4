import { describe, expect, it } from "vitest";
import { formatCountdownLabel, parseUnlockAtUtc, resolveUnlockStatus } from "./unlock-time";

describe("unlock-time", () => {
    it("parses valid utc timestamps and rejects invalid values", () => {
        expect(parseUnlockAtUtc("2026-03-10T18:00:00Z")).toBe(Date.parse("2026-03-10T18:00:00Z"));
        expect(parseUnlockAtUtc("bad-date")).toBeNull();
        expect(parseUnlockAtUtc("")).toBeNull();
    });

    it("locks when trusted time is unavailable", () => {
        const result = resolveUnlockStatus("2026-03-10T18:00:00Z", undefined, false);
        expect(result.locked).toBe(true);
        expect(result.reason).toBe("waiting-time-source");
    });

    it("unlocks once trusted time reaches the target", () => {
        const result = resolveUnlockStatus("2026-03-10T18:00:00Z", Date.parse("2026-03-10T18:00:01Z"), true);
        expect(result.locked).toBe(false);
        expect(result.reason).toBe("unlocked");
    });

    it("formats countdown labels", () => {
        expect(formatCountdownLabel(90_000)).toBe("00:01:30");
        expect(formatCountdownLabel(24 * 60 * 60 * 1000 + 5_000)).toBe("1d 00:00:05");
    });
});
