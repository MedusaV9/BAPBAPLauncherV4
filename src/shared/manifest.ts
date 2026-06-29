export type BapTrack = "bapbap" | "boss-rush" | "battle-royale" | "latest" | string;

export interface ManifestIndex {
    schemaVersion: number;
    game: {
        name: string;
        executable: string;
        dataFolder: string;
        steam?: {
            appId?: string;
            depotId?: string;
        };
    };
    gameVersionsManifestPath: string;
    radioManifestPath?: string;
    timeSourceUrl?: string;
    secretUnlocks?: SecretUnlockManifestEntry[];
    launcherUpdatesManifestPath?: string;
    launcher?: {
        updatesManifestPath?: string;
        channel?: string;
    };
    /**
     * Path to bundles.json (Bundle Instance update channel index).
     * Optional — older manifest indexes that predate Bundle Instances
     * simply omit this field; the launcher then treats Bundles as
     * unavailable and only the bundled fallback is offered offline.
     */
    bundlesManifestPath?: string;
    bundles?: {
        manifestPath?: string;
        channel?: string;
    };
    melonLoader?: MelonLoaderManifest;
    channels: Array<{
        id: string;
        name: string;
        manifestPath: string;
        enabled?: boolean;
        order?: number;
    }>;
}

export interface SecretUnlockManifestEntry {
    id: string;
    label?: string;
    passwordSha256: string;
}

export interface MelonLoaderArtifact {
    url: string;
    sha256: string;
}

export interface MelonLoaderManifest {
    requiredVersion: string;
    x64: MelonLoaderArtifact;
    x86: MelonLoaderArtifact;
}

export interface RadioTrack {
    id: string;
    title: string;
    artists: string[];
    group?: string;
    album?: string;
    durationMs: number;
    artworkPath?: string;
    audioUrl: string;
    sha256: string;
    order?: number;
    enabled?: boolean;
    moodTags?: string[];
    shuffleWeight?: number;
}

export interface RadioManifest {
    schemaVersion: number;
    stationName: string;
    stationSubtitle?: string;
    stationArtworkPath?: string;
    libraryVersion: string;
    tracks: RadioTrack[];
}

export interface LauncherUpdateAsset {
    url: string;
    sha256?: string;
    fileName?: string;
}

export interface LauncherUpdateRelease {
    version: string;
    channel?: string;
    notes?: string;
    publishedAtUtc?: string;
    windows?: {
        x64?: LauncherUpdateAsset;
        arm64?: LauncherUpdateAsset;
        default?: LauncherUpdateAsset;
    };
}

export interface LauncherUpdatesManifest {
    schemaVersion: number;
    channel?: string;
    releases: LauncherUpdateRelease[];
}

/**
 * Bundle Instance update entry. One per published Bundle release.
 * Mirrors LauncherUpdateRelease but for content (assets + mod payload)
 * instead of launcher binaries.
 *
 * The launcher polls this manifest every launcher start (and every 1h
 * while open) to detect new Bundle versions. The full per-version
 * Bundle manifest (Track 5 schema, with file-level SHA-256 entries)
 * lives at `manifestUrl` and is only fetched when an update is being
 * applied.
 */
export interface BundleEntry {
    bundleId: string;
    name?: string;
    description?: string;
    imageUrl?: string;
    logoUrl?: string;
    channel?: string;
    version: string;
    buildNumber: number;
    publishedAtUtc?: string;
    /** URL of the per-version Bundle manifest (Track 5 schema). */
    manifestUrl: string;
    /** Direct URL of the bundle.zip archive on GitHub Releases. */
    archiveUrl?: string;
    /** SHA-256 of the archive. The launcher verifies before extraction. */
    archiveSha256?: string;
    sizeBytes?: number;
    /** Short release-notes summary surfaced in the BundleUpdateGate. */
    notes?: string;
    /** Optional minimum launcher version. Refuse update if older. */
    minLauncherVersion?: string;
    /** Optional minimum game version for the bundled mod payload. */
    minGameVersion?: string;
}

export interface BundlesManifest {
    schemaVersion: number;
    channel?: string;
    bundles: BundleEntry[];
}

export interface GameVersionsManifest {
    schemaVersion: number;
    steamAppId?: string;
    steamDepotId?: string;
    versions: OfficialVersionEntry[];
}

export interface OfficialVersionEntry {
    id: string;
    track: BapTrack;
    gameVersion: string;
    displayName: string;
    description?: string;
    imagePath?: string;
    steamManifestId?: string;
    releaseDateUtc?: string;
    recommended?: boolean;
    order?: number;
    directDownloadUrl?: string;
    directDownloadSha256?: string;
    directDownloadFileName?: string;
    unlockAtUtc?: string;
    tags?: string[];
    visual?: PackageVisual;
}

export interface ChannelManifest {
    schemaVersion: number;
    channelId: string;
    displayName: string;
    packagesIndexPath: string;
}

export interface PackageIndexManifest {
    schemaVersion: number;
    channelId: string;
    packages: PackageCard[];
}

export interface PackageVisual {
    preset?: string;
    tags?: string[];
    ribbonTags?: string[];
    overlay?: {
        surfaceColor?: string;
        accentColor?: string;
    };
}

export type PackageVisibility = "public" | "secret";

export interface PackageCard {
    id: string;
    type: string;
    name: string;
    summary?: string;
    description?: string;
    imagePath?: string;
    thumbnailPath?: string;
    latestVersion?: string;
    packageManifestPath: string;
    unlockAtUtc?: string;
    visibility?: PackageVisibility;
    secretUnlockId?: string;
    tags?: string[];
    visual?: PackageVisual;
    supportedTracks?: string[];
}

export interface PackageAuthor {
    id?: string;
    name: string;
    profileUrl?: string;
    role?: string;
}

export interface PackageVersionRef {
    version: string;
    changelog?: string;
    versionManifestPath: string;
}

export interface PackageManifest {
    schemaVersion: number;
    id: string;
    type: string;
    name: string;
    summary?: string;
    description?: string;
    heroImagePath?: string;
    imagePath?: string;
    thumbnailPath?: string;
    gallery?: string[];
    tags?: string[];
    visual?: PackageVisual;
    supportedTracks?: string[];
    owner?: {
        name: string;
        profileUrl?: string;
    };
    authors?: PackageAuthor[];
    latestVersion?: string;
    unlockAtUtc?: string;
    visibility?: PackageVisibility;
    secretUnlockId?: string;
    versions?: PackageVersionRef[];
}

export interface PackageVersionManifest {
    schemaVersion: number;
    id: string;
    version: string;
    files: Array<{
        sourcePath: string;
        targetPath: string;
        sha256?: string;
        description?: string;
    }>;
}

export type InstalledInstanceSource = "official-managed" | "steam-library";

/**
 * Distinguishes the launcher's three first-class instance kinds.
 * "standard"     — user-managed BAPBAP install (the historical default).
 * "creator-kit"  — user-managed install with creator-kit pre-set.
 * "bundle"       — launcher-managed, auto-updating, mod-locked bundle.
 *                  See docs/bundle-instance/BUNDLE_INSTANCE_MASTER_SPEC.md.
 *
 * The field is optional so existing on-disk metadata (.bapbap-instance.json
 * files written by older launcher versions) keeps working without a one-shot
 * migration. Treat undefined as "standard".
 */
export type InstanceType = "standard" | "creator-kit" | "bundle";

export interface InstalledInstance {
    id: string;
    profileName: string;
    versionId: string;
    gameVersion: string;
    name: string;
    version: string;
    track: string;
    path: string;
    imageUrl?: string;
    officialManaged: boolean;
    officialTrack?: string;
    lastUpdatedUtc: string;
    melonLoaderFirstRunPending?: boolean;
    instanceSource?: InstalledInstanceSource;
    compatibilityWarning?: string;

    // Bundle Instance fields (only set when instanceType === "bundle").
    // See docs/bundle-instance/BUNDLE_INSTANCE_MASTER_SPEC.md §3.1.
    instanceType?: InstanceType;
    bundleId?: string;
    bundleChannel?: string;
    bundleVersion?: string;
    bundleBuildNumber?: number;
    bundleLastCheckUtc?: string;
    bundleLastApplyUtc?: string;
}

export interface InstallOfficialInput {
    versionId: string;
    profileName: string;
    installPath?: string;
}

export interface ContentInstallInput {
    instanceId: string;
    channelId: string;
    packageId: string;
    version: string;
}

export interface ContentToggleInput {
    instanceId: string;
    channelId: string;
    packageId: string;
    enabled: boolean;
}
