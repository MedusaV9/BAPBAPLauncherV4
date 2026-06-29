import type { InstalledInstance, OfficialVersionEntry } from "../../shared/manifest";
import { resolveUnlockStatus, type UnlockStatus } from "../../shared/unlock-time";

export type InstancesHeroTrack = "bapbap" | "boss-rush" | "bundle";

export const INSTANCES_HERO_TRACKS: InstancesHeroTrack[] = ["boss-rush", "bundle", "bapbap"];

export function hasDirectDownloadUrl(version: OfficialVersionEntry): boolean {
    const value = `${version.directDownloadUrl || ""}`.trim();
    return /^https?:\/\//i.test(value);
}

export function isOfficialVersionInstalled(version: OfficialVersionEntry, instances: InstalledInstance[]): boolean {
    const targetId = `${version.id || ""}`.toLowerCase();
    const targetTrack = `${version.track || ""}`.toLowerCase();
    const targetGameVersion = `${version.gameVersion || ""}`.toLowerCase();

    return instances.some(instance => {
        if (!instance.officialManaged) {
            return false;
        }

        const instanceVersionId = `${instance.versionId || instance.id || ""}`.toLowerCase();
        const instanceId = `${instance.id || ""}`.toLowerCase();
        if ((instanceVersionId && instanceVersionId === targetId) || (!instance.versionId && instanceId && instanceId === targetId)) {
            return true;
        }

        const instanceTrack = `${instance.officialTrack || instance.track || ""}`.toLowerCase();
        const instanceVersion = `${instance.gameVersion || instance.version || ""}`.toLowerCase();
        if (!targetTrack || !targetGameVersion || !instanceTrack || !instanceVersion) {
            return false;
        }
        return instanceTrack === targetTrack && instanceVersion === targetGameVersion;
    });
}

export function isVersionInstallableOrInstalled(version: OfficialVersionEntry, instances: InstalledInstance[]): boolean {
    return hasDirectDownloadUrl(version) || isOfficialVersionInstalled(version, instances);
}

export function getOfficialVersionUnlockStatus(
    version: OfficialVersionEntry,
    trustedNowMs?: number | null,
    trustedTimeAvailable = true
): UnlockStatus {
    return resolveUnlockStatus(version.unlockAtUtc, trustedNowMs, trustedTimeAvailable);
}

export function resolvePrimaryOfficialVersionForTrack(
    track: InstancesHeroTrack,
    versions: OfficialVersionEntry[],
    instances: InstalledInstance[],
    trustedNowMs?: number | null,
    trustedTimeAvailable = true
): OfficialVersionEntry | null {
    const candidates = versions
        .map((version, index) => ({ version, index }))
        .filter(({ version }) => `${version.track || ""}`.toLowerCase() === track)
        .filter(({ version }) => isVersionInstallableOrInstalled(version, instances));
    const unlockedCandidates = candidates.filter(({ version }) => !getOfficialVersionUnlockStatus(version, trustedNowMs, trustedTimeAvailable).locked);

    if (unlockedCandidates.length === 0) {
        return null;
    }

    unlockedCandidates.sort((left, right) => {
        if (Boolean(left.version.recommended) !== Boolean(right.version.recommended)) {
            return left.version.recommended ? -1 : 1;
        }

        const leftOrder = left.version.order ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.version.order ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
        }

        const leftRelease = parseReleaseTimestamp(left.version.releaseDateUtc);
        const rightRelease = parseReleaseTimestamp(right.version.releaseDateUtc);
        if (leftRelease !== rightRelease) {
            return rightRelease - leftRelease;
        }

        return left.index - right.index;
    });

    return unlockedCandidates[0]?.version ?? null;
}

export function resolveNextLockedOfficialVersionForTrack(
    track: InstancesHeroTrack,
    versions: OfficialVersionEntry[],
    trustedNowMs?: number | null,
    trustedTimeAvailable = true
): OfficialVersionEntry | null {
    const candidates = versions
        .map((version, index) => ({ version, index }))
        .filter(({ version }) => `${version.track || ""}`.toLowerCase() === track)
        .filter(({ version }) => getOfficialVersionUnlockStatus(version, trustedNowMs, trustedTimeAvailable).locked);

    if (candidates.length === 0) {
        return null;
    }

    candidates.sort((left, right) => {
        if (Boolean(left.version.recommended) !== Boolean(right.version.recommended)) {
            return left.version.recommended ? -1 : 1;
        }

        const leftOrder = left.version.order ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.version.order ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
        }

        const leftRelease = parseReleaseTimestamp(left.version.releaseDateUtc);
        const rightRelease = parseReleaseTimestamp(right.version.releaseDateUtc);
        if (leftRelease !== rightRelease) {
            return rightRelease - leftRelease;
        }

        return left.index - right.index;
    });

    return candidates[0]?.version ?? null;
}

export function countInstalledInstancesForTrack(track: InstancesHeroTrack, instances: InstalledInstance[]): number {
    return instances.filter(instance => {
        const instanceTrack = `${instance.officialTrack || instance.track || ""}`.toLowerCase();
        if (track === "bundle") {
            // Bundle hero counts every Bundle Instance regardless of which
            // game-track it shadows. We additionally accept either an explicit
            // track === "bundle" tag OR a matching `bundleId` so that future
            // multi-bundle launchers (e.g. "boss-rush" + "vanilla-plus") still
            // attribute their instances to the Bundle hero rail.
            // See docs/bundle-instance/BUNDLE_INSTANCE_MASTER_SPEC.md §6.
            if (instance.instanceType !== "bundle") {
                return false;
            }
            const matchTrack = instanceTrack === track;
            const expectedBundleId = `${instance.bundleId || ""}`.toLowerCase();
            return matchTrack || expectedBundleId.length > 0;
        }
        return instanceTrack === track;
    }).length;
}

function parseReleaseTimestamp(value?: string): number {
    if (!value) {
        return Number.NEGATIVE_INFINITY;
    }
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}
