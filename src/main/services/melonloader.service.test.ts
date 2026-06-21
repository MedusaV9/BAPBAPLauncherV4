import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => {
    const app = { getPath: () => os.tmpdir() };
    return { default: { app }, app };
});

import { MelonLoaderService } from "./melonloader.service";

const REQUIRED_VERSION = "0.6.1";
const tempRoots: string[] = [];

afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

async function makeInstanceDir(): Promise<string> {
    const dir = path.join(os.tmpdir(), `melon-${crypto.randomBytes(6).toString("hex")}`);
    await fs.mkdir(dir, { recursive: true });
    tempRoots.push(dir);
    return dir;
}

/** Build a minimal 4KB PE buffer whose machine field reports the given arch. */
function peBuffer(machine: number): Buffer {
    const buf = Buffer.alloc(4096);
    const peOffset = 256;
    buf.writeUInt32LE(peOffset, 0x3c);
    buf.writeUInt16LE(machine, peOffset + 4);
    return buf;
}

const PE_X64 = 0x8664;
const PE_X86 = 0x14c;

function makeManifests(melonLoader: unknown = {
    requiredVersion: REQUIRED_VERSION,
    x64: { url: "https://github.com/o/r/x64.zip", sha256: "a".repeat(64) },
    x86: { url: "https://github.com/o/r/x86.zip", sha256: "b".repeat(64) },
}) {
    return { getIndex: vi.fn().mockResolvedValue({ melonLoader }) };
}

function makeService(opts: { melonLoader?: unknown; downloadFile?: ReturnType<typeof vi.fn> } = {}) {
    const manifests = makeManifests(opts.melonLoader);
    const downloader = { downloadFile: opts.downloadFile ?? vi.fn().mockResolvedValue(undefined) };
    const service = new MelonLoaderService(manifests as never, downloader as never);
    return { service, manifests, downloader };
}

/** Lay down the files a healthy x64 install requires. */
async function writeHealthyInstall(dir: string, version = REQUIRED_VERSION, arch = "x64", machine = PE_X64) {
    await fs.writeFile(path.join(dir, "bapbap.exe"), peBuffer(machine));
    await fs.writeFile(path.join(dir, "version.dll"), "stub");
    await fs.mkdir(path.join(dir, "MelonLoader", "net6"), { recursive: true });
    await fs.writeFile(path.join(dir, "MelonLoader", "net6", "MelonLoader.dll"), "stub");
    await fs.writeFile(
        path.join(dir, ".bapbap-melonloader.json"),
        JSON.stringify({ schemaVersion: 1, version, architecture: arch, installedAtUtc: "2026-01-01T00:00:00.000Z" })
    );
}

describe("MelonLoaderService", () => {
    it("detects x64 architecture from the PE header", async () => {
        const dir = await makeInstanceDir();
        await fs.writeFile(path.join(dir, "bapbap.exe"), peBuffer(PE_X64));
        const { service } = makeService();

        const status = await service.getStatus(dir);
        expect(status.architecture).toBe("x64");
    });

    it("detects x86 architecture from the PE header", async () => {
        const dir = await makeInstanceDir();
        await fs.writeFile(path.join(dir, "bapbap.exe"), peBuffer(PE_X86));
        const { service } = makeService();

        const status = await service.getStatus(dir);
        expect(status.architecture).toBe("x86");
    });

    it("reports not-installed and unhealthy for a bare instance", async () => {
        const dir = await makeInstanceDir();
        await fs.writeFile(path.join(dir, "bapbap.exe"), peBuffer(PE_X64));
        const { service } = makeService();

        const status = await service.getStatus(dir);
        expect(status.installed).toBe(false);
        expect(status.healthy).toBe(false);
        expect(status.requiredVersion).toBe(REQUIRED_VERSION);
    });

    it("reports healthy when marker, folder, and runtime files all match", async () => {
        const dir = await makeInstanceDir();
        await writeHealthyInstall(dir);
        const { service } = makeService();

        const status = await service.getStatus(dir);
        expect(status.installed).toBe(true);
        expect(status.healthy).toBe(true);
        expect(status.installedVersion).toBe(REQUIRED_VERSION);
    });

    it("reports installed-but-unhealthy when the marker version is stale", async () => {
        const dir = await makeInstanceDir();
        await writeHealthyInstall(dir, "0.5.0");
        const { service } = makeService();

        const status = await service.getStatus(dir);
        expect(status.installed).toBe(true);
        expect(status.healthy).toBe(false);
        expect(status.installedVersion).toBe("0.5.0");
    });

    it("reports unhealthy when the marker arch does not match the detected arch", async () => {
        const dir = await makeInstanceDir();
        // PE says x64, marker claims x86 -> mismatch.
        await writeHealthyInstall(dir, REQUIRED_VERSION, "x86", PE_X64);
        const { service } = makeService();

        const status = await service.getStatus(dir);
        expect(status.healthy).toBe(false);
    });

    it("ensureInstalled is a no-op (no download) when already healthy", async () => {
        const dir = await makeInstanceDir();
        await writeHealthyInstall(dir);
        const { service, downloader } = makeService();

        const status = await service.ensureInstalled(dir);
        expect(status.healthy).toBe(true);
        expect(downloader.downloadFile).not.toHaveBeenCalled();
    });

    it("throws when the manifest is missing required MelonLoader fields", async () => {
        const dir = await makeInstanceDir();
        await fs.writeFile(path.join(dir, "bapbap.exe"), peBuffer(PE_X64));
        const { service } = makeService({ melonLoader: { requiredVersion: "0.6.1" } }); // no x64/x86

        await expect(service.getStatus(dir)).rejects.toThrow(/missing required melonloader/i);
    });

    it("throws a clear error when bapbap.exe is absent", async () => {
        const dir = await makeInstanceDir();
        const { service } = makeService();

        await expect(service.getStatus(dir)).rejects.toThrow(/cannot detect game architecture/i);
    });
});
