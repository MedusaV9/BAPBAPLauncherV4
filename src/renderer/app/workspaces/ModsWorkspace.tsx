import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Search, Plus, Check, Power, X, Package as PackageIcon, Trash2, Download } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { SectionHeading } from "../../components/brand/SectionHeading";
import { FeatureCard } from "../../components/brand/FeatureCard";
import { StatusPill, type StatusTone } from "../../components/brand/StatusPill";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { ModSetsBar } from "../../components/mods/ModSetsBar";
import { ModDetailDialog } from "../../components/mods/ModDetailDialog";
import { cn } from "../lib/utils";
import { useShellStore } from "../stores/useShellStore";
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
import { containerVariants, itemUp, EASE_POP } from "../../motion";
import type { ContentInstallState, ContentStateMap, ContentBulkAction, ContentBulkApplyResult } from "../../../shared/ipc";
import type { PackageCard } from "../../../shared/manifest";

const STATUS_FILTERS = [
    { id: "all", label: "All" },
    { id: "installed", label: "Installed" },
    { id: "enabled", label: "Enabled" },
    { id: "available", label: "Available" },
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number]["id"];

function statusMeta(state: ContentInstallState | undefined): { label: string; tone: StatusTone } {
    switch (state?.status) {
        case "installed-enabled":
            return { label: "Enabled", tone: "new" };
        case "installed-disabled":
            return { label: "Disabled", tone: "neutral" };
        case "partial":
            return { label: "Partial", tone: "installed" };
        default:
            return { label: "Available", tone: "curated" };
    }
}

function isInstalled(state: ContentInstallState | undefined) {
    return state?.status === "installed-enabled" || state?.status === "installed-disabled";
}

function stateKey(channelId: string, packageId: string): string {
    return `${channelId.toLowerCase()}::${packageId.toLowerCase()}`;
}

function getPackageState(
    states: ContentStateMap | undefined,
    channelId: string,
    packageId: string
): ContentInstallState | undefined {
    return states?.[stateKey(channelId, packageId)] ?? states?.[packageId];
}

// A mod is "secret" if the manifest marks it hidden or tags it as such. The real
// manifest never sets the `visibility` field — it signals secret via a "secret"
// or "hidden" entry in tags / visual.ribbonTags / visual.tags — so check all of
// them. Secret mods are kept out of the catalog grid.
function isSecretPackage(p: PackageCard): boolean {
    const hasSecretTag = (tags?: string[]) =>
        (tags ?? []).some(t => {
            const v = t.toLowerCase();
            return v.includes("secret") || v.includes("hidden");
        });
    return (
        p.visibility === "secret" ||
        Boolean(p.secretUnlockId) ||
        hasSecretTag(p.tags) ||
        hasSecretTag(p.visual?.ribbonTags) ||
        hasSecretTag(p.visual?.tags)
    );
}

// Mirror the backend's assertPackageSupportedForInstance (content.service.ts): a
// mod with a non-empty supportedTracks only installs on an instance whose track
// tokens intersect it. Empty supportedTracks = installs anywhere.
function isSupportedOnInstance(
    p: PackageCard,
    instance: { officialTrack?: string; track?: string; versionId?: string } | null | undefined
): boolean {
    const supported = (p.supportedTracks ?? [])
        .map(t => `${t || ""}`.trim().toLowerCase())
        .filter(Boolean);
    if (!supported.length) return true;
    if (!instance) return true;
    const tokens = new Set(
        [instance.officialTrack, instance.track, instance.versionId]
            .map(t => `${t || ""}`.trim().toLowerCase())
            .filter(Boolean)
    );
    return supported.some(t => tokens.has(t));
}

function ModArtwork({ pkg }: { pkg: PackageCard }) {
    const [failed, setFailed] = useState(false);
    const src = pkg.thumbnailPath || pkg.imagePath;
    if (!src || failed) {
        return (
            <div className="flex h-full w-full items-center justify-center bg-secondary">
                <PackageIcon size={28} className="text-muted-foreground" />
            </div>
        );
    }
    return (
        <img
            src={src}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 ease-pop group-hover:scale-105"
        />
    );
}

function ModCard({
    pkg,
    state,
    selected,
    busy,
    version,
    supported,
    installable,
    reduceMotion,
    onToggleSelect,
    onOpenDetail,
    onInstall,
    onSetEnabled,
    onUninstall,
}: {
    pkg: PackageCard;
    state: ContentInstallState | undefined;
    selected: boolean;
    busy: boolean;
    version: string;
    supported: boolean;
    installable: boolean;
    reduceMotion: boolean | null;
    onToggleSelect: () => void;
    onOpenDetail: () => void;
    onInstall: () => void;
    onSetEnabled: (enabled: boolean) => void;
    onUninstall: () => void;
}) {
    const meta = statusMeta(state);
    const installed = isInstalled(state);
    const enabled = state?.status === "installed-enabled";
    const updateAvailable = installed && Boolean(version && state?.version && state.version !== version);

    return (
        <motion.div variants={reduceMotion ? undefined : itemUp} className="h-full">
            <FeatureCard selected={selected} className="group flex h-full flex-col">
                <div className="relative aspect-[16/10] w-full overflow-hidden">
                    <ModArtwork pkg={pkg} />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card/80 via-transparent to-transparent" />

                    {/* Click the artwork to open the detail modal (sits below the
                        z-10 controls so it never intercepts their clicks). */}
                    <button
                        type="button"
                        onClick={onOpenDetail}
                        aria-label={`View ${pkg.name} details`}
                        className="focus-ring absolute inset-0 z-[5]"
                    />

                    <button
                        onClick={onToggleSelect}
                        aria-pressed={selected}
                        aria-label={selected ? "Deselect mod" : "Select mod"}
                        className={cn(
                            "focus-ring absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-[0.625rem] border backdrop-blur transition-all",
                            selected
                                ? "border-accent bg-accent text-accent-foreground opacity-100"
                                : "border-white/25 bg-black/40 text-transparent opacity-0 hover:border-accent group-hover:opacity-100"
                        )}
                    >
                        <Check size={14} strokeWidth={3} />
                    </button>

                    <div className="absolute left-3 top-3 z-10">
                        <StatusPill tone={meta.tone} onImage>
                            {meta.label}
                        </StatusPill>
                    </div>
                </div>

                <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-baseline justify-between gap-2">
                        <h2 className="font-display text-sm uppercase leading-tight text-foreground">{pkg.name}</h2>
                        {version && (
                            <span className="shrink-0 rounded-[0.625rem] bg-[var(--surface-inset)] px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                                v{version}
                            </span>
                        )}
                    </div>
                    {pkg.summary && (
                        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{pkg.summary}</p>
                    )}

                    <div className="mt-auto pt-2">
                        {!supported ? (
                            <div
                                className="flex w-full items-center justify-center gap-1.5 rounded-[0.625rem] border border-gold/35 bg-gold/10 px-3 py-2 text-center font-mono text-[0.65rem] uppercase tracking-[0.1em] text-gold"
                                title={`Only installs on: ${(pkg.supportedTracks ?? []).join(", ")}`}
                            >
                                Not available for this profile
                            </div>
                        ) : !installed ? (
                            <Button
                                size="sm"
                                variant="default"
                                className="w-full"
                                disabled={busy || !version || !installable}
                                onClick={onInstall}
                                title={!installable ? "Select a profile to install mods into" : undefined}
                            >
                                <Plus size={14} /> Install
                            </Button>
                        ) : (
                            <div className="flex items-center gap-2">
                                {updateAvailable ? (
                                    <Button
                                        size="sm"
                                        variant="default"
                                        className="flex-1"
                                        disabled={busy}
                                        onClick={onInstall}
                                        title={`Update from v${state?.version} to v${version}`}
                                    >
                                        <Download size={14} /> Update
                                    </Button>
                                ) : (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className={cn(
                                            "flex-1",
                                            enabled &&
                                                "border-[#22d3ee]/50 bg-[#22d3ee]/10 text-[#22d3ee] hover:bg-[#22d3ee]/15 hover:text-[#22d3ee]"
                                        )}
                                        disabled={busy}
                                        onClick={() => onSetEnabled(!enabled)}
                                    >
                                        {enabled ? <Check size={14} /> : <Power size={14} />}
                                        {enabled ? "Enabled" : "Enable"}
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                    disabled={busy}
                                    onClick={onUninstall}
                                    aria-label="Remove mod"
                                    title="Remove"
                                >
                                    <Trash2 size={14} />
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </FeatureCard>
        </motion.div>
    );
}

export function ModsWorkspace() {
    const { data: instances } = useInstances();
    const { data: manifestIndex } = useManifestIndex();
    const pendingModsInstanceId = useShellStore(s => s.pendingModsInstanceId);
    const consumePendingModsInstanceId = useShellStore(s => s.consumePendingModsInstanceId);
    const modTargets = useMemo(
        () => (instances ?? []).filter(instance => !("instanceType" in instance) || instance.instanceType !== "bundle"),
        [instances]
    );
    const [instanceId, setInstanceId] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const deferredQuery = useDeferredValue(query);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [detailPackageId, setDetailPackageId] = useState<string | null>(null);
    const [bulkResult, setBulkResult] = useState<ContentBulkApplyResult | null>(null);
    const reduceMotion = useReducedMotion();

    // Resolve the live channel from the manifest index rather than hardcoding —
    // the manifest declares "release", not "default", so a hardcoded id returned
    // zero mods in the real app.
    const channelId = useMemo(() => {
        const channels = manifestIndex?.channels ?? [];
        return channels.find(c => c.enabled !== false)?.id ?? channels[0]?.id ?? "release";
    }, [manifestIndex]);

    useEffect(() => {
        if (instances && instances.length > 0) {
            // Auto-select the first non-bundle instance if nothing is
            // selected or the current selection disappeared.
            if (!instanceId || !modTargets.some(instance => instance.id === instanceId)) {
                setInstanceId(modTargets[0]?.id ?? null);
            }
        } else if (instances && instances.length === 0 && instanceId) {
            setInstanceId(null);
        }
    }, [instances, modTargets, instanceId]);

    // Honor an "Add mods" jump from the Start tab: pre-select that instance,
    // then clear the pending target so it doesn't override later switches.
    useEffect(() => {
        if (pendingModsInstanceId && modTargets.some(i => i.id === pendingModsInstanceId)) {
            setInstanceId(pendingModsInstanceId);
            consumePendingModsInstanceId();
        }
    }, [pendingModsInstanceId, modTargets, consumePendingModsInstanceId]);

    // Selection is per-instance; reset when switching profiles.
    useEffect(() => {
        setSelected(new Set());
    }, [instanceId]);

    const selectedInstance = useMemo(
        () => (instances ?? []).find(i => i.id === instanceId) ?? null,
        [instances, instanceId]
    );

    const { data: packages, isLoading } = usePackages(channelId);
    const { data: states } = useContentStates(instanceId ?? undefined);
    const installContent = useInstallContent();
    const uninstallContent = useUninstallContent();
    const setEnabled = useSetContentEnabled();
    const bulkApply = useBulkApply();

    // Surface a failed mod operation. These mutations hit the network (manifest +
    // file download) and used to fail silently, making install/enable look like a
    // no-op. We show the real error message and let the user dismiss it; a new,
    // different error re-shows.
    const opError = installContent.error ?? setEnabled.error ?? uninstallContent.error ?? bulkApply.error;
    // IPC-deserialized errors can arrive as plain objects, so don't rely on
    // `instanceof Error` alone or a real failure renders no banner.
    const errorMessage = opError
        ? opError instanceof Error
            ? opError.message
            : String((opError as { message?: unknown })?.message ?? opError)
        : null;
    const [dismissedError, setDismissedError] = useState<string | null>(null);
    const showError = Boolean(errorMessage) && errorMessage !== dismissedError;

    const filtered = useMemo(() => {
        // Secret/hidden mods never appear in the catalog grid (they're revealed
        // through their own unlock flow, not browsed here).
        let list = (packages ?? []).filter(p => !isSecretPackage(p));
        const q = deferredQuery.trim().toLowerCase();
        if (q) {
            list = list.filter(
                p =>
                    p.name.toLowerCase().includes(q) ||
                    p.summary?.toLowerCase().includes(q) ||
                    p.tags?.some(t => t.toLowerCase().includes(q))
            );
        }
        if (statusFilter !== "all") {
            list = list.filter(p => {
                const state = getPackageState(states, channelId, p.id);
                const status = state?.status;
                if (statusFilter === "enabled") return status === "installed-enabled";
                if (statusFilter === "installed")
                    return status === "installed-enabled" || status === "installed-disabled";
                return !isInstalled(state); // "available"
            });
        }
        return list;
    }, [packages, deferredQuery, statusFilter, states, channelId]);

    const hasActiveFilters = query.trim().length > 0 || statusFilter !== "all";

    function toggleSelected(packageId: string) {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(packageId)) next.delete(packageId);
            else next.add(packageId);
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
        setBulkResult(null);
        bulkApply.mutate(
            { instanceId, channelId, packageIds, action, versionByPackage },
            {
                onSuccess: result => {
                    setBulkResult(result);
                    if (result.failedCount === 0) setSelected(new Set());
                },
            }
        );
    }

    return (
        <div className="bap-glow relative h-full overflow-y-auto px-8 pb-8 pt-16">
            <SectionHeading subtitle="Browse the catalog and manage mods per profile.">
                Mods
            </SectionHeading>

            {showError && (
                <div className="mb-4 flex items-start gap-3 rounded-[0.625rem] border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    <X size={16} className="mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                        <p className="font-display text-xs uppercase tracking-wide">Mod action failed</p>
                        <p className="mt-0.5 break-words font-mono text-xs text-destructive/90">{errorMessage}</p>
                    </div>
                    <button
                        onClick={() => setDismissedError(errorMessage)}
                        className="focus-ring shrink-0 rounded p-1 text-destructive/70 transition-colors hover:bg-destructive/15 hover:text-destructive"
                        aria-label="Dismiss error"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Install target — the single most important control on this tab,
                so it gets a full-width prominent bar of its own above the
                search/filter row, not a small dropdown lost at the far right. */}
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-[1.125rem] border border-accent/30 bg-accent/[0.06] px-4 py-3">
                <div className="flex items-center gap-2">
                    <Download size={16} className="text-accent" />
                    <span className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-accent">
                        Installing mods into
                    </span>
                </div>
                {modTargets.length > 0 ? (
                    <select
                        value={instanceId ?? ""}
                        onChange={e => setInstanceId(e.target.value)}
                        aria-label="Profile"
                        className="focus-ring h-9 rounded-lg border border-border bg-card px-3 font-display text-sm text-foreground transition-colors hover:bg-secondary"
                    >
                        {modTargets.map(i => (
                            <option key={i.id} value={i.id}>
                                {i.profileName}
                            </option>
                        ))}
                    </select>
                ) : (
                    <span className="font-display text-sm text-gold">
                        Battle Royale profiles are mod-locked
                    </span>
                )}
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="relative min-w-[200px] max-w-md flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search mods…"
                        aria-label="Search mods"
                        className="pl-9"
                    />
                </div>

                <div className="flex items-center gap-1.5">
                    {STATUS_FILTERS.map(f => {
                        const active = statusFilter === f.id;
                        return (
                            <button
                                key={f.id}
                                onClick={() => setStatusFilter(f.id)}
                                aria-pressed={active}
                                className={cn(
                                    "focus-ring rounded-full border px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.1em] transition-all duration-200 ease-pop",
                                    active
                                        ? "border-accent bg-accent/12 text-foreground"
                                        : "border-border bg-popover text-muted-foreground hover:border-white/20 hover:text-foreground"
                                )}
                            >
                                {f.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {instanceId && <ModSetsBar instanceId={instanceId} />}

            {isLoading && (
                <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-4 overflow-hidden pr-1 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="bap-card overflow-hidden">
                            <div className="h-32 w-full animate-pulse bg-secondary" />
                            <div className="space-y-2 p-4">
                                <div className="h-4 w-2/3 animate-pulse rounded bg-secondary" />
                                <div className="h-3 w-full animate-pulse rounded bg-secondary" />
                                <div className="mt-3 h-8 w-full animate-pulse rounded bg-secondary" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!isLoading && filtered.length === 0 && (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-secondary">
                        <Search size={26} className="text-muted-foreground" />
                    </div>
                    <div>
                        <h2 className="font-display text-base text-foreground">
                            {hasActiveFilters ? "No mods match" : "No mods available"}
                        </h2>
                        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                            {hasActiveFilters
                                ? "Try a different name or clear your filters."
                                : "This channel has no mods yet."}
                        </p>
                    </div>
                    {hasActiveFilters && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setQuery("");
                                setStatusFilter("all");
                            }}
                        >
                            Clear filters
                        </Button>
                    )}
                </div>
            )}

            {!isLoading && filtered.length > 0 && (
                <motion.div
                    className={cn(
                        "grid grid-cols-1 content-start gap-4 sm:grid-cols-2 xl:grid-cols-3",
                        selected.size > 0 && "pb-24"
                    )}
                    variants={reduceMotion ? undefined : containerVariants}
                    initial={reduceMotion ? undefined : "hidden"}
                    animate={reduceMotion ? undefined : "show"}
                >
                    {filtered.map(pkg => {
                        const state = getPackageState(states, channelId, pkg.id);
                        const version = pkg.latestVersion ?? "";
                        const installing =
                            installContent.isPending && installContent.variables?.packageId === pkg.id;
                        const toggling =
                            setEnabled.isPending && setEnabled.variables?.packageId === pkg.id;
                        const uninstalling =
                            uninstallContent.isPending && uninstallContent.variables?.packageId === pkg.id;
                        return (
                            <ModCard
                                key={pkg.id}
                                pkg={pkg}
                                state={state}
                                selected={selected.has(pkg.id)}
                                busy={bulkApply.isPending || installing || toggling || uninstalling}
                                version={version}
                                supported={isSupportedOnInstance(pkg, selectedInstance)}
                                installable={Boolean(instanceId)}
                                reduceMotion={reduceMotion}
                                onToggleSelect={() => toggleSelected(pkg.id)}
                                onOpenDetail={() => setDetailPackageId(pkg.id)}
                                onInstall={() =>
                                    instanceId &&
                                    installContent.mutate({ instanceId, channelId, packageId: pkg.id, version })
                                }
                                onSetEnabled={next =>
                                    instanceId &&
                                    setEnabled.mutate({
                                        instanceId,
                                        channelId,
                                        packageId: pkg.id,
                                        enabled: next,
                                    })
                                }
                                onUninstall={() =>
                                    instanceId &&
                                    uninstallContent.mutate({ instanceId, channelId, packageId: pkg.id })
                                }
                            />
                        );
                    })}
                </motion.div>
            )}

            <AnimatePresence>
                {selected.size > 0 && (
                    <motion.div
                        initial={reduceMotion ? { opacity: 0, x: "-50%" } : { y: 24, opacity: 0, x: "-50%" }}
                        animate={{ y: 0, opacity: 1, x: "-50%" }}
                        exit={reduceMotion ? { opacity: 0, x: "-50%" } : { y: 24, opacity: 0, x: "-50%" }}
                        transition={{ duration: 0.24, ease: EASE_POP }}
                        className="glass-strong fixed bottom-6 left-1/2 z-50 flex items-center gap-2 rounded-full px-4 py-2.5 shadow-soft-lg"
                    >
                        <span className="font-display px-1 text-xs text-foreground">
                            <span className="text-accent">{selected.size}</span> selected
                        </span>
                        <span className="h-5 w-px bg-border" />
                        <Button size="sm" variant="ghost" disabled={bulkApply.isPending} onClick={() => runBulk("install")}>
                            Install
                        </Button>
                        <Button size="sm" variant="ghost" disabled={bulkApply.isPending} onClick={() => runBulk("enable")}>
                            Enable
                        </Button>
                        <Button size="sm" variant="ghost" disabled={bulkApply.isPending} onClick={() => runBulk("disable")}>
                            Disable
                        </Button>
                        <span className="h-5 w-px bg-border" />
                        <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={bulkApply.isPending}
                            onClick={() => runBulk("uninstall")}
                        >
                            <Trash2 size={14} /> Uninstall
                        </Button>
                        {bulkResult && bulkResult.failedCount > 0 && (
                            <span className="font-mono text-xs text-destructive">
                                {bulkResult.successCount}/{bulkResult.total} succeeded
                            </span>
                        )}
                        <button
                            onClick={() => setSelected(new Set())}
                            className="focus-ring ml-1 rounded-full p-1 text-muted-foreground hover:text-foreground"
                            aria-label="Clear selection"
                        >
                            <X size={16} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            <ModDetailDialog
                channelId={channelId}
                packageId={detailPackageId}
                installed={detailPackageId ? isInstalled(getPackageState(states, channelId, detailPackageId)) : false}
                busy={bulkApply.isPending || installContent.isPending}
                onInstall={version => {
                    if (instanceId && detailPackageId) {
                        installContent.mutate({ instanceId, channelId, packageId: detailPackageId, version });
                    }
                    setDetailPackageId(null);
                }}
                onClose={() => setDetailPackageId(null)}
            />
        </div>
    );
}
