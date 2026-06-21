import { describe, expect, it } from "vitest";
import type { InstalledInstance, OfficialVersionEntry } from "../../shared/manifest";
import type { InstanceInstallState } from "../../shared/ipc";
import {
    getInstancesHeroTrackMeta,
    formatInstalledCount,
    suggestProfileName,
    getProfileFolderPreview,
    pathTail,
    isInstallStateBusy,
    getInstallStateLabel,
} from "./instances-ui";

function installed(profileName: string): InstalledInstance {
    return {
        id: `id-${profileName}`,
        profileName,
        versionId: "v1",
        gameVersion: "1.0.0",
        name: profileName,
        version: "1.0.0",
        track: "bapbap",
        path: `C:/games/${profileName}`,
        officialManaged: true,
        lastUpdatedUtc: "2026-01-01T00:00:00.000Z",
    };
}

describe("getInstancesHeroTrackMeta", () => {
    it("returns distinct copy per track", () => {
        expect(getInstancesHeroTrackMeta("boss-rush").label).toBe("Boss Rush");
        expect(getInstancesHeroTrackMeta("bundle").label).toBe("Bundle");
        expect(getInstancesHeroTrackMeta("bapbap").label).toBe("Standard");
    });
});

describe("formatInstalledCount", () => {
    it("singularizes 1 and pluralizes others", () => {
        expect(formatInstalledCount(1)).toBe("1 profile installed");
        expect(formatInstalledCount(0)).toBe("0 profiles installed");
        expect(formatInstalledCount(3)).toBe("3 profiles installed");
    });
});

describe("suggestProfileName", () => {
    const version = {} as OfficialVersionEntry;

    it("uses the base name when free", () => {
        expect(suggestProfileName(version, "bapbap", [])).toBe("Standard");
        expect(suggestProfileName(version, "boss-rush", [])).toBe("Boss Rush");
    });

    it("appends the first free numeric suffix on collision", () => {
        const existing = [installed("Standard"), installed("Standard 2")];
        expect(suggestProfileName(version, "bapbap", existing)).toBe("Standard 3");
    });

    it("matches case-insensitively when detecting collisions", () => {
        expect(suggestProfileName(version, "bapbap", [installed("standard")])).toBe("Standard 2");
    });
});

describe("getProfileFolderPreview", () => {
    it("slugifies unsafe characters and collapses dashes", () => {
        expect(getProfileFolderPreview("My Cool Profile!!")).toBe("My-Cool-Profile");
        expect(getProfileFolderPreview("  spaced  out  ")).toBe("spaced-out");
    });

    it("falls back to 'profile' when nothing usable remains", () => {
        expect(getProfileFolderPreview("***")).toBe("profile");
        expect(getProfileFolderPreview("")).toBe("profile");
    });
});

describe("pathTail", () => {
    it("returns the last path segment for both separators", () => {
        expect(pathTail("C:/games/inst/bapbap.exe")).toBe("bapbap.exe");
        expect(pathTail("C:\\games\\inst")).toBe("inst");
    });
});

describe("install state helpers", () => {
    it("flags in-progress statuses as busy", () => {
        for (const status of ["preparing", "downloading", "extracting", "writingMetadata"]) {
            expect(isInstallStateBusy({ status } as InstanceInstallState)).toBe(true);
        }
        expect(isInstallStateBusy({ status: "done" } as InstanceInstallState)).toBe(false);
        expect(isInstallStateBusy({ status: "idle" } as InstanceInstallState)).toBe(false);
    });

    it("labels states, including download percent and error fallback", () => {
        expect(getInstallStateLabel({ status: "preparing" } as InstanceInstallState)).toBe("Preparing files...");
        expect(getInstallStateLabel({ status: "downloading", progressPercent: 42 } as InstanceInstallState)).toBe("Downloading 42%");
        expect(getInstallStateLabel({ status: "downloading" } as InstanceInstallState)).toBe("Downloading...");
        expect(getInstallStateLabel({ status: "done" } as InstanceInstallState)).toBe("Profile ready");
        expect(getInstallStateLabel({ status: "error", error: "disk full" } as InstanceInstallState)).toBe("disk full");
        expect(getInstallStateLabel({ status: "error" } as InstanceInstallState)).toBe("Install failed");
    });
});
