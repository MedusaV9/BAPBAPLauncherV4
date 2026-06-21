import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Check, Power, X, Package as PackageIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { SectionHeading } from "../../components/brand/SectionHeading";
import { BapCard } from "../../components/brand/BapCard";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ModSetsBar } from "../../components/mods/ModSetsBar";
import { cn } from "../lib/utils";
import {
    useInstances,
    useManifestIndex,
    usePackages,
    useContentStates,
    useInstallContent,
    useUninstallContent,
    useSetContentEnabled,
    useBulkApply,
} from "../query/hooks";
import { containerVariants, itemUp } from "../../motion";
import type { ContentInstallState, ContentBulkAction } from "../../../shared/ipc";
import type { PackageCard } from "../../../shared/manifest";

function stateLabel(state: ContentInstallState | undefined): { text: string; variant: "secondary" | "accent" | "outline" } {
    switch (state?.status) {
        case "installed-enabled":
            return { text: "Enabled", variant: "accent" };
        case "installed-disabled":
            return { text: "Disabled", variant: "outline" };
        case "partial":
            return { text: "Partial", variant: "outline" };
        default:
            return { text: "Not installed", variant: "secondary" };
    }
}

function ModArtwork({ pkg }: { pkg: PackageCard }) {
    const [failed, setFailed] = useState(false);
    const src = pkg.thumbnailPath || pkg.imagePath;
    if (!src || failed) {
        return (
            <div className="relative flex h-28 w-full items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-accent/25 via-purple/15 to-cyan/15 ring-1 ring-white/10">
                <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-accent/30 blur-2xl" />
                <PackageIcon size={28} className="relative text-foreground/70" />
            </div>
        );
    }
    return (
        <img
            src={src}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
            className="h-28 w-full rounded-lg object-cover ring-1 ring-white/10"
        />
    );
}

export function ModsWorkspace() {
    const { data: instances } = useInstances();
    const { data: manifestIndex } = useManifestIndex();
    const [instanceId, setInstanceId] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const reduceMotion = useReducedMotion();

    // Resolve the live channel from the manifest index rather than hardcoding —
    // the manifest declares "release", not "default", so a hardcoded id returned
    // zero mods in the real app.
    const channelId = useMemo(() => {
        const channels = manifestIndex?.channels ?? [];
        return channels.find(c => c.enabled !== false)?.id ?? channels[0]?.id ?? "release";
    }, [manifestIndex]);

    useEffect(() => {
        if (!instanceId && instances && instances.length > 0) {
            setInstanceId(instances[0].id);
        }
    }, [instances, instanceId]);

    // Selection is per-instance; reset when switching profiles.
    useEffect(() => {
        setSelected(new Set());
    }, [instanceId]);

    const { data: packages, isLoading } = usePackages(channelId);
    const { data: states } = useContentStates(instanceId ?? undefined);
    const installContent = useInstallContent();
    const uninstallContent = useUninstallContent();
    const setEnabled = useSetContentEnabled();
    const bulkApply = useBulkApply();

    const filtered = useMemo(() => {
        if (!packages) return [];
        const q = query.trim().toLowerCase();
        if (!q) return packages;
        return packages.filter(
            p =>
                p.name.toLowerCase().includes(q) ||
                p.summary?.toLowerCase().includes(q) ||
                p.tags?.some(t => t.toLowerCase().includes(q))
        );
    }, [packages, query]);

    function toggleSelected(packageId: string) {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(packageId)) {
                next.delete(packageId);
            } else {
                next.add(packageId);
            }
            return next;
        });
    }

    function runBulk(action: ContentBulkAction) {
        if (!instanceId || selected.size === 0) return;
        const packageIds = [...selected];
        const versionByPackage: Record<string, string> = {};
        for (const id of packageIds) {
            const version = packages?.find(p => p.id === id)?.latestVersion;
            if (version) versionByPackage[id] = version;
        }
        bulkApply.mutate(
            { instanceId, channelId, packageIds, action, versionByPackage },
            { onSuccess: () => setSelected(new Set()) }
        );
    }

    return (
        <div className="bap-glow relative flex h-full flex-col overflow-hidden px-8 pb-8 pt-20">
            <SectionHeading eyebrow="Catalog" subtitle="Browse the catalog and manage mods per profile.">
                Mods
            </SectionHeading>

            <div className="mb-4 flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search mods…"
                        aria-label="Search mods"
                        className="pl-9"
                    />
                </div>
                <select
                    value={instanceId ?? ""}
                    onChange={e => setInstanceId(e.target.value)}
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

            {instanceId && <ModSetsBar instanceId={instanceId} />}

            {isLoading && <p className="text-sm text-muted-foreground">Loading catalog…</p>}

            {!isLoading && filtered.length === 0 && (
                <BapCard className="mb-4 p-6 text-sm text-muted-foreground">
                    No mods match that search. Try a different name, tag, or description.
                </BapCard>
            )}

            {selected.size > 0 && (
                <div className="glass mb-4 flex items-center gap-3 rounded-xl p-3">
                    <span className="font-display text-xs text-foreground">{selected.size} selected</span>
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="default" disabled={bulkApply.isPending} onClick={() => runBulk("install")}>
                            Install
                        </Button>
                        <Button size="sm" variant="secondary" disabled={bulkApply.isPending} onClick={() => runBulk("enable")}>
                            Enable
                        </Button>
                        <Button size="sm" variant="outline" disabled={bulkApply.isPending} onClick={() => runBulk("disable")}>
                            Disable
                        </Button>
                        <Button size="sm" variant="ghost" disabled={bulkApply.isPending} onClick={() => runBulk("uninstall")}>
                            Uninstall
                        </Button>
                    </div>
                    <button
                        onClick={() => setSelected(new Set())}
                        className="focus-ring ml-auto rounded p-1 text-muted-foreground hover:text-foreground"
                        title="Clear selection"
                        aria-label="Clear selection"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            <motion.div
                className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-3"
                variants={reduceMotion ? undefined : containerVariants}
                initial={reduceMotion ? undefined : "hidden"}
                animate={reduceMotion ? undefined : "show"}
            >
                {filtered.map(pkg => {
                    const state = states?.[pkg.id];
                    const label = stateLabel(state);
                    const installed = state?.status === "installed-enabled" || state?.status === "installed-disabled";
                    const enabled = state?.status === "installed-enabled";
                    const version = pkg.latestVersion ?? "";
                    const isSelected = selected.has(pkg.id);

                    return (
                        <motion.div key={pkg.id} variants={reduceMotion ? undefined : itemUp}>
                        <BapCard
                            className={cn("flex h-full flex-col gap-3 p-4", isSelected && "ring-2 ring-accent")}
                        >
                            <ModArtwork pkg={pkg} />
                            <div className="flex items-start justify-between gap-2">
                                <label className="flex min-w-0 items-start gap-2">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleSelected(pkg.id)}
                                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#e91e8c]"
                                    />
                                    <h2 className="font-display text-sm leading-tight text-foreground">{pkg.name}</h2>
                                </label>
                                <Badge variant={label.variant}>{label.text}</Badge>
                            </div>
                            {pkg.summary && (
                                <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{pkg.summary}</p>
                            )}
                            {version && (
                                <p className="text-[0.7rem] uppercase tracking-wide text-muted-foreground/70">v{version}</p>
                            )}
                            <div className="mt-auto flex items-center gap-2 pt-1">
                                {!installed ? (
                                    <Button
                                        size="sm"
                                        variant="default"
                                        disabled={!instanceId || !version}
                                        onClick={() =>
                                            instanceId &&
                                            installContent.mutate({
                                                instanceId,
                                                channelId,
                                                packageId: pkg.id,
                                                version,
                                            })
                                        }
                                    >
                                        <Plus size={14} /> Install
                                    </Button>
                                ) : (
                                    <>
                                        <Button
                                            size="sm"
                                            variant={enabled ? "secondary" : "outline"}
                                            disabled={!instanceId}
                                            onClick={() =>
                                                instanceId &&
                                                setEnabled.mutate({
                                                    instanceId,
                                                    channelId,
                                                    packageId: pkg.id,
                                                    enabled: !enabled,
                                                })
                                            }
                                        >
                                            {enabled ? <Check size={14} /> : <Power size={14} />}
                                            {enabled ? "Enabled" : "Enable"}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={!instanceId}
                                            onClick={() =>
                                                instanceId &&
                                                uninstallContent.mutate({
                                                    instanceId,
                                                    channelId,
                                                    packageId: pkg.id,
                                                })
                                            }
                                        >
                                            Remove
                                        </Button>
                                    </>
                                )}
                            </div>
                        </BapCard>
                        </motion.div>
                    );
                })}
            </motion.div>
        </div>
    );
}
