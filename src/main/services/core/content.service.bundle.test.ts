import { describe, expect, it, vi } from "vitest";
import { ContentService } from "./content.service";

const BUNDLE_LOCKED_CODE = "BUNDLE_INSTANCE_LOCKED";

function createBundleInstancesMock() {
    const bundleInstance = {
        id: "bundle-1",
        profileName: "Boss Rush Bundle",
        path: "C:/Profiles/Bundle",
        instanceType: "bundle",
        bundleId: "sonic.bapbap.boss-rush-bundle",
    };
    return {
        bundleInstance,
        getById: vi.fn(async () => bundleInstance),
        assertMutable: vi.fn(async (instance: any) => {
            if (instance?.instanceType === "bundle") {
                const error = new Error(
                    `Cannot modify mods on a Bundle Instance ("${instance.profileName ?? instance.id}").`
                );
                (error as Error & { code?: string }).code = BUNDLE_LOCKED_CODE;
                throw error;
            }
        }),
        readContentState: vi.fn(async () => ({})),
        writeContentState: vi.fn(async () => undefined),
        readModSetState: vi.fn(async () => ({
            activeModSetId: "default",
            sets: [
                {
                    id: "default",
                    name: "Main set",
                    updatedAtUtc: "2026-01-01T00:00:00.000Z",
                    packageStates: {},
                },
            ],
        })),
        writeModSetState: vi.fn(async () => undefined),
    };
}

async function expectBundleLocked(promise: Promise<unknown>): Promise<void> {
    let caught: unknown;
    try {
        await promise;
    } catch (error) {
        caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error & { code?: string }).code).toBe(BUNDLE_LOCKED_CODE);
}

describe("ContentService bundle gating", () => {
    it("install rejects with BUNDLE_INSTANCE_LOCKED for bundle instances", async () => {
        const instances = createBundleInstancesMock();
        const service = new ContentService({} as never, instances as never, {} as never, {} as never);

        await expectBundleLocked(
            service.install({ instanceId: "bundle-1", channelId: "release", packageId: "p", version: "1.0.0" })
        );
        expect(instances.assertMutable).toHaveBeenCalledTimes(1);
        expect(instances.writeContentState).not.toHaveBeenCalled();
        expect(instances.writeModSetState).not.toHaveBeenCalled();
    });

    it("uninstall rejects with BUNDLE_INSTANCE_LOCKED for bundle instances", async () => {
        const instances = createBundleInstancesMock();
        const service = new ContentService({} as never, instances as never, {} as never, {} as never);

        await expectBundleLocked(service.uninstall("bundle-1", "release", "p"));
        expect(instances.assertMutable).toHaveBeenCalledTimes(1);
        expect(instances.writeContentState).not.toHaveBeenCalled();
    });

    it("setEnabled rejects with BUNDLE_INSTANCE_LOCKED for bundle instances", async () => {
        const instances = createBundleInstancesMock();
        const service = new ContentService({} as never, instances as never, {} as never, {} as never);

        await expectBundleLocked(
            service.setEnabled({ instanceId: "bundle-1", channelId: "release", packageId: "p", enabled: false })
        );
        expect(instances.assertMutable).toHaveBeenCalledTimes(1);
        expect(instances.writeContentState).not.toHaveBeenCalled();
    });

    it("bulkApply rejects with BUNDLE_INSTANCE_LOCKED for bundle instances", async () => {
        const instances = createBundleInstancesMock();
        const service = new ContentService({} as never, instances as never, {} as never, {} as never);

        await expectBundleLocked(
            service.bulkApply({
                instanceId: "bundle-1",
                channelId: "release",
                action: "install",
                packageIds: ["p", "q"],
            })
        );
        expect(instances.assertMutable).toHaveBeenCalledTimes(1);
        expect(instances.writeContentState).not.toHaveBeenCalled();
    });

    it("createModSet rejects with BUNDLE_INSTANCE_LOCKED for bundle instances", async () => {
        const instances = createBundleInstancesMock();
        const service = new ContentService({} as never, instances as never, {} as never, {} as never);

        await expectBundleLocked(
            service.createModSet({ instanceId: "bundle-1", name: "Custom set" })
        );
        expect(instances.assertMutable).toHaveBeenCalledTimes(1);
        expect(instances.writeModSetState).not.toHaveBeenCalled();
    });

    it("renameModSet rejects with BUNDLE_INSTANCE_LOCKED for bundle instances", async () => {
        const instances = createBundleInstancesMock();
        const service = new ContentService({} as never, instances as never, {} as never, {} as never);

        await expectBundleLocked(service.renameModSet("bundle-1", "default", "Renamed"));
        expect(instances.assertMutable).toHaveBeenCalledTimes(1);
        expect(instances.writeModSetState).not.toHaveBeenCalled();
    });

    it("deleteModSet rejects with BUNDLE_INSTANCE_LOCKED for bundle instances", async () => {
        const instances = createBundleInstancesMock();
        const service = new ContentService({} as never, instances as never, {} as never, {} as never);

        await expectBundleLocked(service.deleteModSet("bundle-1", "default"));
        expect(instances.assertMutable).toHaveBeenCalledTimes(1);
        expect(instances.writeModSetState).not.toHaveBeenCalled();
    });

    it("activateModSet rejects with BUNDLE_INSTANCE_LOCKED for bundle instances", async () => {
        const instances = createBundleInstancesMock();
        const service = new ContentService({} as never, instances as never, {} as never, {} as never);

        await expectBundleLocked(service.activateModSet("bundle-1", "default"));
        expect(instances.assertMutable).toHaveBeenCalledTimes(1);
        expect(instances.writeModSetState).not.toHaveBeenCalled();
        expect(instances.writeContentState).not.toHaveBeenCalled();
    });

    it("read-only methods do NOT call assertMutable", async () => {
        const instances = createBundleInstancesMock();
        const service = new ContentService({} as never, instances as never, {} as never, {} as never);

        await service.listStates("bundle-1");
        await service.getModSets("bundle-1");

        expect(instances.assertMutable).not.toHaveBeenCalled();
    });
});
