import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AppSettings, ContentBulkApplyInput, LaunchInput, LaunchRuntimeLogEntry } from "../../../shared/ipc";
import type { ContentInstallInput, ContentToggleInput } from "../../../shared/manifest";
import type { RadioSetPlaybackStateInput } from "../../../shared/radio";
import { api } from "../../api";
import { qk } from "./queryKeys";

/* ── diagnostics ───────────────────────────────────────────── */
export function useBuildInfo() {
    return useQuery({
        queryKey: qk.buildInfo,
        queryFn: () => api.diagnostics.getBuildInfo(),
        staleTime: Infinity,
    });
}

/* ── updater (launcher self-update) ────────────────────────── */
export function useUpdaterState() {
    return useQuery({
        queryKey: qk.updaterState,
        queryFn: () => api.updater.getState(),
    });
}

export function useDownloadAndInstallUpdate() {
    return useMutation({
        mutationFn: (force?: boolean) => api.updater.downloadAndInstall(force ?? false),
    });
}

export function useCheckUpdate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (force?: boolean) => api.updater.check(force ?? true),
        onSettled: () => qc.invalidateQueries({ queryKey: qk.updaterState }),
    });
}

export function useRefreshManifest() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () => api.manifest.getIndex(true),
        onSettled: () => {
            qc.invalidateQueries({ queryKey: qk.manifestIndex });
            qc.invalidateQueries({ queryKey: qk.gameVersions });
            qc.invalidateQueries({ queryKey: ["manifest", "channel"] });
            qc.invalidateQueries({ queryKey: qk.bundles });
        },
    });
}

/* ── settings ──────────────────────────────────────────────── */
export function useSettings() {
    return useQuery({ queryKey: qk.settings, queryFn: () => api.settings.getAll() });
}

type SetSettingVars = {
    [K in keyof AppSettings]: { key: K; value: AppSettings[K] };
}[keyof AppSettings];

export function useSetSetting() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (vars: SetSettingVars) => api.settings.set(vars.key, vars.value as never),
        onMutate: async (vars: SetSettingVars) => {
            await qc.cancelQueries({ queryKey: qk.settings });
            const prev = qc.getQueryData<AppSettings>(qk.settings);
            if (prev) {
                qc.setQueryData<AppSettings>(qk.settings, { ...prev, [vars.key]: vars.value });
            }
            return { prev };
        },
        onError: (_err, _vars, ctx) => {
            if (ctx?.prev) qc.setQueryData(qk.settings, ctx.prev);
        },
        onSettled: () => qc.invalidateQueries({ queryKey: qk.settings }),
    });
}

export function useUnlockTools() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (code: string) => api.settings.unlockToolsTab(code),
        onSuccess: ok => {
            if (ok) qc.invalidateQueries({ queryKey: qk.settings });
        },
    });
}

/* ── manifest ──────────────────────────────────────────────── */
export function useManifestIndex(force = false) {
    return useQuery({
        queryKey: qk.manifestIndex,
        queryFn: () => api.manifest.getIndex(force),
        staleTime: 5 * 60_000,
    });
}

export function useGameVersions(force = false) {
    return useQuery({
        queryKey: qk.gameVersions,
        queryFn: () => api.manifest.getGameVersions(force),
        staleTime: 5 * 60_000,
    });
}

export function useChannel(channelId?: string, force = false) {
    return useQuery({
        queryKey: qk.channel(channelId),
        queryFn: () => api.manifest.getChannel(channelId, force),
        staleTime: 5 * 60_000,
    });
}

export function useTrustedTime() {
    return useQuery({
        queryKey: qk.trustedTime,
        queryFn: () => api.manifest.getTrustedTimeState(false),
    });
}

/* ── instances ─────────────────────────────────────────────── */
export function useInstances() {
    return useQuery({ queryKey: qk.instances, queryFn: () => api.instances.list() });
}

export function useSteamPersonaName() {
    return useQuery({
        queryKey: qk.steamPersona,
        queryFn: () => api.instances.getSteamPersonaName(),
        staleTime: Infinity,
    });
}

export function useInstallState() {
    return useQuery({
        queryKey: qk.installState,
        queryFn: () => api.instances.getInstallState(),
    });
}

export function useInstallOfficial() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: Parameters<typeof api.instances.installOfficial>[0]) =>
            api.instances.installOfficial(input),
        onSuccess: () => qc.invalidateQueries({ queryKey: qk.instances }),
    });
}

export function useVerifyInstance() {
    return useMutation({ mutationFn: (instanceId: string) => api.instances.verify(instanceId) });
}

export function useRemoveInstance() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (instanceId: string) => api.instances.remove(instanceId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: qk.instances });
            // Bundle summaries derive isInstalled from the instance list;
            // without this invalidation the hero tile keeps showing "Play"
            // after a bundle profile was deleted.
            qc.invalidateQueries({ queryKey: qk.bundles });
        },
    });
}

export function useRenameInstance() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (vars: { instanceId: string; name: string }) =>
            api.instances.rename(vars.instanceId, vars.name),
        onSuccess: () => qc.invalidateQueries({ queryKey: qk.instances }),
    });
}

/* ── launch ────────────────────────────────────────────────── */
export function useRuntimeState() {
    return useQuery({
        queryKey: qk.runtimeState,
        queryFn: () => api.launch.getRuntimeState(),
    });
}

export function useRuntimeLog() {
    return useQuery({
        queryKey: qk.runtimeLog,
        queryFn: () => [] as LaunchRuntimeLogEntry[],
        staleTime: Infinity,
    });
}

export function useStartLaunch() {
    return useMutation({
        mutationFn: (input: LaunchInput) => api.launch.start(input),
    });
}

export function useStopLaunch() {
    return useMutation({ mutationFn: () => api.launch.stop() });
}

/* ── content (mods) ────────────────────────────────────────── */
export function usePackages(channelId?: string, force = false) {
    return useQuery({
        queryKey: qk.packages(channelId),
        queryFn: () => api.content.listPackages(channelId, force),
    });
}

export function usePackageDetail(channelId: string, packageId: string) {
    return useQuery({
        queryKey: qk.packageDetail(channelId, packageId),
        queryFn: () => api.content.getPackageDetail(channelId, packageId, false),
        enabled: Boolean(channelId && packageId),
    });
}

export function useContentStates(instanceId: string | undefined) {
    return useQuery({
        queryKey: qk.contentStates(instanceId ?? ""),
        queryFn: () => api.content.listStates(instanceId as string),
        enabled: Boolean(instanceId),
    });
}

export function useModSets(instanceId: string | undefined) {
    return useQuery({
        queryKey: qk.modSets(instanceId ?? ""),
        queryFn: () => api.content.getModSets(instanceId as string),
        enabled: Boolean(instanceId),
    });
}

export function useCreateModSet() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (vars: { instanceId: string; name: string; cloneFromModSetId?: string | null }) =>
            api.content.createModSet(vars),
        onSuccess: (state, vars) => qc.setQueryData(qk.modSets(vars.instanceId), state),
    });
}

export function useRenameModSet() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (vars: { instanceId: string; modSetId: string; name: string }) =>
            api.content.renameModSet(vars.instanceId, vars.modSetId, vars.name),
        onSuccess: (state, vars) => qc.setQueryData(qk.modSets(vars.instanceId), state),
    });
}

export function useDeleteModSet() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (vars: { instanceId: string; modSetId: string }) =>
            api.content.deleteModSet(vars.instanceId, vars.modSetId),
        onSuccess: (state, vars) => qc.setQueryData(qk.modSets(vars.instanceId), state),
    });
}

export function useActivateModSet() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (vars: { instanceId: string; modSetId: string }) =>
            api.content.activateModSet(vars.instanceId, vars.modSetId),
        onSuccess: (state, vars) => {
            qc.setQueryData(qk.modSets(vars.instanceId), state);
            qc.invalidateQueries({ queryKey: qk.contentStates(vars.instanceId) });
        },
    });
}

export function useInstallContent() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: ContentInstallInput) => api.content.install(input),
        onSuccess: (_data, input) => {
            qc.invalidateQueries({ queryKey: qk.contentStates(input.instanceId) });
            qc.invalidateQueries({ queryKey: qk.modSets(input.instanceId) });
        },
    });
}

export function useUninstallContent() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (vars: { instanceId: string; channelId: string; packageId: string }) =>
            api.content.uninstall(vars.instanceId, vars.channelId, vars.packageId),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: qk.contentStates(vars.instanceId) });
            qc.invalidateQueries({ queryKey: qk.modSets(vars.instanceId) });
        },
    });
}

export function useSetContentEnabled() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: ContentToggleInput) => api.content.setEnabled(input),
        onSuccess: (_data, input) => {
            qc.invalidateQueries({ queryKey: qk.contentStates(input.instanceId) });
            qc.invalidateQueries({ queryKey: qk.modSets(input.instanceId) });
        },
    });
}

export function useBulkApply() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: ContentBulkApplyInput) => api.content.bulkApply(input),
        onSuccess: (_data, input) => {
            qc.invalidateQueries({ queryKey: qk.contentStates(input.instanceId) });
            qc.invalidateQueries({ queryKey: qk.modSets(input.instanceId) });
        },
    });
}

/* ── config editor ─────────────────────────────────────────── */
export function useConfigList(instanceId: string | undefined) {
    return useQuery({
        queryKey: qk.configList(instanceId ?? ""),
        queryFn: () => api.config.list(instanceId as string),
        enabled: Boolean(instanceId),
    });
}

export function useConfigFile(instanceId: string | undefined, filePath: string | undefined) {
    return useQuery({
        queryKey: qk.configFile(instanceId ?? "", filePath ?? ""),
        queryFn: () => api.config.read(instanceId as string, filePath as string),
        enabled: Boolean(instanceId && filePath),
    });
}

export function useWriteConfig() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (vars: { instanceId: string; filePath: string; content: string }) =>
            api.config.write(vars.instanceId, vars.filePath, vars.content),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: qk.configFile(vars.instanceId, vars.filePath) });
            qc.invalidateQueries({ queryKey: qk.configList(vars.instanceId) });
        },
    });
}

/* ── radio ─────────────────────────────────────────────────── */
export function useRadioState() {
    return useQuery({ queryKey: qk.radio, queryFn: () => api.radio.getState() });
}

export function useSetRadioPlayback() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: RadioSetPlaybackStateInput) => api.radio.setPlaybackState(input),
        onSuccess: state => qc.setQueryData(qk.radio, state),
    });
}

export function useToggleFavorite() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (trackId: string) => api.radio.toggleFavorite(trackId),
        onSuccess: state => qc.setQueryData(qk.radio, state),
    });
}

export function useSyncRadio() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (force?: boolean) => api.radio.sync(force ?? false),
        onSuccess: state => qc.setQueryData(qk.radio, state),
    });
}

export function useCreatePlaylist() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (name: string) => api.radio.createPlaylist(name),
        onSuccess: () => qc.invalidateQueries({ queryKey: qk.radio }),
    });
}

export function useRenamePlaylist() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (vars: { id: string; name: string }) => api.radio.renamePlaylist(vars.id, vars.name),
        onSuccess: () => qc.invalidateQueries({ queryKey: qk.radio }),
    });
}

export function useDeletePlaylist() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.radio.deletePlaylist(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: qk.radio }),
    });
}

export function useSetPlaylistTracks() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (vars: { id: string; trackIds: string[] }) =>
            api.radio.setPlaylistTracks(vars.id, vars.trackIds),
        onSuccess: () => qc.invalidateQueries({ queryKey: qk.radio }),
    });
}

export function useEnqueueTrack() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (trackId: string) => api.radio.enqueue(trackId),
        onSuccess: state => qc.setQueryData(qk.radio, state),
    });
}

export function useRemoveFromQueue() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (trackId: string) => api.radio.removeFromQueue(trackId),
        onSuccess: state => qc.setQueryData(qk.radio, state),
    });
}

export function useClearQueue() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () => api.radio.clearQueue(),
        onSuccess: state => qc.setQueryData(qk.radio, state),
    });
}

/* ── bundles ───────────────────────────────────────────────── */
export function useBundles() {
    return useQuery({ queryKey: qk.bundles, queryFn: () => api.bundle.listAvailable() });
}

export function useInstallBundle() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (vars: { bundleId: string; profileName?: string }) =>
            api.bundle.install(vars.bundleId, vars.profileName),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: qk.instances });
            qc.invalidateQueries({ queryKey: qk.bundles });
        },
    });
}

export function useBundleInstallProgress(bundleId: string | undefined) {
    return useQuery({
        queryKey: qk.bundleInstallProgress(bundleId ?? ""),
        queryFn: () => api.bundle.getInstallProgressState(bundleId as string),
        enabled: Boolean(bundleId),
    });
}

export function useBundleUpdateState(instanceId: string | undefined) {
    return useQuery({
        queryKey: qk.bundleUpdate(instanceId ?? ""),
        queryFn: () => {
            if (!api.bundle.getUpdateState) {
                return Promise.reject(new Error("Bundle update state is not supported in this build."));
            }
            return api.bundle.getUpdateState(instanceId as string);
        },
        enabled: Boolean(instanceId && api.bundle.getUpdateState),
    });
}

export function useApplyBundleUpdate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (instanceId: string) => {
            if (!api.bundle.applyUpdate) {
                return Promise.reject(new Error("Bundle updates are not supported in this build."));
            }
            return api.bundle.applyUpdate(instanceId);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: qk.instances });
            qc.invalidateQueries({ queryKey: qk.bundles });
        },
    });
}
