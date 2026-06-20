import { X, Download, RefreshCw } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Progress } from "../../components/ui/progress";
import { useShellStore } from "../stores/useShellStore";
import { useUpdaterState, useDownloadAndInstallUpdate } from "../query/hooks";
import {
    shouldShowLauncherUpdateBanner,
    getLauncherUpdateBannerTitle,
    getLauncherUpdatePrimaryAction,
    getLauncherUpdateProgressText,
} from "../../helpers/launcher-update-ui";

export function UpdateBanner() {
    const { data: state } = useUpdaterState();
    const dismissed = useShellStore(s => s.updateBannerDismissed);
    const dismiss = useShellStore(s => s.dismissUpdateBanner);
    const downloadAndInstall = useDownloadAndInstallUpdate();

    if (dismissed || !shouldShowLauncherUpdateBanner(state ?? null)) {
        return null;
    }

    const action = getLauncherUpdatePrimaryAction(state ?? null);
    const progressText = getLauncherUpdateProgressText(state ?? null);
    const downloading = state?.status === "downloading";

    return (
        <div className="flex items-center gap-3 border-b border-border bg-accent/10 px-4 py-2">
            <RefreshCw size={16} className="shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                    {getLauncherUpdateBannerTitle(state ?? null)}
                </p>
                {downloading && (
                    <div className="mt-1 flex items-center gap-2">
                        <Progress value={state?.progressPercent ?? 0} className="h-2 max-w-xs" />
                        {progressText && <span className="text-[10px] text-muted-foreground">{progressText}</span>}
                    </div>
                )}
            </div>
            {action.kind && (
                <Button
                    size="sm"
                    variant="default"
                    disabled={action.disabled}
                    onClick={() => downloadAndInstall.mutate(false)}
                >
                    <Download size={14} /> {action.label}
                </Button>
            )}
            <button
                onClick={dismiss}
                className="focus-ring shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Dismiss"
                aria-label="Dismiss update banner"
            >
                <X size={16} />
            </button>
        </div>
    );
}
