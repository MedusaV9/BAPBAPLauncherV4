/**
 * Formats a byte count into a human-readable string using binary (1024-based)
 * units. Designed for download/install UI surfaces (gate banner, install tile,
 * launcher updater, etc.) so size labels stay consistent across the launcher.
 *
 * Rules:
 *   - Bytes below 1 KB are rendered without decimals: "0 B", "512 B", "999 B".
 *   - 1 KB and above use up to 1 decimal place; trailing ".0" is stripped so
 *     whole values render cleanly: "1 KB", "1.5 MB", "1 GB", "538.6 MB".
 *   - Non-finite, negative, or missing values return "unknown size" so callers
 *     can render a stable placeholder instead of "NaN B" or empty strings.
 */
const BYTE_UNITS = ["KB", "MB", "GB", "TB", "PB"] as const;
const UNKNOWN_LABEL = "unknown size";

export function formatBytes(bytes?: number | null): string {
    if (bytes === undefined || bytes === null) {
        return UNKNOWN_LABEL;
    }
    if (!Number.isFinite(bytes) || bytes < 0) {
        return UNKNOWN_LABEL;
    }

    if (bytes < 1024) {
        // Whole bytes only — no decimals below 1 KB.
        return `${Math.round(bytes)} B`;
    }

    let size = bytes / 1024;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }

    let formatted = size.toFixed(1);
    if (formatted.endsWith(".0")) {
        formatted = formatted.slice(0, -2);
    }

    return `${formatted} ${BYTE_UNITS[unitIndex]}`;
}
