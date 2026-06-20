import { useMemo } from "react";
import { Download, Package, Check } from "lucide-react";
import { SectionHeading } from "../../components/brand/SectionHeading";
import { BapCard } from "../../components/brand/BapCard";
import { BapButton } from "../../components/brand/BapButton";
import { Badge } from "../../components/ui/badge";
import { Progress } from "../../components/ui/progress";
import {
    useInstances,
    useGameVersions,
    useBundles,
    useInstallState,
    useInstallOfficial,
    useInstallBundle,
    useBundleInstallProgress,
} from "../query/hooks";
import {
    INSTANCES_HERO_TRACKS,
    resolvePrimaryOfficialVersionForTrack,
    isOfficialVersionInstalled,
    type InstancesHeroTrack,
} from "../../helpers/official-version-visibility";
import { getInstancesHeroTrackMeta, suggestProfileName, getInstallStateLabel, isInstallStateBusy } from "../../helpers/instances-ui";
import type { BundleSummary } from "../../../shared/ipc";

const BUNDLE_PROGRESS_LABEL: Record<string, string> = {
    resolving: "Resolving…",
    downloading: "Downloading…",
    verifying: "Verifying…",
    extracting: "Extracting…",
    installing: "Installing…",
};

const ACTION_ACCENT = "#e91e8c";
const INSTALLED_ACCENT = "#22d3ee";

function BundleTile({
    bundle,
    onInstall,
    disabled,
}: {
    bundle: BundleSummary;
    onInstall: () => void;
    disabled: boolean;
}) {
    const { data: progress } = useBundleInstallProgress(bundle.id);
    const active =
        progress &&
        progress.status !== "idle" &&
        progress.status !== "done" &&
        progress.status !== "failed";

    return (
        <BapCard className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-base text-foreground">{bundle.name}</h3>
                <Badge variant="accent">bundle</Badge>
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {bundle.description ?? "Curated complete package with auto-update."}
            </p>
            <div className="mt-auto pt-4">
                {active ? (
                    <div>
                        <p className="mb-1 text-xs text-foreground">
                            {BUNDLE_PROGRESS_LABEL[progress.status] ?? "Installing…"}
                        </p>
                        <Progress value={progress.progressPercent ?? 0} />
                    </div>
                ) : (
                    <BapButton
                        onClick={onInstall}
                        icon={bundle.isInstalled ? Check : Package}
                        accentColor={bundle.isInstalled ? INSTALLED_ACCENT : ACTION_ACCENT}
                        showChevron={false}
                        disabled={disabled || bundle.isInstalled}
                    >
                        {bundle.isInstalled ? "Installed" : "Install bundle"}
                    </BapButton>
                )}
                {progress?.status === "failed" && progress.errorMessage && (
                    <p className="mt-1 text-xs text-destructive">{progress.errorMessage}</p>
                )}
            </div>
        </BapCard>
    );
}

export function InstancesWorkspace() {
    const { data: instances = [], isLoading } = useInstances();
    const { data: gameVersions } = useGameVersions();
    const { data: bundles = [] } = useBundles();
    const { data: installState } = useInstallState();
    const installOfficial = useInstallOfficial();
    const installBundle = useInstallBundle();

    const versions = useMemo(() => gameVersions?.versions ?? [], [gameVersions]);
    const busy = installState ? isInstallStateBusy(installState) : false;

    return (
        <div className="bap-glow h-full overflow-auto p-8">
            <SectionHeading
                eyebrow="Library"
                subtitle="Install game versions and bundles, then manage your profiles."
            >
                Instances
            </SectionHeading>

            {busy && installState && (
                <BapCard className="mb-6 p-4">
                    <p className="mb-2 text-sm text-foreground">
                        {getInstallStateLabel(installState)}
                        {installState.profileName ? ` — ${installState.profileName}` : ""}
                    </p>
                    <Progress value={installState.progressPercent ?? 0} />
                </BapCard>
            )}

            {/* Available to install */}
            <h2 className="font-display mb-3 text-sm text-foreground">Available</h2>
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {INSTANCES_HERO_TRACKS.filter(t => t !== "bundle").map(track => {
                    const meta = getInstancesHeroTrackMeta(track as InstancesHeroTrack);
                    const version = resolvePrimaryOfficialVersionForTrack(track as InstancesHeroTrack, versions, instances);
                    if (!version) return null;
                    const installed = isOfficialVersionInstalled(version, instances);
                    return (
                        <BapCard key={track} className="flex flex-col p-5">
                            <div className="flex items-start justify-between gap-2">
                                <h3 className="font-display text-base text-foreground">{version.displayName}</h3>
                                <Badge variant="outline">{meta.chipLabel}</Badge>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                {version.description ?? meta.description}
                            </p>
                            <div className="mt-auto pt-4">
                                <BapButton
                                    onClick={() =>
                                        installOfficial.mutate({
                                            versionId: version.id,
                                            profileName: suggestProfileName(version, track as InstancesHeroTrack, instances),
                                        })
                                    }
                                    icon={installed ? Check : Download}
                                    accentColor={installed ? INSTALLED_ACCENT : ACTION_ACCENT}
                                    showChevron={false}
                                    disabled={busy}
                                >
                                    {installed ? "Install another" : "Install"}
                                </BapButton>
                            </div>
                        </BapCard>
                    );
                })}

                {bundles.map(bundle => (
                    <BundleTile
                        key={bundle.id}
                        bundle={bundle}
                        onInstall={() => installBundle.mutate({ bundleId: bundle.id })}
                        disabled={busy}
                    />
                ))}
            </div>

            {/* Installed profiles */}
            <h2 className="font-display mb-3 text-sm text-foreground">Your profiles</h2>
            {isLoading && <p className="text-sm text-muted-foreground">Loading instances…</p>}
            {instances.length === 0 && !isLoading && (
                <BapCard className="p-6 text-sm text-muted-foreground">
                    No instances yet. Install a game version or bundle above to get started.
                </BapCard>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {instances.map(instance => (
                    <BapCard key={instance.id} interactive className="p-5">
                        <div className="flex items-start justify-between gap-3">
                            <h3 className="font-display text-base text-foreground">{instance.profileName}</h3>
                            <Badge variant={instance.instanceType === "bundle" ? "accent" : "outline"}>
                                {instance.instanceType === "bundle" ? "bundle" : instance.versionId}
                            </Badge>
                        </div>
                        <p className="mt-2 truncate text-xs text-muted-foreground" title={instance.path}>
                            {instance.gameVersion || instance.version}
                        </p>
                    </BapCard>
                ))}
            </div>
        </div>
    );
}
