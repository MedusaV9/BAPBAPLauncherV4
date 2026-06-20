import { randomUUID } from "node:crypto";
import path from "node:path";
import fsExtra from "fs-extra";
import { fetchWithTimeout, MANIFEST_TIMEOUT_MS } from "../utils/timeout-fetch";
import { KeyedMutex } from "../utils/async-mutex";
import {
    ContentInstallInput,
    ContentToggleInput,
    InstalledInstance,
    PackageCard,
    PackageManifest,
    PackageVersionManifest,
} from "../../shared/manifest";
import { ManifestClient } from "./manifest-client";
import { InstanceService } from "./instance.service";
import { ArchiveDownloadService } from "./archive-download.service";
import {
    ContentBulkApplyInput,
    ContentBulkApplyResult,
    ContentCreateModSetInput,
    ContentModSet,
    ContentModSetPackageState,
    ContentModSetState,
    ContentStateMap,
} from "../../shared/ipc";
import { resolveUnlockStatus } from "../../shared/unlock-time";
import { TrustedTimeService } from "./trusted-time.service";

const { ensureDir, move, pathExists, remove } = fsExtra;

type ManagedPackageState = {
    channelId: string;
    packageId: string;
    version: string;
    enabled: boolean;
    files: Array<{ targetPath: string; sha256?: string; sourcePath?: string }>;
};

export class ContentService {
    private readonly manifests: ManifestClient;
    private readonly instances: InstanceService;
    private readonly downloader: ArchiveDownloadService;
    private readonly trustedTime: TrustedTimeService;
    private readonly contentMutex = new KeyedMutex();

    constructor(manifests: ManifestClient, instances: InstanceService, downloader: ArchiveDownloadService, trustedTime: TrustedTimeService) {
        this.manifests = manifests;
        this.instances = instances;
        this.downloader = downloader;
        this.trustedTime = trustedTime;
    }

    async listPackages(channelId = "release", force = false): Promise<PackageCard[]> {
        return this.manifests.listPackages(channelId, force);
    }

    async getPackageDetail(channelId: string, packageId: string, force = false): Promise<PackageManifest> {
        return this.manifests.getPackageDetail(channelId, packageId, force);
    }

    async listStates(instanceId: string): Promise<ContentStateMap> {
        const instance = await this.instances.getById(instanceId);
        const state = await this.instances.readContentState(instance.path);
        const result: ContentStateMap = {};

        for (const [key, value] of Object.entries(state)) {
            const typed = value as ManagedPackageState;
            const allFilesExist = await this.allManagedFilesExist(instance.path, typed.files || []);
            if (!allFilesExist) {
                result[key] = { status: "partial", version: typed.version };
                continue;
            }
            result[key] = {
                status: typed.enabled ? "installed-enabled" : "installed-disabled",
                version: typed.version,
            };
        }
        return result;
    }

    async getModSets(instanceId: string): Promise<ContentModSetState> {
        const instance = await this.instances.getById(instanceId);
        return this.instances.readModSetState(instance.path);
    }

    async createModSet(input: ContentCreateModSetInput): Promise<ContentModSetState> {
        const instance = await this.instances.getById(input.instanceId);
        await this.instances.assertMutable(instance);
        const release = await this.contentMutex.acquire(input.instanceId);
        try {
            return await this.createModSetInternal(input);
        } finally {
            release();
        }
    }

    private async createModSetInternal(input: ContentCreateModSetInput): Promise<ContentModSetState> {
        const instance = await this.instances.getById(input.instanceId);
        const modSetState = await this.instances.readModSetState(instance.path);
        const sourceSetId = `${input.cloneFromModSetId || ""}`.trim();
        const sourceSet = sourceSetId
            ? modSetState.sets.find(set => set.id === sourceSetId) || null
            : null;
        const newSet: ContentModSet = {
            id: randomUUID(),
            name: sanitizeModSetName(input.name, `Mod set ${modSetState.sets.length + 1}`),
            updatedAtUtc: new Date().toISOString(),
            packageStates: cloneModSetPackageStates(sourceSet?.packageStates || {}),
        };
        const nextState: ContentModSetState = {
            activeModSetId: newSet.id,
            sets: [...modSetState.sets, newSet],
        };
        await this.instances.writeModSetState(instance.path, nextState);
        return this.activateModSetInternal(input.instanceId, newSet.id);
    }

    async renameModSet(instanceId: string, modSetId: string, name: string): Promise<ContentModSetState> {
        const instance = await this.instances.getById(instanceId);
        await this.instances.assertMutable(instance);
        const release = await this.contentMutex.acquire(instanceId);
        try {
            const modSetState = await this.instances.readModSetState(instance.path);
            const nextState: ContentModSetState = {
                ...modSetState,
                sets: modSetState.sets.map(set =>
                    set.id === modSetId
                        ? {
                              ...set,
                              name: sanitizeModSetName(name, set.name),
                              updatedAtUtc: new Date().toISOString(),
                          }
                        : set
                ),
            };
            await this.instances.writeModSetState(instance.path, nextState);
            return nextState;
        } finally {
            release();
        }
    }

    async deleteModSet(instanceId: string, modSetId: string): Promise<ContentModSetState> {
        const instance = await this.instances.getById(instanceId);
        await this.instances.assertMutable(instance);
        const release = await this.contentMutex.acquire(instanceId);
        try {
            const modSetState = await this.instances.readModSetState(instance.path);
            const remainingSets = modSetState.sets.filter(set => set.id !== modSetId);
            if (!remainingSets.length) {
                throw new Error("At least one mod set has to stay available.");
            }

            let nextState: ContentModSetState = {
                activeModSetId: modSetState.activeModSetId === modSetId ? remainingSets[0].id : modSetState.activeModSetId,
                sets: remainingSets,
            };
            await this.instances.writeModSetState(instance.path, nextState);
            if (modSetState.activeModSetId === modSetId) {
                nextState = await this.activateModSetInternal(instanceId, nextState.activeModSetId);
            }
            return nextState;
        } finally {
            release();
        }
    }

    async activateModSet(instanceId: string, modSetId: string): Promise<ContentModSetState> {
        const instance = await this.instances.getById(instanceId);
        await this.instances.assertMutable(instance);
        const release = await this.contentMutex.acquire(instanceId);
        try {
            return await this.activateModSetInternal(instanceId, modSetId);
        } finally {
            release();
        }
    }

    private async activateModSetInternal(instanceId: string, modSetId: string): Promise<ContentModSetState> {
        const instance = await this.instances.getById(instanceId);
        const modSetState = await this.instances.readModSetState(instance.path);
        const targetSet = modSetState.sets.find(set => set.id === modSetId);
        if (!targetSet) {
            throw new Error(`Mod set '${modSetId}' not found.`);
        }

        const rawState = await this.instances.readContentState(instance.path);
        const desiredStates = targetSet.packageStates || {};

        for (const [stateKey, value] of Object.entries(rawState)) {
            const typed = value as ManagedPackageState;
            const desired = desiredStates[stateKey];
            if (!desired) {
                await this.uninstallInternal(instance.id, typed.channelId, typed.packageId, false);
            }
        }

        for (const desired of Object.values(desiredStates)) {
            const stateKey = this.toStateKey(desired.channelId, desired.packageId);
            const current = rawState[stateKey] as ManagedPackageState | undefined;
            if (!current) {
                if (!desired.version) {
                    continue;
                }
                await this.installInternal(
                    {
                        instanceId: instance.id,
                        channelId: desired.channelId,
                        packageId: desired.packageId,
                        version: desired.version,
                    },
                    false
                );
                if (!desired.enabled) {
                    await this.setEnabledInternal(
                        {
                            instanceId: instance.id,
                            channelId: desired.channelId,
                            packageId: desired.packageId,
                            enabled: false,
                        },
                        false
                    );
                }
                continue;
            }

            if (desired.version && current.version !== desired.version) {
                await this.installInternal(
                    {
                        instanceId: instance.id,
                        channelId: desired.channelId,
                        packageId: desired.packageId,
                        version: desired.version,
                    },
                    false
                );
                if (!desired.enabled) {
                    await this.setEnabledInternal(
                        {
                            instanceId: instance.id,
                            channelId: desired.channelId,
                            packageId: desired.packageId,
                            enabled: false,
                        },
                        false
                    );
                }
                continue;
            }

            if (Boolean(current.enabled) !== desired.enabled) {
                await this.setEnabledInternal(
                    {
                        instanceId: instance.id,
                        channelId: desired.channelId,
                        packageId: desired.packageId,
                        enabled: desired.enabled,
                    },
                    false
                );
            }
        }

        return this.syncModSetSnapshot(instance.path, modSetId, true);
    }

    async install(input: ContentInstallInput): Promise<void> {
        const instance = await this.instances.getById(input.instanceId);
        await this.instances.assertMutable(instance);
        const release = await this.contentMutex.acquire(input.instanceId);
        try {
            await this.installInternal(input, true);
        } finally {
            release();
        }
    }

    async uninstall(instanceId: string, channelId: string, packageId: string): Promise<void> {
        const instance = await this.instances.getById(instanceId);
        await this.instances.assertMutable(instance);
        const release = await this.contentMutex.acquire(instanceId);
        try {
            await this.uninstallInternal(instanceId, channelId, packageId, true);
        } finally {
            release();
        }
    }

    async setEnabled(input: ContentToggleInput): Promise<void> {
        const instance = await this.instances.getById(input.instanceId);
        await this.instances.assertMutable(instance);
        const release = await this.contentMutex.acquire(input.instanceId);
        try {
            await this.setEnabledInternal(input, true);
        } finally {
            release();
        }
    }

    async bulkApply(input: ContentBulkApplyInput): Promise<ContentBulkApplyResult> {
        const instance = await this.instances.getById(input.instanceId);
        await this.instances.assertMutable(instance);
        const release = await this.contentMutex.acquire(input.instanceId);
        try {
            return await this.bulkApplyInternal(input);
        } finally {
            release();
        }
    }

    private async bulkApplyInternal(input: ContentBulkApplyInput): Promise<ContentBulkApplyResult> {
        const packageIds = Array.from(new Set((input.packageIds || []).map(item => `${item}`.trim()).filter(Boolean)));
        const results: ContentBulkApplyResult["results"] = [];

        for (const packageId of packageIds) {
            try {
                switch (input.action) {
                    case "install": {
                        const requestedVersion = input.versionByPackage?.[packageId]?.trim();
                        const version = requestedVersion || await this.resolveLatestVersion(input.channelId, packageId);
                        await this.installInternal({
                            instanceId: input.instanceId,
                            channelId: input.channelId,
                            packageId,
                            version,
                        }, false);
                        break;
                    }
                    case "uninstall":
                        await this.uninstallInternal(input.instanceId, input.channelId, packageId, false);
                        break;
                    case "enable":
                        await this.setEnabledInternal({
                            instanceId: input.instanceId,
                            channelId: input.channelId,
                            packageId,
                            enabled: true,
                        }, false);
                        break;
                    case "disable":
                        await this.setEnabledInternal({
                            instanceId: input.instanceId,
                            channelId: input.channelId,
                            packageId,
                            enabled: false,
                        }, false);
                        break;
                    default:
                        throw new Error(`Unsupported bulk action '${input.action}'.`);
                }
                results.push({ packageId, ok: true });
            } catch (error) {
                results.push({
                    packageId,
                    ok: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        const instance = await this.instances.getById(input.instanceId);
        await this.syncActiveModSet(instance.path);
        const successCount = results.filter(item => item.ok).length;
        return {
            total: results.length,
            successCount,
            failedCount: results.length - successCount,
            results,
        };
    }

    private async installInternal(input: ContentInstallInput, syncActiveModSet: boolean): Promise<void> {
        const instance = await this.instances.getById(input.instanceId);
        const detail = await this.manifests.getPackageDetail(input.channelId, input.packageId, true);
        await this.assertPackageUnlocked(detail);
        this.assertPackageSupportedForInstance(detail, instance);
        const selectedVersion = (detail.versions || []).find(item => item.version === input.version);
        if (!selectedVersion) {
            throw new Error(`Version '${input.version}' not found for package '${input.packageId}'.`);
        }

        const packageManifestUrl = await this.resolvePackageManifestUrl(input.channelId, input.packageId);
        const versionManifestUrl = this.manifests.resolveManifestPath(selectedVersion.versionManifestPath, packageManifestUrl);
        const versionManifest = await this.fetchJson<PackageVersionManifest>(versionManifestUrl);
        if (!versionManifest.files?.length) {
            throw new Error(`No installable files found for ${input.packageId}@${input.version}.`);
        }

        const managedFiles: ManagedPackageState["files"] = [];
        for (const file of versionManifest.files) {
            const sourceUrl = this.manifests.resolveManifestPath(file.sourcePath, versionManifestUrl);
            const targetAbsolute = this.resolveSafeTargetPath(instance.path, file.targetPath);
            await ensureDir(path.dirname(targetAbsolute));
            await this.downloader.downloadFile({
                url: sourceUrl,
                outputPath: targetAbsolute,
                sha256: file.sha256,
            });
            managedFiles.push({
                targetPath: file.targetPath,
                sha256: file.sha256,
                sourcePath: file.sourcePath,
            });
        }

        const key = this.toStateKey(input.channelId, input.packageId);
        const state = await this.instances.readContentState(instance.path);
        state[key] = {
            channelId: input.channelId,
            packageId: input.packageId,
            version: input.version,
            enabled: true,
            files: managedFiles,
        } satisfies ManagedPackageState;
        await this.instances.writeContentState(instance.path, state);
        if (syncActiveModSet) {
            await this.syncActiveModSet(instance.path);
        }
    }

    private async uninstallInternal(instanceId: string, channelId: string, packageId: string, syncActiveModSet: boolean): Promise<void> {
        const instance = await this.instances.getById(instanceId);
        const state = await this.instances.readContentState(instance.path);
        const key = this.toStateKey(channelId, packageId);
        const entry = state[key] as ManagedPackageState | undefined;
        if (!entry) {
            return;
        }

        for (const file of entry.files || []) {
            const targetAbsolute = this.resolveSafeTargetPath(instance.path, file.targetPath);
            const disabledPath = targetAbsolute.endsWith(".dll")
                ? targetAbsolute.slice(0, -4) + ".disabled"
                : `${targetAbsolute}.disabled`;
            if (await pathExists(targetAbsolute)) {
                await remove(targetAbsolute).catch(() => {});
            }
            if (await pathExists(disabledPath)) {
                await remove(disabledPath).catch(() => {});
            }
        }

        delete state[key];
        await this.instances.writeContentState(instance.path, state);
        if (syncActiveModSet) {
            await this.syncActiveModSet(instance.path);
        }
    }

    private async setEnabledInternal(input: ContentToggleInput, syncActiveModSet: boolean): Promise<void> {
        const instance = await this.instances.getById(input.instanceId);
        const state = await this.instances.readContentState(instance.path);
        const key = this.toStateKey(input.channelId, input.packageId);
        const entry = state[key] as ManagedPackageState | undefined;
        if (!entry) {
            return;
        }

        for (const file of entry.files || []) {
            if (!file.targetPath.toLowerCase().endsWith(".dll")) {
                continue;
            }
            const enabledPath = this.resolveSafeTargetPath(instance.path, file.targetPath);
            const disabledPath = enabledPath.slice(0, -4) + ".disabled";

            if (input.enabled) {
                if (await pathExists(disabledPath)) {
                    await remove(enabledPath).catch(() => {});
                    await move(disabledPath, enabledPath, { overwrite: true });
                }
            } else if (await pathExists(enabledPath)) {
                await remove(disabledPath).catch(() => {});
                await move(enabledPath, disabledPath, { overwrite: true });
            }
        }

        entry.enabled = input.enabled;
        state[key] = entry;
        await this.instances.writeContentState(instance.path, state);
        if (syncActiveModSet) {
            await this.syncActiveModSet(instance.path);
        }
    }

    private async resolvePackageManifestUrl(channelId: string, packageId: string): Promise<string> {
        const index = await this.manifests.getIndex();
        const channel = (index.channels || []).find(item => item.id.toLowerCase() === channelId.toLowerCase());
        if (!channel) {
            throw new Error(`Channel '${channelId}' not found.`);
        }
        const channelUrl = this.manifests.resolveManifestPath(channel.manifestPath, this.manifests.getManifestUrl());
        const channelManifest = await this.manifests.getChannel(channelId);
        const packageIndexUrl = this.manifests.resolveManifestPath(channelManifest.packagesIndexPath, channelUrl);
        const packageIndex = await this.fetchJson<{ packages: Array<{ id: string; packageManifestPath: string }> }>(packageIndexUrl);
        const pkg = (packageIndex.packages || []).find(item => item.id.toLowerCase() === packageId.toLowerCase());
        if (!pkg) {
            throw new Error(`Package '${packageId}' not found in channel '${channelId}'.`);
        }
        return this.manifests.resolveManifestPath(pkg.packageManifestPath, packageIndexUrl);
    }

    private resolveSafeTargetPath(instancePath: string, targetRelativePath: string): string {
        const normalized = targetRelativePath.replaceAll("\\", "/");
        const target = path.resolve(instancePath, normalized);
        const normalizedRoot = path.resolve(instancePath) + path.sep;
        if (!target.startsWith(normalizedRoot) && target !== path.resolve(instancePath)) {
            throw new Error(`Illegal target path outside instance root: ${targetRelativePath}`);
        }
        return target;
    }

    private toStateKey(channelId: string, packageId: string): string {
        return `${channelId.toLowerCase()}::${packageId.toLowerCase()}`;
    }

    private async allManagedFilesExist(instancePath: string, files: Array<{ targetPath: string }>): Promise<boolean> {
        if (!files.length) {
            return false;
        }
        for (const file of files) {
            const absolute = this.resolveSafeTargetPath(instancePath, file.targetPath);
            const exists = await pathExists(absolute);
            const disabledExists = absolute.toLowerCase().endsWith(".dll")
                ? await pathExists(absolute.slice(0, -4) + ".disabled")
                : false;
            if (!exists && !disabledExists) {
                return false;
            }
        }
        return true;
    }

    private async fetchJson<T>(url: string): Promise<T> {
        const response = await fetchWithTimeout(url, { method: "GET", cache: "no-store" }, MANIFEST_TIMEOUT_MS);
        if (!response.ok) {
            throw new Error(`Request failed (${response.status}) for ${url}`);
        }
        return response.json() as Promise<T>;
    }

    private async resolveLatestVersion(channelId: string, packageId: string): Promise<string> {
        const detail = await this.getPackageDetail(channelId, packageId, true);
        await this.assertPackageUnlocked(detail);
        const version = detail.latestVersion || detail.versions?.[0]?.version;
        if (!version) {
            throw new Error(`Package '${packageId}' has no installable versions.`);
        }
        return version;
    }

    private async assertPackageUnlocked(detail: PackageManifest): Promise<void> {
        const trustedNow = await this.trustedTime.getTrustedNow(false);
        const unlockStatus = resolveUnlockStatus(detail.unlockAtUtc, trustedNow.trustedNowMs, trustedNow.available);
        if (!unlockStatus.locked) {
            return;
        }
        if (unlockStatus.reason === "waiting-time-source") {
            throw new Error(`'${detail.name || detail.id}' is still locked. Waiting for trusted time source.`);
        }
        throw new Error(`'${detail.name || detail.id}' is locked until ${unlockStatus.unlockAtUtc}.`);
    }

    private assertPackageSupportedForInstance(detail: PackageManifest, instance: InstalledInstance): void {
        const supportedTracks = (detail.supportedTracks || []).map(item => `${item || ""}`.trim().toLowerCase()).filter(Boolean);
        if (!supportedTracks.length) {
            return;
        }
        const currentTokens = new Set(
            [instance.officialTrack, instance.track, instance.versionId]
                .map(item => `${item || ""}`.trim().toLowerCase())
                .filter(Boolean)
        );
        if (supportedTracks.some(track => currentTokens.has(track))) {
            return;
        }
        throw new Error(`'${detail.name || detail.id}' only installs on ${supportedTracks.join(", ")}.`);
    }

    private async syncActiveModSet(instancePath: string): Promise<void> {
        const current = await this.instances.readModSetState(instancePath);
        await this.syncModSetSnapshot(instancePath, current.activeModSetId, true);
    }

    private async syncModSetSnapshot(instancePath: string, modSetId: string, setActive: boolean): Promise<ContentModSetState> {
        const current = await this.instances.readModSetState(instancePath);
        const snapshot = buildModSetSnapshot(await this.instances.readContentState(instancePath));
        const now = new Date().toISOString();
        const nextState: ContentModSetState = {
            activeModSetId: setActive ? modSetId : current.activeModSetId,
            sets: current.sets.map(set =>
                set.id === modSetId
                    ? {
                          ...set,
                          updatedAtUtc: now,
                          packageStates: snapshot,
                      }
                    : set
            ),
        };
        await this.instances.writeModSetState(instancePath, nextState);
        return nextState;
    }
}

function sanitizeModSetName(value: string, fallback: string): string {
    const normalized = `${value || ""}`.trim().replace(/\s+/g, " ");
    return normalized || fallback;
}

function cloneModSetPackageStates(source: Record<string, ContentModSetPackageState>): Record<string, ContentModSetPackageState> {
    return Object.fromEntries(
        Object.entries(source || {}).map(([key, value]) => [
            key,
            {
                channelId: value.channelId,
                packageId: value.packageId,
                version: value.version,
                enabled: value.enabled,
            },
        ])
    );
}

function buildModSetSnapshot(contentState: Record<string, any>): Record<string, ContentModSetPackageState> {
    const snapshot: Record<string, ContentModSetPackageState> = {};
    for (const [key, value] of Object.entries(contentState || {})) {
        const typed = value as ManagedPackageState;
        if (!typed?.packageId || !typed?.channelId) {
            continue;
        }
        snapshot[key] = {
            channelId: typed.channelId,
            packageId: typed.packageId,
            version: typed.version,
            enabled: typed.enabled !== false,
        };
    }
    return snapshot;
}
