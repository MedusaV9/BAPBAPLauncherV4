import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InstalledInstance } from "../../../shared/manifest";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => {
    const spawn = (...args: unknown[]) => spawnMock(...args);
    return { spawn, default: { spawn } };
});

// The dependency modules pull in electron transitively at import time.
vi.mock("electron", () => {
    const app = { getPath: () => "" };
    return { default: { app }, app };
});

import { LaunchService } from "./launch.service";

/** Minimal controllable stand-in for a spawned ChildProcess. */
class FakeChild extends EventEmitter {
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    pid = 4242;
    unref = vi.fn();
    kill = vi.fn();
}

function makeInstance(overrides: Partial<InstalledInstance> = {}): InstalledInstance {
    return {
        id: "inst-1",
        profileName: "Profile One",
        versionId: "v1",
        gameVersion: "1.0.0",
        name: "Profile One",
        version: "1.0.0",
        track: "stable",
        path: "C:/games/inst-1",
        officialManaged: true,
        lastUpdatedUtc: "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}

type Deps = {
    instances: {
        getById: ReturnType<typeof vi.fn>;
        markMelonLoaderFirstRunCompleted: ReturnType<typeof vi.fn>;
    };
    manifests: { getIndex: ReturnType<typeof vi.fn> };
    settings: { set: ReturnType<typeof vi.fn> };
    melonLoader: { ensureInstalled: ReturnType<typeof vi.fn> };
};

function makeDeps(instance = makeInstance()): Deps {
    return {
        instances: {
            getById: vi.fn().mockResolvedValue(instance),
            markMelonLoaderFirstRunCompleted: vi.fn().mockResolvedValue(undefined),
        },
        manifests: { getIndex: vi.fn().mockResolvedValue({ game: { executable: "bapbap.exe" } }) },
        settings: { set: vi.fn() },
        melonLoader: { ensureInstalled: vi.fn().mockResolvedValue(undefined) },
    };
}

function makeService(deps: Deps): LaunchService {
    return new LaunchService(
        deps.instances as never,
        deps.manifests as never,
        deps.settings as never,
        deps.melonLoader as never
    );
}

afterEach(() => {
    spawnMock.mockReset();
});

beforeEach(() => {
    spawnMock.mockReset();
});

describe("LaunchService", () => {
    it("spawns the game and transitions to running on the spawn event", async () => {
        const child = new FakeChild();
        spawnMock.mockReturnValue(child);
        const deps = makeDeps();
        const service = makeService(deps);

        await service.launch({ instanceId: "inst-1", showMelonConsole: false });

        // After launch() resolves, the process has been spawned but the OS
        // "spawn" event has not fired yet — still launching.
        expect(service.getRuntimeState().status).toBe("launching");
        expect(spawnMock).toHaveBeenCalledOnce();
        const [exe, args] = spawnMock.mock.calls[0];
        expect(String(exe).endsWith("bapbap.exe")).toBe(true);
        expect(args).toContain("--melonloader.hideconsole");

        child.emit("spawn");
        const state = service.getRuntimeState();
        expect(state.status).toBe("running");
        expect(state.pid).toBe(4242);
        expect(deps.instances.markMelonLoaderFirstRunCompleted).toHaveBeenCalledWith("inst-1");
    });

    it("omits the hideconsole arg when the console should be shown", async () => {
        const child = new FakeChild();
        spawnMock.mockReturnValue(child);
        const deps = makeDeps();
        const service = makeService(deps);

        await service.launch({ instanceId: "inst-1", showMelonConsole: true });

        const [, args] = spawnMock.mock.calls[0];
        expect(args).not.toContain("--melonloader.hideconsole");
        expect(deps.settings.set).toHaveBeenCalledWith("launchShowMelonConsole", true);
    });

    it("rejects a second launch while one is already in flight", async () => {
        const child = new FakeChild();
        spawnMock.mockReturnValue(child);
        const service = makeService(makeDeps());

        await service.launch({ instanceId: "inst-1", showMelonConsole: false });
        child.emit("spawn");
        expect(service.getRuntimeState().status).toBe("running");

        await expect(service.launch({ instanceId: "inst-1", showMelonConsole: false })).rejects.toThrow(
            /already running/i
        );
        // The guard must prevent a duplicate spawn.
        expect(spawnMock).toHaveBeenCalledOnce();
    });

    it("rejects a second launch even before the spawn event fires", async () => {
        const child = new FakeChild();
        spawnMock.mockReturnValue(child);
        const service = makeService(makeDeps());

        await service.launch({ instanceId: "inst-1", showMelonConsole: false });
        // Status is "launching" here — the guard must still reject.
        await expect(service.launch({ instanceId: "inst-1", showMelonConsole: false })).rejects.toThrow(
            /already running/i
        );
        expect(spawnMock).toHaveBeenCalledOnce();
    });

    it("fails without spawning when MelonLoader setup throws", async () => {
        const deps = makeDeps();
        deps.melonLoader.ensureInstalled.mockRejectedValue(new Error("loader exploded"));
        const service = makeService(deps);

        await expect(service.launch({ instanceId: "inst-1", showMelonConsole: false })).rejects.toThrow(
            "loader exploded"
        );

        expect(spawnMock).not.toHaveBeenCalled();
        const state = service.getRuntimeState();
        expect(state.status).toBe("failed");
        expect(state.error).toBe("loader exploded");

        // A failed launch must leave the service launchable again.
        const child = new FakeChild();
        spawnMock.mockReturnValue(child);
        deps.melonLoader.ensureInstalled.mockResolvedValue(undefined);
        await expect(service.launch({ instanceId: "inst-1", showMelonConsole: false })).resolves.toBeUndefined();
        expect(spawnMock).toHaveBeenCalledOnce();
    });

    it("records the exit state and becomes launchable again after the process exits", async () => {
        const child = new FakeChild();
        spawnMock.mockReturnValue(child);
        const service = makeService(makeDeps());

        await service.launch({ instanceId: "inst-1", showMelonConsole: false });
        child.emit("spawn");
        child.emit("exit", 0);

        const state = service.getRuntimeState();
        expect(state.status).toBe("exited");
        expect(state.exitCode).toBe(0);

        // Exited is not one of the guarded states, so launching again works.
        const child2 = new FakeChild();
        spawnMock.mockReturnValue(child2);
        await expect(service.launch({ instanceId: "inst-1", showMelonConsole: false })).resolves.toBeUndefined();
    });

    it("buffers stdout into line-delimited log entries", async () => {
        const child = new FakeChild();
        spawnMock.mockReturnValue(child);
        const service = makeService(makeDeps());
        const logs: string[] = [];
        service.onRuntimeLog(entry => {
            if (entry.stream === "stdout") logs.push(entry.message);
        });

        await service.launch({ instanceId: "inst-1", showMelonConsole: false });
        child.emit("spawn");
        child.stdout.emit("data", Buffer.from("line one\nline two\npartial"));

        expect(logs).toEqual(["line one", "line two"]);

        // The partial line is flushed on exit.
        child.emit("exit", 0);
        expect(logs).toContain("partial");
    });

    it("throws when stopping with no running session", async () => {
        const service = makeService(makeDeps());
        await expect(service.stop()).rejects.toThrow(/no launcher-managed game session/i);
    });
});
