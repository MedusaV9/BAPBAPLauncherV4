import fs from "node:fs";
import path from "node:path";
import fsExtra from "fs-extra";
import type { ConfigFileContent, ConfigFileEntry, ConfigFileSection } from "../../shared/ipc";
import { InstanceService } from "./instance.service";

const { ensureDir, pathExists } = fsExtra;

const ALLOWED_ROOTS = ["UserData/", "Mods/Config/"] as const;
const ALLOWED_EXTENSIONS = new Set([".cfg", ".toml", ".json", ".ini"]);
const MAX_CONFIG_FILE_BYTES = 1_000_000;

export class ConfigEditorService {
    private readonly instances: InstanceService;

    constructor(instances: InstanceService) {
        this.instances = instances;
    }

    async list(instanceId: string): Promise<ConfigFileEntry[]> {
        const instance = await this.instances.getById(instanceId);
        const entries: ConfigFileEntry[] = [];

        for (const root of ALLOWED_ROOTS) {
            const section: ConfigFileSection = root === "UserData/" ? "UserData" : "Mods/Config";
            const absoluteRoot = path.join(instance.path, root.replaceAll("/", path.sep));
            if (!(await pathExists(absoluteRoot))) {
                continue;
            }
            await this.walkConfigFiles(instance.path, absoluteRoot, section, entries);
        }

        return entries.sort((a, b) => a.path.localeCompare(b.path));
    }

    async read(instanceId: string, filePath: string): Promise<ConfigFileContent> {
        const instance = await this.instances.getById(instanceId);
        const resolved = this.resolveAndValidateConfigPath(instance.path, filePath);
        const stats = await fs.promises.stat(resolved.absolute);
        if (stats.size > MAX_CONFIG_FILE_BYTES) {
            throw new Error(`Config file is too large (max ${MAX_CONFIG_FILE_BYTES} bytes): ${resolved.relative}`);
        }

        const content = await fs.promises.readFile(resolved.absolute, "utf8");
        return {
            path: resolved.relative,
            extension: path.extname(resolved.relative).toLowerCase(),
            content,
        };
    }

    async write(instanceId: string, filePath: string, content: string): Promise<void> {
        const instance = await this.instances.getById(instanceId);
        await this.instances.assertMutable(instance);
        const resolved = this.resolveAndValidateConfigPath(instance.path, filePath);
        const bytes = Buffer.byteLength(content ?? "", "utf8");
        if (bytes > MAX_CONFIG_FILE_BYTES) {
            throw new Error(`Config content exceeds max size (${MAX_CONFIG_FILE_BYTES} bytes).`);
        }

        await ensureDir(path.dirname(resolved.absolute));
        await fs.promises.writeFile(resolved.absolute, content ?? "", "utf8");
    }

    private async walkConfigFiles(
        instancePath: string,
        currentPath: string,
        section: ConfigFileSection,
        entries: ConfigFileEntry[]
    ): Promise<void> {
        const children = await fs.promises.readdir(currentPath, { withFileTypes: true });
        for (const child of children) {
            const absolute = path.join(currentPath, child.name);
            if (child.isDirectory()) {
                await this.walkConfigFiles(instancePath, absolute, section, entries);
                continue;
            }
            if (!child.isFile()) {
                continue;
            }

            const relative = path.relative(instancePath, absolute).replaceAll("\\", "/");
            const ext = path.extname(relative).toLowerCase();
            if (!ALLOWED_EXTENSIONS.has(ext)) {
                continue;
            }

            const stats = await fs.promises.stat(absolute);
            entries.push({
                path: relative,
                section,
                size: stats.size,
                modifiedAtUtc: stats.mtime.toISOString(),
            });
        }
    }

    private resolveAndValidateConfigPath(instancePath: string, inputPath: string): { absolute: string; relative: string } {
        const normalized = `${inputPath ?? ""}`.trim().replaceAll("\\", "/").replace(/^\/+/, "");
        if (!normalized || normalized.includes("..") || path.isAbsolute(normalized)) {
            throw new Error(`Unsafe config path: ${inputPath}`);
        }

        const ext = path.extname(normalized).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) {
            throw new Error(`Unsupported config extension: ${ext || "(none)"}`);
        }

        const allowedRoot = ALLOWED_ROOTS.some(root => normalized.startsWith(root));
        if (!allowedRoot) {
            throw new Error(`Config path must be inside UserData/ or Mods/Config/: ${normalized}`);
        }

        const absolute = path.resolve(instancePath, normalized.replaceAll("/", path.sep));
        const root = path.resolve(instancePath) + path.sep;
        if (!absolute.startsWith(root)) {
            throw new Error(`Config path escapes instance root: ${normalized}`);
        }

        return { absolute, relative: normalized };
    }
}
