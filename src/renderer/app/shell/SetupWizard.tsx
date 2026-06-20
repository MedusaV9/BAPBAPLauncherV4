import { useState } from "react";
import { FolderOpen, Sparkles } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import { Button } from "../../components/ui/button";
import { BapButton } from "../../components/brand/BapButton";
import { useSettings, useSetSetting } from "../query/hooks";
import { api } from "../../api";
import { CURRENT_SETUP_VERSION } from "../../../shared/setup";

export function SetupWizard() {
    const { data: settings } = useSettings();
    const setSetting = useSetSetting();

    const [instancesRoot, setInstancesRoot] = useState<string | null>(null);
    const [autoUpdate, setAutoUpdate] = useState(true);
    const [motionEnabled, setMotionEnabled] = useState(true);
    const [finishing, setFinishing] = useState(false);

    if (!settings) return null;
    const needsSetup =
        !settings.uiOnboardingCompleted || settings.setupVersionCompleted < CURRENT_SETUP_VERSION;
    if (!needsSetup) return null;

    const effectiveRoot = instancesRoot ?? settings.instancesRoot;

    async function chooseFolder() {
        const dir = await api.dialog.chooseDirectory({ title: "Choose instances folder" });
        if (dir) setInstancesRoot(dir);
    }

    async function finish() {
        setFinishing(true);
        try {
            if (instancesRoot && instancesRoot !== settings!.instancesRoot) {
                await setSetting.mutateAsync({ key: "instancesRoot", value: instancesRoot });
            }
            await setSetting.mutateAsync({ key: "launcherAutoUpdate", value: autoUpdate });
            await setSetting.mutateAsync({ key: "uiMotionEnabled", value: motionEnabled });
            await setSetting.mutateAsync({ key: "uiOnboardingCompleted", value: true });
            await setSetting.mutateAsync({ key: "setupVersionCompleted", value: CURRENT_SETUP_VERSION });
        } finally {
            setFinishing(false);
        }
    }

    return (
        <Dialog open>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <div className="mb-1 flex items-center gap-2">
                        <Sparkles size={20} className="text-accent" />
                        <DialogTitle>Welcome to BAPBAP</DialogTitle>
                    </div>
                    <DialogDescription>
                        A couple of quick choices and you're ready to mod.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 py-2">
                    <div>
                        <p className="mb-1 text-sm text-foreground">Instances folder</p>
                        <div className="flex items-center gap-2">
                            <Input value={effectiveRoot} readOnly className="flex-1 text-xs" />
                            <Button variant="outline" size="icon" onClick={chooseFolder} title="Choose folder">
                                <FolderOpen size={16} />
                            </Button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-sm text-foreground">Automatic updates</p>
                            <p className="text-xs text-muted-foreground">Keep the launcher up to date.</p>
                        </div>
                        <Switch checked={autoUpdate} onCheckedChange={setAutoUpdate} />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-sm text-foreground">Motion &amp; effects</p>
                            <p className="text-xs text-muted-foreground">Animate transitions (off for calm mode).</p>
                        </div>
                        <Switch checked={motionEnabled} onCheckedChange={setMotionEnabled} />
                    </div>
                </div>

                <div className="flex justify-end">
                    <BapButton onClick={finish} showChevron={false} disabled={finishing}>
                        Get started
                    </BapButton>
                </div>
            </DialogContent>
        </Dialog>
    );
}
