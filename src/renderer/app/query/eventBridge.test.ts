import { describe, expect, it, vi } from "vitest";

type Listener = (value: unknown) => void;
const captured = vi.hoisted(() => ({ listeners: {} as Record<string, Listener>, unsubs: [] as ReturnType<typeof vi.fn>[] }));

function register(key: string) {
    return (cb: Listener) => {
        captured.listeners[key] = cb;
        const unsub = vi.fn();
        captured.unsubs.push(unsub);
        return unsub;
    };
}

vi.mock("../../api", () => ({
    api: {
        updater: { onStateChanged: register("updater") },
        manifest: { onTrustedTimeChanged: register("trustedTime") },
        instances: { onInstallStateChanged: register("install") },
        launch: { onRuntimeStateChanged: register("runtime"), onRuntimeLog: register("log") },
        radio: { onStateChanged: register("radio") },
        bundle: { onInstallProgressChanged: register("bundleProgress"), onUpdateStateChanged: register("bundleUpdate") },
    },
}));

import { installEventBridge } from "./eventBridge";

function fakeQc() {
    const store = new Map<string, unknown>();
    return {
        store,
        setQueryData: vi.fn((key: unknown, updater: unknown) => {
            const k = JSON.stringify(key);
            const next = typeof updater === "function" ? (updater as (p: unknown) => unknown)(store.get(k)) : updater;
            store.set(k, next);
        }),
        invalidateQueries: vi.fn(),
    };
}

describe("installEventBridge", () => {
    it("wires each backend event into the query cache", () => {
        const qc = fakeQc();
        installEventBridge(qc as never);

        captured.listeners.radio({ stationName: "BAPBAP" });
        captured.listeners.runtime({ status: "running" });

        expect(qc.setQueryData).toHaveBeenCalled();
        expect([...qc.store.values()]).toContainEqual({ stationName: "BAPBAP" });
        expect([...qc.store.values()]).toContainEqual({ status: "running" });
    });

    it("invalidates the instances query when an install state arrives", () => {
        const qc = fakeQc();
        installEventBridge(qc as never);

        captured.listeners.install({ status: "done" });

        expect(qc.invalidateQueries).toHaveBeenCalled();
    });

    it("does not invalidate instances on non-terminal install progress", () => {
        const qc = fakeQc();
        installEventBridge(qc as never);

        captured.listeners.install({ status: "downloading", progressPercent: 42 });

        expect(qc.invalidateQueries).not.toHaveBeenCalled();
    });

    it("invalidates bundles only on terminal bundle update states", () => {
        const qc = fakeQc();
        installEventBridge(qc as never);

        captured.listeners.bundleUpdate({ instanceId: "inst-1", status: "downloading", progressPercent: 10 });
        expect(qc.invalidateQueries).not.toHaveBeenCalled();

        captured.listeners.bundleUpdate({ instanceId: "inst-1", status: "done" });
        expect(qc.invalidateQueries).toHaveBeenCalled();
    });

    it("caps the runtime log ring buffer at 400 entries, keeping the most recent", () => {
        const qc = fakeQc();
        installEventBridge(qc as never);

        for (let i = 0; i < 450; i++) {
            captured.listeners.log({ id: i, message: `line ${i}` });
        }

        const logKey = [...qc.store.keys()].find(k => k.includes("runtimeLog"))!;
        const log = qc.store.get(logKey) as Array<{ id: number }>;
        expect(log.length).toBe(400);
        expect(log[0].id).toBe(50); // oldest 50 dropped
        expect(log[log.length - 1].id).toBe(449);
    });

    it("returns a teardown that unsubscribes every listener", () => {
        captured.unsubs.length = 0;
        const qc = fakeQc();
        const teardown = installEventBridge(qc as never);

        const count = captured.unsubs.length;
        expect(count).toBeGreaterThan(0);
        teardown();
        for (const unsub of captured.unsubs) {
            expect(unsub).toHaveBeenCalled();
        }
    });
});
