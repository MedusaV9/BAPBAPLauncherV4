import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => {
    const app = { getPath: () => "/tmp/bundle-fetcher-test" };
    return { default: { app }, app };
});

const fetchState = vi.hoisted(() => ({ impl: null as null | ((url: string, init?: unknown) => Promise<unknown>) }));
vi.mock("../../utils/timeout-fetch", () => ({
    MANIFEST_TIMEOUT_MS: 15_000,
    fetchWithTimeout: (url: string, init?: unknown) => {
        if (!fetchState.impl) throw new Error("fetchWithTimeout not stubbed");
        return fetchState.impl(url, init);
    },
}));

const hashState = vi.hoisted(() => ({ matches: true }));
vi.mock("../../utils/file-hash", () => ({
    verifySha256: vi.fn().mockImplementation(() => Promise.resolve(hashState.matches)),
}));

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { ManifestClientBundleFetcher } from "./manifest-client-bundle-fetcher";
import { BUNDLE_HASH_MISMATCH_CODE } from "./bundle-update.service";

const tempRoots: string[] = [];

afterEach(async () => {
    fetchState.impl = null;
    hashState.matches = true;
    vi.clearAllMocks();
    await Promise.all(tempRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

async function makeTempDir(): Promise<string> {
    const dir = path.join(os.tmpdir(), `bundle-fetch-${crypto.randomBytes(6).toString("hex")}`);
    await fs.mkdir(dir, { recursive: true });
    tempRoots.push(dir);
    return dir;
}

function makeFetcher(opts: {
    bundlesManifest?: unknown;
    downloadFile?: ReturnType<typeof vi.fn>;
} = {}) {
    const manifests = { getBundlesManifest: vi.fn().mockResolvedValue(opts.bundlesManifest ?? null) };
    const downloader = { downloadFile: opts.downloadFile ?? vi.fn().mockResolvedValue(undefined) };
    const fetcher = new ManifestClientBundleFetcher(manifests as never, downloader as never);
    return { fetcher, manifests, downloader };
}

function jsonResponse(body: unknown, ok = true, status = 200) {
    return { ok, status, json: () => Promise.resolve(body) };
}

describe("ManifestClientBundleFetcher.fetchChannelIndex", () => {
    it("throws when the central index has no bundles manifest", async () => {
        const { fetcher } = makeFetcher({ bundlesManifest: null });
        await expect(fetcher.fetchChannelIndex("boss-rush")).rejects.toThrow(/not available in the central index/i);
    });

    it("throws when the bundle id is not listed", async () => {
        const { fetcher } = makeFetcher({ bundlesManifest: { schemaVersion: 1, channel: "stable", bundles: [] } });
        await expect(fetcher.fetchChannelIndex("boss-rush")).rejects.toThrow(/not listed in bundles\.json/i);
    });

    it("returns the newest build as current, sorted descending", async () => {
        const { fetcher } = makeFetcher({
            bundlesManifest: {
                schemaVersion: 1,
                channel: "stable",
                bundles: [
                    { bundleId: "boss-rush", version: "1.0.0", buildNumber: 3, manifestUrl: "u3" },
                    { bundleId: "boss-rush", version: "1.0.0", buildNumber: 5, manifestUrl: "u5" },
                    { bundleId: "other", version: "1.0.0", buildNumber: 9, manifestUrl: "ux" },
                ],
            },
        });

        const index = await fetcher.fetchChannelIndex("BOSS-RUSH"); // case-insensitive match
        expect(index.current.buildNumber).toBe(5);
        expect(index.releases?.map(r => r.buildNumber)).toEqual([5, 3]);
    });
});

describe("ManifestClientBundleFetcher.fetchManifest", () => {
    it("throws on an empty url", async () => {
        const { fetcher } = makeFetcher();
        await expect(fetcher.fetchManifest("")).rejects.toThrow(/url is empty/i);
    });

    it("throws on a non-ok response", async () => {
        fetchState.impl = () => Promise.resolve(jsonResponse({}, false, 404));
        const { fetcher } = makeFetcher();
        await expect(fetcher.fetchManifest("https://x/m.json")).rejects.toThrow(/HTTP 404/);
    });

    it("throws when the manifest has no id", async () => {
        fetchState.impl = () => Promise.resolve(jsonResponse({ buildNumber: 1 }));
        const { fetcher } = makeFetcher();
        await expect(fetcher.fetchManifest("https://x/m.json")).rejects.toThrow(/no id/i);
    });

    it("throws when buildNumber is invalid", async () => {
        fetchState.impl = () => Promise.resolve(jsonResponse({ id: "boss-rush", buildNumber: "nope" }));
        const { fetcher } = makeFetcher();
        await expect(fetcher.fetchManifest("https://x/m.json")).rejects.toThrow(/invalid buildNumber/i);
    });

    it("returns a valid manifest", async () => {
        const manifest = { schemaVersion: 1, id: "boss-rush", channel: "stable", version: "1.0.0", buildNumber: 5 };
        fetchState.impl = () => Promise.resolve(jsonResponse(manifest));
        const { fetcher } = makeFetcher();
        await expect(fetcher.fetchManifest("https://x/m.json")).resolves.toMatchObject({ id: "boss-rush", buildNumber: 5 });
    });
});

describe("ManifestClientBundleFetcher.downloadArchive", () => {
    it("requires an archive url and a sha256", async () => {
        const { fetcher } = makeFetcher();
        await expect(fetcher.downloadArchive({ archiveUrl: "", archiveSha256: "abc", stagingDir: "/tmp/x" })).rejects.toThrow(/url is empty/i);
        await expect(fetcher.downloadArchive({ archiveUrl: "https://x/a.zip", archiveSha256: "", stagingDir: "/tmp/x" })).rejects.toThrow(/SHA-256 hash is required/i);
    });

    it("downloads then defensively re-verifies the hash", async () => {
        const dir = await makeTempDir();
        const downloadFile = vi.fn().mockResolvedValue(undefined);
        const { fetcher } = makeFetcher({ downloadFile });
        hashState.matches = true;

        await fetcher.downloadArchive({ archiveUrl: "https://github.com/x/a.zip", archiveSha256: "a".repeat(64), stagingDir: dir });
        expect(downloadFile).toHaveBeenCalledWith(
            expect.objectContaining({
                url: "https://github.com/x/a.zip",
                sha256: "a".repeat(64),
                outputPath: path.join(dir, "bundle.zip"),
            })
        );
    });

    it("fails closed with the mismatch code when re-verification fails", async () => {
        const dir = await makeTempDir();
        const { fetcher } = makeFetcher({ downloadFile: vi.fn().mockResolvedValue(undefined) });
        hashState.matches = false;

        await expect(
            fetcher.downloadArchive({ archiveUrl: "https://github.com/x/a.zip", archiveSha256: "b".repeat(64), stagingDir: dir })
        ).rejects.toMatchObject({ code: BUNDLE_HASH_MISMATCH_CODE });
    });
});

describe("ManifestClientBundleFetcher.verifyArchive", () => {
    it("throws with the mismatch code when the staging dir is empty", async () => {
        const dir = await makeTempDir();
        const { fetcher } = makeFetcher();
        await expect(
            fetcher.verifyArchive({ stagingDir: dir, manifest: { id: "x", buildNumber: 1 } as never })
        ).rejects.toMatchObject({ code: BUNDLE_HASH_MISMATCH_CODE });
    });

    it("passes when the staging dir has at least one entry", async () => {
        const dir = await makeTempDir();
        await fs.writeFile(path.join(dir, "extracted.txt"), "x");
        const { fetcher } = makeFetcher();
        await expect(
            fetcher.verifyArchive({ stagingDir: dir, manifest: { id: "x", buildNumber: 1 } as never })
        ).resolves.toBeUndefined();
    });
});
