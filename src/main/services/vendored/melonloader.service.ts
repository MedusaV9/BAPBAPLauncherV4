import fs from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import electron from "electron";
import fsExtra from "fs-extra";
import type { MelonLoaderManifest } from "../../../shared/manifest";
import { KeyedMutex } from "../../utils/async-mutex";
import { ArchiveDownloadService } from "./archive-download.service";
import { ManifestClient } from "./manifest-client";
import { normalizeLoaderConfigContent, normalizeMelonPreferencesContent } from "./melonloader-config";

const { ensureDir, pathExists, readFile, readJson, remove, writeFile, writeJson } = fsExtra;
const { app } = electron;

type MelonLoaderArchitecture = "x64" | "x86";

type MelonLoaderMarker = {
    schemaVersion: 1;
    version: string;
    architecture: MelonLoaderArchitecture;
    installedAtUtc: string;
};

export type MelonLoaderStatus = {
    requiredVersion: string;
    installedVersion?: string;
    installed: boolean;
    healthy: boolean;
    architecture: MelonLoaderArchitecture;
};

const MARKER_FILE = ".bapbap-melonloader.json";

export class MelonLoaderService {
    private readonly manifests: ManifestClient;
    private readonly downloader: ArchiveDownloadService;
    private readonly installMutex = new KeyedMutex();

    constructor(manifests: ManifestClient, downloader: ArchiveDownloadService) {
        this.manifests = manifests;
        this.downloader = downloader;
    }

    async getStatus(instancePath: string, force = false): Promise<MelonLoaderStatus> {
        const manifest = await this.getManifest(force);
        await this.normalizeMelonPreferences(instancePath).catch(() => {});
        await this.normalizeLoaderConfig(instancePath).catch(() => {});
        const architecture = await this.detectArchitecture(instancePath);
        const marker = await this.readMarker(instancePath);
        const melonFolderExists = await pathExists(path.join(instancePath, "MelonLoader"));
        const requiredFilesPresent = await this.hasRequiredRuntimeFiles(instancePath);
        const installedVersion = marker?.version;
        const installed = !!marker || melonFolderExists || requiredFilesPresent;
        const healthy =
            !!marker &&
            marker.version === manifest.requiredVersion &&
            marker.architecture === architecture &&
            melonFolderExists &&
            requiredFilesPresent;

        return {
            requiredVersion: manifest.requiredVersion,
            installedVersion,
            installed,
            healthy,
            architecture,
        };
    }

    async ensureInstalled(instancePath: string, force = false): Promise<MelonLoaderStatus> {
        const release = await this.installMutex.acquire(instancePath);
        try {
            return await this._ensureInstalledInner(instancePath, force);
        } finally {
            release();
        }
    }

    private async _ensureInstalledInner(instancePath: string, force: boolean): Promise<MelonLoaderStatus> {
        const currentStatus = await this.getStatus(instancePath, force);
        if (currentStatus.healthy) {
            return currentStatus;
        }

        const manifest = await this.getManifest(force);
        const artifact = currentStatus.architecture === "x64" ? manifest.x64 : manifest.x86;
        const tempRoot = path.join(app.getPath("userData"), "tmp", "melonloader");
        const archivePath = path.join(tempRoot, `melonloader-${currentStatus.architecture}-${Date.now()}.zip`);

        await ensureDir(tempRoot);
        try {
            await this.downloader.downloadFile({
                url: artifact.url,
                outputPath: archivePath,
                sha256: artifact.sha256,
            });

            const archive = new AdmZip(archivePath);
            archive.extractAllTo(instancePath, true);

            await this.normalizeMelonPreferences(instancePath);
            await this.normalizeLoaderConfig(instancePath);
            await this.writeMarker(instancePath, {
                schemaVersion: 1,
                version: manifest.requiredVersion,
                architecture: currentStatus.architecture,
                installedAtUtc: new Date().toISOString(),
            });

            const verifiedStatus = await this.getStatus(instancePath, true);
            if (!verifiedStatus.healthy) {
                throw new Error(`MelonLoader install verification failed. Required ${manifest.requiredVersion}.`);
            }
            return verifiedStatus;
        } finally {
            await remove(archivePath).catch(() => {});
        }
    }

    private async getManifest(force = false): Promise<MelonLoaderManifest> {
        const index = await this.manifests.getIndex(force);
        const manifest = index.melonLoader;
        if (!manifest?.requiredVersion || !manifest?.x64?.url || !manifest?.x64?.sha256 || !manifest?.x86?.url || !manifest?.x86?.sha256) {
            throw new Error("Manifest index is missing required MelonLoader fields.");
        }
        return manifest;
    }

    private async readMarker(instancePath: string): Promise<MelonLoaderMarker | null> {
        const markerPath = path.join(instancePath, MARKER_FILE);
        if (!(await pathExists(markerPath))) {
            return null;
        }
        return readJson(markerPath).then(value => value as MelonLoaderMarker).catch(() => null);
    }

    private async writeMarker(instancePath: string, marker: MelonLoaderMarker): Promise<void> {
        await writeJson(path.join(instancePath, MARKER_FILE), marker, { spaces: 2 });
    }

    private async hasRequiredRuntimeFiles(instancePath: string): Promise<boolean> {
        const requiredFiles = [
            path.join(instancePath, "version.dll"),
            path.join(instancePath, "MelonLoader", "net6", "MelonLoader.dll"),
        ];
        for (const filePath of requiredFiles) {
            if (!(await pathExists(filePath))) {
                return false;
            }
        }
        return true;
    }

    private async normalizeMelonPreferences(instancePath: string): Promise<void> {
        const userDataPath = path.join(instancePath, "UserData");
        const preferencesPath = path.join(userDataPath, "MelonPreferences.cfg");
        await ensureDir(userDataPath);
        const existing = await readFile(preferencesPath, "utf8").catch(() => "");
        const updated = normalizeMelonPreferencesContent(existing);
        const normalizedExisting = `${existing ?? ""}`.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        if (updated !== (normalizedExisting.endsWith("\n") ? normalizedExisting : `${normalizedExisting}\n`)) {
            await writeFile(preferencesPath, updated, "utf8");
        }
    }

    private async normalizeLoaderConfig(instancePath: string): Promise<void> {
        const userDataPath = path.join(instancePath, "UserData");
        const loaderConfigPath = path.join(userDataPath, "Loader.cfg");
        await ensureDir(userDataPath);
        const existing = await readFile(loaderConfigPath, "utf8").catch(() => "");
        const updated = normalizeLoaderConfigContent(existing);
        const normalizedExisting = `${existing ?? ""}`.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        if (updated !== (normalizedExisting.endsWith("\n") ? normalizedExisting : `${normalizedExisting}\n`)) {
            await writeFile(loaderConfigPath, updated, "utf8");
        }
    }

    private async detectArchitecture(instancePath: string): Promise<MelonLoaderArchitecture> {
        const executablePath = path.join(instancePath, "bapbap.exe");
        try {
            const fileHandle = await fs.open(executablePath, "r");
            try {
                const buffer = Buffer.alloc(4096);
                await fileHandle.read(buffer, 0, buffer.length, 0);
                const peOffset = buffer.readUInt32LE(0x3c);
                const machineOffset = peOffset + 4;
                const machine = buffer.readUInt16LE(machineOffset);
                return machine === 0x8664 ? "x64" : "x86";
            } finally {
                await fileHandle.close();
            }
        } catch (error) {
            throw new Error(`Cannot detect game architecture: ${error instanceof Error ? error.message : String(error)}. Ensure bapbap.exe exists and is a valid PE file.`);
        }
    }
}
