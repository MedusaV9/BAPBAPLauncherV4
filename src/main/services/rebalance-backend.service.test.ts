import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// The service imports InstanceService/LaunchService/SettingsStoreService which
// pull electron in transitively; only types are used from electron itself.
vi.mock("electron", () => {
    const app = { getPath: () => "" };
    return { default: { app }, app };
});

import { RebalanceBackendService, REBALANCE_ALLOWED_COMMANDS } from "./rebalance-backend.service";

type FakeBackend = {
    invoke: ReturnType<typeof vi.fn>;
    fileSrc: ReturnType<typeof vi.fn>;
};

function makeService(opts: {
    backend?: FakeBackend;
    instances?: { list: ReturnType<typeof vi.fn> };
    launch?: { launch: ReturnType<typeof vi.fn> };
    settings?: { getAll: ReturnType<typeof vi.fn> };
} = {}) {
    const backend: FakeBackend = opts.backend ?? {
        invoke: vi.fn().mockResolvedValue(null),
        fileSrc: vi.fn().mockReturnValue("rebalance-file://served"),
    };
    const instances = opts.instances ?? { list: vi.fn().mockResolvedValue([]) };
    const launch = opts.launch ?? { launch: vi.fn().mockResolvedValue(undefined) };
    const settings = opts.settings ?? { getAll: vi.fn().mockResolvedValue({ launchShowMelonConsole: false }) };

    const service = new RebalanceBackendService(
        {} as never,
        {} as never,
        {} as never,
        instances as never,
        launch as never,
        settings as never
    );
    // Pre-seed the lazily-required vendor backend so getBackend() never touches disk.
    (service as unknown as { backend: FakeBackend }).backend = backend;
    return { service, backend, instances, launch, settings };
}

// Absolute, platform-correct roots derived from cwd so path.resolve behaves.
const TRUSTED_ROOT = path.resolve("trusted-workspace");
const ATTACKER_ROOT = path.resolve("attacker-workspace");

async function establishWorkspace(service: RebalanceBackendService, backend: FakeBackend, root = TRUSTED_ROOT) {
    backend.invoke.mockResolvedValueOnce({ workspace: { workspaceRoot: root } });
    await service.invoke("bootstrap", {});
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("RebalanceBackendService", () => {
    it("rejects commands outside the allowlist before reaching the backend", async () => {
        const { service, backend } = makeService();
        await expect(service.invoke("rm_rf_everything", {})).rejects.toThrow(/not allowed/i);
        expect(backend.invoke).not.toHaveBeenCalled();
    });

    it("forwards allowlisted commands to the backend", async () => {
        const { service, backend } = makeService();
        backend.invoke.mockResolvedValueOnce({ ok: true });
        const result = await service.invoke("read_library_metadata", {});
        expect(result).toEqual({ ok: true });
        expect(backend.invoke).toHaveBeenCalledWith("read_library_metadata", {});
    });

    it("tracks the active workspace root from a bootstrap result", async () => {
        const { service, backend } = makeService();
        await establishWorkspace(service, backend);
        // fileSrc only works once a workspace root is known — proves it was tracked.
        backend.fileSrc.mockReturnValueOnce("served");
        expect(() => service.fileSrc(path.join(TRUSTED_ROOT, "art.png"))).not.toThrow();
    });

    it("ignores a caller-supplied workspaceRoot once a trusted root is active (anti-traversal)", async () => {
        const { service, backend } = makeService();
        await establishWorkspace(service, backend);

        // The caller tries to bypass containment by supplying its own root +
        // an absolutePath both inside the attacker tree. The guard must anchor
        // to the TRUSTED root and reject, not trust the supplied pair.
        await expect(
            service.invoke("open_document", {
                workspaceRoot: ATTACKER_ROOT,
                absolutePath: path.join(ATTACKER_ROOT, "evil.json"),
            })
        ).rejects.toThrow(/outside the Rebalance workspace/i);
        expect(backend.invoke).toHaveBeenCalledTimes(1); // only the bootstrap call
    });

    it("allows an absolutePath inside the trusted workspace root", async () => {
        const { service, backend } = makeService();
        await establishWorkspace(service, backend);
        backend.invoke.mockResolvedValueOnce({ ok: true });

        await expect(
            service.invoke("open_document", {
                absolutePath: path.join(TRUSTED_ROOT, "data", "doc.json"),
            })
        ).resolves.toEqual({ ok: true });
    });

    it("rejects a traversal escape via a nested request object", async () => {
        const { service, backend } = makeService();
        await establishWorkspace(service, backend);

        await expect(
            service.invoke("save_document", {
                request: { absolutePath: path.join(TRUSTED_ROOT, "..", "escape.json") },
            })
        ).rejects.toThrow(/outside the Rebalance workspace/i);
    });

    it("rejects a disallowed document extension even inside the root", async () => {
        const { service, backend } = makeService();
        await establishWorkspace(service, backend);

        await expect(
            service.invoke("open_document", {
                absolutePath: path.join(TRUSTED_ROOT, "payload.exe"),
            })
        ).rejects.toThrow(/extension/i);
    });

    it("fileSrc refuses before a workspace root is established", () => {
        const { service } = makeService();
        expect(() => service.fileSrc(path.join(TRUSTED_ROOT, "art.png"))).toThrow(/no active workspace root/i);
    });

    it("fileSrc rejects paths outside the workspace and disallowed extensions", async () => {
        const { service, backend } = makeService();
        await establishWorkspace(service, backend);

        expect(() => service.fileSrc(path.join(ATTACKER_ROOT, "art.png"))).toThrow(/outside the Rebalance workspace/i);
        expect(() => service.fileSrc(path.join(TRUSTED_ROOT, "doc.json"))).toThrow(/extension/i);
    });

    it("routes launch_game through the launcher when the workspace matches an instance", async () => {
        const instances = {
            list: vi.fn().mockResolvedValue([{ id: "inst-9", path: TRUSTED_ROOT }]),
        };
        const launch = { launch: vi.fn().mockResolvedValue(undefined) };
        const { service, backend } = makeService({ instances, launch });

        const result = await service.invoke("launch_game", { workspaceRoot: TRUSTED_ROOT });
        expect(result).toBeNull();
        expect(launch.launch).toHaveBeenCalledWith({ instanceId: "inst-9", showMelonConsole: false });
        // Routed through the launcher — the vendor backend is not invoked for launch.
        expect(backend.invoke).not.toHaveBeenCalled();
    });

    it("exposes a frozen-in-intent allowlist that excludes obviously dangerous commands", () => {
        expect(REBALANCE_ALLOWED_COMMANDS.has("open_document")).toBe(true);
        expect(REBALANCE_ALLOWED_COMMANDS.has("eval")).toBe(false);
        expect(REBALANCE_ALLOWED_COMMANDS.has("delete_workspace")).toBe(false);
    });
});
