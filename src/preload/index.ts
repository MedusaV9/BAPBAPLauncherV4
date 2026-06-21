import electron from "electron";
import { BundleInstallProgressState, BundleUpdateState, IPC_CHANNELS, V2Api } from "../shared/ipc";

const { contextBridge, ipcRenderer } = electron;

const v2Api: V2Api = {
    diagnostics: {
        getBuildInfo: () => ipcRenderer.invoke(IPC_CHANNELS.diagnosticsGetBuildInfo),
        reportStartupFatal: input => ipcRenderer.invoke(IPC_CHANNELS.diagnosticsReportStartupFatal, input),
    },
    updater: {
        check: force => ipcRenderer.invoke(IPC_CHANNELS.updaterCheck, force),
        downloadAndInstall: force => ipcRenderer.invoke(IPC_CHANNELS.updaterDownloadAndInstall, force),
        getState: () => ipcRenderer.invoke(IPC_CHANNELS.updaterGetState),
        onStateChanged: listener => {
            const wrapped = (_event: Electron.IpcRendererEvent, state: Awaited<ReturnType<V2Api["updater"]["getState"]>>) => listener(state);
            ipcRenderer.on(IPC_CHANNELS.updaterStateChanged, wrapped);
            return () => {
                ipcRenderer.removeListener(IPC_CHANNELS.updaterStateChanged, wrapped);
            };
        },
    },
    settings: {
        getAll: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGetAll),
        set: (key, value) => ipcRenderer.invoke(IPC_CHANNELS.settingsSet, key, value),
        unlockToolsTab: code => ipcRenderer.invoke(IPC_CHANNELS.settingsUnlockToolsTab, code),
        unlockSecretMods: password => ipcRenderer.invoke(IPC_CHANNELS.settingsUnlockSecretMods, password),
        revealBundles: code => ipcRenderer.invoke(IPC_CHANNELS.settingsRevealBundles, code),
    },
    dialog: {
        chooseDirectory: input => ipcRenderer.invoke(IPC_CHANNELS.dialogChooseDirectory, input),
        chooseAudioFiles: input => ipcRenderer.invoke(IPC_CHANNELS.dialogChooseAudioFiles, input),
    },
    manifest: {
        getIndex: force => ipcRenderer.invoke(IPC_CHANNELS.manifestGetIndex, force),
        getGameVersions: force => ipcRenderer.invoke(IPC_CHANNELS.manifestGetGameVersions, force),
        getChannel: (channelId, force) => ipcRenderer.invoke(IPC_CHANNELS.manifestGetChannel, channelId, force),
        getTrustedTimeState: force => ipcRenderer.invoke(IPC_CHANNELS.manifestGetTrustedTimeState, force),
        onTrustedTimeChanged: listener => {
            const wrapped = (_event: Electron.IpcRendererEvent, state: Awaited<ReturnType<V2Api["manifest"]["getTrustedTimeState"]>>) => listener(state);
            ipcRenderer.on(IPC_CHANNELS.manifestTrustedTimeChanged, wrapped);
            return () => {
                ipcRenderer.removeListener(IPC_CHANNELS.manifestTrustedTimeChanged, wrapped);
            };
        },
    },
    instances: {
        list: () => ipcRenderer.invoke(IPC_CHANNELS.instancesList),
        installOfficial: input => ipcRenderer.invoke(IPC_CHANNELS.instancesInstallOfficial, input),
        getInstallState: () => ipcRenderer.invoke(IPC_CHANNELS.instancesGetInstallState),
        onInstallStateChanged: listener => {
            const wrapped = (_event: Electron.IpcRendererEvent, state: Awaited<ReturnType<V2Api["instances"]["getInstallState"]>>) => listener(state);
            ipcRenderer.on(IPC_CHANNELS.instancesInstallStateChanged, wrapped);
            return () => {
                ipcRenderer.removeListener(IPC_CHANNELS.instancesInstallStateChanged, wrapped);
            };
        },
        verify: instanceId => ipcRenderer.invoke(IPC_CHANNELS.instancesVerify, instanceId),
        hasRelativeFile: (instanceId, relativePath) => ipcRenderer.invoke(IPC_CHANNELS.instancesHasRelativeFile, instanceId, relativePath),
        installCustomMod: instanceId => ipcRenderer.invoke(IPC_CHANNELS.instancesInstallCustomMod, instanceId),
        remove: instanceId => ipcRenderer.invoke(IPC_CHANNELS.instancesRemove, instanceId),
        getSteamPersonaName: () => ipcRenderer.invoke(IPC_CHANNELS.instancesGetSteamPersonaName),
    },
    launch: {
        start: input => ipcRenderer.invoke(IPC_CHANNELS.launchStart, input),
        stop: () => ipcRenderer.invoke(IPC_CHANNELS.launchStop),
        getRuntimeState: () => ipcRenderer.invoke(IPC_CHANNELS.launchGetRuntimeState),
        onRuntimeStateChanged: listener => {
            const wrapped = (_event: Electron.IpcRendererEvent, state: Awaited<ReturnType<V2Api["launch"]["getRuntimeState"]>>) => listener(state);
            ipcRenderer.on(IPC_CHANNELS.launchRuntimeStateChanged, wrapped);
            return () => {
                ipcRenderer.removeListener(IPC_CHANNELS.launchRuntimeStateChanged, wrapped);
            };
        },
        onRuntimeLog: listener => {
            const wrapped = (_event: Electron.IpcRendererEvent, entry: Parameters<Parameters<V2Api["launch"]["onRuntimeLog"]>[0]>[0]) => listener(entry);
            ipcRenderer.on(IPC_CHANNELS.launchRuntimeLog, wrapped);
            return () => {
                ipcRenderer.removeListener(IPC_CHANNELS.launchRuntimeLog, wrapped);
            };
        },
    },
    content: {
        listPackages: (channelId, force) => ipcRenderer.invoke(IPC_CHANNELS.contentListPackages, channelId, force),
        getPackageDetail: (channelId, packageId, force) =>
            ipcRenderer.invoke(IPC_CHANNELS.contentGetPackageDetail, channelId, packageId, force),
        listStates: instanceId => ipcRenderer.invoke(IPC_CHANNELS.contentListStates, instanceId),
        getModSets: instanceId => ipcRenderer.invoke(IPC_CHANNELS.contentGetModSets, instanceId),
        createModSet: input => ipcRenderer.invoke(IPC_CHANNELS.contentCreateModSet, input),
        renameModSet: (instanceId, modSetId, name) => ipcRenderer.invoke(IPC_CHANNELS.contentRenameModSet, instanceId, modSetId, name),
        deleteModSet: (instanceId, modSetId) => ipcRenderer.invoke(IPC_CHANNELS.contentDeleteModSet, instanceId, modSetId),
        activateModSet: (instanceId, modSetId) => ipcRenderer.invoke(IPC_CHANNELS.contentActivateModSet, instanceId, modSetId),
        install: input => ipcRenderer.invoke(IPC_CHANNELS.contentInstall, input),
        uninstall: (instanceId, channelId, packageId) =>
            ipcRenderer.invoke(IPC_CHANNELS.contentUninstall, instanceId, channelId, packageId),
        setEnabled: input => ipcRenderer.invoke(IPC_CHANNELS.contentSetEnabled, input),
        bulkApply: input => ipcRenderer.invoke(IPC_CHANNELS.contentBulkApply, input),
    },
    config: {
        list: instanceId => ipcRenderer.invoke(IPC_CHANNELS.configList, instanceId),
        read: (instanceId, filePath) => ipcRenderer.invoke(IPC_CHANNELS.configRead, instanceId, filePath),
        write: (instanceId, filePath, content) => ipcRenderer.invoke(IPC_CHANNELS.configWrite, instanceId, filePath, content),
    },
    radio: {
        getState: () => ipcRenderer.invoke(IPC_CHANNELS.radioGetState),
        sync: force => ipcRenderer.invoke(IPC_CHANNELS.radioSync, force),
        importTracks: filePaths => ipcRenderer.invoke(IPC_CHANNELS.radioImportTracks, filePaths),
        createPlaylist: name => ipcRenderer.invoke(IPC_CHANNELS.radioCreatePlaylist, name),
        renamePlaylist: (id, name) => ipcRenderer.invoke(IPC_CHANNELS.radioRenamePlaylist, id, name),
        deletePlaylist: id => ipcRenderer.invoke(IPC_CHANNELS.radioDeletePlaylist, id),
        setPlaylistTracks: (id, trackIds) => ipcRenderer.invoke(IPC_CHANNELS.radioSetPlaylistTracks, id, trackIds),
        toggleFavorite: trackId => ipcRenderer.invoke(IPC_CHANNELS.radioToggleFavorite, trackId),
        setQueue: trackIds => ipcRenderer.invoke(IPC_CHANNELS.radioSetQueue, trackIds),
        enqueue: trackId => ipcRenderer.invoke(IPC_CHANNELS.radioEnqueue, trackId),
        removeFromQueue: trackId => ipcRenderer.invoke(IPC_CHANNELS.radioRemoveFromQueue, trackId),
        clearQueue: () => ipcRenderer.invoke(IPC_CHANNELS.radioClearQueue),
        setPlaybackState: input => ipcRenderer.invoke(IPC_CHANNELS.radioSetPlaybackState, input),
        onStateChanged: listener => {
            const wrapped = (_event: Electron.IpcRendererEvent, state: Awaited<ReturnType<V2Api["radio"]["getState"]>>) => listener(state);
            ipcRenderer.on(IPC_CHANNELS.radioStateChanged, wrapped);
            return () => {
                ipcRenderer.removeListener(IPC_CHANNELS.radioStateChanged, wrapped);
            };
        },
    },
    rebalance: {
        invoke: (command, args) => ipcRenderer.invoke(IPC_CHANNELS.rebalanceInvoke, command, args),
        fileSrc: targetPath => ipcRenderer.invoke(IPC_CHANNELS.rebalanceFileSrc, targetPath),
    },
    bundle: {
        listAvailable: () => ipcRenderer.invoke(IPC_CHANNELS.bundleListAvailable),
        install: (bundleId, profileName) => ipcRenderer.invoke(IPC_CHANNELS.bundleInstall, bundleId, profileName),
        remove: instanceId => ipcRenderer.invoke(IPC_CHANNELS.bundleRemove, instanceId),
        getInstallProgressState: bundleId => ipcRenderer.invoke(IPC_CHANNELS.bundleGetInstallProgressState, bundleId),
        onInstallProgressChanged: handler => {
            const wrapped = (
                _event: Electron.IpcRendererEvent,
                state: BundleInstallProgressState,
            ) => handler(state);
            ipcRenderer.on(IPC_CHANNELS.bundleInstallProgressChanged, wrapped);
            return () => {
                ipcRenderer.removeListener(IPC_CHANNELS.bundleInstallProgressChanged, wrapped);
            };
        },
        checkForUpdate: instanceId => ipcRenderer.invoke(IPC_CHANNELS.bundleCheckForUpdate, instanceId),
        applyUpdate: instanceId => ipcRenderer.invoke(IPC_CHANNELS.bundleApplyUpdate, instanceId),
        getUpdateState: instanceId => ipcRenderer.invoke(IPC_CHANNELS.bundleGetUpdateState, instanceId),
        onUpdateStateChanged: listener => {
            const wrapped = (
                _event: Electron.IpcRendererEvent,
                state: BundleUpdateState,
            ) => listener(state);
            ipcRenderer.on(IPC_CHANNELS.bundleUpdateStateChanged, wrapped);
            return () => {
                ipcRenderer.removeListener(IPC_CHANNELS.bundleUpdateStateChanged, wrapped);
            };
        },
    },
};

contextBridge.exposeInMainWorld("v2Api", v2Api);
