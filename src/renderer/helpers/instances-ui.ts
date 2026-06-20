import type { InstanceInstallState } from "../../shared/ipc";
import type { InstalledInstance, OfficialVersionEntry } from "../../shared/manifest";
import type { InstancesHeroTrack } from "./official-version-visibility";

export function getInstancesHeroTrackMeta(track: InstancesHeroTrack): {
    label: string;
    chipLabel: string;
    className: string;
    description: string;
    emptyTitle: string;
    emptyBody: string;
    placeholderLabel: string;
} {
    if (track === "boss-rush") {
        return {
            label: "Boss Rush",
            chipLabel: "boss-rush",
            className: "is-boss-rush",
            description: "Install a separate Boss Rush profile with its own folder, config, and mod setup.",
            emptyTitle: "Boss Rush unavailable",
            emptyBody: "No current downloadable Boss Rush build is available in the manifest.",
            placeholderLabel: "Boss Rush",
        };
    }

    if (track === "bundle") {
        // The "bundle" track is a generic dispatcher: the actual title for each
        // Bundle Instance tile is read from `BundleSummary.name` (which itself
        // comes from each bundle's manifest.json). The strings returned here
        // are only used as the empty-state fallback when zero bundles are
        // currently installable, and as default copy for non-title fields
        // (description, chip, placeholder image label).
        // See docs/bundle-instance/BUNDLE_INSTANCE_MASTER_SPEC.md §6.
        return {
            label: "Bundle",
            chipLabel: "bundle",
            className: "is-bundle",
            description: "Curated complete package with auto-update.",
            emptyTitle: "Bundle Instance",
            emptyBody: "No bundles available yet",
            placeholderLabel: "Bundle",
        };
    }

    return {
        label: "Standard",
        chipLabel: "bapbap",
        className: "is-standard",
        description: "Create a fresh Standard profile. You can install the same official build more than once with different profile names.",
        emptyTitle: "Standard unavailable",
        emptyBody: "No current downloadable Standard build is available in the manifest.",
        placeholderLabel: "Standard",
    };
}

export function formatInstalledCount(count: number): string {
    if (count === 1) {
        return "1 profile installed";
    }
    return `${count} profiles installed`;
}

export function suggestProfileName(version: OfficialVersionEntry, track: InstancesHeroTrack, installedInstances: InstalledInstance[]): string {
    const baseName = track === "boss-rush" ? "Boss Rush" : "Standard";
    const existing = new Set(installedInstances.map(instance => `${instance.profileName || instance.name}`.trim().toLowerCase()));
    if (!existing.has(baseName.toLowerCase())) {
        return baseName;
    }
    let suffix = 2;
    while (existing.has(`${baseName} ${suffix}`.toLowerCase())) {
        suffix += 1;
    }
    return `${baseName} ${suffix}`;
}

export function getProfileFolderPreview(profileName: string): string {
    const slug = `${profileName || ""}`.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    return slug || "profile";
}

export function pathTail(filePath: string): string {
    return `${filePath || ""}`.split(/[\\/]/).filter(Boolean).pop() || filePath;
}

export function isInstallStateBusy(state: InstanceInstallState): boolean {
    return state.status === "preparing" || state.status === "downloading" || state.status === "extracting" || state.status === "writingMetadata";
}

export function getInstallStateLabel(state: InstanceInstallState): string {
    switch (state.status) {
        case "preparing":
            return "Preparing files...";
        case "downloading":
            return state.progressPercent !== undefined ? `Downloading ${state.progressPercent}%` : "Downloading...";
        case "extracting":
            return "Extracting files...";
        case "writingMetadata":
            return "Finalizing profile...";
        case "done":
            return "Profile ready";
        case "error":
            return state.error || "Install failed";
        default:
            return "";
    }
}
