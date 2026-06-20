import { createHash } from "node:crypto";
import electron from "electron";
import { IPC_CHANNELS, AppSettings, StartupFatalInput } from "../../shared/ipc";
import { ManifestClient } from "../services/manifest-client";
import { SettingsStoreService } from "../services/settings-store";
import { InstanceService } from "../services/instance.service";
import { ContentService } from "../services/content.service";
import { LaunchService } from "../services/launch.service";
import { LauncherUpdaterService } from "../services/launcher-updater.service";
import { ConfigEditorService } from "../services/config-editor.service";
import { TrustedTimeService } from "../services/trusted-time.service";
import { RadioService } from "../services/radio.service";
import { RebalanceBackendService } from "../services/rebalance-backend.service";
import { BundleService } from "../services/bundle.service";
import { BundleUpdateService } from "../services/bundle-update.service";
import { computeStringSha256 } from "../utils/file-hash";

type IpcServices = {
    settings: SettingsStoreService;
    manifests: ManifestClient;
    instances: InstanceService;
    content: ContentService;
    launch: LaunchService;
    updater: LauncherUpdaterService;
    trustedTime: TrustedTimeService;
    config: ConfigEditorService;
    radio: RadioService;
    rebalance: RebalanceBackendService;
    bundle: BundleService;
    bundleUpdate: BundleUpdateService;
    buildTimestamp: string;
};

type Handler<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult> | TResult;
const TOOLS_UNLOCK_CODE_SHA256 = process.env.V2_TOOLS_UNLOCK_CODE_SHA256 || "752e3be506b30d8ed95a4548b387ee0cd36b97b22e5457e9f41e35c130f056ad";
const BUNDLE_REVEAL_CODE_SHA256 = process.env.V2_BUNDLE_REVEAL_CODE_SHA256 || "cf055880de15544fa31dab66a228ebc06538c9a0daa6b5aa2d85aab29748eff1";

export function registerIpcHandlers(services: IpcServices): void {
    const { app, dialog, BrowserWindow } = electron;
    const { settings, manifests, instances, content, launch, updater, trustedTime, config, radio, rebalance, bundle, bundleUpdate, buildTimestamp } = services;

    updater.onStateChanged(state => {
        for (const window of BrowserWindow.getAllWindows()) {
            if (window.isDestroyed()) {
                continue;
            }
            window.webContents.send(IPC_CHANNELS.updaterStateChanged, state);
        }
    });
    trustedTime.onStateChanged(state => {
        for (const window of BrowserWindow.getAllWindows()) {
            if (window.isDestroyed()) {
                continue;
            }
            window.webContents.send(IPC_CHANNELS.manifestTrustedTimeChanged, state);
        }
    });
    instances.onInstallStateChanged(state => {
        for (const window of BrowserWindow.getAllWindows()) {
            if (window.isDestroyed()) {
                continue;
            }
            window.webContents.send(IPC_CHANNELS.instancesInstallStateChanged, state);
        }
    });
    launch.onRuntimeStateChanged(state => {
        for (const window of BrowserWindow.getAllWindows()) {
            if (window.isDestroyed()) {
                continue;
            }
            window.webContents.send(IPC_CHANNELS.launchRuntimeStateChanged, state);
        }
    });
    launch.onRuntimeLog(entry => {
        for (const window of BrowserWindow.getAllWindows()) {
            if (window.isDestroyed()) {
                continue;
            }
            window.webContents.send(IPC_CHANNELS.launchRuntimeLog, entry);
        }
    });
    radio.onStateChanged(state => {
        for (const window of BrowserWindow.getAllWindows()) {
            if (window.isDestroyed()) {
                continue;
            }
            window.webContents.send(IPC_CHANNELS.radioStateChanged, state);
        }
    });

    handle(IPC_CHANNELS.diagnosticsGetBuildInfo, async () => ({
        appVersion: app.getVersion(),
        environment: app.isPackaged ? "production" : "development",
        buildTimestamp,
    }));
    handle(IPC_CHANNELS.diagnosticsReportStartupFatal, async input => {
        const fatal = input as StartupFatalInput;
        const contextText = fatal.context ? `\n\nContext: ${JSON.stringify(fatal.context)}` : "";
        dialog.showErrorBox(
            "BAPBAP Launcher V2 - Startup Error",
            `[${fatal.code}] ${fatal.message}${contextText}`
        );
        app.exit(1);
    });
    handle(IPC_CHANNELS.updaterCheck, async (force = false) => updater.check(Boolean(force)));
    handle(IPC_CHANNELS.updaterDownloadAndInstall, async (force = false) => updater.downloadAndInstall(Boolean(force)));
    handle(IPC_CHANNELS.updaterGetState, async () => updater.getState());

    handle(IPC_CHANNELS.settingsGetAll, async () => settings.getAll());
    handle(IPC_CHANNELS.settingsSet, async (key: keyof AppSettings, value: AppSettings[keyof AppSettings]) => {
        settings.set(key, value as never);
    });
    handle(IPC_CHANNELS.settingsUnlockToolsTab, async code => {
        const normalizedCode = String(code ?? "").trim();
        if (!normalizedCode) {
            return false;
        }
        if (computeStringSha256(normalizedCode) !== TOOLS_UNLOCK_CODE_SHA256) {
            return false;
        }
        return settings.unlockToolsTab();
    });
    handle(IPC_CHANNELS.settingsUnlockSecretMods, async password => {
        const normalizedPassword = String(password ?? "").trim();
        if (!normalizedPassword) {
            return false;
        }
        const index = await manifests.getIndex();
        const passwordSha256 = createHash("sha256").update(normalizedPassword).digest("hex").toLowerCase();
        const matchedUnlock = (index.secretUnlocks || []).find(entry => entry.passwordSha256 === passwordSha256);
        if (!matchedUnlock) {
            return false;
        }
        return settings.unlockSecretMods(matchedUnlock.id);
    });
    handle(IPC_CHANNELS.settingsRevealBundles, async code => {
        const normalizedCode = String(code ?? "").trim();
        if (!normalizedCode) {
            return false;
        }
        if (computeStringSha256(normalizedCode) !== BUNDLE_REVEAL_CODE_SHA256) {
            return false;
        }
        return settings.revealBundles();
    });
    handle(IPC_CHANNELS.dialogChooseDirectory, async input => {
        const config = (input ?? {}) as { title?: string; defaultPath?: string };
        const result = await dialog.showOpenDialog({
            title: config.title || "Choose folder",
            defaultPath: config.defaultPath,
            properties: ["openDirectory", "createDirectory"],
        });
        if (result.canceled) {
            return null;
        }
        return result.filePaths[0] || null;
    });
    handle(IPC_CHANNELS.dialogChooseAudioFiles, async input => {
        const config = (input ?? {}) as { title?: string; defaultPath?: string };
        const result = await dialog.showOpenDialog({
            title: config.title || "Import songs",
            defaultPath: config.defaultPath,
            properties: ["openFile", "multiSelections"],
            filters: [
                {
                    name: "Audio",
                    extensions: ["mp3", "wav", "ogg", "m4a", "aac", "flac"],
                },
            ],
        });
        return result.canceled ? [] : result.filePaths;
    });

    handle(IPC_CHANNELS.manifestGetIndex, async (force = false) => manifests.getIndex(Boolean(force)));
    handle(IPC_CHANNELS.manifestGetGameVersions, async (force = false) => manifests.getGameVersions(Boolean(force)));
    handle(IPC_CHANNELS.manifestGetChannel, async (channelId = "release", force = false) => manifests.getChannel(String(channelId), Boolean(force)));
    handle(IPC_CHANNELS.manifestGetTrustedTimeState, async (force = false) => trustedTime.getState(Boolean(force)));

    handle(IPC_CHANNELS.instancesList, async () => instances.list());
    handle(IPC_CHANNELS.instancesInstallOfficial, async input => instances.installOfficial(input as Parameters<typeof instances.installOfficial>[0]));
    handle(IPC_CHANNELS.instancesGetInstallState, async () => instances.getInstallState());
    handle(IPC_CHANNELS.instancesVerify, async instanceId => instances.verify(String(instanceId)));
    handle(IPC_CHANNELS.instancesHasRelativeFile, async (instanceId, relativePath) => instances.hasRelativeFile(String(instanceId), String(relativePath)));
    handle(IPC_CHANNELS.instancesInstallCustomMod, async instanceId => {
        const targetInstance = await instances.getById(String(instanceId));
        const pickerResult = await dialog.showOpenDialog({
            title: `Install custom mod into ${targetInstance.profileName || targetInstance.name}`,
            defaultPath: targetInstance.path,
            properties: ["openFile"],
            filters: [
                {
                    name: "Mod DLL",
                    extensions: ["dll"],
                },
            ],
        });
        if (pickerResult.canceled || !pickerResult.filePaths.length) {
            return { status: "cancelled" } as const;
        }
        const selectedFilePath = pickerResult.filePaths[0];
        const destinationFileName = selectedFilePath.split(/[/\\]/).pop() || "mod.dll";
        const destinationRelativePath = `Mods/${destinationFileName}`;
        const destinationExists = await instances.hasRelativeFile(String(instanceId), destinationRelativePath);
        let overwrite = false;
        if (destinationExists) {
            const overwriteChoice = await dialog.showMessageBox({
                type: "question",
                buttons: ["Overwrite", "Cancel"],
                defaultId: 0,
                cancelId: 1,
                title: "Replace existing mod",
                message: `${destinationFileName} already exists in this profile.`,
                detail: "Overwrite the existing DLL in the selected profile?",
            });
            if (overwriteChoice.response !== 0) {
                return { status: "cancelled" } as const;
            }
            overwrite = true;
        }
        return instances.installCustomMod(String(instanceId), selectedFilePath, overwrite);
    });
    handle(IPC_CHANNELS.instancesRemove, async instanceId => instances.remove(String(instanceId)));

    handle(IPC_CHANNELS.launchStart, async input => launch.launch(input as Parameters<typeof launch.launch>[0]));
    handle(IPC_CHANNELS.launchStop, async () => launch.stop());
    handle(IPC_CHANNELS.launchGetRuntimeState, async () => launch.getRuntimeState());

    handle(IPC_CHANNELS.contentListPackages, async (channelId = "release", force = false) => content.listPackages(String(channelId), Boolean(force)));
    handle(IPC_CHANNELS.contentGetPackageDetail, async (channelId, packageId, force = false) => content.getPackageDetail(String(channelId), String(packageId), Boolean(force)));
    handle(IPC_CHANNELS.contentListStates, async instanceId => content.listStates(String(instanceId)));
    handle(IPC_CHANNELS.contentGetModSets, async instanceId => content.getModSets(String(instanceId)));
    handle(IPC_CHANNELS.contentCreateModSet, async input => content.createModSet(input as Parameters<typeof content.createModSet>[0]));
    handle(IPC_CHANNELS.contentRenameModSet, async (instanceId, modSetId, name) => content.renameModSet(String(instanceId), String(modSetId), String(name)));
    handle(IPC_CHANNELS.contentDeleteModSet, async (instanceId, modSetId) => content.deleteModSet(String(instanceId), String(modSetId)));
    handle(IPC_CHANNELS.contentActivateModSet, async (instanceId, modSetId) => content.activateModSet(String(instanceId), String(modSetId)));
    handle(IPC_CHANNELS.contentInstall, async input => content.install(input as Parameters<typeof content.install>[0]));
    handle(IPC_CHANNELS.contentUninstall, async (instanceId, channelId, packageId) => content.uninstall(String(instanceId), String(channelId), String(packageId)));
    handle(IPC_CHANNELS.contentSetEnabled, async input => content.setEnabled(input as Parameters<typeof content.setEnabled>[0]));
    handle(IPC_CHANNELS.contentBulkApply, async input => content.bulkApply(input as Parameters<typeof content.bulkApply>[0]));

    handle(IPC_CHANNELS.configList, async instanceId => config.list(String(instanceId)));
    handle(IPC_CHANNELS.configRead, async (instanceId, filePath) => config.read(String(instanceId), String(filePath)));
    handle(IPC_CHANNELS.configWrite, async (instanceId, filePath, fileContent) => config.write(String(instanceId), String(filePath), String(fileContent ?? "")));

    handle(IPC_CHANNELS.radioGetState, async () => radio.getState());
    handle(IPC_CHANNELS.radioSync, async (force = false) => radio.sync(Boolean(force)));
    handle(IPC_CHANNELS.radioImportTracks, async filePaths => radio.importTracks(Array.isArray(filePaths) ? filePaths.map(String) : []));
    handle(IPC_CHANNELS.radioCreatePlaylist, async name => radio.createPlaylist(String(name)));
    handle(IPC_CHANNELS.radioRenamePlaylist, async (id, name) => radio.renamePlaylist(String(id), String(name)));
    handle(IPC_CHANNELS.radioDeletePlaylist, async id => radio.deletePlaylist(String(id)));
    handle(IPC_CHANNELS.radioSetPlaylistTracks, async (id, trackIds) => radio.setPlaylistTracks(String(id), Array.isArray(trackIds) ? trackIds.map(String) : []));
    handle(IPC_CHANNELS.radioToggleFavorite, async trackId => radio.toggleFavorite(String(trackId)));
    handle(IPC_CHANNELS.radioSetQueue, async trackIds => radio.setQueue(Array.isArray(trackIds) ? trackIds.map(String) : []));
    handle(IPC_CHANNELS.radioEnqueue, async trackId => radio.enqueue(String(trackId)));
    handle(IPC_CHANNELS.radioRemoveFromQueue, async trackId => radio.removeFromQueue(String(trackId)));
    handle(IPC_CHANNELS.radioClearQueue, async () => radio.clearQueue());
    handle(IPC_CHANNELS.radioSetPlaybackState, async input => radio.setPlaybackState((input ?? {}) as Parameters<typeof radio.setPlaybackState>[0]));

    handle(IPC_CHANNELS.rebalanceInvoke, async (command, args = {}) => rebalance.invoke(String(command), (args ?? {}) as Record<string, unknown>));
    handle(IPC_CHANNELS.rebalanceFileSrc, async targetPath => rebalance.fileSrc(String(targetPath)));

    handle(IPC_CHANNELS.bundleListAvailable, async () => bundle.listAvailable());
    handle(IPC_CHANNELS.bundleInstall, async (bundleId, profileName) => {
        const profileNameArg = profileName === undefined || profileName === null ? undefined : String(profileName);
        return bundle.install(String(bundleId), profileNameArg);
    });
    handle(IPC_CHANNELS.bundleRemove, async instanceId => bundle.remove(String(instanceId)));

    // Bundle install progress fan-out — same pattern as bundleUpdate
    // below. Keyed by bundleId (no instance exists yet during the
    // first-install pipeline), so renderers must subscribe before
    // invoking install() to catch the initial "resolving" emission.
    bundle.on("progress-changed", state => {
        for (const window of BrowserWindow.getAllWindows()) {
            if (window.isDestroyed()) {
                continue;
            }
            window.webContents.send(IPC_CHANNELS.bundleInstallProgressChanged, state);
        }
    });
    handle(IPC_CHANNELS.bundleGetInstallProgressState, async bundleId => bundle.getInstallProgressState(String(bundleId)));

    // Bundle update infrastructure — same fan-out pattern as installState.
    bundleUpdate.on("state-changed", state => {
        for (const window of BrowserWindow.getAllWindows()) {
            if (window.isDestroyed()) {
                continue;
            }
            window.webContents.send(IPC_CHANNELS.bundleUpdateStateChanged, state);
        }
    });
    handle(IPC_CHANNELS.bundleCheckForUpdate, async instanceId => bundleUpdate.checkForUpdate(String(instanceId)));
    handle(IPC_CHANNELS.bundleApplyUpdate, async instanceId => bundleUpdate.applyUpdate(String(instanceId)));
    handle(IPC_CHANNELS.bundleGetUpdateState, async instanceId => bundleUpdate.getUpdateState(String(instanceId)));
}

function handle<TArgs extends unknown[], TResult>(channel: string, handler: Handler<TArgs, TResult>): void {
    const { ipcMain } = electron;
    ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
        try {
            return await handler(...(args as TArgs));
        } catch (error) {
            throw toIpcError(channel, error);
        }
    });
}

function toIpcError(channel: string, error: unknown): Error {
    if (error instanceof Error) {
        const wrapped = new Error(error.message);
        const originalCode = (error as Error & { code?: unknown }).code;
        const subCode = typeof originalCode === "string" && originalCode.length > 0 ? originalCode : undefined;
        const wrappedTyped = wrapped as Error & {
            code: string;
            subCode?: string;
            context: Record<string, unknown>;
        };
        wrappedTyped.code = "V2_IPC_ERROR";
        if (subCode) {
            wrappedTyped.subCode = subCode;
        }
        wrappedTyped.context = { channel, ...(subCode ? { subCode } : {}) };
        wrapped.stack = error.stack;
        return wrapped;
    }
    const wrapped = new Error("Unexpected IPC failure.");
    (wrapped as Error & { code: string; context: Record<string, unknown> }).code = "V2_IPC_ERROR";
    (wrapped as Error & { code: string; context: Record<string, unknown> }).context = { channel, reason: String(error) };
    return wrapped;
}
