import { useEffect, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { BapCard } from "../../components/brand/BapCard";
import { InputWell } from "../../components/brand/InputWell";
import { Button } from "../../components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { RebalanceEmbedPanel } from "../../components/tools/RebalanceEmbedPanel";
import { ConfigEditorPanel } from "../../components/tools/ConfigEditorPanel";
import { cn } from "../lib/utils";
import { useT } from "../i18n";
import { useSettings, useUnlockTools, useInstances } from "../query/hooks";

function UnlockGate() {
    const t = useT();
    const unlockTools = useUnlockTools();
    const [code, setCode] = useState("");
    const [error, setError] = useState(false);

    async function submit() {
        setError(false);
        const ok = await unlockTools.mutateAsync(code);
        if (!ok) {
            setError(true);
            setCode("");
        }
    }

    return (
        <div className="bap-dotgrid relative flex h-full items-center justify-center overflow-hidden p-8">
            <div
                className="pointer-events-none absolute inset-0"
                style={{ background: "radial-gradient(60% 50% at 50% 38%, rgba(233,30,140,0.10), transparent 70%)" }}
            />
            <div className="relative w-full max-w-[460px]">
                <BapCard className="relative flex flex-col items-center gap-6 p-10 text-center shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]">
                    <div className="relative flex h-16 w-16 items-center justify-center">
                        <span className="absolute inset-0 rounded-full border-2 border-gold/20" />
                        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-[var(--surface-inset)]">
                            <Lock size={28} className="text-gold" />
                        </span>
                    </div>
                    <div>
                        <h2 className="font-display text-xl uppercase tracking-[0.04em] text-foreground">{t("tools.restrictedAccessHeading")}</h2>
                    </div>
                    <div className={cn("w-full", error && "bap-shake")}>
                        <InputWell
                            value={code}
                            onChange={e => {
                                setCode(e.target.value);
                                if (error) setError(false);
                            }}
                            onKeyDown={e => e.key === "Enter" && submit()}
                            placeholder={t("tools.enterUnlockCodePlaceholder")}
                            type="password"
                            autoFocus
                            className={cn(
                                "h-12 text-center font-mono text-lg tracking-[0.42em]",
                                error && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25"
                            )}
                        />
                        <p className={cn("mt-2 h-4 text-center font-mono text-xs text-destructive transition-opacity", error ? "opacity-100" : "opacity-0")}>
                            {t("tools.invalidUnlockCodeError")}
                        </p>
                    </div>
                    <Button
                        variant="pop"
                        className="w-full"
                        onClick={submit}
                        disabled={!code || unlockTools.isPending}
                    >
                        <ShieldCheck size={16} /> {t("tools.unlockButton")}
                    </Button>
                </BapCard>
            </div>
        </div>
    );
}

export function ToolsWorkspace() {
    const t = useT();
    const { data: settings, isLoading: settingsLoading } = useSettings();
    const { data: instances } = useInstances();
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        if (!instances || instances.length === 0) {
            if (selectedId) setSelectedId(null);
            return;
        }
        if (!selectedId || !instances.some(i => i.id === selectedId)) {
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
        <div className="bap-glow flex h-full flex-col overflow-hidden px-8 pb-8 pt-16">
            {/* Workbench header */}
            <div className="mb-4 flex flex-col gap-4 rounded-[1.125rem] border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <h1 className="font-display text-lg uppercase leading-tight text-foreground">{t("tools.heading")}</h1>
                    <p className="text-xs text-muted-foreground">{t("tools.subtitle")}</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 rounded-[0.625rem] border border-accent/30 bg-accent/10 px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-accent">
                        <ShieldCheck size={12} /> {t("tools.unlockedStatus")}
                    </span>
                    <select
                        value={selectedId ?? ""}
                        onChange={e => setSelectedId(e.target.value)}
                        aria-label={t("tools.profileLabel")}
                        className="focus-ring h-10 rounded-[0.625rem] border border-input bg-[var(--surface-inset)] px-3 text-sm text-foreground transition-colors hover:border-white/20"
                    >
                        {instances?.map(i => (
                            <option key={i.id} value={i.id}>
                                {i.profileName}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="min-h-0 flex-1">
                {selected ? (
                    <Tabs defaultValue="rebalance" className="flex h-full flex-col">
                        <TabsList className="h-auto justify-start gap-1 rounded-none border-0 border-b border-border bg-transparent p-0">
                            <TabsTrigger
                                value="rebalance"
                                className="rounded-none border-b-2 border-transparent bg-transparent px-3 pb-2.5 pt-1 font-medium text-muted-foreground data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground"
                            >
                                {t("tools.rebalanceStudioTab")}
                            </TabsTrigger>
                            <TabsTrigger
                                value="config"
                                className="rounded-none border-b-2 border-transparent bg-transparent px-3 pb-2.5 pt-1 font-medium text-muted-foreground data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground"
                            >
                                {t("tools.configEditorTab")}
                            </TabsTrigger>
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
                        {t("tools.emptyStateMessage")}
                    </BapCard>
                )}
            </div>
        </div>
    );
}
