import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const electronState = vi.hoisted(() => ({ version: "4.0.0", userData: "/tmp/bapbap-test", temp: "/tmp/bapbap-test" }));

vi.mock("electron", () => {
    const app = {
        getVersion: () => electronState.version,
        getPath: (name: string) => (name === "temp" ? electronState.temp : electronState.userData),
        quit: vi.fn(),
    };
    return { default: { app }, app };
});

import { LauncherUpdaterService } from "./launcher-updater.service";

type Manifests = { getLauncherUpdates: ReturnType<typeof vi.fn> };
type Downloader = { downloadFile: ReturnType<typeof vi.fn> };
type Settings = { getAll: ReturnType<typeof vi.fn> };

function makeService(opts: {
    updates?: unknown;
    settings?: Record<string, unknown>;
    downloader?: Downloader;
} = {}) {
    const manifests: Manifests = {
        getLauncherUpdates: vi.fn().mockResolvedValue(opts.updates ?? null),
    };
    const downloader: Downloader = opts.downloader ?? { downloadFile: vi.fn().mockResolvedValue(undefined) };
    const settings: Settings = {
        getAll: vi.fn().mockReturnValue({
            launcherAutoDownloadUpdates: false,
            launcherAutoInstallOnNextStart: false,
            ...opts.settings,
        }),
    };
    const service = new LauncherUpdaterService(manifests as never, downloader as never, settings as never);
    return { service, manifests, downloader, settings };
}

function release(version: string, extra: Record<string, unknown> = {}) {
    return {
        version,
        windows: { x64: { url: `https://github.com/o/r/releases/download/${version}/setup.exe`, sha256: "a".repeat(64), fileName: "setup.exe" } },
        ...extra,
    };
}

afterEach(() => {
    electronState.version = "4.0.0";
    vi.restoreAllMocks();
});

describe("LauncherUpdaterService", () => {
    it("reports not-configured when the manifest defines no launcher updates", async () => {
        const { service } = makeService({ updates: null });
        const result = await service.check(true);
        expect(result.configured).toBe(false);
        expect(result.updateAvailable).toBe(false);
    });

    it("reports up-to-date when the current version is the newest release", async () => {
        const { service } = makeService({ updates: { channel: "stable", releases: [release("4.0.0")] } });
        const result = await service.check(true);
        expect(result.configured).toBe(true);
        expect(result.updateAvailable).toBe(false);
    });

    it("offers an update when a newer release exists", async () => {
        const { service } = makeService({ updates: { channel: "stable", releases: [release("5.1.0"), release("4.0.0")] } });
        const result = await service.check(true);
        expect(result.updateAvailable).toBe(true);
        expect(result.latestVersion).toBe("5.1.0");
    });

    it("selects the highest eligible version across multiple releases", async () => {
        const { service } = makeService({
            updates: { channel: "stable", releases: [release("4.2.0"), release("4.10.0"), release("4.9.0")] },
        });
        const result = await service.check(true);
        // Numeric semver ordering: 4.10.0 > 4.9.0, not string ordering.
        expect(result.latestVersion).toBe("4.10.0");
    });

    it("ignores releases on a different channel", async () => {
        const { service } = makeService({
            updates: { channel: "stable", releases: [release("9.0.0", { channel: "beta" }), release("4.5.0")] },
        });
        const result = await service.check(true);
        expect(result.latestVersion).toBe("4.5.0");
    });

    it("treats a stable release as newer than a prerelease of the same core version", async () => {
        electronState.version = "4.0.0";
        const { service } = makeService({
            updates: { channel: "stable", releases: [release("4.1.0"), release("4.1.0-rc.1")] },
        });
        const result = await service.check(true);
        expect(result.latestVersion).toBe("4.1.0");
    });

    it("rejects an update whose asset is missing a SHA-256 hash, without downloading", async () => {
        const noHashRelease = {
            version: "5.0.0",
            windows: { x64: { url: "https://github.com/o/r/releases/download/5.0.0/setup.exe", fileName: "setup.exe" } },
        };
        const { service, downloader } = makeService({ updates: { channel: "stable", releases: [noHashRelease] } });

        await expect(service.downloadAndInstall(true)).rejects.toThrow(/sha-256/i);
        expect(downloader.downloadFile).not.toHaveBeenCalled();
    });

    it("emits state transitions to listeners during a check", async () => {
        const { service } = makeService({ updates: { channel: "stable", releases: [release("5.0.0")] } });
        const statuses: string[] = [];
        service.onStateChanged(state => statuses.push(state.status));

        await service.check(true);
        expect(statuses).toContain("checking");
        expect(statuses).toContain("available");
    });
});
