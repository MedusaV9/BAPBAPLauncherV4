import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ArchiveDownloadService } from "./archive-download.service";

const tempRoots: string[] = [];
const originalFetch = globalThis.fetch;

afterEach(async () => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    await Promise.all(tempRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

async function makeTempDir(): Promise<string> {
    const dir = path.join(os.tmpdir(), `archive-dl-${crypto.randomBytes(6).toString("hex")}`);
    await fs.mkdir(dir, { recursive: true });
    tempRoots.push(dir);
    return dir;
}

/** Minimal Response stand-in that streams `bytes` from a single read. */
function streamResponse(bytes: Buffer, opts: { ok?: boolean; status?: number; contentLength?: number } = {}) {
    const { ok = true, status = 200, contentLength } = opts;
    const headers = new Map<string, string>();
    if (contentLength !== undefined) headers.set("content-length", String(contentLength));
    let sent = false;
    return {
        ok,
        status,
        headers: { get: (key: string) => headers.get(key.toLowerCase()) ?? null },
        body: {
            getReader() {
                return {
                    read() {
                        if (sent) return Promise.resolve({ done: true, value: undefined });
                        sent = true;
                        return Promise.resolve({ done: false, value: new Uint8Array(bytes) });
                    },
                };
            },
        },
    } as unknown as Response;
}

function sha256(bytes: Buffer): string {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

describe("ArchiveDownloadService", () => {
    it("rejects non-HTTPS download URLs before any network call", async () => {
        const service = new ArchiveDownloadService();
        globalThis.fetch = vi.fn() as never;
        const dir = await makeTempDir();

        await expect(
            service.downloadFile({ url: "http://github.com/owner/repo/file.bin", outputPath: path.join(dir, "f.bin") })
        ).rejects.toThrow(/only https/i);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("rejects downloads from hosts outside the allowlist", async () => {
        const service = new ArchiveDownloadService();
        globalThis.fetch = vi.fn() as never;
        const dir = await makeTempDir();

        await expect(
            service.downloadFile({ url: "https://evil.example.com/file.bin", outputPath: path.join(dir, "f.bin") })
        ).rejects.toThrow(/not allowed/i);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("downloads to disk and accepts a matching SHA-256", async () => {
        const payload = Buffer.from("bapbap-payload-contents");
        const service = new ArchiveDownloadService();
        globalThis.fetch = vi.fn().mockResolvedValue(streamResponse(payload, { contentLength: payload.length })) as never;
        const dir = await makeTempDir();
        const outputPath = path.join(dir, "f.bin");

        await service.downloadFile({
            url: "https://github.com/owner/repo/releases/download/v1/f.bin",
            outputPath,
            sha256: sha256(payload),
        });

        const written = await fs.readFile(outputPath);
        expect(written.equals(payload)).toBe(true);
    });

    it("throws and removes the output file on a SHA-256 mismatch", async () => {
        const payload = Buffer.from("real-bytes");
        const service = new ArchiveDownloadService();
        globalThis.fetch = vi.fn().mockResolvedValue(streamResponse(payload)) as never;
        const dir = await makeTempDir();
        const outputPath = path.join(dir, "f.bin");

        await expect(
            service.downloadFile({
                url: "https://github.com/owner/repo/releases/download/v1/f.bin",
                outputPath,
                sha256: "0".repeat(64),
            })
        ).rejects.toThrow(/sha256 mismatch/i);

        // The partial/incorrect download must not be left behind.
        await expect(fs.access(outputPath)).rejects.toThrow();
    });

    it("reports progress with a final 100% emission when content-length is known", async () => {
        const payload = Buffer.from("progress-bytes-payload");
        const service = new ArchiveDownloadService();
        globalThis.fetch = vi.fn().mockResolvedValue(streamResponse(payload, { contentLength: payload.length })) as never;
        const dir = await makeTempDir();
        const events: number[] = [];

        await service.downloadFile({
            url: "https://github.com/owner/repo/releases/download/v1/f.bin",
            outputPath: path.join(dir, "f.bin"),
            onProgress: p => {
                if (typeof p.progressPercent === "number") events.push(p.progressPercent);
            },
        });

        expect(events.at(-1)).toBe(100);
    });

    it("throws on a non-ok HTTP response", async () => {
        const service = new ArchiveDownloadService();
        globalThis.fetch = vi.fn().mockResolvedValue(streamResponse(Buffer.alloc(0), { ok: false, status: 404 })) as never;
        const dir = await makeTempDir();

        await expect(
            service.downloadFile({
                url: "https://github.com/owner/repo/releases/download/v1/missing.bin",
                outputPath: path.join(dir, "f.bin"),
            })
        ).rejects.toThrow(/download failed \(404\)/i);
    });

    it("rejects extract requests for disallowed hosts before downloading", async () => {
        const service = new ArchiveDownloadService();
        globalThis.fetch = vi.fn() as never;
        const dir = await makeTempDir();

        await expect(
            service.downloadAndExtractZip({
                url: "https://evil.example.com/pack.zip",
                destination: path.join(dir, "dest"),
                tmpRoot: path.join(dir, "tmp"),
            })
        ).rejects.toThrow(/not allowed/i);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });
});
