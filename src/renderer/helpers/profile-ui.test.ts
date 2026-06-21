import { describe, expect, it } from "vitest";
import type { ContentStateMap } from "../../shared/ipc";
import type { InstalledInstance, PackageCard } from "../../shared/manifest";
import {
    countInstalledProfileMods,
    buildInstalledProfileModEntries,
    resolvePreferredInstanceId,
} from "./profile-ui";

function instance(id: string): InstalledInstance {
    return {
        id,
        profileName: id,
        versionId: "v1",
        gameVersion: "1.0.0",
        name: id,
        version: "1.0.0",
        track: "bapbap",
        path: `C:/games/${id}`,
        officialManaged: true,
        lastUpdatedUtc: "2026-01-01T00:00:00.000Z",
    };
}

function pkg(id: string, over: Partial<PackageCard> = {}): PackageCard {
    return { id, name: `${id} Name`, summary: `${id} summary`, ...over } as PackageCard;
}

describe("countInstalledProfileMods", () => {
    it("returns 0 for undefined", () => {
        expect(countInstalledProfileMods(undefined)).toBe(0);
    });

    it("counts only non-not-installed states", () => {
        const states = {
            a: { status: "installed-enabled" },
            b: { status: "installed-disabled" },
            c: { status: "not-installed" },
        } as unknown as ContentStateMap;
        expect(countInstalledProfileMods(states)).toBe(2);
    });
});

describe("buildInstalledProfileModEntries", () => {
    it("resolves known packages, splits composite keys, and sorts by name", () => {
        const states = {
            "release::zeta": { status: "installed-enabled", version: "2.0.0" },
            "release::alpha": { status: "installed-disabled", version: "1.0.0" },
            "release::ghost": { status: "not-installed" },
        } as unknown as ContentStateMap;
        const packages = [pkg("zeta"), pkg("alpha")];

        const entries = buildInstalledProfileModEntries(states, packages);

        // not-installed filtered out, sorted by resolved name.
        expect(entries.map(e => e.packageId)).toEqual(["alpha", "zeta"]);
        expect(entries[0]).toMatchObject({ name: "alpha Name", version: "1.0.0", known: true });
    });

    it("falls back to the packageId as name for unknown packages", () => {
        const states = {
            "release::mystery": { status: "installed-enabled", version: "9.9.9" },
        } as unknown as ContentStateMap;

        const [entry] = buildInstalledProfileModEntries(states, []);
        expect(entry).toMatchObject({ packageId: "mystery", name: "mystery", known: false });
    });

    it("handles a bare key with no '::' separator", () => {
        const states = {
            solo: { status: "installed-enabled" },
        } as unknown as ContentStateMap;

        const [entry] = buildInstalledProfileModEntries(states, [pkg("solo")]);
        expect(entry.packageId).toBe("solo");
        expect(entry.known).toBe(true);
    });
});

describe("resolvePreferredInstanceId", () => {
    const instances = [instance("a"), instance("b"), instance("c")];

    it("keeps the current id when it still exists", () => {
        expect(resolvePreferredInstanceId(instances, "b", "a")).toBe("b");
    });

    it("falls back to the default id when current is gone", () => {
        expect(resolvePreferredInstanceId(instances, "missing", "c")).toBe("c");
    });

    it("falls back to the first instance when neither current nor default exist", () => {
        expect(resolvePreferredInstanceId(instances, "missing", "also-missing")).toBe("a");
    });

    it("returns null when there are no instances", () => {
        expect(resolvePreferredInstanceId([], "x", "y")).toBeNull();
    });
});
