import type { ContentStateMap } from "../../shared/ipc";
import type { InstalledInstance, PackageCard } from "../../shared/manifest";

export type InstalledProfileModEntry = {
    packageId: string;
    name: string;
    version?: string;
    summary?: string;
    status: ContentStateMap[string]["status"];
    known: boolean;
};

export function countInstalledProfileMods(states: ContentStateMap | undefined): number {
    if (!states) {
        return 0;
    }
    return Object.values(states).filter(state => state.status !== "not-installed").length;
}

export function buildInstalledProfileModEntries(states: ContentStateMap, packages: PackageCard[]): InstalledProfileModEntry[] {
    const packageMap = new Map(packages.map(pkg => [pkg.id.toLowerCase(), pkg]));
    return Object.entries(states)
        .filter(([, state]) => state.status !== "not-installed")
        .map(([key, state]) => {
            const [, rawPackageId = key] = key.split("::");
            const packageId = rawPackageId || key;
            const knownPackage = packageMap.get(packageId.toLowerCase());
            return {
                packageId,
                name: knownPackage?.name || packageId,
                version: state.version,
                summary: knownPackage?.summary || knownPackage?.description,
                status: state.status,
                known: Boolean(knownPackage),
            } satisfies InstalledProfileModEntry;
        })
        .sort((left, right) => left.name.localeCompare(right.name));
}

export function resolvePreferredInstanceId(
    instances: InstalledInstance[],
    currentId: string | null,
    defaultId: string | null | undefined
): string | null {
    if (currentId && instances.some(instance => instance.id === currentId)) {
        return currentId;
    }
    if (defaultId && instances.some(instance => instance.id === defaultId)) {
        return defaultId;
    }
    return instances[0]?.id ?? null;
}
