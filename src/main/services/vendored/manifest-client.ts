import { URL } from "node:url";
import { fetchWithTimeout, MANIFEST_TIMEOUT_MS } from "../../utils/timeout-fetch";
import {
    BundlesManifest,
    ChannelManifest,
    GameVersionsManifest,
    LauncherUpdateAsset,
    LauncherUpdateRelease,
    LauncherUpdatesManifest,
    MelonLoaderManifest,
    ManifestIndex,
    PackageCard,
    PackageIndexManifest,
    PackageManifest,
    RadioManifest,
} from "../../../shared/manifest";
import { SettingsStoreService } from "../core/settings-store";
import { githubAuthHeaders } from "../../utils/github-auth";

type CacheState = {
    index?: ManifestIndex;
    gameVersions?: GameVersionsManifest;
    launcherUpdates?: LauncherUpdatesManifest | null;
    bundlesManifest?: BundlesManifest | null;
    radioManifest?: RadioManifest | null;
    channels: Map<string, ChannelManifest>;
    packageIndexes: Map<string, PackageIndexManifest>;
    packageDetails: Map<string, PackageManifest>;
};

export class ManifestClient {
    private readonly settings: SettingsStoreService;
    private readonly cache: CacheState = {
        channels: new Map(),
        packageIndexes: new Map(),
        packageDetails: new Map(),
    };

    constructor(settings: SettingsStoreService) {
        this.settings = settings;
    }

    getManifestUrl(): string {
        return this.settings.getManifestUrl();
    }

    async getIndex(force = false): Promise<ManifestIndex> {
        if (!force && this.cache.index) {
            return this.cache.index;
        }
        const url = this.getManifestUrl();
        const index = await this.fetchJson<ManifestIndex>(url);
        index.timeSourceUrl = index.timeSourceUrl ? this.resolveManifestPath(index.timeSourceUrl, url) : index.timeSourceUrl;
        index.secretUnlocks = Array.isArray(index.secretUnlocks)
            ? index.secretUnlocks
                .map(item => ({
                    id: String(item.id || "").trim(),
                    label: item.label?.trim(),
                    passwordSha256: String(item.passwordSha256 || "").trim().toLowerCase(),
                }))
                .filter(item => Boolean(item.id && item.passwordSha256))
            : [];
        index.melonLoader = index.melonLoader ? normalizeMelonLoaderManifest(index.melonLoader, url) : index.melonLoader;
        this.cache.index = index;
        return index;
    }

    async getGameVersions(force = false): Promise<GameVersionsManifest> {
        if (!force && this.cache.gameVersions) {
            return this.cache.gameVersions;
        }
        const index = await this.getIndex(force);
        const url = this.resolveManifestPath(index.gameVersionsManifestPath, this.getManifestUrl());
        const gameVersions = await this.fetchJson<GameVersionsManifest>(url);
        gameVersions.versions = (gameVersions.versions || []).map(version => ({
            ...version,
            imagePath: version.imagePath ? this.resolveManifestPath(version.imagePath, url) : version.imagePath,
            directDownloadUrl: version.directDownloadUrl?.trim(),
            directDownloadSha256: version.directDownloadSha256?.trim(),
            directDownloadFileName: version.directDownloadFileName?.trim(),
            unlockAtUtc: version.unlockAtUtc?.trim(),
        }));
        this.cache.gameVersions = gameVersions;
        return gameVersions;
    }

    async getLauncherUpdates(force = false): Promise<LauncherUpdatesManifest | null> {
        if (!force && this.cache.launcherUpdates !== undefined) {
            return this.cache.launcherUpdates;
        }

        const index = await this.getIndex(force);
        const manifestPath =
            index.launcher?.updatesManifestPath ||
            index.launcherUpdatesManifestPath;
        if (!manifestPath) {
            this.cache.launcherUpdates = null;
            return null;
        }

        const updatesUrl = this.resolveManifestPath(manifestPath, this.getManifestUrl());
        const manifest = await this.fetchJson<LauncherUpdatesManifest>(updatesUrl);
        manifest.channel = manifest.channel?.trim().toLowerCase() || index.launcher?.channel?.trim().toLowerCase() || "stable";
        manifest.releases = (manifest.releases || [])
            .map(release => normalizeLauncherRelease(release))
            .filter(release => Boolean(release.version));
        this.cache.launcherUpdates = manifest;
        return manifest;
    }

    /**
     * Fetch the Bundle Instances update channel index from the central
     * GitHub manifest. Returns null if the manifest index does not list a
     * bundlesManifestPath (older manifests pre-Bundle-Instances).
     *
     * Same shape and caching as getLauncherUpdates() — Bundle updates are
     * just another item in the central manifest tree, not a separate system.
     */
    async getBundlesManifest(force = false): Promise<BundlesManifest | null> {
        if (!force && this.cache.bundlesManifest !== undefined) {
            return this.cache.bundlesManifest;
        }

        const index = await this.getIndex(force);
        const manifestPath =
            index.bundles?.manifestPath ||
            index.bundlesManifestPath;
        if (!manifestPath) {
            this.cache.bundlesManifest = null;
            return null;
        }

        const bundlesUrl = this.resolveManifestPath(manifestPath, this.getManifestUrl());
        const manifest = await this.fetchJson<BundlesManifest>(bundlesUrl);
        manifest.channel = manifest.channel?.trim().toLowerCase()
            || index.bundles?.channel?.trim().toLowerCase()
            || "stable";
        manifest.bundles = (manifest.bundles || [])
            .map(entry => ({
                ...entry,
                bundleId: String(entry.bundleId || "").trim(),
                version: String(entry.version || "").trim(),
                buildNumber: Number(entry.buildNumber) || 0,
                channel: entry.channel?.trim().toLowerCase() || manifest.channel,
                manifestUrl: entry.manifestUrl
                    ? this.resolveManifestPath(entry.manifestUrl, bundlesUrl)
                    : entry.manifestUrl,
                archiveUrl: entry.archiveUrl
                    ? this.resolveManifestPath(entry.archiveUrl, bundlesUrl)
                    : entry.archiveUrl,
                archiveSha256: entry.archiveSha256?.trim().toLowerCase(),
                publishedAtUtc: entry.publishedAtUtc?.trim(),
                notes: entry.notes?.trim(),
                minLauncherVersion: entry.minLauncherVersion?.trim(),
                minGameVersion: entry.minGameVersion?.trim(),
            }))
            .filter(entry => Boolean(entry.bundleId && entry.version && entry.manifestUrl));
        this.cache.bundlesManifest = manifest;
        return manifest;
    }

    async getRadioManifest(force = false): Promise<RadioManifest | null> {
        if (!force && this.cache.radioManifest !== undefined) {
            return this.cache.radioManifest;
        }

        const index = await this.getIndex(force);
        if (!index.radioManifestPath) {
            this.cache.radioManifest = null;
            return null;
        }

        const radioUrl = this.resolveManifestPath(index.radioManifestPath, this.getManifestUrl());
        const manifest = await this.fetchJson<RadioManifest>(radioUrl);
        manifest.stationArtworkPath = manifest.stationArtworkPath
            ? this.resolveManifestPath(manifest.stationArtworkPath, radioUrl)
            : manifest.stationArtworkPath;
        manifest.stationName = String(manifest.stationName || "").trim() || "BAPBAP Radio";
        manifest.stationSubtitle = manifest.stationSubtitle?.trim();
        manifest.libraryVersion = String(manifest.libraryVersion || "").trim() || "1";
        manifest.tracks = (manifest.tracks || [])
            .map(track => ({
                ...track,
                title: String(track.title || "").trim(),
                artists: Array.isArray(track.artists) ? track.artists.map(artist => String(artist).trim()).filter(Boolean) : [],
                group: track.group?.trim(),
                album: track.album?.trim(),
                artworkPath: track.artworkPath ? this.resolveManifestPath(track.artworkPath, radioUrl) : track.artworkPath,
                audioUrl: track.audioUrl ? this.resolveManifestPath(track.audioUrl, radioUrl) : track.audioUrl,
                sha256: track.sha256?.trim(),
                moodTags: Array.isArray(track.moodTags) ? track.moodTags.map(tag => String(tag).trim()).filter(Boolean) : [],
            }))
            .filter(track => Boolean(track.id && track.title && track.audioUrl))
            .sort((left, right) => {
                const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
                const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;
                if (leftOrder !== rightOrder) {
                    return leftOrder - rightOrder;
                }
                return left.title.localeCompare(right.title);
            });
        this.cache.radioManifest = manifest;
        return manifest;
    }

    async getChannel(channelId = "release", force = false): Promise<ChannelManifest> {
        const cacheKey = channelId.toLowerCase();
        if (!force && this.cache.channels.has(cacheKey)) {
            return this.cache.channels.get(cacheKey)!;
        }

        const index = await this.getIndex(force);
        const channel = (index.channels || []).find(item => item.id.toLowerCase() === cacheKey);
        if (!channel) {
            throw new Error(`Channel '${channelId}' not found in manifest index.`);
        }

        const channelUrl = this.resolveManifestPath(channel.manifestPath, this.getManifestUrl());
        const channelManifest = await this.fetchJson<ChannelManifest>(channelUrl);
        this.cache.channels.set(cacheKey, channelManifest);
        return channelManifest;
    }

    async listPackages(channelId = "release", force = false): Promise<PackageCard[]> {
        const cacheKey = channelId.toLowerCase();
        if (!force && this.cache.packageIndexes.has(cacheKey)) {
            return this.cache.packageIndexes.get(cacheKey)!.packages;
        }

        const channel = await this.getChannel(channelId, force);
        const index = await this.getIndex(force);
        const channelUrl = this.resolveManifestPath(
            (index.channels || []).find(item => item.id.toLowerCase() === cacheKey)?.manifestPath || "",
            this.getManifestUrl()
        );
        const packagesIndexUrl = this.resolveManifestPath(channel.packagesIndexPath, channelUrl);
        const packageIndex = await this.fetchJson<PackageIndexManifest>(packagesIndexUrl);
        packageIndex.packages = (packageIndex.packages || []).map(pkg => ({
            ...pkg,
            imagePath: pkg.imagePath ? this.resolveManifestPath(pkg.imagePath, packagesIndexUrl) : pkg.imagePath,
            thumbnailPath: pkg.thumbnailPath ? this.resolveManifestPath(pkg.thumbnailPath, packagesIndexUrl) : pkg.thumbnailPath,
            latestVersion: pkg.latestVersion?.trim(),
            unlockAtUtc: pkg.unlockAtUtc?.trim(),
            visibility: pkg.visibility?.trim().toLowerCase() === "secret" ? "secret" : "public",
            secretUnlockId: pkg.secretUnlockId?.trim(),
        }));
        this.cache.packageIndexes.set(cacheKey, packageIndex);
        return packageIndex.packages;
    }

    async getPackageDetail(channelId: string, packageId: string, force = false): Promise<PackageManifest> {
        const cacheKey = `${channelId.toLowerCase()}::${packageId.toLowerCase()}`;
        if (!force && this.cache.packageDetails.has(cacheKey)) {
            return this.cache.packageDetails.get(cacheKey)!;
        }

        const channelLower = channelId.toLowerCase();
        const index = await this.getIndex(force);
        const channelRef = (index.channels || []).find(item => item.id.toLowerCase() === channelLower);
        if (!channelRef) {
            throw new Error(`Channel '${channelId}' not found.`);
        }

        const channelUrl = this.resolveManifestPath(channelRef.manifestPath, this.getManifestUrl());
        const channelManifest = await this.getChannel(channelId, force);
        const packagesIndexUrl = this.resolveManifestPath(channelManifest.packagesIndexPath, channelUrl);
        const packageIndex = await this.fetchJson<PackageIndexManifest>(packagesIndexUrl);
        const packageCard = (packageIndex.packages || []).find(pkg => pkg.id.toLowerCase() === packageId.toLowerCase());
        if (!packageCard) {
            throw new Error(`Package '${packageId}' not found in channel '${channelId}'.`);
        }

        const packageManifestUrl = this.resolveManifestPath(packageCard.packageManifestPath, packagesIndexUrl);
        const packageManifest = await this.fetchJson<PackageManifest>(packageManifestUrl);
        packageManifest.heroImagePath = packageManifest.heroImagePath
            ? this.resolveManifestPath(packageManifest.heroImagePath, packageManifestUrl)
            : packageManifest.heroImagePath;
        packageManifest.imagePath = packageManifest.imagePath
            ? this.resolveManifestPath(packageManifest.imagePath, packageManifestUrl)
            : (packageCard.imagePath ? this.resolveManifestPath(packageCard.imagePath, packagesIndexUrl) : packageManifest.imagePath);
        packageManifest.thumbnailPath = packageManifest.thumbnailPath
            ? this.resolveManifestPath(packageManifest.thumbnailPath, packageManifestUrl)
            : (packageCard.thumbnailPath ? this.resolveManifestPath(packageCard.thumbnailPath, packagesIndexUrl) : packageManifest.thumbnailPath);
        packageManifest.gallery = (packageManifest.gallery || []).map(item => this.resolveManifestPath(item, packageManifestUrl));
        packageManifest.latestVersion = packageManifest.latestVersion?.trim() || packageCard.latestVersion?.trim();
        packageManifest.unlockAtUtc = packageManifest.unlockAtUtc?.trim();
        packageManifest.visibility = packageManifest.visibility?.trim().toLowerCase() === "secret"
            ? "secret"
            : (packageCard.visibility?.trim().toLowerCase() === "secret" ? "secret" : "public");
        packageManifest.secretUnlockId = packageManifest.secretUnlockId?.trim() || packageCard.secretUnlockId?.trim();

        this.cache.packageDetails.set(cacheKey, packageManifest);
        return packageManifest;
    }

    resolveManifestPath(pathOrUrl: string, baseUrl: string): string {
        if (!pathOrUrl) {
            return pathOrUrl;
        }
        if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
            return pathOrUrl;
        }
        return new URL(pathOrUrl, ensureTrailingSlash(baseUrl)).toString();
    }

    clearCache(): void {
        this.cache.index = undefined;
        this.cache.gameVersions = undefined;
        this.cache.launcherUpdates = undefined;
        this.cache.radioManifest = undefined;
        this.cache.channels.clear();
        this.cache.packageIndexes.clear();
        this.cache.packageDetails.clear();
    }

    private async fetchJson<T>(url: string): Promise<T> {
        const response = await fetchWithTimeout(
            url,
            {
                method: "GET",
                cache: "no-store",
                headers: {
                    Accept: "application/json",
                    // Private lab repos (e.g. bapbap-manifest-lab) need a PAT.
                    ...githubAuthHeaders(this.settings.getGithubToken(), url),
                },
            },
            MANIFEST_TIMEOUT_MS
        );
        if (!response.ok) {
            throw new Error(`Manifest request failed (${response.status}) for ${url}`);
        }
        return response.json() as Promise<T>;
    }
}

function ensureTrailingSlash(url: string): string {
    return url.endsWith("/") ? url : `${url.substring(0, url.lastIndexOf("/") + 1)}`;
}

function normalizeLauncherRelease(release: LauncherUpdateRelease): LauncherUpdateRelease {
    return {
        ...release,
        version: String(release.version || "").trim(),
        channel: release.channel?.trim().toLowerCase(),
        notes: release.notes?.trim(),
        publishedAtUtc: release.publishedAtUtc?.trim(),
        windows: release.windows
            ? {
                  x64: normalizeLauncherAsset(release.windows.x64),
                  arm64: normalizeLauncherAsset(release.windows.arm64),
                  default: normalizeLauncherAsset(release.windows.default),
              }
            : undefined,
    };
}

function normalizeLauncherAsset(asset?: LauncherUpdateAsset): LauncherUpdateAsset | undefined {
    if (!asset?.url) {
        return undefined;
    }
    return {
        url: String(asset.url).trim(),
        sha256: asset.sha256?.trim(),
        fileName: asset.fileName?.trim(),
    };
}

function normalizeMelonLoaderManifest(manifest: MelonLoaderManifest, baseUrl: string): MelonLoaderManifest {
    return {
        requiredVersion: String(manifest.requiredVersion || "").trim(),
        x64: {
            url: manifest.x64?.url ? new URL(manifest.x64.url, ensureTrailingSlash(baseUrl)).toString() : "",
            sha256: manifest.x64?.sha256?.trim() || "",
        },
        x86: {
            url: manifest.x86?.url ? new URL(manifest.x86.url, ensureTrailingSlash(baseUrl)).toString() : "",
            sha256: manifest.x86?.sha256?.trim() || "",
        },
    };
}
