import { describe, expect, it } from "vitest";
import type { InstalledInstance, OfficialVersionEntry } from "../../shared/manifest";
import {
    countInstalledInstancesForTrack,
    getOfficialVersionUnlockStatus,
    hasDirectDownloadUrl,
    isOfficialVersionInstalled,
    isVersionInstallableOrInstalled,
    resolveNextLockedOfficialVersionForTrack,
    resolvePrimaryOfficialVersionForTrack,
} from "./official-version-visibility";

function createVersion(partial: Partial<OfficialVersionEntry>): OfficialVersionEntry {
    return {
        id: "latest",
        track: "bapbap",
        gameVersion: "build-1",
        displayName: "Latest",
        ...partial,
    };
}

function createInstance(partial: Partial<InstalledInstance>): InstalledInstance {
    const profileName = partial.profileName || partial.name || "Latest";
    const versionId = partial.versionId || partial.id || "latest";
    const gameVersion = partial.gameVersion || partial.version || "build-1";
    return {
        id: partial.id || "latest",
        profileName,
        versionId,
        gameVersion,
        name: profileName,
        version: gameVersion,
        track: "bapbap",
        path: "C:/instances/latest",
        officialManaged: true,
        officialTrack: "bapbap",
        lastUpdatedUtc: "2026-01-01T00:00:00Z",
        ...partial,
    };
}

describe("official-version visibility", () => {
    it("detects installable versions by trimmed directDownloadUrl", () => {
        expect(hasDirectDownloadUrl(createVersion({ directDownloadUrl: "  https://github.com/release.zip  " }))).toBe(true);
        expect(hasDirectDownloadUrl(createVersion({ directDownloadUrl: "   " }))).toBe(false);
        expect(hasDirectDownloadUrl(createVersion({ directDownloadUrl: "No directDownloadUrl" }))).toBe(false);
    });

    it("matches installed official version by id", () => {
        const version = createVersion({ id: "boss-rush", track: "boss-rush", gameVersion: "boss-rush" });
        const instances = [createInstance({ id: "boss-rush", officialTrack: "boss-rush", version: "x" })];
        expect(isOfficialVersionInstalled(version, instances)).toBe(true);
    });

    it("falls back to track + gameVersion for installed detection", () => {
        const version = createVersion({ id: "build-2025-08-14", track: "bapbap", gameVersion: "build-2025-08-14" });
        const instances = [createInstance({ id: "latest", officialTrack: "bapbap", version: "build-2025-08-14" })];
        expect(isOfficialVersionInstalled(version, instances)).toBe(true);
    });

    it("shows version when installable or already installed", () => {
        const withUrl = createVersion({ directDownloadUrl: "https://github.com/ok.zip" });
        const noUrlInstalled = createVersion({ id: "legacy", track: "bapbap", gameVersion: "old-build", directDownloadUrl: undefined });
        const instances = [createInstance({ id: "legacy", version: "old-build", officialTrack: "bapbap" })];
        expect(isVersionInstallableOrInstalled(withUrl, [])).toBe(true);
        expect(isVersionInstallableOrInstalled(noUrlInstalled, instances)).toBe(true);
        expect(isVersionInstallableOrInstalled(createVersion({ id: "missing", directDownloadUrl: undefined }), [])).toBe(false);
    });

    it("resolves one primary version per track using recommended, order and release date", () => {
        const versions = [
            createVersion({
                id: "older",
                track: "bapbap",
                displayName: "Older",
                directDownloadUrl: "https://github.com/older.zip",
                order: 10,
                releaseDateUtc: "2026-01-01T00:00:00Z",
            }),
            createVersion({
                id: "recommended",
                track: "bapbap",
                displayName: "Recommended",
                directDownloadUrl: "https://github.com/recommended.zip",
                recommended: true,
                order: 999,
                releaseDateUtc: "2025-01-01T00:00:00Z",
            }),
            createVersion({
                id: "boss",
                track: "boss-rush",
                displayName: "Boss",
                directDownloadUrl: "https://github.com/boss.zip",
                order: 1,
                releaseDateUtc: "2026-02-01T00:00:00Z",
            }),
        ];

        expect(resolvePrimaryOfficialVersionForTrack("bapbap", versions, [])?.id).toBe("recommended");
        expect(resolvePrimaryOfficialVersionForTrack("boss-rush", versions, [])?.id).toBe("boss");
    });

    it("keeps future unlocks out of the current primary slot and resolves them as next locked", () => {
        const versions = [
            createVersion({
                id: "available-now",
                track: "bapbap",
                displayName: "Available",
                directDownloadUrl: "https://github.com/available.zip",
                recommended: true,
            }),
            createVersion({
                id: "coming-soon",
                track: "bapbap",
                displayName: "Soon",
                unlockAtUtc: "2026-04-01T00:00:00Z",
                recommended: true,
            }),
        ];

        const trustedNowMs = Date.parse("2026-03-01T00:00:00Z");
        expect(resolvePrimaryOfficialVersionForTrack("bapbap", versions, [], trustedNowMs, true)?.id).toBe("available-now");
        expect(resolveNextLockedOfficialVersionForTrack("bapbap", versions, trustedNowMs, true)?.id).toBe("coming-soon");
    });

    it("treats unlock entries as locked while trusted time is unavailable", () => {
        const version = createVersion({
            id: "future",
            unlockAtUtc: "2026-04-01T00:00:00Z",
        });
        const unlockStatus = getOfficialVersionUnlockStatus(version, undefined, false);
        expect(unlockStatus.locked).toBe(true);
        expect(unlockStatus.reason).toBe("waiting-time-source");
    });

    it("counts installed instances per hero track using officialTrack fallback", () => {
        const instances = [
            createInstance({ id: "one", officialTrack: "bapbap", track: "latest" }),
            createInstance({ id: "two", officialTrack: "boss-rush", track: "boss-rush" }),
            createInstance({ id: "three", officialTrack: undefined, track: "bapbap" }),
        ];

        expect(countInstalledInstancesForTrack("bapbap", instances)).toBe(2);
        expect(countInstalledInstancesForTrack("boss-rush", instances)).toBe(1);
    });
});
