import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks for node:fs so listAvailable() can be tested without
// touching the real filesystem. The hoisting ensures the module mock is in
// place before BundleService is imported below.
//
// The install-pipeline tests use REAL fs (via os.tmpdir) but go around
// these mocks by NOT calling listAvailable; the install path uses
// fs.promises.readFile only for the bundled-fallback manifest, which is
// resolved by readBundledManifestForId — that single call is also covered
// by readFileMock below.
const { readdirMock, readFileMock } = vi.hoisted(() => ({
    readdirMock: vi.fn(),
    readFileMock: vi.fn(),
}));

vi.mock("node:fs", async () => {
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    return {
        ...actual,
        default: {
            ...(actual as unknown as { default?: typeof import("node:fs") }).default,
            promises: {
                ...actual.promises,
                readdir: readdirMock,
                readFile: readFileMock,
            },
        },
        promises: {
            ...actual.promises,
            readdir: readdirMock,
            readFile: readFileMock,
        },
    };
});

import { BundleService } from "./bundle.service";

function makeDirent(name: string, isDir: boolean) {
    return {
        name,
        isDirectory: () => isDir,
        isFile: () => !isDir,
        isSymbolicLink: () => false,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isFIFO: () => false,
        isSocket: () => false,
    } as unknown as import("node:fs").Dirent;
}

function makeServices(installed: unknown[] = []) {
    const instanceService = {
        list: vi.fn(async () => installed),
        assertMutable: vi.fn(async () => undefined),
    };
    const settings: { getInstancesRoot?: () => string } = {};
    // Cast vi.fn() bodies to `any` so install-pipeline tests can swap in
    // mock implementations whose return type differs from the default
    // (e.g. a real BundlesManifest where the default is null). Without
    // the cast TypeScript narrows each function to its first body and
    // refuses an assignment of a wider implementation later.
    const manifests = {
        getBundlesManifest: vi.fn(async () => null as any),
    };
    const archiveDownload = {
        downloadFile: vi.fn(async (_input: { url: string; outputPath: string; sha256?: string }) => {
            // No-op default. Tests that exercise the install pipeline
            // override this with an implementation that writes a real
            // ZIP buffer at `_input.outputPath`.
            return undefined;
        }),
    };
    const melonLoader = {
        ensureInstalled: vi.fn(async (_destination: string) => ({ healthy: true })),
    };
    return { instanceService, settings, manifests, archiveDownload, melonLoader };
}

/**
 * Construct a BundleService with the listAvailable-friendly mocks and an
 * optional override for any of the new constructor dependencies. Used by
 * the older listAvailable / id-validation / assertMutable tests that do
 * not exercise the install pipeline.
 */
function createBundleService(
    overrides: {
        installed?: unknown[];
        bundlesRoot?: string;
        instanceService?: unknown;
        manifests?: unknown;
        archiveDownload?: unknown;
        melonLoader?: unknown;
        settings?: unknown;
        tmpRoot?: string;
    } = {},
) {
    const services = makeServices(overrides.installed ?? []);
    return new BundleService(
        (overrides.settings ?? services.settings) as never,
        (overrides.instanceService ?? services.instanceService) as never,
        (overrides.manifests ?? services.manifests) as never,
        (overrides.archiveDownload ?? services.archiveDownload) as never,
        (overrides.melonLoader ?? services.melonLoader) as never,
        { bundlesRoot: overrides.bundlesRoot ?? "/fake", tmpRoot: overrides.tmpRoot },
    );
}

describe("BundleService.isValidBundleId", () => {
    it("accepts the canonical boss-rush id", () => {
        expect(BundleService.isValidBundleId("boss-rush")).toBe(true);
    });

    it("accepts single-character ids", () => {
        expect(BundleService.isValidBundleId("x")).toBe(true);
        expect(BundleService.isValidBundleId("0")).toBe(true);
    });

    it("accepts 64-character ids", () => {
        const id = "a" + "0".repeat(62) + "z"; // 64 chars
        expect(id.length).toBe(64);
        expect(BundleService.isValidBundleId(id)).toBe(true);
    });

    it("rejects ids longer than 64 chars", () => {
        const id = "a".repeat(65);
        expect(BundleService.isValidBundleId(id)).toBe(false);
    });

    it("rejects empty strings", () => {
        expect(BundleService.isValidBundleId("")).toBe(false);
    });

    it("rejects uppercase letters", () => {
        expect(BundleService.isValidBundleId("Boss-Rush")).toBe(false);
        expect(BundleService.isValidBundleId("BOSSRUSH")).toBe(false);
    });

    it("rejects leading or trailing hyphens", () => {
        expect(BundleService.isValidBundleId("-boss-rush")).toBe(false);
        expect(BundleService.isValidBundleId("boss-rush-")).toBe(false);
    });

    it("rejects whitespace and special characters", () => {
        expect(BundleService.isValidBundleId("boss rush")).toBe(false);
        expect(BundleService.isValidBundleId("boss/rush")).toBe(false);
        expect(BundleService.isValidBundleId("boss.rush")).toBe(false);
        expect(BundleService.isValidBundleId("boss_rush")).toBe(false);
    });
});

describe("BundleService.listAvailable", () => {
    it("returns the bundled boss-rush fallback when a manifest exists", async () => {
        readdirMock.mockReset();
        readFileMock.mockReset();

        readdirMock.mockResolvedValue([makeDirent("boss-rush", true)]);
        readFileMock.mockResolvedValue(
            JSON.stringify({
                schemaVersion: 1,
                id: "boss-rush",
                name: "Boss Rush",
                channel: "stable",
                version: "1.0.0",
                buildNumber: 100,
                sizeBytes: 12345,
            }),
        );

        const service = createBundleService({ bundlesRoot: "/fake/bundles" });

        const summaries = await service.listAvailable();

        expect(summaries).toEqual([
            {
                id: "boss-rush",
                name: "Boss Rush",
                channel: "stable",
                version: "1.0.0",
                buildNumber: 100,
                sizeBytes: 12345,
                isInstalled: false,
                isUpdateAvailable: false,
                isDownloadable: true,
            },
        ]);
        // Only the manifest.json under the boss-rush directory should be read.
        expect(readFileMock).toHaveBeenCalledTimes(1);
        const [readPath] = readFileMock.mock.calls[0];
        expect(String(readPath).replace(/\\/g, "/")).toContain("/fake/bundles/boss-rush/manifest.json");
    });

    it("returns [] when the bundles directory does not exist", async () => {
        readdirMock.mockReset();
        readFileMock.mockReset();

        const enoent: NodeJS.ErrnoException = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        readdirMock.mockRejectedValue(enoent);

        const service = createBundleService({ bundlesRoot: "/missing" });

        await expect(service.listAvailable()).resolves.toEqual([]);
        expect(readFileMock).not.toHaveBeenCalled();
    });

    it("skips directories with malformed JSON manifests", async () => {
        readdirMock.mockReset();
        readFileMock.mockReset();

        readdirMock.mockResolvedValue([
            makeDirent("good", true),
            makeDirent("broken", true),
            makeDirent("not-a-dir.txt", false),
        ]);

        readFileMock.mockImplementation(async (filePath: string) => {
            if (String(filePath).includes("good")) {
                return JSON.stringify({ id: "good", name: "Good", channel: "stable", version: "1.0.0", buildNumber: 1 });
            }
            return "{ this is not json";
        });

        const service = createBundleService({ bundlesRoot: "/fake" });

        const summaries = await service.listAvailable();
        expect(summaries.map(s => s.id)).toEqual(["good"]);
    });

    it("rejects manifests whose id does not match the strict pattern", async () => {
        readdirMock.mockReset();
        readFileMock.mockReset();

        readdirMock.mockResolvedValue([makeDirent("BadCase", true)]);
        readFileMock.mockResolvedValue(
            JSON.stringify({ id: "BadCase", name: "Bad", channel: "stable", version: "1.0.0", buildNumber: 1 }),
        );

        const service = createBundleService({ bundlesRoot: "/fake" });

        await expect(service.listAvailable()).resolves.toEqual([]);
    });

    it("marks isInstalled=true and isUpdateAvailable=true when the installed build is older", async () => {
        readdirMock.mockReset();
        readFileMock.mockReset();

        readdirMock.mockResolvedValue([makeDirent("boss-rush", true)]);
        readFileMock.mockResolvedValue(
            JSON.stringify({
                id: "boss-rush",
                name: "Boss Rush",
                channel: "stable",
                version: "2.0.0",
                buildNumber: 200,
            }),
        );

        const service = createBundleService({
            installed: [
                {
                    id: "bundle-instance-id",
                    profileName: "Boss Rush",
                    instanceType: "bundle",
                    bundleId: "boss-rush",
                    bundleBuildNumber: 100,
                },
            ],
            bundlesRoot: "/fake",
        });

        const [summary] = await service.listAvailable();
        expect(summary).toMatchObject({
            id: "boss-rush",
            isInstalled: true,
            isUpdateAvailable: true,
        });
    });

    it("marks isUpdateAvailable=false when the installed build is up to date", async () => {
        readdirMock.mockReset();
        readFileMock.mockReset();

        readdirMock.mockResolvedValue([makeDirent("boss-rush", true)]);
        readFileMock.mockResolvedValue(
            JSON.stringify({ id: "boss-rush", name: "Boss Rush", channel: "stable", version: "1.0.0", buildNumber: 100 }),
        );

        const service = createBundleService({
            installed: [
                {
                    id: "bundle-instance-id",
                    profileName: "Boss Rush",
                    instanceType: "bundle",
                    bundleId: "boss-rush",
                    bundleBuildNumber: 100,
                },
            ],
            bundlesRoot: "/fake",
        });

        const [summary] = await service.listAvailable();
        expect(summary.isInstalled).toBe(true);
        expect(summary.isUpdateAvailable).toBe(false);
    });
});

describe("BundleService.install (Phase D pipeline)", () => {
    const tempRoots: string[] = [];

    afterEach(async () => {
        await Promise.all(
            tempRoots.splice(0).map(root => fs.promises.rm(root, { recursive: true, force: true })),
        );
    });

    /**
     * Allocate a fresh tmp dir and remember it for cleanup. We use the
     * native fs.promises.mkdtemp here even though "node:fs" is module-mocked
     * — the install-pipeline tests reset readdirMock / readFileMock to a
     * pass-through implementation so all real fs writes (and binary reads)
     * work correctly.
     */
    async function makeTempRoot(prefix = "bundle-install-test-"): Promise<string> {
        const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
        tempRoots.push(root);
        return root;
    }

    /**
     * Build a real ZIP buffer with the supplied entries. We use JSZip
     * (already a launcher dependency) so the mocked downloadFile can write
     * a genuine archive that BundleService.extractZipSafely will parse.
     */
    async function makeZipBuffer(entries: Array<{ name: string; content: string }>): Promise<Buffer> {
        const zip = new JSZip();
        for (const entry of entries) {
            zip.file(entry.name, entry.content);
        }
        return zip.generateAsync({ type: "nodebuffer" });
    }

    /**
     * Wire readdirMock + readFileMock to forward to the real `node:fs`
     * implementation. This is the inverse of the listAvailable tests
     * (which configure deterministic in-memory return values per test).
     *
     * The install-pipeline tests need real fs because:
     *   - readBundledManifestForId reads (or fails to read) a real
     *     manifest.json under a real bundlesRoot temp directory;
     *   - extractZipSafely reads the downloaded archive as a Buffer (no
     *     encoding) — a stale string-decoding mock would corrupt the zip
     *     header.
     */
    function useRealFsForReads() {
        readdirMock.mockReset();
        readFileMock.mockReset();
        readdirMock.mockImplementation(async (...args: unknown[]) => {
            const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (actual.promises.readdir as any)(...(args as []));
        });
        readFileMock.mockImplementation(async (...args: unknown[]) => {
            const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (actual.promises.readFile as any)(...(args as []));
        });
    }

    /**
     * Drop a manifest.json into a real bundlesRoot/<id>/ directory so the
     * "fallback exists but no remote" branch can be exercised end-to-end.
     */
    async function writeBundledFallback(bundlesRoot: string, id: string, manifest: object): Promise<void> {
        const dir = path.join(bundlesRoot, id);
        await fs.promises.mkdir(dir, { recursive: true });
        await fs.promises.writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest), "utf8");
    }

    it("rejects invalid bundle ids before touching the install pipeline", async () => {
        const service = createBundleService({ bundlesRoot: "/fake" });
        await expect(service.install("Bad Id")).rejects.toThrow("Invalid bundle id");
    });

    it("downloads, extracts, and writes both metadata files on the happy path", async () => {
        useRealFsForReads();
        const instancesRoot = await makeTempRoot("bundle-install-happy-");
        const tmpRoot = await makeTempRoot("bundle-install-tmp-");
        const bundlesRoot = await makeTempRoot("bundle-install-bundlesroot-");

        const services = makeServices();
        services.settings = { getInstancesRoot: () => instancesRoot };
        services.manifests.getBundlesManifest = vi.fn(async () => ({
            schemaVersion: 1,
            channel: "stable",
            bundles: [
                {
                    bundleId: "boss-rush",
                    name: "Boss Rush",
                    version: "1.4.2",
                    buildNumber: 142,
                    channel: "stable",
                    publishedAtUtc: "2026-05-26T18:00:00Z",
                    manifestUrl: "https://example.test/manifest.json",
                    archiveUrl: "https://example.test/bundle.zip",
                    archiveSha256: "deadbeef".repeat(8),
                    sizeBytes: 12345,
                } as never,
            ],
        }));

        const zipBuffer = await makeZipBuffer([
            { name: "Mods/MyBundleMod.dll", content: "fake-dll-bytes" },
            { name: "UserData/BalanceMod/config.cfg", content: "key=value\n" },
        ]);
        services.archiveDownload.downloadFile = vi.fn(async (input: { outputPath: string }) => {
            await fs.promises.writeFile(input.outputPath, zipBuffer);
        });

        const service = new BundleService(
            services.settings as never,
            services.instanceService as never,
            services.manifests as never,
            services.archiveDownload as never,
            services.melonLoader as never,
            { bundlesRoot, tmpRoot },
        );

        const result = await service.install("boss-rush");

        // Returned shape includes ALL bundle metadata fields.
        expect(result).toMatchObject({
            instanceType: "bundle",
            bundleId: "boss-rush",
            bundleVersion: "1.4.2",
            bundleBuildNumber: 142,
            bundleChannel: "stable",
            track: "bundle",
            officialTrack: "bundle",
        });
        expect(result.id).toBeTypeOf("string");
        expect(result.id.length).toBeGreaterThan(0);
        expect(result.bundleLastApplyUtc).toBeDefined();

        // Destination dir was created and contains the extracted tree.
        expect(await fs.promises.stat(result.path)).toBeDefined();
        expect(await fs.promises.readFile(path.join(result.path, "Mods", "MyBundleMod.dll"), "utf8")).toBe("fake-dll-bytes");
        expect(
            await fs.promises.readFile(path.join(result.path, "UserData", "BalanceMod", "config.cfg"), "utf8"),
        ).toBe("key=value\n");

        // Sidecar metadata was written.
        const instanceMeta = JSON.parse(
            await fs.promises.readFile(path.join(result.path, ".bapbap-instance.json"), "utf8"),
        );
        expect(instanceMeta).toMatchObject({
            instanceType: "bundle",
            bundleId: "boss-rush",
            bundleBuildNumber: 142,
        });

        const bundleManifest = JSON.parse(
            await fs.promises.readFile(path.join(result.path, ".bundle-manifest.json"), "utf8"),
        );
        expect(bundleManifest).toMatchObject({
            schemaVersion: 1,
            id: "boss-rush",
            buildNumber: 142,
            version: "1.4.2",
            channel: "stable",
        });
        expect(bundleManifest.appliedAtUtc).toBeDefined();

        // Bundles ship their own version-matched MelonLoader; the install
        // pipeline must NOT re-run ensureInstalled (which would overwrite it
        // and invalidate the shipped pre-generated Il2Cpp assemblies).
        expect(services.melonLoader.ensureInstalled).not.toHaveBeenCalled();

        // ArchiveDownloadService was called with the verified hash.
        expect(services.archiveDownload.downloadFile).toHaveBeenCalledTimes(1);
        const [downloadArgs] = services.archiveDownload.downloadFile.mock.calls;
        expect(downloadArgs[0]).toMatchObject({
            url: "https://example.test/bundle.zip",
            sha256: "deadbeef".repeat(8),
        });
    });

    it("throws a clear English error when remote manifest is missing AND no bundled fallback exists", async () => {
        useRealFsForReads();
        const instancesRoot = await makeTempRoot("bundle-install-noremote-");
        const tmpRoot = await makeTempRoot("bundle-install-noremote-tmp-");
        const bundlesRoot = await makeTempRoot("bundle-install-noremote-bundlesroot-");

        const services = makeServices();
        services.settings = { getInstancesRoot: () => instancesRoot };
        services.manifests.getBundlesManifest = vi.fn(async () => null);

        const service = new BundleService(
            services.settings as never,
            services.instanceService as never,
            services.manifests as never,
            services.archiveDownload as never,
            services.melonLoader as never,
            { bundlesRoot, tmpRoot },
        );

        await expect(service.install("never-published")).rejects.toThrow(
            /Bundle 'never-published' is not available\..*No remote manifest entry and no bundled fallback manifest were found\./,
        );

        // Nothing was downloaded or melon-loadered.
        expect(services.archiveDownload.downloadFile).not.toHaveBeenCalled();
        expect(services.melonLoader.ensureInstalled).not.toHaveBeenCalled();

        // Destination was never created (no entries under instancesRoot).
        const remaining = await fs.promises.readdir(instancesRoot);
        expect(remaining).toEqual([]);
    });

    it("throws when only a bundled fallback exists (offline) — fallback has no archiveUrl by design", async () => {
        // This pins the spec contract: the bundled fallback ships with
        // files=[] and no archiveUrl, so install() MUST refuse to proceed
        // even when the fallback manifest exists.
        useRealFsForReads();
        const instancesRoot = await makeTempRoot("bundle-install-offline-");
        const tmpRoot = await makeTempRoot("bundle-install-offline-tmp-");
        const bundlesRoot = await makeTempRoot("bundle-install-offline-bundlesroot-");
        await writeBundledFallback(bundlesRoot, "offline-only", {
            schemaVersion: 1,
            id: "offline-only",
            name: "Offline Only",
            channel: "stable",
            version: "0.1.0",
            buildNumber: 1,
            files: [],
        });

        const services = makeServices();
        services.settings = { getInstancesRoot: () => instancesRoot };
        services.manifests.getBundlesManifest = vi.fn(async () => null);

        const service = new BundleService(
            services.settings as never,
            services.instanceService as never,
            services.manifests as never,
            services.archiveDownload as never,
            services.melonLoader as never,
            { bundlesRoot, tmpRoot },
        );

        await expect(service.install("offline-only")).rejects.toThrow(
            /no remote manifest entry/,
        );
    });

    it("refuses zip entries that escape the destination via path traversal", async () => {
        useRealFsForReads();
        const instancesRoot = await makeTempRoot("bundle-install-traversal-");
        const tmpRoot = await makeTempRoot("bundle-install-traversal-tmp-");
        const bundlesRoot = await makeTempRoot("bundle-install-traversal-bundlesroot-");

        const services = makeServices();
        services.settings = { getInstancesRoot: () => instancesRoot };
        services.manifests.getBundlesManifest = vi.fn(async () => ({
            schemaVersion: 1,
            channel: "stable",
            bundles: [
                {
                    bundleId: "evil-bundle",
                    name: "Evil Bundle",
                    version: "1.0.0",
                    buildNumber: 1,
                    channel: "stable",
                    manifestUrl: "https://example.test/manifest.json",
                    archiveUrl: "https://example.test/evil.zip",
                    archiveSha256: "deadbeef".repeat(8),
                } as never,
            ],
        }));

        // Build a zip with a malicious entry. JSZip itself doesn't
        // sanitise entry names, so this is a faithful reproduction of
        // a real zip-slip attempt.
        const zipBuffer = await makeZipBuffer([
            { name: "Mods/Innocent.dll", content: "ok" },
            { name: "../../etc/passwd", content: "root:x:0:0::/root:/bin/bash\n" },
        ]);
        services.archiveDownload.downloadFile = vi.fn(async (input: { outputPath: string }) => {
            await fs.promises.writeFile(input.outputPath, zipBuffer);
        });

        const service = new BundleService(
            services.settings as never,
            services.instanceService as never,
            services.manifests as never,
            services.archiveDownload as never,
            services.melonLoader as never,
            { bundlesRoot, tmpRoot },
        );

        await expect(service.install("evil-bundle")).rejects.toThrow(/path traversal/);

        // Cleanup must fully remove the destination so a half-extracted
        // tree never lingers under the instances root.
        const remaining = await fs.promises.readdir(instancesRoot);
        expect(remaining).toEqual([]);

        // MelonLoader must NOT have been touched once extraction failed.
        expect(services.melonLoader.ensureInstalled).not.toHaveBeenCalled();
    });

    it("handles zip entries with directory/file name collisions correctly", async () => {
        useRealFsForReads();
        const instancesRoot = await makeTempRoot("bundle-install-collision-");
        const tmpRoot = await makeTempRoot("bundle-install-collision-tmp-");
        const bundlesRoot = await makeTempRoot("bundle-install-collision-bundlesroot-");

        const services = makeServices();
        services.settings = { getInstancesRoot: () => instancesRoot };
        services.manifests.getBundlesManifest = vi.fn(async () => ({
            schemaVersion: 1,
            channel: "stable",
            bundles: [
                {
                    bundleId: "collision-bundle",
                    name: "Collision Bundle",
                    version: "1.0.0",
                    buildNumber: 1,
                    channel: "stable",
                    manifestUrl: "https://example.test/manifest.json",
                    archiveUrl: "https://example.test/collision.zip",
                    archiveSha256: "deadbeef".repeat(8),
                } as never,
            ],
        }));

        // Build a zip where 'bapbap_Data/il2cpp_data' is a file,
        // but 'bapbap_Data/il2cpp_data/Metadata/global-metadata.dat' is also inside it.
        const zipBuffer = await makeZipBuffer([
            { name: "bapbap_Data/il2cpp_data", content: "" },
            { name: "bapbap_Data/il2cpp_data/Metadata/global-metadata.dat", content: "dat-bytes" },
        ]);
        services.archiveDownload.downloadFile = vi.fn(async (input: { outputPath: string }) => {
            await fs.promises.writeFile(input.outputPath, zipBuffer);
        });

        const service = new BundleService(
            services.settings as never,
            services.instanceService as never,
            services.manifests as never,
            services.archiveDownload as never,
            services.melonLoader as never,
            { bundlesRoot, tmpRoot },
        );

        const result = await service.install("collision-bundle");

        expect(result).toBeDefined();
        const metadataPath = path.join(result.path, "bapbap_Data", "il2cpp_data", "Metadata", "global-metadata.dat");
        expect(await fs.promises.readFile(metadataPath, "utf8")).toBe("dat-bytes");
    });


    it("propagates the SHA-256 mismatch error from the downloader and cleans up", async () => {
        // ArchiveDownloadService.downloadFile is the layer that verifies
        // the archive hash. We assert the BundleService correctly lets
        // that error bubble up AND scrubs the destination directory so
        // no half-installed bundle remains.
        useRealFsForReads();
        const instancesRoot = await makeTempRoot("bundle-install-sha-");
        const tmpRoot = await makeTempRoot("bundle-install-sha-tmp-");
        const bundlesRoot = await makeTempRoot("bundle-install-sha-bundlesroot-");

        const services = makeServices();
        services.settings = { getInstancesRoot: () => instancesRoot };
        services.manifests.getBundlesManifest = vi.fn(async () => ({
            schemaVersion: 1,
            channel: "stable",
            bundles: [
                {
                    bundleId: "boss-rush",
                    name: "Boss Rush",
                    version: "1.0.0",
                    buildNumber: 1,
                    channel: "stable",
                    manifestUrl: "https://example.test/manifest.json",
                    archiveUrl: "https://example.test/bundle.zip",
                    archiveSha256: "expected-hash",
                } as never,
            ],
        }));
        services.archiveDownload.downloadFile = vi.fn(async () => {
            throw new Error("SHA256 mismatch. Expected expected-hash, got actual-hash.");
        });

        const service = new BundleService(
            services.settings as never,
            services.instanceService as never,
            services.manifests as never,
            services.archiveDownload as never,
            services.melonLoader as never,
            { bundlesRoot, tmpRoot },
        );

        await expect(service.install("boss-rush")).rejects.toThrow(/SHA256 mismatch/);

        // Cleanup: instances root should not contain any leftover
        // half-installed Boss Rush directory.
        const remaining = await fs.promises.readdir(instancesRoot);
        expect(remaining).toEqual([]);
        expect(services.melonLoader.ensureInstalled).not.toHaveBeenCalled();
    });

    it("sanitises the profile name and adds a numeric suffix on collision", async () => {
        useRealFsForReads();
        const instancesRoot = await makeTempRoot("bundle-install-collide-");
        const tmpRoot = await makeTempRoot("bundle-install-collide-tmp-");
        const bundlesRoot = await makeTempRoot("bundle-install-collide-bundlesroot-");

        // Pre-create both the sanitised base name AND the -2 suffix so
        // the collision loop must walk to -3. The path for
        // "Boss Rush!! 🚀" sanitises to "Boss-Rush" (special chars to "-",
        // leading/trailing dashes trimmed).
        await fs.promises.mkdir(path.join(instancesRoot, "Boss-Rush"), { recursive: true });
        await fs.promises.mkdir(path.join(instancesRoot, "Boss-Rush-2"), { recursive: true });

        const services = makeServices();
        services.settings = { getInstancesRoot: () => instancesRoot };
        services.manifests.getBundlesManifest = vi.fn(async () => ({
            schemaVersion: 1,
            channel: "stable",
            bundles: [
                {
                    bundleId: "boss-rush",
                    name: "Boss Rush",
                    version: "1.0.0",
                    buildNumber: 1,
                    channel: "stable",
                    manifestUrl: "https://example.test/manifest.json",
                    archiveUrl: "https://example.test/bundle.zip",
                    archiveSha256: "deadbeef".repeat(8),
                } as never,
            ],
        }));
        const zipBuffer = await makeZipBuffer([{ name: "Mods/MyBundleMod.dll", content: "ok" }]);
        services.archiveDownload.downloadFile = vi.fn(async (input: { outputPath: string }) => {
            await fs.promises.writeFile(input.outputPath, zipBuffer);
        });

        const service = new BundleService(
            services.settings as never,
            services.instanceService as never,
            services.manifests as never,
            services.archiveDownload as never,
            services.melonLoader as never,
            { bundlesRoot, tmpRoot },
        );

        const result = await service.install("boss-rush", "Boss Rush!! 🚀");

        expect(path.basename(result.path)).toBe("Boss-Rush-3");
        // Pre-existing dirs were not touched.
        expect(await fs.promises.readdir(path.join(instancesRoot, "Boss-Rush"))).toEqual([]);
        expect(await fs.promises.readdir(path.join(instancesRoot, "Boss-Rush-2"))).toEqual([]);
    });
});

describe("BundleService.install progress events", () => {
    const tempRoots: string[] = [];

    afterEach(async () => {
        await Promise.all(
            tempRoots.splice(0).map(root => fs.promises.rm(root, { recursive: true, force: true })),
        );
    });

    async function makeTempRoot(prefix = "bundle-progress-test-"): Promise<string> {
        const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
        tempRoots.push(root);
        return root;
    }

    /**
     * Mirror of useRealFsForReads() in the install describe — the
     * progress tests need real fs access for ZIP buffers and the
     * fallback manifest probe.
     */
    function useRealFsForReads() {
        readdirMock.mockReset();
        readFileMock.mockReset();
        readdirMock.mockImplementation(async (...args: unknown[]) => {
            const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (actual.promises.readdir as any)(...(args as []));
        });
        readFileMock.mockImplementation(async (...args: unknown[]) => {
            const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (actual.promises.readFile as any)(...(args as []));
        });
    }

    async function makeZipBuffer(entries: Array<{ name: string; content: string }>): Promise<Buffer> {
        const zip = new JSZip();
        for (const entry of entries) {
            zip.file(entry.name, entry.content);
        }
        return zip.generateAsync({ type: "nodebuffer" });
    }

    function makeRemoteBundlesManifest(bundleId: string) {
        return async () => ({
            schemaVersion: 1,
            channel: "stable",
            bundles: [
                {
                    bundleId,
                    name: bundleId,
                    version: "1.0.0",
                    buildNumber: 1,
                    channel: "stable",
                    manifestUrl: "https://example.test/manifest.json",
                    archiveUrl: "https://example.test/bundle.zip",
                    archiveSha256: "deadbeef".repeat(8),
                    sizeBytes: 1024,
                } as never,
            ],
        });
    }

    it("emits resolving → downloading → verifying → extracting → installing → done in order", async () => {
        useRealFsForReads();
        const instancesRoot = await makeTempRoot("bundle-progress-order-");
        const tmpRoot = await makeTempRoot("bundle-progress-order-tmp-");
        const bundlesRoot = await makeTempRoot("bundle-progress-order-bundlesroot-");

        const services = makeServices();
        services.settings = { getInstancesRoot: () => instancesRoot };
        services.manifests.getBundlesManifest = vi.fn(makeRemoteBundlesManifest("boss-rush"));

        const zipBuffer = await makeZipBuffer([{ name: "Mods/A.dll", content: "ok" }]);
        services.archiveDownload.downloadFile = vi.fn(
            async (input: { outputPath: string; onProgress?: (p: { downloadedBytes: number; totalBytes?: number; progressPercent?: number }) => void }) => {
                await fs.promises.writeFile(input.outputPath, zipBuffer);
            },
        );

        const service = new BundleService(
            services.settings as never,
            services.instanceService as never,
            services.manifests as never,
            services.archiveDownload as never,
            services.melonLoader as never,
            { bundlesRoot, tmpRoot },
        );

        const statuses: string[] = [];
        service.on("progress-changed", (state: { status: string }) => {
            statuses.push(state.status);
        });

        await service.install("boss-rush");

        // Filter to UNIQUE consecutive statuses so multiple "downloading"
        // progress ticks collapse to a single entry — we care about the
        // stage transition order, not the per-tick count.
        const transitions = statuses.filter((status, index) => index === 0 || status !== statuses[index - 1]);
        expect(transitions).toEqual([
            "resolving",
            "downloading",
            "verifying",
            "extracting",
            "installing",
            "done",
        ]);

        // The terminal "done" snapshot must be retrievable via the
        // public getter — a renderer that mounts late should still see
        // the most recent outcome.
        const finalState = service.getInstallProgressState("boss-rush");
        expect(finalState.status).toBe("done");
        expect(finalState.completedAtUtc).toBeDefined();
    });

    it("emits intermediate downloading states with bytesDownloaded growing", async () => {
        useRealFsForReads();
        const instancesRoot = await makeTempRoot("bundle-progress-bytes-");
        const tmpRoot = await makeTempRoot("bundle-progress-bytes-tmp-");
        const bundlesRoot = await makeTempRoot("bundle-progress-bytes-bundlesroot-");

        const services = makeServices();
        services.settings = { getInstancesRoot: () => instancesRoot };
        services.manifests.getBundlesManifest = vi.fn(makeRemoteBundlesManifest("boss-rush"));

        const zipBuffer = await makeZipBuffer([{ name: "Mods/A.dll", content: "ok" }]);
        // Drive 10 progress callbacks at 10%, 20%, ..., 100% so the
        // throttle gate (200ms or 1% delta) emits every tick. Each tick
        // grows bytesDownloaded by 100 so the test can prove the field
        // is monotonically increasing.
        services.archiveDownload.downloadFile = vi.fn(
            async (input: {
                outputPath: string;
                onProgress?: (p: { downloadedBytes: number; totalBytes?: number; progressPercent?: number }) => void;
            }) => {
                if (input.onProgress) {
                    for (let percent = 10; percent <= 100; percent += 10) {
                        input.onProgress({
                            downloadedBytes: percent * 10,
                            totalBytes: 1000,
                            progressPercent: percent,
                        });
                    }
                }
                await fs.promises.writeFile(input.outputPath, zipBuffer);
            },
        );

        const service = new BundleService(
            services.settings as never,
            services.instanceService as never,
            services.manifests as never,
            services.archiveDownload as never,
            services.melonLoader as never,
            { bundlesRoot, tmpRoot },
        );

        const downloadingStates: Array<{ bytesDownloaded?: number; sizeBytes?: number; progressPercent?: number }> = [];
        service.on("progress-changed", (state: {
            status: string;
            bytesDownloaded?: number;
            sizeBytes?: number;
            progressPercent?: number;
        }) => {
            if (state.status === "downloading") {
                downloadingStates.push({
                    bytesDownloaded: state.bytesDownloaded,
                    sizeBytes: state.sizeBytes,
                    progressPercent: state.progressPercent,
                });
            }
        });

        await service.install("boss-rush");

        // We expect at least one "downloading" emit before the first
        // onProgress tick (the priming emission with bytesDownloaded=0)
        // PLUS one per tick. Throttle should NOT collapse a 10% jump.
        expect(downloadingStates.length).toBeGreaterThanOrEqual(2);

        // bytesDownloaded must never decrease. Skip the first emission
        // because the priming emission has bytesDownloaded=0 by design,
        // and subsequent ticks compare against the previous tick.
        const tickedStates = downloadingStates.filter(s => typeof s.bytesDownloaded === "number" && s.bytesDownloaded > 0);
        expect(tickedStates.length).toBeGreaterThanOrEqual(2);
        for (let index = 1; index < tickedStates.length; index += 1) {
            expect(tickedStates[index].bytesDownloaded!).toBeGreaterThanOrEqual(tickedStates[index - 1].bytesDownloaded!);
        }

        // The final downloading emit must report the full 1000 bytes
        // (last onProgress tick at 100%).
        const lastTick = tickedStates[tickedStates.length - 1];
        expect(lastTick.bytesDownloaded).toBe(1000);
        expect(lastTick.sizeBytes).toBe(1000);
        expect(lastTick.progressPercent).toBe(100);
    });

    it("emits failed status when downloadFile rejects", async () => {
        useRealFsForReads();
        const instancesRoot = await makeTempRoot("bundle-progress-fail-");
        const tmpRoot = await makeTempRoot("bundle-progress-fail-tmp-");
        const bundlesRoot = await makeTempRoot("bundle-progress-fail-bundlesroot-");

        const services = makeServices();
        services.settings = { getInstancesRoot: () => instancesRoot };
        services.manifests.getBundlesManifest = vi.fn(makeRemoteBundlesManifest("boss-rush"));
        services.archiveDownload.downloadFile = vi.fn(async () => {
            throw new Error("SHA256 mismatch. Expected aaa, got bbb.");
        });

        const service = new BundleService(
            services.settings as never,
            services.instanceService as never,
            services.manifests as never,
            services.archiveDownload as never,
            services.melonLoader as never,
            { bundlesRoot, tmpRoot },
        );

        const states: Array<{ status: string; errorMessage?: string }> = [];
        service.on("progress-changed", (state: { status: string; errorMessage?: string }) => {
            states.push({ status: state.status, errorMessage: state.errorMessage });
        });

        await expect(service.install("boss-rush")).rejects.toThrow(/SHA256 mismatch/);

        // The terminal emission MUST be "failed" with the underlying
        // download error message preserved verbatim so the renderer can
        // surface it in the install gate.
        const lastState = states[states.length - 1];
        expect(lastState.status).toBe("failed");
        expect(lastState.errorMessage).toMatch(/SHA256 mismatch/);

        // The cached snapshot must agree.
        const snapshot = service.getInstallProgressState("boss-rush");
        expect(snapshot.status).toBe("failed");
        expect(snapshot.errorMessage).toMatch(/SHA256 mismatch/);
    });
});

describe("BundleService.remove", () => {
    it("rejects empty instance ids", async () => {
        const service = createBundleService({ bundlesRoot: "/fake" });
        await expect(service.remove("")).rejects.toThrow("instanceId is required");
    });

    it("delegates to InstanceService.remove with the bypass flag for valid instance ids", async () => {
        const services = makeServices();
        // makeServices doesn't include `remove` by default — provide it.
        const removeMock = vi.fn(async () => undefined);
        (services.instanceService as unknown as { remove: typeof removeMock }).remove = removeMock;
        const service = new BundleService(
            services.settings as never,
            services.instanceService as never,
            services.manifests as never,
            services.archiveDownload as never,
            services.melonLoader as never,
            { bundlesRoot: "/fake" },
        );
        await service.remove("bundle-instance-id");
        expect(removeMock).toHaveBeenCalledWith(
            "bundle-instance-id",
            { bypassOfficialManagedCheck: true },
        );
    });
});

describe("BundleService.assertMutable", () => {
    it("delegates to InstanceService.assertMutable", async () => {
        const services = makeServices();
        const service = new BundleService(
            services.settings as never,
            services.instanceService as never,
            services.manifests as never,
            services.archiveDownload as never,
            services.melonLoader as never,
            { bundlesRoot: "/fake" },
        );

        const fakeInstance = { id: "x", instanceType: "standard" } as never;
        await service.assertMutable(fakeInstance);
        expect(services.instanceService.assertMutable).toHaveBeenCalledWith(fakeInstance);
    });

    it("propagates the BUNDLE_INSTANCE_LOCKED error from the delegate", async () => {
        const lockedError = Object.assign(new Error("locked"), { code: "BUNDLE_INSTANCE_LOCKED" });
        const instanceService = {
            list: vi.fn(async () => []),
            assertMutable: vi.fn(async () => {
                throw lockedError;
            }),
        };
        const service = new BundleService(
            {} as never,
            instanceService as never,
            { getBundlesManifest: vi.fn() } as never,
            { downloadFile: vi.fn() } as never,
            { ensureInstalled: vi.fn() } as never,
            { bundlesRoot: "/fake" },
        );

        await expect(service.assertMutable({ id: "y", instanceType: "bundle" } as never)).rejects.toBe(lockedError);
    });
});
