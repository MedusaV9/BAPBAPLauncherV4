import { describe, expect, it } from "vitest";
import { formatBytes } from "./format-bytes";

describe("formatBytes", () => {
    it("returns '0 B' for an empty payload", () => {
        expect(formatBytes(0)).toBe("0 B");
    });

    it("keeps values below 1 KB in plain bytes without decimals", () => {
        expect(formatBytes(512)).toBe("512 B");
        expect(formatBytes(999)).toBe("999 B");
        expect(formatBytes(1023)).toBe("1023 B");
    });

    it("renders whole KB without trailing '.0'", () => {
        expect(formatBytes(1024)).toBe("1 KB");
    });

    it("renders fractional MB with one decimal", () => {
        expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
    });

    it("renders large MB values using binary units (564701369 -> '538.5 MB')", () => {
        // 564701369 / 1024^2 ≈ 538.5414 -> toFixed(1) -> "538.5 MB".
        // Task spec accepts "539 MB" (rounded) or one-decimal binary form.
        expect(formatBytes(564701369)).toBe("538.5 MB");
    });

    it("renders whole GB without trailing '.0'", () => {
        expect(formatBytes(1024 ** 3)).toBe("1 GB");
    });

    it("returns 'unknown size' for missing values", () => {
        expect(formatBytes(undefined)).toBe("unknown size");
        expect(formatBytes(null)).toBe("unknown size");
    });

    it("returns 'unknown size' for non-finite or negative values", () => {
        expect(formatBytes(Number.NaN)).toBe("unknown size");
        expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("unknown size");
        expect(formatBytes(-1)).toBe("unknown size");
    });
});
