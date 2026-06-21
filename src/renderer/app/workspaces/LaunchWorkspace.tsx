import { useEffect, useRef, useState } from "react";
import { Play, Square, Terminal, Boxes } from "lucide-react";
import { SectionHeading } from "../../components/brand/SectionHeading";
import { BapCard } from "../../components/brand/BapCard";
import { BapButton } from "../../components/brand/BapButton";
import { StatusChip, type StatusTone } from "../../components/brand/StatusChip";
import { Badge } from "../../components/ui/badge";
import { ScrollArea } from "../../components/ui/scroll-area";
import { cn } from "../lib/utils";
import { useShellStore } from "../stores/useShellStore";
import {
    useInstances,
    useRuntimeState,
    useRuntimeLog,
    useStartLaunch,
    useStopLaunch,
    useSettings,
    useSetSetting,
} from "../query/hooks";
import { getLaunchRuntimeLabel } from "../../helpers/launch-ui";

const LAUNCH_ACCENT = "#22d3ee";
const STOP_ACCENT = "#ff2e2e";

export function LaunchWorkspace() {
    const { data: instances } = useInstances();
    const { data: runtime } = useRuntimeState();
    const { data: log } = useRuntimeLog();
    const { data: settings } = useSettings();
    const startLaunch = useStartLaunch();
    const stopLaunch = useStopLaunch();
    const setSetting = useSetSetting();
    const setActiveWorkspace = useShellStore(s => s.setActiveWorkspace);

    const defaultProfileId = settings?.launchDefaultProfileId ?? null;
    const [selectedId, setSelectedId] = useState<string | null>(defaultProfileId);

    useEffect(() => {
        if (!selectedId && instances && instances.length > 0) {
            setSelectedId(defaultProfileId ?? instances[0].id);
        }
    }, [instances, defaultProfileId, selectedId]);

    const status = runtime?.status ?? "idle";
    const isBusy = status === "launching" || status === "stopping";
    const isRunning = status === "running";
    const statusTone: StatusTone = isRunning ? "active" : isBusy ? "busy" : status === "failed" ? "error" : "idle";

    const logViewport = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = logViewport.current?.querySelector("[data-radix-scroll-area-viewport]");
        if (el) el.scrollTop = el.scrollHeight;
    }, [log]);

    function handleLaunch() {
        if (!selectedId) return;
        startLaunch.mutate({
            instanceId: selectedId,
            showMelonConsole: settings?.launchShowMelonConsole ?? false,
        });
    }

    return (
        <div className="bap-glow flex h-full flex-col overflow-hidden px-8 pb-8 pt-20">
            <SectionHeading eyebrow="Play" subtitle="Pick a profile, launch the game, and watch live runtime logs.">
                Start
            </SectionHeading>

            {instances && instances.length === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center">
                    <BapCard className="flex max-w-md flex-col items-center gap-4 p-10 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
                            <Boxes size={26} className="text-accent" />
                        </div>
                        <div>
                            <h2 className="font-display text-lg text-foreground">No profiles yet</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Install a game version or bundle to create your first profile, then come back here to play.
                            </p>
                        </div>
                        <BapButton
                            onClick={() => setActiveWorkspace("instances")}
                            icon={Boxes}
                            showChevron={false}
                        >
                            Go to Instances
                        </BapButton>
                    </BapCard>
                </div>
            ) : (
            <div className="flex min-h-0 flex-1 gap-6">
                {/* Profile picker + controls */}
                <div className="flex w-80 shrink-0 flex-col gap-3">
                    <div className="flex flex-col gap-2 overflow-auto pr-1">
                        {instances?.map(instance => {
                            const active = selectedId === instance.id;
                            const isDefault = defaultProfileId === instance.id;
                            return (
                                <BapCard
                                    key={instance.id}
                                    interactive
                                    onClick={() => setSelectedId(instance.id)}
                                    className={cn("p-3", active && "ring-2 ring-accent")}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-display text-sm text-foreground">
                                            {instance.profileName}
                                        </span>
                                        {isDefault && <Badge variant="accent">default</Badge>}
                                    </div>
                                    <p className="mt-1 truncate text-xs text-muted-foreground">
                                        {instance.versionId}
                                    </p>
                                </BapCard>
                            );
                        })}
                        {instances && instances.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                                No profiles yet — install a version first.
                            </p>
                        )}
                    </div>

                    <div className="mt-auto flex flex-col gap-2">
                        <StatusChip
                            tone={statusTone}
                            label={getLaunchRuntimeLabel(runtime ?? { status: "idle" })}
                            pulse={isRunning || isBusy}
                            className="w-fit"
                        />
                        {isRunning || isBusy ? (
                            <BapButton
                                onClick={() => stopLaunch.mutate()}
                                icon={Square}
                                accentColor={STOP_ACCENT}
                                showChevron={false}
                                disabled={status === "stopping"}
                            >
                                Stop
                            </BapButton>
                        ) : (
                            <BapButton
                                onClick={handleLaunch}
                                icon={Play}
                                accentColor={LAUNCH_ACCENT}
                                showChevron={false}
                                disabled={!selectedId}
                                magnetic
                                glow
                            >
                                Launch
                            </BapButton>
                        )}
                        {selectedId && defaultProfileId !== selectedId && (
                            <button
                                onClick={() =>
                                    setSetting.mutate({ key: "launchDefaultProfileId", value: selectedId })
                                }
                                className="focus-ring text-xs text-muted-foreground hover:text-accent"
                            >
                                Set as default profile
                            </button>
                        )}
                    </div>
                </div>

                {/* Live log stream */}
                <BapCard className="flex min-h-0 flex-1 flex-col overflow-hidden bg-popover p-0">
                    <div className="flex items-center gap-2 border-b border-border px-4 py-2">
                        <Terminal size={16} className="text-accent" />
                        <span className="font-display text-xs text-foreground">Runtime log</span>
                    </div>
                    <ScrollArea ref={logViewport} className="flex-1">
                        <div className="p-4 font-mono text-xs leading-relaxed text-foreground/85">
                            {(!log || log.length === 0) && (
                                <p className="text-muted-foreground">No output yet.</p>
                            )}
                            {log?.map(entry => (
                                <div
                                    key={entry.id}
                                    className={cn(
                                        "whitespace-pre-wrap",
                                        entry.stream === "stderr" && "text-destructive",
                                        entry.stream === "system" && "text-accent"
                                    )}
                                >
                                    {entry.message}
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </BapCard>
            </div>
            )}
        </div>
    );
}
