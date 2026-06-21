import { afterEach, describe, expect, it, vi } from "vitest";

import { ManifestClient } from "./manifest-client";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
});

const BASE_URL = "https://manifest.example.test/index.json";

function makeSettings(manifestUrl = BASE_URL) {
    return { getManifestUrl: vi.fn().mockReturnValue(manifestUrl) };
}

/** Map a URL -> JSON body, returning a fetch stub that 404s anything unmapped. */
function makeFetch(routes: Record<string, unknown>) {
    return vi.fn().mockImplementation((url: string) => {
        if (url in routes) {
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(routes[url]) } as Response);
        }
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
    });
}

function indexBody(extra: Record<string, unknown> = {}) {
    return {
        schemaVersion: 1,
        game: { name: "BAPBAP", executable: "bapbap.exe", dataFolder: "BAPBAP_Data" },
        gameVersionsManifestPath: "game-versions.json",
        channels: [{ id: "release", name: "Release", manifestPath: "channels/release.json" }],
        ...extra,
    };
}

describe("ManifestClient", () => {
    it("fetches and caches the index, only hitting the network once", async () => {
        const fetchMock = makeFetch({ [BASE_URL]: indexBody() });
        globalThis.fetch = fetchMock as never;
        const client = new ManifestClient(makeSettings() as never);

        const first = await client.getIndex();
        const second = await client.getIndex();

        expect(first.game.executable).toBe("bapbap.exe");
        expect(second).toBe(first);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("re-fetches the index when force is true", async () => {
        const fetchMock = makeFetch({ [BASE_URL]: indexBody() });
        globalThis.fetch = fetchMock as never;
        const client = new ManifestClient(makeSettings() as never);

        await client.getIndex();
        await client.getIndex(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("resolves relative timeSourceUrl against the manifest base URL", async () => {
        const fetchMock = makeFetch({ [BASE_URL]: indexBody({ timeSourceUrl: "time" }) });
        globalThis.fetch = fetchMock as never;
        const client = new ManifestClient(makeSettings() as never);

        const index = await client.getIndex();
        expect(index.timeSourceUrl).toBe("https://manifest.example.test/time");
    });

    it("normalizes and filters secretUnlocks (drops entries missing id or hash, lowercases hash)", async () => {
        const fetchMock = makeFetch({
            [BASE_URL]: indexBody({
                secretUnlocks: [
                    { id: "alpha", label: " Alpha ", passwordSha256: "ABCDEF" },
                    { id: "", passwordSha256: "deadbeef" }, // dropped: no id
                    { id: "beta" }, // dropped: no hash
                ],
            }),
        });
        globalThis.fetch = fetchMock as never;
        const client = new ManifestClient(makeSettings() as never);

        const index = await client.getIndex();
        expect(index.secretUnlocks).toEqual([{ id: "alpha", label: "Alpha", passwordSha256: "abcdef" }]);
    });

    it("returns null launcher updates when the index declares no updates path", async () => {
        const fetchMock = makeFetch({ [BASE_URL]: indexBody() });
        globalThis.fetch = fetchMock as never;
        const client = new ManifestClient(makeSettings() as never);

        expect(await client.getLauncherUpdates()).toBeNull();
    });

    it("loads launcher updates, defaulting and lowercasing the channel", async () => {
        const updatesUrl = "https://manifest.example.test/launcher/updates.json";
        const fetchMock = makeFetch({
            [BASE_URL]: indexBody({ launcher: { updatesManifestPath: "launcher/updates.json" } }),
            [updatesUrl]: { schemaVersion: 1, channel: "STABLE", releases: [{ version: "5.0.0" }, { version: "" }] },
        });
        globalThis.fetch = fetchMock as never;
        const client = new ManifestClient(makeSettings() as never);

        const updates = await client.getLauncherUpdates();
        expect(updates?.channel).toBe("stable");
        // The version-less release is filtered out.
        expect(updates?.releases.map(r => r.version)).toEqual(["5.0.0"]);
    });

    it("throws a descriptive error when a manifest request is not ok", async () => {
        const fetchMock = makeFetch({}); // every URL 404s
        globalThis.fetch = fetchMock as never;
        const client = new ManifestClient(makeSettings() as never);

        await expect(client.getIndex()).rejects.toThrow(/manifest request failed \(404\)/i);
    });

    it("throws when an unknown channel is requested", async () => {
        const fetchMock = makeFetch({ [BASE_URL]: indexBody() });
        globalThis.fetch = fetchMock as never;
        const client = new ManifestClient(makeSettings() as never);

        await expect(client.getChannel("nonexistent")).rejects.toThrow(/not found/i);
    });

    it("clearCache forces the next index read to re-fetch", async () => {
        const fetchMock = makeFetch({ [BASE_URL]: indexBody() });
        globalThis.fetch = fetchMock as never;
        const client = new ManifestClient(makeSettings() as never);

        await client.getIndex();
        client.clearCache();
        await client.getIndex();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("leaves absolute URLs untouched in resolveManifestPath", () => {
        const client = new ManifestClient(makeSettings() as never);
        expect(client.resolveManifestPath("https://cdn.example/x.png", BASE_URL)).toBe("https://cdn.example/x.png");
        expect(client.resolveManifestPath("art/x.png", BASE_URL)).toBe("https://manifest.example.test/art/x.png");
    });
});
