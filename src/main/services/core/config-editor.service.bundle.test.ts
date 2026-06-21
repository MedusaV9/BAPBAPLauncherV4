import { describe, expect, it, vi } from "vitest";
import { ConfigEditorService } from "./config-editor.service";

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
                    `Cannot modify configs on a Bundle Instance ("${instance.profileName ?? instance.id}").`
                );
                (error as Error & { code?: string }).code = BUNDLE_LOCKED_CODE;
                throw error;
            }
        }),
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

describe("ConfigEditorService bundle gating", () => {
    it("write rejects with BUNDLE_INSTANCE_LOCKED for bundle instances", async () => {
        const instances = createBundleInstancesMock();
        const service = new ConfigEditorService(instances as never);

        await expectBundleLocked(
            service.write("bundle-1", "UserData/Settings.cfg", "key=value\n")
        );
        expect(instances.getById).toHaveBeenCalledWith("bundle-1");
        expect(instances.assertMutable).toHaveBeenCalledTimes(1);
        expect(instances.assertMutable).toHaveBeenCalledWith(instances.bundleInstance);
    });

    it("write rejects before validating the file path on bundle instances", async () => {
        const instances = createBundleInstancesMock();
        const service = new ConfigEditorService(instances as never);

        // Even with a path that would normally fail validation (escapes root),
        // the bundle gate must fire first so the renderer always sees the
        // locked code rather than a generic "unsafe path" error.
        await expectBundleLocked(
            service.write("bundle-1", "../escape/path.cfg", "ignored")
        );
        expect(instances.assertMutable).toHaveBeenCalledTimes(1);
    });
});
