import { FolderOpen } from "lucide-react";
import { SectionHeading } from "../../components/brand/SectionHeading";
import { BapCard } from "../../components/brand/BapCard";
import { Switch } from "../../components/ui/switch";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { useSettings, useSetSetting } from "../query/hooks";
import { api } from "../../api";
import type { AppSettings } from "../../../shared/ipc";

type ToggleRowProps = {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (value: boolean) => void;
};

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
    return (
        <div className="flex items-center justify-between gap-4 py-2">
            <div>
                <p className="text-sm text-foreground">{label}</p>
                {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </div>
            <Switch checked={checked} onCheckedChange={onChange} />
        </div>
    );
}

export function SettingsWorkspace() {
    const { data: settings } = useSettings();
    const setSetting = useSetSetting();

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
        <div className="bap-glow relative h-full overflow-auto px-8 pb-8 pt-20">
            <SectionHeading eyebrow="Preferences" subtitle="Configure the launcher to your liking.">
                Settings
            </SectionHeading>

            <div className="flex max-w-2xl flex-col gap-6">
                <BapCard className="p-5">
                    <h2 className="font-display mb-3 text-xs tracking-[0.18em] text-muted-foreground">Updates</h2>
                    <ToggleRow
                        label="Automatic updates"
                        description="Check for launcher updates on startup."
                        checked={settings.launcherAutoUpdate}
                        onChange={v => set("launcherAutoUpdate", v)}
                    />
                    <ToggleRow
                        label="Auto-download updates"
                        description="Download updates in the background when available."
                        checked={settings.launcherAutoDownloadUpdates}
                        onChange={v => set("launcherAutoDownloadUpdates", v)}
                    />
                </BapCard>

                <BapCard className="p-5">
                    <h2 className="font-display mb-3 text-xs tracking-[0.18em] text-muted-foreground">Launch</h2>
                    <ToggleRow
                        label="Show MelonLoader console"
                        description="Open the MelonLoader console window when launching."
                        checked={settings.launchShowMelonConsole}
                        onChange={v => set("launchShowMelonConsole", v)}
                    />
                </BapCard>

                <BapCard className="p-5">
                    <h2 className="font-display mb-3 text-xs tracking-[0.18em] text-muted-foreground">Storage</h2>
                    <p className="mb-1 text-sm text-foreground">Instances folder</p>
                    <div className="flex items-center gap-2">
                        <Input value={settings.instancesRoot} readOnly className="flex-1" />
                        <Button variant="outline" size="icon" onClick={chooseInstancesRoot} title="Choose folder" aria-label="Choose instances folder">
                            <FolderOpen size={16} />
                        </Button>
                    </div>
                </BapCard>

                <BapCard className="p-5">
                    <h2 className="font-display mb-3 text-xs tracking-[0.18em] text-muted-foreground">Manifest source</h2>
                    <Input
                        defaultValue={settings.manifestUrl}
                        onBlur={e => {
                            const next = e.target.value.trim();
                            if (next && next !== settings.manifestUrl) set("manifestUrl", next);
                        }}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                        URL of the manifest index used to discover versions, mods, and bundles.
                    </p>
                </BapCard>

                <BapCard className="p-5">
                    <h2 className="font-display mb-3 text-xs tracking-[0.18em] text-muted-foreground">Motion &amp; effects</h2>
                    <ToggleRow
                        label="Enable motion"
                        description="Animate transitions and reveals (disable for calm mode)."
                        checked={settings.uiMotionEnabled}
                        onChange={v => set("uiMotionEnabled", v)}
                    />
                </BapCard>
            </div>
        </div>
    );
}
