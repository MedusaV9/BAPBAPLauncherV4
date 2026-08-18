import { useState, type ReactNode } from "react";
import { FolderOpen, RefreshCw, DownloadCloud } from "lucide-react";
import { Switch } from "../../components/ui/switch";
import { InputWell } from "../../components/brand/InputWell";
import { Button } from "../../components/ui/button";
import {
    useSettings,
    useSetSetting,
    useSteamPersonaName,
    useBuildInfo,
    useInstances,
    useUpdaterState,
    useCheckUpdate,
    useRefreshManifest,
} from "../query/hooks";
import { getLauncherUpdateBannerTitle } from "../../helpers/launcher-update-ui";
import { LANGUAGES } from "../i18n/languages";
import { LanguageFlag } from "../i18n/flags";
import { useT, useLanguage } from "../i18n";
import { api } from "../../api";
import type { AppSettings } from "../../../shared/ipc";

function AccountGroup() {
    const { data: persona } = useSteamPersonaName();
    const { data: build } = useBuildInfo();
    const { data: instances } = useInstances();
    const t = useT();

    const name = persona?.trim() || "Player";
    const profileCount = instances?.length ?? 0;

    return (
        <Group title={t("settings.group.account")}>
            <Row
                label={t("settings.account.username")}
                description={persona ? t("settings.header.signedInSteam") : t("settings.header.noSteam")}
                control={<span className="font-mono text-sm text-foreground">{name}</span>}
            />
            <Row
                label={t("settings.header.build")}
                control={<span className="font-mono text-sm text-foreground">{build?.appVersion ? `v${build.appVersion}` : "—"}</span>}
            />
            <Row
                label={t("settings.header.profiles")}
                control={<span className="font-mono text-sm text-foreground">{profileCount}</span>}
            />
        </Group>
    );
}

function Group({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
    return (
        <section className="flex h-full flex-col gap-3">
            <div className="px-1">
                <h2 className="font-display text-xs uppercase tracking-[0.1em] text-foreground">{title}</h2>
                {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
            </div>
            <div className="flex-1 overflow-hidden rounded-[1.125rem] border border-border bg-card divide-y divide-border px-4">
                {children}
            </div>
        </section>
    );
}

function Row({
    label,
    description,
    control,
    align = "center",
}: {
    label: string;
    description?: string;
    control: ReactNode;
    align?: "center" | "start";
}) {
    return (
        <div className={`flex min-h-[56px] justify-between gap-6 py-3.5 ${align === "start" ? "items-start" : "items-center"}`}>
            <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{label}</p>
                {description && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{description}</p>}
            </div>
            <div className="shrink-0">{control}</div>
        </div>
    );
}

function ScaleSlider() {
    const { data: settings } = useSettings();
    const setSetting = useSetSetting();
    const [draft, setDraft] = useState<number | null>(null);
    const value = draft ?? settings?.uiScale ?? 1;

    function commit(v: number) {
        setDraft(null);
        setSetting.mutate({ key: "uiScale", value: v } as Parameters<typeof setSetting.mutate>[0]);
    }

    return (
        <div className="flex w-48 items-center gap-3">
            <input
                type="range"
                min={0.8}
                max={1.5}
                step={0.05}
                value={value}
                onChange={e => setDraft(Number(e.target.value))}
                onPointerUp={e => commit(Number((e.target as HTMLInputElement).value))}
                onKeyUp={e => {
                    if (e.key === "Enter" || e.key === " ") commit(Number((e.target as HTMLInputElement).value));
                }}
                className="h-1 flex-1 cursor-pointer accent-[#e91e8c]"
                aria-label="UI scale"
            />
            <span className="w-10 font-mono text-xs text-muted-foreground">
                {Math.round(value * 100)}%
            </span>
        </div>
    );
}

function LanguageGroup() {
    const { data: settings } = useSettings();
    const setSetting = useSetSetting();
    const t = useT();
    const current = useLanguage();

    if (!settings) return null;

    return (
        <Group title={t("settings.group.language")}>
            <div className="flex h-full flex-col py-3.5">
                <div className="grid flex-1 grid-cols-2 content-start gap-2 sm:grid-cols-3">
                    {LANGUAGES.map(lang => {
                        const active = lang.code === current;
                        return (
                            <button
                                key={lang.code}
                                type="button"
                                onClick={() =>
                                    setSetting.mutate({ key: "language", value: lang.code } as Parameters<typeof setSetting.mutate>[0])
                                }
                                className={`focus-ring flex items-center gap-2.5 rounded-[0.625rem] border px-3 py-2.5 text-sm transition-colors ${
                                    active
                                        ? "border-accent bg-accent/10 text-foreground"
                                        : "border-input bg-[var(--surface-inset)] text-muted-foreground hover:border-white/20"
                                }`}
                                aria-pressed={active}
                            >
                                <LanguageFlag code={lang.code} />
                                <span className="truncate">{lang.name}</span>
                            </button>
                        );
                    })}
                </div>
                <p className="mt-3 text-xs leading-snug text-muted-foreground">{t("settings.language.aiWarning")}</p>
            </div>
        </Group>
    );
}

export function SettingsWorkspace() {
    const { data: settings } = useSettings();
    const setSetting = useSetSetting();
    const { data: updaterState } = useUpdaterState();
    const checkUpdate = useCheckUpdate();
    const refreshManifest = useRefreshManifest();
    const [migrating, setMigrating] = useState(false);
    const t = useT();

    async function migrateV3() {
        const dir = await api.dialog.chooseDirectory({ title: "Choose V3 instances folder" });
        if (!dir) return;
        setMigrating(true);
        try {
            const result = await api.instances.migrateFromV3(dir);
            const msg = [`Imported ${result.imported}, skipped ${result.skipped}`];
            if (result.errors.length > 0) msg.push(`Errors: ${result.errors.slice(0, 3).join("; ")}`);
            alert(msg.join("\n"));
            location.reload();
        } catch (error) {
            alert(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setMigrating(false);
        }
    }

    if (!settings) {
        return (
            <div className="p-8">
                <p className="text-sm text-muted-foreground">{t("settings.loading")}</p>
            </div>
        );
    }

    function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
        setSetting.mutate({ key, value } as Parameters<typeof setSetting.mutate>[0]);
    }

    async function chooseInstancesRoot() {
        const dir = await api.dialog.chooseDirectory({ title: "Choose instances folder" });
        if (dir) set("instancesRoot", dir);
    }

    return (
        <div className="bap-glow relative h-full overflow-auto px-8 pb-8 pt-24">
            <div className="mx-auto grid max-w-5xl grid-cols-1 items-start gap-7 lg:grid-cols-2">
                <LanguageGroup />
                <Group title={t("settings.group.updates")}>
                    <Row
                        label={t("settings.autoUpdate.label")}
                        description={t("settings.autoUpdate.description")}
                        control={
                            <Switch
                                checked={settings.launcherAutoUpdate}
                                onCheckedChange={v => set("launcherAutoUpdate", v)}
                            />
                        }
                    />
                    <Row
                        label={t("settings.autoDownload.label")}
                        description={t("settings.autoDownload.description")}
                        control={
                            <Switch
                                checked={settings.launcherAutoDownloadUpdates}
                                onCheckedChange={v => set("launcherAutoDownloadUpdates", v)}
                            />
                        }
                    />
                    <Row
                        label={t("settings.checkUpdate.label")}
                        description={
                            updaterState
                                ? getLauncherUpdateBannerTitle(updaterState)
                                : t("settings.checkUpdate.description")
                        }
                        control={
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={checkUpdate.isPending || updaterState?.status === "downloading"}
                                onClick={() => checkUpdate.mutate(true)}
                            >
                                <DownloadCloud
                                    size={14}
                                    className={checkUpdate.isPending ? "animate-spin" : undefined}
                                />
                                {checkUpdate.isPending ? t("settings.checkUpdate.checking") : t("settings.checkUpdate.action")}
                            </Button>
                        }
                    />
                    <Row
                        label={t("settings.refresh.label")}
                        description={t("settings.refresh.description")}
                        control={
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={refreshManifest.isPending}
                                onClick={() => refreshManifest.mutate()}
                            >
                                <RefreshCw
                                    size={14}
                                    className={refreshManifest.isPending ? "animate-spin" : undefined}
                                />
                                {refreshManifest.isPending ? t("settings.refresh.refreshing") : t("settings.refresh.action")}
                            </Button>
                        }
                    />
                </Group>

                <AccountGroup />

                <Group title={t("settings.group.launch")}>
                    <Row
                        label={t("settings.melonConsole.label")}
                        description={t("settings.melonConsole.description")}
                        control={
                            <Switch
                                checked={settings.launchShowMelonConsole}
                                onCheckedChange={v => set("launchShowMelonConsole", v)}
                            />
                        }
                    />
                    <Row
                        label={t("settings.autoplayVideos.label")}
                        description={t("settings.autoplayVideos.description")}
                        control={
                            <Switch
                                checked={settings.launchAutoplayVideos}
                                onCheckedChange={v => set("launchAutoplayVideos", v)}
                            />
                        }
                    />
                </Group>

                <Group title={t("settings.group.storage")}>
                    <Row
                        label={t("settings.instancesFolder.label")}
                        description={t("settings.instancesFolder.description")}
                        align="start"
                        control={
                            <div className="flex w-72 items-center gap-2">
                                <InputWell value={settings.instancesRoot} readOnly className="flex-1 font-mono text-xs" />
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={chooseInstancesRoot}
                                    title={t("settings.chooseFolder")}
                                    aria-label={t("settings.chooseFolder")}
                                >
                                    <FolderOpen size={16} />
                                </Button>
                            </div>
                        }
                    />
                </Group>

                <Group title={t("settings.group.manifest")}>
                    <Row
                        label={t("settings.manifestUrl.label")}
                        description={t("settings.manifestUrl.description")}
                        align="start"
                        control={
                            <InputWell
                                defaultValue={settings.manifestUrl}
                                onBlur={e => {
                                    const next = e.target.value.trim();
                                    if (next && next !== settings.manifestUrl) set("manifestUrl", next);
                                }}
                                className="w-72 font-mono text-xs"
                            />
                        }
                    />
                    <Row
                        label={t("settings.githubToken.label")}
                        description={t("settings.githubToken.description")}
                        align="start"
                        control={
                            <InputWell
                                type="password"
                                autoComplete="off"
                                spellCheck={false}
                                placeholder={t("settings.githubToken.placeholder")}
                                defaultValue={settings.githubToken}
                                onBlur={e => {
                                    const next = e.target.value.trim();
                                    if (next !== settings.githubToken) set("githubToken", next);
                                }}
                                className="w-72 font-mono text-xs"
                            />
                        }
                    />
                </Group>

                <Group title={t("settings.group.motion")}>
                    <Row
                        label={t("settings.motion.label")}
                        description={t("settings.motion.description")}
                        control={
                            <Switch
                                checked={settings.uiMotionEnabled}
                                onCheckedChange={v => set("uiMotionEnabled", v)}
                            />
                        }
                    />
                </Group>

                <Group title={t("settings.group.display")}>
                    <Row
                        label={t("settings.uiScale.label")}
                        description={t("settings.uiScale.description")}
                        align="start"
                        control={
                            <ScaleSlider />
                        }
                    />
                </Group>

                <Group title={t("settings.group.startupWindow")}>
                    <Row
                        label={t("settings.tray.label")}
                        description={t("settings.tray.description")}
                        control={
                            <Switch
                                checked={settings.closeToTrayEnabled}
                                onCheckedChange={v => set("closeToTrayEnabled", v)}
                            />
                        }
                    />
                </Group>

                <Group title={t("settings.group.security")}>
                    <Row
                        label={t("settings.resetTools.label")}
                        description={t("settings.resetTools.description")}
                        control={
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => set("toolsUnlocked", false)}
                                disabled={!settings.toolsUnlocked}
                            >
                                {t("settings.resetTools.action")}
                            </Button>
                        }
                    />
                </Group>

                <Group title={t("settings.group.migration")}>
                    <Row
                        label={t("settings.migration.label")}
                        description={t("settings.migration.description")}
                        align="start"
                        control={
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={migrating}
                                onClick={migrateV3}
                            >
                                <DownloadCloud size={14} className={migrating ? "animate-spin" : undefined} />
                                {migrating ? t("settings.migration.importing") : t("settings.migration.action")}
                            </Button>
                        }
                    />
                </Group>
            </div>
        </div>
    );
}
