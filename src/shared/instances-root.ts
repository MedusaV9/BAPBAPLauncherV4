export function normalizeInstancesRootPath(value: string, fallback: string): string {
    const normalizedFallback = normalizeSeparators(`${fallback || ""}`.trim());
    const candidate = normalizeSeparators(`${value || ""}`.trim()) || normalizedFallback;
    if (!candidate) {
        return "";
    }

    if (isWindowsDriveRoot(candidate)) {
        const driveRoot = stripTrailingSeparators(candidate);
        return `${driveRoot}\\BAPBAP Launcher\\instances`;
    }

    return stripTrailingSeparators(candidate);
}

function normalizeSeparators(value: string): string {
    return value.replace(/\//g, "\\");
}

function isWindowsDriveRoot(value: string): boolean {
    return /^[a-zA-Z]:\\?$/.test(value);
}

function stripTrailingSeparators(value: string): string {
    if (isWindowsDriveRoot(value)) {
        return value.endsWith("\\") ? value.slice(0, -1) : value;
    }
    return value.replace(/[\\]+$/g, "");
}
