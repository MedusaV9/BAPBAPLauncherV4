import type { LauncherUpdaterState } from "../../shared/ipc";

export type LauncherUpdatePrimaryAction = {
    kind: "download" | "install" | null;
    label: string | null;
    disabled: boolean;
};

export function getLauncherUpdatePrimaryAction(state: LauncherUpdaterState | null): LauncherUpdatePrimaryAction {
    if (!state) {
        return { kind: null, label: null, disabled: false };
    }

    switch (state.status) {
        case "checking":
            return { kind: null, label: "Checking...", disabled: true };
        case "downloading":
            return {
                kind: "download",
                label: state.progressPercent !== undefined ? `Downloading ${state.progressPercent}%` : "Downloading...",
                disabled: true,
            };
        case "readyToInstall":
            return {
                kind: "install",
                label: "Install now",
                disabled: false,
            };
        case "installing":
            return {
                kind: "install",
                label: "Starting installer...",
                disabled: true,
            };
        case "available":
            return {
                kind: "download",
                label: "Download now",
                disabled: false,
            };
        default:
            return { kind: null, label: null, disabled: false };
    }
}

export function shouldShowLauncherUpdateBanner(state: LauncherUpdaterState | null): boolean {
    if (!state) {
        return false;
    }
    return state.status === "available" || state.status === "downloading" || state.status === "readyToInstall" || state.status === "installing";
}

export function getLauncherUpdateStatusLabel(state: LauncherUpdaterState | null): string {
    if (!state) {
        return "Idle";
    }
    switch (state.status) {
        case "checking":
            return "Checking";
        case "available":
            return "Update available";
        case "upToDate":
            return "Up to date";
        case "downloading":
            return "Downloading";
        case "readyToInstall":
            return "Ready to install";
        case "installing":
            return "Installing";
        case "error":
            return "Error";
        default:
            return "Idle";
    }
}

export function getLauncherUpdateBannerTitle(state: LauncherUpdaterState | null): string {
    if (!state) {
        return "Launcher update";
    }
    switch (state.status) {
        case "downloading":
            return `Downloading ${state.latestVersion || "update"}`;
        case "readyToInstall":
            return `${state.latestVersion || "Update"} is ready to install`;
        case "installing":
            return "Launching installer";
        default:
            return `${state.latestVersion || "Launcher update"} available`;
    }
}

export function getLauncherUpdateMetaLine(state: LauncherUpdaterState | null): string {
    if (!state) {
        return "No update metadata loaded yet.";
    }
    const parts = [`Current ${state.currentVersion}`];
    if (state.latestVersion) {
        parts.push(`Latest ${state.latestVersion}`);
    }
    if (state.channel) {
        parts.push(`Channel ${state.channel}`);
    }
    if (state.publishedAtUtc) {
        parts.push(`Published ${formatUtcDate(state.publishedAtUtc)}`);
    }
    return parts.join(" / ");
}

export function getLauncherUpdateProgressText(state: LauncherUpdaterState | null): string | null {
    if (!state || state.status !== "downloading") {
        return null;
    }

    if (typeof state.progressPercent === "number") {
    return `${state.progressPercent}% / ${formatBytes(state.downloadedBytes)} of ${formatBytes(state.totalBytes)}`;
    }

    return formatBytes(state.downloadedBytes);
}

export function formatUtcDate(value?: string): string {
    if (!value) {
        return "-";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleString();
}

export function formatBytes(value?: number): string {
    if (!Number.isFinite(value) || !value || value <= 0) {
        return "-";
    }

    const units = ["B", "KB", "MB", "GB"];
    let size = value;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }
    const digits = unitIndex === 0 ? 0 : size < 10 ? 1 : 0;
    return `${size.toFixed(digits)} ${units[unitIndex]}`;
}
