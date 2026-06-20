import { afterEach, describe, expect, it, vi } from "vitest";

const perfState = vi.hoisted(() => ({ now: 1000 }));

vi.mock("node:perf_hooks", () => {
    const performance = { now: () => perfState.now };
    return { performance, default: { performance } };
});

// trusted-time.service imports manifest-client, which pulls in electron at load.
vi.mock("electron", () => {
    const app = { getPath: () => "" };
    return { default: { app }, app };
});

import { TrustedTimeService } from "./trusted-time.service";

const SERVER_DATE = "Wed, 21 Oct 2026 07:28:00 GMT";
const SERVER_EPOCH = Date.parse(SERVER_DATE);

function makeManifests(timeSourceUrl?: string) {
    return { getIndex: vi.fn().mockResolvedValue({ timeSourceUrl }) };
}

function makeService(timeSourceUrl: string | undefined, manifests = makeManifests(timeSourceUrl)) {
    return new TrustedTimeService(manifests as never);
}

function headerResponse(dateHeader: string | null, ok = true) {
    return {
        ok,
        headers: { get: (key: string) => (key.toLowerCase() === "date" ? dateHeader : null) },
    } as unknown as Response;
}

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
    perfState.now = 1000;
    vi.restoreAllMocks();
});

describe("TrustedTimeService", () => {
    it("reports ready and available when the source returns a valid Date header", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(headerResponse(SERVER_DATE)) as never;
        const service = makeService("https://time.example.test");

        const state = await service.getState(true);
        expect(state.status).toBe("ready");
        expect(state.available).toBe(true);
        expect(state.configured).toBe(true);
        expect(state.trustedEpochMs).toBe(SERVER_EPOCH);
    });

    it("anchors trusted now to the server epoch plus the monotonic delta, not the local clock", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(headerResponse(SERVER_DATE)) as never;
        const service = makeService("https://time.example.test");

        perfState.now = 1000; // perf clock at sync time
        await service.getState(true);

        perfState.now = 1500; // 500ms of monotonic time elapsed
        const trusted = await service.getTrustedNow(false);

        expect(trusted.available).toBe(true);
        // Anchored to the server-provided epoch + the 500ms monotonic delta —
        // independent of whatever the local wall clock reads.
        expect(trusted.trustedNowMs).toBe(SERVER_EPOCH + 500);
    });

    it("is unavailable when the manifest declares no time source", async () => {
        globalThis.fetch = vi.fn() as never;
        const service = makeService(undefined);

        const state = await service.getState(true);
        expect(state.status).toBe("unavailable");
        expect(state.available).toBe(false);
        expect(state.configured).toBe(false);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("is unavailable when the source returns no Date header", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(headerResponse(null)) as never;
        const service = makeService("https://time.example.test");

        const state = await service.getState(true);
        expect(state.status).toBe("unavailable");
        expect(state.available).toBe(false);
        expect(state.configured).toBe(true);
    });

    it("is unavailable when the Date header is unparseable", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(headerResponse("not a date")) as never;
        const service = makeService("https://time.example.test");

        const state = await service.getState(true);
        expect(state.status).toBe("unavailable");
        expect(state.available).toBe(false);
    });

    it("falls back to GET when the HEAD request is not ok", async () => {
        const fetchMock = vi.fn().mockImplementation((_url: string, init?: { method?: string }) => {
            if (init?.method === "HEAD") return Promise.resolve(headerResponse(null, false));
            return Promise.resolve(headerResponse(SERVER_DATE));
        });
        globalThis.fetch = fetchMock as never;
        const service = makeService("https://time.example.test");

        const state = await service.getState(true);
        expect(state.available).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "HEAD" });
        expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "GET" });
    });

    it("getTrustedNow reports unavailable without a successful sync", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(headerResponse(null)) as never;
        const service = makeService("https://time.example.test");

        const trusted = await service.getTrustedNow(true);
        expect(trusted.available).toBe(false);
        expect(trusted.trustedNowMs).toBeUndefined();
    });

    it("dedupes concurrent syncs into a single fetch", async () => {
        const fetchMock = vi.fn().mockResolvedValue(headerResponse(SERVER_DATE));
        globalThis.fetch = fetchMock as never;
        const service = makeService("https://time.example.test");

        const [a, b] = await Promise.all([service.getState(true), service.getState(true)]);
        expect(a.available).toBe(true);
        expect(b.available).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("notifies listeners on state changes and stops after unsubscribe", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(headerResponse(SERVER_DATE)) as never;
        const service = makeService("https://time.example.test");
        const seen: string[] = [];
        const unsubscribe = service.onStateChanged(state => seen.push(state.status));

        await service.getState(true);
        expect(seen).toContain("syncing");
        expect(seen).toContain("ready");

        seen.length = 0;
        unsubscribe();
        await service.getState(true);
        expect(seen).toEqual([]);
    });
});
