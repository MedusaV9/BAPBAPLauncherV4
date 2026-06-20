import path from "node:path";
import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";

const { removeMock, pathExistsMock, readJsonMock, ensureDirMock } = vi.hoisted(() => ({
    removeMock: vi.fn(async () => undefined),
    pathExistsMock: vi.fn(async () => false),
    readJsonMock: vi.fn(async () => ({})),
    ensureDirMock: vi.fn(async () => undefined),
}));

vi.mock("fs-extra", async () => {
    const actual = await vi.importActual<any>("fs-extra");
    const defaultExport = {
        ...(actual.default ?? actual),
        remove: removeMock,
        pathExists: pathExistsMock,
        readJson: readJsonMock,
        ensureDir: ensureDirMock,
    };
    return {
        ...actual,
        default: defaultExport,
        remove: removeMock,
        pathExists: pathExistsMock,
        readJson: readJsonMock,
        ensureDir: ensureDirMock,
    };
});

import { InstanceService } from "./instance.service";

describe("InstanceService.remove", () => {
    it("removes launcher-managed installs inside the managed instances root", async () => {
        removeMock.mockClear();
        const service = new InstanceService(
            {
                getInstancesRoot: () => "C:/Profiles",
            } as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never
        );

        vi.spyOn(service, "list").mockResolvedValue([
            {
                id: "profile-standard",
                path: "C:/Profiles/Standard",
                officialManaged: true,
                instanceSource: "official-managed",
            } as never,
        ]);

        await service.remove("profile-standard");

        expect(removeMock).toHaveBeenCalledWith("C:/Profiles/Standard");
    });

    it("refuses to delete Steam installs", async () => {
        removeMock.mockClear();
        const service = new InstanceService(
            {
                getInstancesRoot: () => "C:/Profiles",
            } as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never
        );

        vi.spyOn(service, "list").mockResolvedValue([
            {
                id: "steam:bapbap",
                path: "C:/Program Files (x86)/Steam/steamapps/common/BAPBAP",
                officialManaged: false,
                instanceSource: "steam-library",
            } as never,
        ]);

        await expect(service.remove("steam:bapbap")).rejects.toThrow("Only launcher-managed installs can be deleted");
        expect(removeMock).not.toHaveBeenCalled();
    });

    it("refuses to delete managed entries that point outside the managed instances root", async () => {
        removeMock.mockClear();
        const service = new InstanceService(
            {
                getInstancesRoot: () => "C:/Profiles",
            } as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never
        );

        vi.spyOn(service, "list").mockResolvedValue([
            {
                id: "profile-standard",
                path: "D:/Elsewhere/Standard",
                officialManaged: true,
                instanceSource: "official-managed",
            } as never,
        ]);

        await expect(service.remove("profile-standard")).rejects.toThrow("outside the managed instances folder");
        expect(removeMock).not.toHaveBeenCalled();
    });
});

describe("InstanceService.hasRelativeFile", () => {
    it("returns true when the relative file exists inside the selected instance", async () => {
        pathExistsMock.mockReset();
        pathExistsMock.mockResolvedValue(true);
        const service = new InstanceService(
            {
                getInstancesRoot: () => "C:/Profiles",
            } as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never
        );

        vi.spyOn(service, "getById").mockResolvedValue({
            id: "profile-standard",
            path: "C:/Profiles/Standard",
        } as never);

        await expect(service.hasRelativeFile("profile-standard", "Mods/BAPBAPBalanceMod.dll")).resolves.toBe(true);
        expect(pathExistsMock).toHaveBeenCalledWith(path.join("C:/Profiles/Standard", "Mods", "BAPBAPBalanceMod.dll"));
    });

    it("accepts Windows-style separators for per-instance DLL gating", async () => {
        pathExistsMock.mockReset();
        pathExistsMock.mockResolvedValue(true);
        const service = new InstanceService(
            {
                getInstancesRoot: () => "C:/Profiles",
            } as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never
        );

        vi.spyOn(service, "getById").mockResolvedValue({
            id: "profile-standard",
            path: "C:/Profiles/Standard",
        } as never);

        await expect(service.hasRelativeFile("profile-standard", "Mods\\BAPBAPBalanceMod.dll")).resolves.toBe(true);
        expect(pathExistsMock).toHaveBeenCalledWith(path.join("C:/Profiles/Standard", "Mods", "BAPBAPBalanceMod.dll"));
    });

    it("rejects escaped or absolute paths", async () => {
        pathExistsMock.mockReset();
        const service = new InstanceService(
            {
                getInstancesRoot: () => "C:/Profiles",
            } as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never
        );

        await expect(service.hasRelativeFile("profile-standard", "../secret.txt")).resolves.toBe(false);
        await expect(service.hasRelativeFile("profile-standard", "C:/Profiles/Standard/Mods/BAPBAPBalanceMod.dll")).resolves.toBe(false);
    });
});



describe("InstanceService.list bundle metadata", () => {
    /**
     * Build a minimal manifests stub: list() reaches into manifests.getIndex()
     * via isValidGameFolder() and detectSteamInstances(). Returning null for
     * both means: default game-folder check (looks for bapbap.exe + BAPBAP_Data
     * via pathExists, which we stub to true), and zero detected Steam installs.
     */
    function buildService() {
        return new InstanceService(
            {
                getInstancesRoot: () => "C:/Profiles",
                getManifestUrl: () => "",
            } as never,
            {
                getIndex: async () => null,
                getGameVersions: async () => null,
                resolveManifestPath: () => undefined,
            } as never,
            {} as never,
            {} as never,
            {} as never,
        );
    }

    function stubReaddirOnce(entries: string[]) {
        const dirents = entries.map(name => ({
            name,
            isDirectory: () => true,
        })) as unknown as fs.Dirent[];
        return vi.spyOn(fs.promises, "readdir").mockResolvedValueOnce(dirents as never);
    }

    it("returns instanceType: 'bundle' and the bundle* fields when the meta file has them", async () => {
        pathExistsMock.mockReset();
        readJsonMock.mockReset();
        ensureDirMock.mockReset();
        ensureDirMock.mockResolvedValue(undefined as never);
        // Every pathExists() probe is satisfied — root, meta file, exe, data folder.
        pathExistsMock.mockResolvedValue(true);
        readJsonMock.mockResolvedValueOnce({
            id: "bundle-instance-1",
            profileName: "BAPBAP Bundle",
            versionId: "bundle:bapbap-monthly:1.4.0",
            gameVersion: "1.4.0",
            track: "bundle",
            path: "C:/Profiles/BAPBAP Bundle",
            officialManaged: true,
            officialTrack: "bundle",
            lastUpdatedUtc: "2026-05-26T10:00:00Z",
            instanceSource: "official-managed",
            instanceType: "bundle",
            bundleId: "bapbap-monthly",
            bundleChannel: "release",
            bundleVersion: "1.4.0",
            bundleBuildNumber: 42,
            bundleLastCheckUtc: "2026-05-26T11:30:00Z",
            bundleLastApplyUtc: "2026-05-26T10:05:00Z",
        });
        stubReaddirOnce(["BAPBAP Bundle"]);

        const service = buildService();
        const list = await service.list();

        expect(list).toHaveLength(1);
        const [instance] = list;
        expect(instance.instanceType).toBe("bundle");
        expect(instance.bundleId).toBe("bapbap-monthly");
        expect(instance.bundleChannel).toBe("release");
        expect(instance.bundleVersion).toBe("1.4.0");
        expect(instance.bundleBuildNumber).toBe(42);
        expect(instance.bundleLastCheckUtc).toBe("2026-05-26T11:30:00Z");
        expect(instance.bundleLastApplyUtc).toBe("2026-05-26T10:05:00Z");
    });

    it("ignores invalid instanceType values, non-positive build numbers, and bad timestamps", async () => {
        pathExistsMock.mockReset();
        readJsonMock.mockReset();
        ensureDirMock.mockReset();
        ensureDirMock.mockResolvedValue(undefined as never);
        pathExistsMock.mockResolvedValue(true);
        readJsonMock.mockResolvedValueOnce({
            id: "bogus-instance",
            profileName: "Bogus",
            versionId: "v1",
            gameVersion: "1.0.0",
            track: "bapbap",
            path: "C:/Profiles/Bogus",
            officialManaged: true,
            instanceType: "weird-unknown-kind",
            bundleId: "bundle-x",
            bundleBuildNumber: -7,
            bundleLastCheckUtc: "definitely-not-a-date",
            bundleLastApplyUtc: 12345 as unknown as string,
        });
        stubReaddirOnce(["Bogus"]);

        const service = buildService();
        const list = await service.list();

        expect(list).toHaveLength(1);
        const [instance] = list;
        // Unknown instanceType is dropped silently — undefined means "treat as standard".
        expect(instance.instanceType).toBeUndefined();
        // Bundle id is a benign string and is preserved even when the type is invalid;
        // only the explicitly invalid fields are rejected.
        expect(instance.bundleId).toBe("bundle-x");
        expect(instance.bundleBuildNumber).toBeUndefined();
        expect(instance.bundleLastCheckUtc).toBeUndefined();
        expect(instance.bundleLastApplyUtc).toBeUndefined();
    });
});
