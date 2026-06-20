import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { SectionHeading } from "../../components/brand/SectionHeading";
import { BapCard } from "../../components/brand/BapCard";
import { BapButton } from "../../components/brand/BapButton";
import { Input } from "../../components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { RebalanceEmbedPanel } from "../../components/tools/RebalanceEmbedPanel";
import { ConfigEditorPanel } from "../../components/tools/ConfigEditorPanel";
import { useSettings, useUnlockTools, useInstances } from "../query/hooks";

function UnlockGate() {
    const unlockTools = useUnlockTools();
    const [code, setCode] = useState("");
    const [error, setError] = useState(false);

    async function submit() {
        setError(false);
        const ok = await unlockTools.mutateAsync(code);
        if (!ok) setError(true);
    }

    return (
        <div className="bap-glow relative flex h-full items-center justify-center overflow-hidden p-8">
            <BapCard className="relative flex w-full max-w-sm flex-col items-center gap-4 p-8 text-center">
                <span className="absolute -top-3 right-6 rounded-full border border-border bg-secondary px-3 py-1 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                    Locked
                </span>
                <Lock size={28} className="text-accent" />
                <div>
                    <h2 className="font-display text-lg text-foreground">Tools are locked</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Enter the unlock code to continue.</p>
                </div>
                <Input
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && submit()}
                    placeholder="Unlock code"
                    type="password"
                    className={error ? "border-destructive" : ""}
                />
                {error && <p className="text-xs text-destructive">That code didn't work.</p>}
                <BapButton onClick={submit} showChevron={false} disabled={!code || unlockTools.isPending}>
                    Unlock
                </BapButton>
            </BapCard>
        </div>
    );
}

export function ToolsWorkspace() {
    const { data: settings, isLoading: settingsLoading } = useSettings();
    const { data: instances } = useInstances();
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        if (!selectedId && instances && instances.length > 0) {
            setSelectedId(instances[0].id);
        }
    }, [instances, selectedId]);

    // Wait for settings before deciding lock state, otherwise the UnlockGate
    // flashes for a frame on every mount while the query resolves.
    if (settingsLoading || !settings) {
        return null;
    }

    if (!settings.toolsUnlocked) {
        return <UnlockGate />;
    }

    const selected = instances?.find(i => i.id === selectedId) ?? null;

    return (
        <div className="bap-glow flex h-full flex-col overflow-hidden p-8">
            <div className="mb-4 flex items-center justify-between gap-4">
                <SectionHeading eyebrow="Studio" className="mb-0" subtitle="Rebalance Studio — author and tune content packs.">
                    Tools
                </SectionHeading>
                <select
                    value={selectedId ?? ""}
                    onChange={e => setSelectedId(e.target.value)}
                    aria-label="Profile"
                    className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {instances?.map(i => (
                        <option key={i.id} value={i.id}>
                            {i.profileName}
                        </option>
                    ))}
                </select>
            </div>

            <div className="min-h-0 flex-1">
                {selected ? (
                    <Tabs defaultValue="rebalance" className="flex h-full flex-col">
                        <TabsList>
                            <TabsTrigger value="rebalance">Rebalance Studio</TabsTrigger>
                            <TabsTrigger value="config">Config editor</TabsTrigger>
                        </TabsList>
                        <TabsContent value="rebalance" className="min-h-0 flex-1">
                            <RebalanceEmbedPanel key={selected.id} selectedInstance={selected} />
                        </TabsContent>
                        <TabsContent value="config" className="min-h-0 flex-1">
                            <ConfigEditorPanel key={selected.id} instanceId={selected.id} />
                        </TabsContent>
                    </Tabs>
                ) : (
                    <BapCard className="p-6 text-sm text-muted-foreground">
                        Install an instance to use these tools.
                    </BapCard>
                )}
            </div>
        </div>
    );
}
