import { describe, expect, it, vi } from "vitest";
import { ContentService } from "./content.service";

describe("ContentService.activateModSet", () => {
    it("removes packages that are not part of the target mod set", async () => {
        const instances = {
            assertMutable: vi.fn(async () => undefined),
            getById: vi.fn(async () => ({
                id: "profile-standard",
                path: "C:/Profiles/Standard",
            })),
            readModSetState: vi.fn(async () => ({
                activeModSetId: "set-a",
                sets: [
                    {
                        id: "set-a",
                        name: "Set A",
                        updatedAtUtc: "2026-03-17T15:00:00Z",
                        packageStates: {
                            "release::hidden-dev-arguments": {
                                channelId: "release",
                                packageId: "hidden-dev-arguments",
                                version: "1.0.0",
                                enabled: true,
                            },
                            "release::pool-randomizer": {
                                channelId: "release",
                                packageId: "pool-randomizer",
                                version: "1.0.0",
                                enabled: false,
                            },
                        },
                    },
                    {
                        id: "set-b",
                        name: "Set B",
                        updatedAtUtc: "2026-03-17T15:10:00Z",
                        packageStates: {
                            "release::hidden-dev-arguments": {
                                channelId: "release",
                                packageId: "hidden-dev-arguments",
                                version: "1.0.0",
                                enabled: true,
                            },
                        },
                    },
                ],
            })),
            readContentState: vi.fn(async () => ({
                "release::hidden-dev-arguments": {
                    channelId: "release",
                    packageId: "hidden-dev-arguments",
                    version: "1.0.0",
                    enabled: true,
                    files: [],
                },
                "release::pool-randomizer": {
                    channelId: "release",
                    packageId: "pool-randomizer",
                    version: "1.0.0",
                    enabled: false,
                    files: [],
                },
            })),
        };

        const service = new ContentService({} as never, instances as never, {} as never, {} as never);
        const uninstallInternal = vi.fn(async () => undefined);
        const installInternal = vi.fn(async () => undefined);
        const setEnabledInternal = vi.fn(async () => undefined);
        const syncModSetSnapshot = vi.fn(async () => ({
            activeModSetId: "set-b",
            sets: [],
        }));

        (service as any).uninstallInternal = uninstallInternal;
        (service as any).installInternal = installInternal;
        (service as any).setEnabledInternal = setEnabledInternal;
        (service as any).syncModSetSnapshot = syncModSetSnapshot;

        await service.activateModSet("profile-standard", "set-b");

        expect(uninstallInternal).toHaveBeenCalledWith("profile-standard", "release", "pool-randomizer", false);
        expect(installInternal).not.toHaveBeenCalled();
        expect(syncModSetSnapshot).toHaveBeenCalledWith("C:/Profiles/Standard", "set-b", true);
    });

    it("reinstalls a package when the target mod set wants a different version", async () => {
        const instances = {
            assertMutable: vi.fn(async () => undefined),
            getById: vi.fn(async () => ({
                id: "profile-standard",
                path: "C:/Profiles/Standard",
            })),
            readModSetState: vi.fn(async () => ({
                activeModSetId: "set-b",
                sets: [
                    {
                        id: "set-b",
                        name: "Set B",
                        updatedAtUtc: "2026-03-17T15:10:00Z",
                        packageStates: {
                            "release::hidden-dev-arguments": {
                                channelId: "release",
                                packageId: "hidden-dev-arguments",
                                version: "1.0.1",
                                enabled: true,
                            },
                        },
                    },
                ],
            })),
            readContentState: vi.fn(async () => ({
                "release::hidden-dev-arguments": {
                    channelId: "release",
                    packageId: "hidden-dev-arguments",
                    version: "1.0.0",
                    enabled: true,
                    files: [],
                },
            })),
        };

        const service = new ContentService({} as never, instances as never, {} as never, {} as never);
        const uninstallInternal = vi.fn(async () => undefined);
        const installInternal = vi.fn(async () => undefined);
        const setEnabledInternal = vi.fn(async () => undefined);
        const syncModSetSnapshot = vi.fn(async () => ({
            activeModSetId: "set-b",
            sets: [],
        }));

        (service as any).uninstallInternal = uninstallInternal;
        (service as any).installInternal = installInternal;
        (service as any).setEnabledInternal = setEnabledInternal;
        (service as any).syncModSetSnapshot = syncModSetSnapshot;

        await service.activateModSet("profile-standard", "set-b");

        expect(installInternal).toHaveBeenCalledWith(
            {
                instanceId: "profile-standard",
                channelId: "release",
                packageId: "hidden-dev-arguments",
                version: "1.0.1",
            },
            false
        );
        expect(uninstallInternal).not.toHaveBeenCalled();
    });
});

describe("ContentService.createModSet", () => {
    it("creates an empty mod set when no source set is provided", async () => {
        const writeModSetState = vi.fn(async () => undefined);
        const instances = {
            assertMutable: vi.fn(async () => undefined),
            getById: vi.fn(async () => ({
                id: "profile-standard",
                path: "C:/Profiles/Standard",
            })),
            readModSetState: vi.fn(async () => ({
                activeModSetId: "default",
                sets: [
                    {
                        id: "default",
                        name: "Main set",
                        updatedAtUtc: "2026-03-17T15:10:00Z",
                        packageStates: {
                            "release::hidden-dev-arguments": {
                                channelId: "release",
                                packageId: "hidden-dev-arguments",
                                version: "1.0.1",
                                enabled: true,
                            },
                        },
                    },
                ],
            })),
            writeModSetState,
        };

        const service = new ContentService({} as never, instances as never, {} as never, {} as never);
        const activateModSetInternal = vi.fn(async (_instanceId: string, modSetId: string) => ({
            activeModSetId: modSetId,
            sets: [
                {
                    id: "default",
                    name: "Main set",
                    updatedAtUtc: "2026-03-17T15:10:00Z",
                    packageStates: {
                        "release::hidden-dev-arguments": {
                            channelId: "release",
                            packageId: "hidden-dev-arguments",
                            version: "1.0.1",
                            enabled: true,
                        },
                    },
                },
                {
                    id: modSetId,
                    name: "Fresh set",
                    updatedAtUtc: "2026-03-17T15:11:00Z",
                    packageStates: {},
                },
            ],
        }));
        (service as any).activateModSetInternal = activateModSetInternal;

        const nextState = await service.createModSet({
            instanceId: "profile-standard",
            name: "Fresh set",
        });

        expect(nextState.sets).toHaveLength(2);
        expect(nextState.activeModSetId).toBe(nextState.sets[1].id);
        expect(nextState.sets[1]).toMatchObject({
            name: "Fresh set",
            packageStates: {},
        });
        expect(writeModSetState).toHaveBeenCalledTimes(1);
        const firstWriteCall = (writeModSetState as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
        expect(firstWriteCall).toBeDefined();
        const stagedState = (firstWriteCall![1] as unknown) as {
            activeModSetId: string;
            sets: unknown[];
        };
        expect(stagedState).toMatchObject({
            activeModSetId: expect.any(String),
            sets: [
                expect.objectContaining({ id: "default", name: "Main set" }),
                expect.objectContaining({ name: "Fresh set", packageStates: {} }),
            ],
        });
        expect(activateModSetInternal).toHaveBeenCalledWith("profile-standard", stagedState.activeModSetId);
    });

    it("copies package states when a source mod set is provided", async () => {
        const writeModSetState = vi.fn(async () => undefined);
        const sourcePackageStates = {
            "release::hidden-dev-arguments": {
                channelId: "release",
                packageId: "hidden-dev-arguments",
                version: "1.0.1",
                enabled: true,
            },
        };
        const instances = {
            assertMutable: vi.fn(async () => undefined),
            getById: vi.fn(async () => ({
                id: "profile-standard",
                path: "C:/Profiles/Standard",
            })),
            readModSetState: vi.fn(async () => ({
                activeModSetId: "default",
                sets: [
                    {
                        id: "default",
                        name: "Main set",
                        updatedAtUtc: "2026-03-17T15:10:00Z",
                        packageStates: sourcePackageStates,
                    },
                ],
            })),
            writeModSetState,
        };

        const service = new ContentService({} as never, instances as never, {} as never, {} as never);
        const activateModSetInternal = vi.fn(async (_instanceId: string, modSetId: string) => ({
            activeModSetId: modSetId,
            sets: [
                {
                    id: "default",
                    name: "Main set",
                    updatedAtUtc: "2026-03-17T15:10:00Z",
                    packageStates: sourcePackageStates,
                },
                {
                    id: modSetId,
                    name: "Copied set",
                    updatedAtUtc: "2026-03-17T15:11:00Z",
                    packageStates: sourcePackageStates,
                },
            ],
        }));
        (service as any).activateModSetInternal = activateModSetInternal;

        const nextState = await service.createModSet({
            instanceId: "profile-standard",
            name: "Copied set",
            cloneFromModSetId: "default",
        });

        expect(nextState.sets[1]).toMatchObject({
            name: "Copied set",
            packageStates: sourcePackageStates,
        });
        expect(writeModSetState).toHaveBeenCalledTimes(1);
        const firstWriteCall = (writeModSetState as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
        expect(firstWriteCall).toBeDefined();
        const stagedState = (firstWriteCall![1] as unknown) as {
            activeModSetId: string;
        };
        expect(activateModSetInternal).toHaveBeenCalledWith("profile-standard", stagedState.activeModSetId);
    });
});

describe("ContentService.install", () => {
    it("blocks packages that do not support the current track", async () => {
        const manifests = {
            getPackageDetail: vi.fn(async () => ({
                id: "jackmygoodman.bapbap.boss-rush-qol",
                name: "BossRushQoL",
                supportedTracks: ["boss-rush"],
                versions: [{ version: "1.0.1", versionManifestPath: "versions/1.0.1/version.json" }],
            })),
        };
        const instances = {
            assertMutable: vi.fn(async () => undefined),
            getById: vi.fn(async () => ({
                id: "profile-standard",
                path: "C:/Profiles/Standard",
                track: "bapbap",
                officialTrack: "bapbap",
                versionId: "latest",
            })),
        };
        const trustedTime = {
            getTrustedNow: vi.fn(async () => ({
                trustedNowMs: Date.now(),
                available: true,
            })),
        };

        const service = new ContentService(manifests as never, instances as never, {} as never, trustedTime as never);

        await expect(
            service.install({
                instanceId: "profile-standard",
                channelId: "release",
                packageId: "jackmygoodman.bapbap.boss-rush-qol",
                version: "1.0.1",
            })
        ).rejects.toThrow(/only installs on boss-rush/i);
    });
});
