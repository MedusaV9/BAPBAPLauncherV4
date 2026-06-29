import { useState, type ReactNode } from "react";
import { FolderOpen, User, RefreshCw, DownloadCloud } from "lucide-react";
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

function MetaChip({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center gap-2 rounded-[0.625rem] border border-border bg-popover px-2.5 py-1.5">
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
            <span className="font-mono text-[0.6875rem] text-foreground">{value}</span>
        </div>
    );
}

function ControlPanelHeader() {
    const { data: persona } = useSteamPersonaName();
    const { data: build } = useBuildInfo();
    const { data: instances } = useInstances();

    const name = persona?.trim() || "Player";
    const monogram = name.charAt(0).toUpperCase();
    const profileCount = instances?.length ?? 0;

    return (
        <div className="mb-8 flex flex-col gap-4 rounded-[1.125rem] border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-[var(--surface-inset)]">
                    {persona ? (
                        <span className="font-display text-base uppercase text-foreground">{monogram}</span>
                    ) : (
                        <User size={20} className="text-muted-foreground" />
                    )}
                </div>
                <div className="min-w-0">
                    <h1 className="truncate font-display text-lg uppercase leading-tight text-foreground">{name}</h1>
                    <p className="font-mono text-xs text-muted-foreground">
                        {persona ? "Signed in via Steam" : "No Steam profile detected"}
                    </p>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {build?.appVersion && <MetaChip label="Build" value={`v${build.appVersion}`} />}
                <MetaChip label="Profiles" value={String(profileCount)} />
            </div>
        </div>
    );
}

function Group({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-3">
            <div className="px-1">
                <h2 className="font-display text-xs uppercase tracking-[0.1em] text-foreground">{title}</h2>
                {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
            </div>
            <div className="overflow-hidden rounded-[1.125rem] border border-border bg-card divide-y divide-border px-4">
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
            <Row
                label={t("settings.language.label")}
                description={t("settings.language.description")}
                align="start"
                control={
                    <div className="flex flex-col gap-1.5">
                        {LANGUAGES.map(lang => {
                            const active = lang.code === current;
                            return (
                                <button
                                    key={lang.code}
                                    type="button"
                                    onClick={() =>
                                        setSetting.mutate({ key: "language", value: lang.code } as Parameters<typeof setSetting.mutate>[0])
                                    }
                                    className={`focus-ring flex w-44 items-center gap-2.5 rounded-[0.625rem] border px-3 py-2 text-sm transition-colors ${
                                        active
                                            ? "border-accent bg-accent/10 text-foreground"
                                            : "border-input bg-[var(--surface-inset)] text-muted-foreground hover:border-white/20"
                                    }`}
                                    aria-pressed={active}
                                >
                                    <LanguageFlag code={lang.code} />
                                    <span>{lang.name}</span>
                                </button>
                            );
                        })}
                    </div>
                }
            />
            <Row
                label=""
                description={t("settings.language.aiWarning")}
                control={null}
            />
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
                <p className="text-sm text-muted-foreground">Loading settings…</p>
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
        <div className="bap-glow relative h-full overflow-auto px-8 pb-8 pt-16">
            <ControlPanelHeader />

            <div className="flex max-w-2xl flex-col gap-7">
                <Group title="Updates">
                    <Row
                        label="Automatic updates"
                        description="Check for launcher updates on startup."
                        control={
                            <Switch
                                checked={settings.launcherAutoUpdate}
                                onCheckedChange={v => set("launcherAutoUpdate", v)}
                            />
                        }
                    />
                    <Row
                        label="Auto-download updates"
                        description="Download updates in the background when available."
                        control={
                            <Switch
                                checked={settings.launcherAutoDownloadUpdates}
                                onCheckedChange={v => set("launcherAutoDownloadUpdates", v)}
                            />
                        }
                    />
                    <Row
                        label="Check for launcher updates"
                        description={
                            updaterState
                                ? getLauncherUpdateBannerTitle(updaterState)
                                : "Look for a newer launcher version now."
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
                                {checkUpdate.isPending ? "Checking…" : "Check now"}
                            </Button>
                        }
                    />
                    <Row
                        label="Refresh content library"
                        description="Re-fetch the manifest (versions, mods, bundles) from the source."
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
                                {refreshManifest.isPending ? "Refreshing…" : "Refresh"}
                            </Button>
                        }
                    />
                </Group>

                <Group title="Launch">
                    <Row
                        label="Show MelonLoader console"
                        description="Open the MelonLoader console window when launching."
                        control={
                            <Switch
                                checked={settings.launchShowMelonConsole}
                                onCheckedChange={v => set("launchShowMelonConsole", v)}
                            />
                        }
                    />
                    <Row
                        label="Autoplay background videos"
                        description="Play the animated mode video on the Start tab (disable for a static image)."
                        control={
                            <Switch
                                checked={settings.launchAutoplayVideos}
                                onCheckedChange={v => set("launchAutoplayVideos", v)}
                            />
                        }
                    />
                </Group>

                <Group title="Storage">
                    <Row
                        label="Instances folder"
                        description="Where game versions and profiles are installed."
                        align="start"
                        control={
                            <div className="flex w-72 items-center gap-2">
                                <InputWell value={settings.instancesRoot} readOnly className="flex-1 font-mono text-xs" />
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={chooseInstancesRoot}
                                    title="Choose folder"
                                    aria-label="Choose instances folder"
                                >
                                    <FolderOpen size={16} />
                                </Button>
                            </div>
                        }
                    />
                </Group>

                <Group title="Manifest source">
                    <Row
                        label="Manifest URL"
                        description="Source for versions, mods, and bundles."
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
                </Group>

                <Group title="Motion & effects">
                    <Row
                        label="Enable motion"
                        description="Animate transitions and reveals (disable for calm mode)."
                        control={
                            <Switch
                                checked={settings.uiMotionEnabled}
                                onCheckedChange={v => set("uiMotionEnabled", v)}
                            />
                        }
                    />
                </Group>

                <Group title="Display">
                    <Row
                        label="UI scale"
                        description="Make the interface larger or smaller."
                        align="start"
                        control={
                            <ScaleSlider />
                        }
                    />
                </Group>

                <LanguageGroup />

                <Group title="Startup & window">
                    <Row
                        label="Minimize to tray on close"
                        description="Closing the window keeps it running in the system tray. Right-click the tray icon to quit."
                        control={
                            <Switch
                                checked={settings.closeToTrayEnabled}
                                onCheckedChange={v => set("closeToTrayEnabled", v)}
                            />
                        }
                    />
                </Group>

                <Group title="Security & tools">
                    <Row
                        label="Reset Tools access"
                        description="Reset Tools unlock state."
                        control={
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => set("toolsUnlocked", false)}
                                disabled={!settings.toolsUnlocked}
                            >
                                Reset tools
                            </Button>
                        }
                    />
                </Group>

                <Group title="Migration">
                    <Row
                        label="Import V3 instances"
                        description="Copy profiles from the legacy BAPBAP Launcher (V3) into this version. Installed mod files are preserved and will be recognized after re-syncing the Mods tab."
                        align="start"
                        control={
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={migrating}
                                onClick={migrateV3}
                            >
                                <DownloadCloud size={14} className={migrating ? "animate-spin" : undefined} />
                                {migrating ? "Importing…" : "Import V3 profiles"}
                            </Button>
                        }
                    />
                </Group>
            </div>
        </div>
    );
}
