import crypto from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import fsExtra from "fs-extra";
import JSZip from "jszip";
import { DOWNLOAD_TIMEOUT_MS, fetchWithTimeout } from "../utils/timeout-fetch";

const { ensureDir, move, pathExists, remove } = fsExtra;

/** Minimum interval between progress callback emissions. */
const PROGRESS_THROTTLE_MS = 150;

export type DownloadFileProgress = {
    downloadedBytes: number;
    totalBytes?: number;
    progressPercent?: number;
};

/**
 * Zip-slip guard: validate that a ZIP entry path resolves within the target directory.
 * Throws if the entry would escape the target via path traversal.
 */
function assertZipEntryPathSafe(entryName: string, targetDir: string): string {
    const resolvedTarget = path.resolve(targetDir, entryName);
    const resolvedDir = path.resolve(targetDir);
    if (!resolvedTarget.startsWith(resolvedDir + path.sep) && resolvedTarget !== resolvedDir) {
        throw new Error(`Refusing zip entry with path traversal: ${entryName}`);
    }
    return resolvedTarget;
}

export class ArchiveDownloadService {
    private readonly allowedHosts = new Set<string>([
        "github.com",
        "raw.githubusercontent.com",
        "objects.githubusercontent.com",
        "release-assets.githubusercontent.com",
    ]);

    async downloadAndExtractZip(input: {
        url: string;
        destination: string;
        sha256?: string;
        tmpRoot: string;
        onProgress?: (progress: DownloadFileProgress) => void;
        onStageChange?: (stage: "downloading" | "extracting") => void;
    }): Promise<void> {
        const { url, destination, sha256, tmpRoot, onProgress, onStageChange } = input;
        this.assertAllowedUrl(url);

        const tempZip = path.join(tmpRoot, `official-${Date.now()}.zip`);
        await ensureDir(tmpRoot);
        await ensureDir(destination);

        try {
            onStageChange?.("downloading");
            await this.downloadToFile(url, tempZip, onProgress);
            if (sha256) {
                const calculated = await this.computeSha256(tempZip);
                if (calculated.toLowerCase() !== sha256.toLowerCase()) {
                    throw new Error(`SHA256 mismatch. Expected ${sha256}, got ${calculated}.`);
                }
            }

            onStageChange?.("extracting");
            await this.extractZipAsync(tempZip, destination);
            await this.normalizeExtractedRoot(destination);
        } finally {
            await remove(tempZip).catch(() => {});
        }
    }

    async downloadFile(input: { url: string; outputPath: string; sha256?: string; onProgress?: (progress: DownloadFileProgress) => void }): Promise<void> {
        const { url, outputPath, sha256, onProgress } = input;
        this.assertAllowedUrl(url);
        await ensureDir(path.dirname(outputPath));
        try {
            await this.downloadToFile(url, outputPath, onProgress);
            if (sha256) {
                const calculated = await this.computeSha256(outputPath);
                if (calculated.toLowerCase() !== sha256.toLowerCase()) {
                    throw new Error(`SHA256 mismatch. Expected ${sha256}, got ${calculated}.`);
                }
            }
        } catch (error) {
            await remove(outputPath).catch(() => {});
            throw error;
        }
    }

    private assertAllowedUrl(url: string): void {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:") {
            throw new Error("Only HTTPS download URLs are allowed.");
        }
        if (!this.allowedHosts.has(parsed.hostname)) {
            throw new Error(`Host '${parsed.hostname}' is not allowed for manifest-only downloads.`);
        }
    }

    /**
     * Async ZIP extraction using JSZip with zip-slip protection.
     */
    private async extractZipAsync(zipPath: string, targetDir: string): Promise<void> {
        const zipData = await fs.promises.readFile(zipPath);
        const zip = await JSZip.loadAsync(zipData);
        const resolvedDest = path.resolve(targetDir);

        const entries = Object.values(zip.files);
        for (const entry of entries) {
            const safePath = assertZipEntryPathSafe(entry.name, targetDir);

            if (entry.dir) {
                await this.ensureDirSafely(safePath, resolvedDest);
            } else {
                await this.ensureDirSafely(path.dirname(safePath), resolvedDest);
                const stat = await fs.promises.stat(safePath).catch(() => null);
                if (stat && stat.isDirectory()) {
                    continue;
                }
                const content = await entry.async("nodebuffer");
                await fs.promises.writeFile(safePath, content);
            }
        }
    }

    private async ensureDirSafely(dirPath: string, destinationDir: string): Promise<void> {
        const resolvedDest = path.resolve(destinationDir);
        const resolvedDir = path.resolve(dirPath);

        let current = resolvedDir;
        const pathsToCheck: string[] = [];
        while (current && current !== resolvedDest && current.startsWith(resolvedDest + path.sep)) {
            pathsToCheck.push(current);
            current = path.dirname(current);
        }

        pathsToCheck.reverse();
        for (const p of pathsToCheck) {
            const stat = await fs.promises.stat(p).catch(() => null);
            if (stat && stat.isFile()) {
                await fs.promises.unlink(p);
            }
        }

        await ensureDir(resolvedDir);
    }


    private async downloadToFile(url: string, outputPath: string, onProgress?: (progress: DownloadFileProgress) => void): Promise<void> {
        const response = await fetchWithTimeout(url, { method: "GET" }, DOWNLOAD_TIMEOUT_MS);
        if (!response.ok || !response.body) {
            throw new Error(`Download failed (${response.status}) for ${url}`);
        }

        const totalBytesHeader = response.headers.get("content-length");
        const totalBytes = totalBytesHeader ? Number.parseInt(totalBytesHeader, 10) : undefined;
        const output = fs.createWriteStream(outputPath);
        const reader = response.body.getReader();
        let downloadedBytes = 0;
        let lastProgressEmit = 0;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }

                if (!value || value.length === 0) {
                    continue;
                }

                downloadedBytes += value.length;
                if (!output.write(Buffer.from(value))) {
                    await once(output, "drain");
                }

                const now = Date.now();
                if (onProgress && now - lastProgressEmit >= PROGRESS_THROTTLE_MS) {
                    lastProgressEmit = now;
                    onProgress({
                        downloadedBytes,
                        totalBytes,
                        progressPercent: totalBytes && totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : undefined,
                    });
                }
            }

            output.end();
            await once(output, "finish");
            // Always emit final progress regardless of throttle
            onProgress?.({
                downloadedBytes,
                totalBytes,
                progressPercent: totalBytes && totalBytes > 0 ? 100 : undefined,
            });
        } catch (error) {
            output.destroy();
            throw error;
        }
    }

    private async computeSha256(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash("sha256");
            const stream = fs.createReadStream(filePath);
            stream.on("data", chunk => hash.update(chunk));
            stream.on("error", reject);
            stream.on("end", () => resolve(hash.digest("hex")));
        });
    }

    private async normalizeExtractedRoot(destination: string): Promise<void> {
        const entries = await fs.promises.readdir(destination, { withFileTypes: true }).catch(() => []);
        const directories = entries.filter(item => item.isDirectory());
        if (directories.length !== 1) {
            return;
        }

        const nestedRoot = path.join(destination, directories[0].name);
        const nestedExe = path.join(nestedRoot, "bapbap.exe");
        const nestedData = path.join(nestedRoot, "BAPBAP_Data");
        if (!(await pathExists(nestedExe)) || !(await pathExists(nestedData))) {
            return;
        }

        const nestedEntries = await fs.promises.readdir(nestedRoot);
        for (const entry of nestedEntries) {
            await move(path.join(nestedRoot, entry), path.join(destination, entry), { overwrite: true });
        }
        await remove(nestedRoot);
    }
}
