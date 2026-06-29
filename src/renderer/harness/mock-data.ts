import type {
    AppSettings,
    ConfigFileContent,
    ConfigFileEntry,
    ContentStateMap,
    InstanceInstallState,
    LaunchRuntimeState,
    LauncherUpdaterState,
    TrustedTimeState,
} from "../../shared/ipc";
import { LOCKED_FX_SETTINGS } from "../../shared/fx-settings";
import { createEmptyRadioState, type RadioState } from "../../shared/radio";
import { CURRENT_SETUP_VERSION } from "../../shared/setup";
import standardHeroImage from "../assets/harness/hero-standard.png";
import bossRushHeroImage from "../assets/harness/hero-boss-rush.png";
import type {
    ChannelManifest,
    GameVersionsManifest,
    InstalledInstance,
    ManifestIndex,
    OfficialVersionEntry,
    PackageCard,
    PackageManifest,
    PackageVersionRef,
} from "../../shared/manifest";

function svgDataUrl(label: string, background: string, accent: string): string {
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
            <defs>
                <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="${background}" />
                    <stop offset="100%" stop-color="#0b1329" />
                </linearGradient>
                <radialGradient id="spot" cx="65%" cy="35%" r="55%">
                    <stop offset="0%" stop-color="${accent}" stop-opacity="0.92" />
                    <stop offset="100%" stop-color="${accent}" stop-opacity="0" />
                </radialGradient>
                <linearGradient id="glass" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="rgba(255,255,255,0.16)" />
                    <stop offset="100%" stop-color="rgba(255,255,255,0.02)" />
                </linearGradient>
            </defs>
            <rect width="1600" height="900" fill="url(#bg)" />
            <rect width="1600" height="900" fill="url(#spot)" />
            <rect x="74" y="86" width="1452" height="728" rx="34" fill="rgba(10,16,28,0.38)" stroke="rgba(255,255,255,0.14)" stroke-width="4" />
            <rect x="118" y="146" width="640" height="420" rx="28" fill="rgba(5,9,18,0.38)" stroke="rgba(255,255,255,0.18)" stroke-width="3" />
            <path d="M1030 188 L1410 188 L1205 604 L820 604 Z" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.14)" stroke-width="3" />
            <circle cx="1164" cy="360" r="104" fill="rgba(255,255,255,0.08)" />
            <circle cx="1164" cy="360" r="58" fill="${accent}" fill-opacity="0.55" />
            <path d="M255 512 C420 388, 566 418, 710 540" fill="none" stroke="${accent}" stroke-opacity="0.75" stroke-width="18" stroke-linecap="round" />
            <path d="M236 546 C390 448, 560 476, 734 628" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="10" stroke-linecap="round" />
            <text x="90" y="170" fill="#f8fbff" font-family="Segoe UI, Arial, sans-serif" font-size="88" font-weight="700">${label}</text>
            <text x="94" y="260" fill="#d2dcf8" font-family="Segoe UI, Arial, sans-serif" font-size="30">Harness Fixture</text>
            <text x="160" y="735" fill="rgba(248,251,255,0.82)" font-family="Segoe UI, Arial, sans-serif" font-size="28">Contained image preview</text>
        </svg>
    `;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function gallery(label: string, background: string, accent: string): string[] {
    return [
        svgDataUrl(`${label} Cover`, background, accent),
        svgDataUrl(`${label} Alt`, accent, background),
    ];
}

function versionRefs(version: string): PackageVersionRef[] {
    return [
        {
            version,
            versionManifestPath: `release/${version}.json`,
            changelog: "Fixture version for harness smoke flows.",
        },
    ];
}

export const harnessAudioFixture = "data:audio/wav;base64,UklGRlQAAABXQVZFZm10IBAAAAABAAEAgD4AAIA+AAABAAgAZGF0YTAAAAAAAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA";

const standardImage = standardHeroImage;
const bossRushImage = bossRushHeroImage;

export const harnessSettings: AppSettings = {
    manifestUrl: "https://example.test/manifest/index.json",
    launcherAutoUpdate: true,
    launcherAutoDownloadUpdates: true,
    launcherAutoInstallOnNextStart: true,
    toolsUnlocked: false,
    bundlesRevealed: false,
    modsSecretUnlocked: false,
    modsUnlockedSecretIds: [],
    launchShowMelonConsole: true,
    launchHideMelonLoaderStartupWarning: false,
    launchDefaultProfileId: "profile-standard",
    launchAutoplayVideos: true,
    instancesRoot: "C:/BAPBAP/Profiles",
    leftRailCollapsed: false,
    leftRailAutoHover: true,
    instancesViewMode: "tiles",
    contentViewMode: "tiles",
    uiMotionProfile: LOCKED_FX_SETTINGS.uiMotionProfile,
    uiMotionTier: LOCKED_FX_SETTINGS.uiMotionTier,
    uiMotionMaximalFx: LOCKED_FX_SETTINGS.uiMotionMaximalFx,
    uiMotionEnabled: true,
    uiMotionAdaptive: LOCKED_FX_SETTINGS.uiMotionAdaptive,
    uiMotionSpeed: LOCKED_FX_SETTINGS.uiMotionSpeed,
    uiOnboardingCompleted: true,
    setupVersionCompleted: CURRENT_SETUP_VERSION,
    debugShowEffectLab: false,
    radioVolume: 0.72,
    radioMuted: false,
    radioCrossfadeMs: 2200,
    radioAutoplayOnLaunch: false,
    radioRememberPlaybackState: true,
    uiScale: 1,
    closeToTrayEnabled: true,
    language: "en",
    brAccountId: "custom-harness00000",
};

export const harnessBuildInfo = {
    appVersion: "0.1.0",
    environment: "playwright-harness",
    buildTimestamp: "2026-03-07T12:00:00Z",
};

export const harnessManifestIndex: ManifestIndex = {
    schemaVersion: 1,
    timeSourceUrl: "https://example.test/time",
    secretUnlocks: [
        {
            id: "default",
            label: "Default secret mods",
            passwordSha256: "9fcb66908db7aa4286fb44a8066e84a6327e3b235cd8bedecf12aa4c619851a9",
        },
    ],
    gameVersionsManifestPath: "versions.json",
    radioManifestPath: "radio/radio.json",
    channels: [{ id: "release", name: "Release", manifestPath: "release/channel.json", enabled: true, order: 1 }],
    game: {
        name: "BAPBAP",
        executable: "BAPBAP.exe",
        dataFolder: "BAPBAP_Data",
        steam: {
            appId: "2226280",
            depotId: "2226283",
        },
    },
};

export const harnessTrustedTimeState: TrustedTimeState = {
    status: "ready",
    configured: true,
    available: true,
    sourceUrl: "https://example.test/time",
    trustedEpochMs: Date.parse("2026-03-07T12:00:00Z"),
    syncedAtUtc: "2026-03-07T12:00:00Z",
};

const standardVersion: OfficialVersionEntry = {
    id: "latest",
    track: "bapbap",
    gameVersion: "build-2025-08-19-750068",
    displayName: "BAPBAP",
    description: "Latest official BAPBAP release.",
    imagePath: standardImage,
    releaseDateUtc: "2025-08-19T18:14:42Z",
    recommended: true,
    order: 1,
    directDownloadUrl: "https://example.test/downloads/std-latest.zip",
    directDownloadFileName: "std-latest.zip",
    tags: ["official"],
    visual: { tags: ["radiant"], ribbonTags: ["recommended"] },
};

const bossVersion: OfficialVersionEntry = {
    id: "boss-rush",
    track: "boss-rush",
    gameVersion: "boss-rush",
    displayName: "Boss Rush",
    description: "Boss Rush branch snapshot.",
    imagePath: bossRushImage,
    releaseDateUtc: "2025-06-10T17:58:43Z",
    order: 1,
    directDownloadUrl: "https://example.test/downloads/boss-rush.zip",
    directDownloadFileName: "boss-rush.zip",
    tags: ["snapshot"],
    visual: { tags: ["cyberpunk"], ribbonTags: ["hot"] },
};

export const harnessGameVersions: GameVersionsManifest = {
    schemaVersion: 1,
    versions: [standardVersion, bossVersion],
};

export const harnessChannelManifest: ChannelManifest = {
    schemaVersion: 1,
    channelId: "release",
    displayName: "Release",
    packagesIndexPath: "release/packages.json",
};

export const harnessInstances: InstalledInstance[] = [
    {
        id: "profile-standard",
        profileName: "Standard",
        versionId: standardVersion.id,
        gameVersion: standardVersion.gameVersion,
        name: "Standard",
        version: standardVersion.gameVersion,
        track: "bapbap",
        path: "C:/BAPBAP/Profiles/Standard",
        imageUrl: standardImage,
        officialManaged: true,
        officialTrack: "bapbap",
        lastUpdatedUtc: "2026-03-07T12:00:00Z",
    },
    {
        id: "profile-creator-kit",
        profileName: "Creator Kit",
        versionId: standardVersion.id,
        gameVersion: standardVersion.gameVersion,
        name: "Creator Kit",
        version: standardVersion.gameVersion,
        track: "bapbap",
        path: "C:/BAPBAP/Profiles/Creator Kit",
        imageUrl: standardImage,
        officialManaged: true,
        officialTrack: "bapbap",
        lastUpdatedUtc: "2026-03-07T12:10:00Z",
    },
    {
        id: "profile-boss-rush",
        profileName: "Boss Rush",
        versionId: bossVersion.id,
        gameVersion: bossVersion.gameVersion,
        name: "Boss Rush",
        version: bossVersion.gameVersion,
        track: "boss-rush",
        path: "C:/BAPBAP/Profiles/Boss Rush",
        imageUrl: bossRushImage,
        officialManaged: true,
        officialTrack: "boss-rush",
        lastUpdatedUtc: "2026-03-07T11:42:00Z",
    },
    {
        id: "steam:c:/steam/steamapps/common/bapbap",
        profileName: "BAPBAP (Steam)",
        versionId: "steam-library",
        gameVersion: "Steam build 19658140",
        name: "BAPBAP (Steam)",
        version: "Steam build 19658140",
        track: "steam",
        path: "C:/steam/steamapps/common/BAPBAP",
        imageUrl: standardImage,
        officialManaged: false,
        lastUpdatedUtc: new Date(0).toISOString(),
        instanceSource: "steam-library",
        compatibilityWarning: "Steam installs are detected automatically. Launching and basic mod support should work, but some launcher-only features may behave differently.",
    },
    // Bundle Instance fixture. Only surfaced by the harness mock list()
    // when settings.bundlesRevealed is true (matches the production gate
    // — see docs/bundle-instance/BUNDLE_INSTANCE_MASTER_SPEC.md §3.1).
    {
        id: "profile-bundle-monthly",
        profileName: "BAPBAP Bundle (Monthly)",
        versionId: "bundle:bapbap-monthly:1.4.0",
        gameVersion: "1.4.0",
        name: "BAPBAP Bundle (Monthly)",
        version: "1.4.0",
        track: "bundle",
        path: "C:/BAPBAP/Profiles/BAPBAP Bundle (Monthly)",
        imageUrl: standardImage,
        officialManaged: true,
        officialTrack: "bundle",
        lastUpdatedUtc: "2026-03-07T12:30:00Z",
        instanceSource: "official-managed",
        instanceType: "bundle",
        bundleId: "bapbap-monthly",
        bundleChannel: "release",
        bundleVersion: "1.4.0",
        bundleBuildNumber: 42,
        bundleLastCheckUtc: "2026-03-07T12:30:00Z",
        bundleLastApplyUtc: "2026-03-07T12:25:00Z",
    },
];

export const harnessPackages: PackageCard[] = [
    {
        id: "sonic.bapbap.hidden-dev-arguments",
        type: "mod",
        name: "BAPBAP Hidden Dev Arguments",
        summary: "Full native argument catalog and arena category integration.",
        description: "Standalone mod that extends hidden/dev argument access and category integration for BAPBAP.",
        imagePath: svgDataUrl("Hidden Dev Arguments", "#2f1839", "#ff8bd8"),
        thumbnailPath: svgDataUrl("Hidden Dev Arguments", "#291333", "#ff79cc"),
        packageManifestPath: "release/sonic.bapbap.hidden-dev-arguments.json",
        latestVersion: "1.0.0",
        tags: ["mod", "dev", "arguments", "arena", "secret"],
        visual: { tags: ["hidden_candy"], ribbonTags: ["secret"] },
        supportedTracks: ["bapbap", "boss-rush"],
    },
    {
        id: "sonic.bapbap.pool-randomizer",
        type: "mod",
        name: "BAPBAP Pool Randomizer",
        summary: "Rarity-aware randomizer across vanilla, legacy and hidden pools.",
        description: "Standalone pool randomizer for BAPBAP with tier-aware replacement and broad candidate coverage.",
        imagePath: svgDataUrl("Pool Randomizer", "#16224d", "#7f92ff"),
        thumbnailPath: svgDataUrl("Pool Randomizer", "#131d41", "#7584ff"),
        packageManifestPath: "release/sonic.bapbap.pool-randomizer.json",
        latestVersion: "1.0.0",
        tags: ["mod", "randomizer", "pool", "qol"],
        visual: {},
        supportedTracks: ["bapbap"],
    },
    {
        id: "sonic.bapbap.hp-numbers",
        type: "mod",
        name: "BAPBAP HP Numbers",
        summary: "Shows your HP as a Number.",
        description: "It displays your HP as a Number.",
        imagePath: svgDataUrl("HP Numbers", "#3d1f2a", "#ff8d8d"),
        thumbnailPath: svgDataUrl("HP Numbers", "#341924", "#ff8080"),
        packageManifestPath: "release/sonic.bapbap.hp-numbers.json",
        latestVersion: "1.0.1",
        tags: ["mod", "ui", "hp", "qol"],
        visual: {},
        supportedTracks: ["bapbap", "boss-rush"],
    },
    {
        id: "sonic.bapbap.arena-random-chars",
        type: "mod",
        name: "BAPBAP Arena Random Chars",
        summary: "Random character assignment for arena rounds.",
        description: "Standalone arena random character mod that rotates characters during active arena matches.",
        imagePath: svgDataUrl("Arena Random Chars", "#1d203b", "#b8beff"),
        thumbnailPath: svgDataUrl("Arena Random Chars", "#181c32", "#abb2ff"),
        packageManifestPath: "release/sonic.bapbap.arena-random-chars.json",
        latestVersion: "1.0.0",
        tags: ["mod", "arena", "characters", "random"],
        visual: { ribbonTags: ["host-only"] },
        supportedTracks: ["bapbap", "boss-rush"],
    },
    {
        id: "sonic.bapbap.br-ui-old-but-gold",
        type: "mod",
        name: "BR UI (Old But Gold)",
        summary: "Restores the classic Battle Royale style UI.",
        description: "Adds the old Battle Royale HUD/UI style back into BAPBAP.",
        imagePath: svgDataUrl("BR UI", "#2a190f", "#ffb56f"),
        thumbnailPath: svgDataUrl("BR UI", "#25150d", "#ffa14d"),
        packageManifestPath: "release/sonic.bapbap.br-ui-old-but-gold.json",
        latestVersion: "1.0.0",
        tags: ["mod", "ui", "battle-royale", "legacy"],
        visual: { tags: ["hidden_ember"] },
        supportedTracks: ["bapbap"],
    },
    {
        id: "sonic.bapbap.fps-camera",
        type: "mod",
        name: "BAPFPS (First/Third Person)",
        summary: "Enables first-person and third-person camera gameplay.",
        description: "Camera mod that enables switching into first-person and third-person perspectives.",
        imagePath: svgDataUrl("BAPFPS", "#17253f", "#8bd8ff"),
        thumbnailPath: svgDataUrl("BAPFPS", "#132036", "#7dd2ff"),
        packageManifestPath: "release/sonic.bapbap.fps-camera.json",
        latestVersion: "0.2.0",
        tags: ["mod", "camera", "first-person", "third-person"],
        visual: {},
        supportedTracks: ["bapbap", "boss-rush"],
    },
    {
        id: "sonic.bapbap.asset-dumper",
        type: "tool",
        name: "BAPBAP Asset Dumper",
        summary: "Dump assets, icons and sounds from BAPBAP into a local folder.",
        description: "If you want all assets, icons and sounds inside of the game, use this tool/mod to dump them into a folder so you can reuse them.",
        imagePath: svgDataUrl("Asset Dumper", "#20212b", "#d9e2ff"),
        thumbnailPath: svgDataUrl("Asset Dumper", "#1a1b22", "#d4dcff"),
        packageManifestPath: "release/sonic.bapbap.asset-dumper.json",
        latestVersion: "1.0.0",
        tags: ["tool", "asset-dump", "modding", "audio"],
        visual: {},
        supportedTracks: ["bapbap", "boss-rush"],
    },
    {
        id: "jackmygoodman.bapbap.boss-rush-qol",
        type: "mod",
        name: "BossRushQoL",
        summary: "Infinite Rerolls",
        description: "A QoL mod for the boss rush game mode, currently allows for unlimited rerolls inside of Boss Rush.",
        imagePath: bossRushImage,
        thumbnailPath: bossRushImage,
        packageManifestPath: "release/jackmygoodman.bapbap.boss-rush-qol.json",
        latestVersion: "1.0.0",
        tags: ["mod", "boss-rush", "qol"],
        visual: { tags: ["cyberpunk"] },
        supportedTracks: ["boss-rush"],
    },
];

export const harnessPackageDetails: Record<string, PackageManifest> = {
    "sonic.bapbap.hidden-dev-arguments": {
        schemaVersion: 1,
        id: "sonic.bapbap.hidden-dev-arguments",
        type: "mod",
        name: "BAPBAP Hidden Dev Arguments",
        summary: harnessPackages[0].summary,
        description: harnessPackages[0].description,
        heroImagePath: gallery("Hidden Dev Arguments Hero", "#2f1839", "#ff8bd8")[0],
        imagePath: harnessPackages[0].imagePath,
        thumbnailPath: harnessPackages[0].thumbnailPath,
        gallery: gallery("Hidden Dev Arguments", "#2f1839", "#ff8bd8"),
        tags: harnessPackages[0].tags,
        visual: harnessPackages[0].visual,
        supportedTracks: harnessPackages[0].supportedTracks,
        authors: [{ name: "Sonic0810", role: "Owner", profileUrl: "https://github.com/Sonic0810" }],
        owner: { name: "Sonic0810", profileUrl: "https://github.com/Sonic0810" },
        latestVersion: "1.0.0",
        versions: versionRefs("1.0.0"),
    },
    "sonic.bapbap.pool-randomizer": {
        schemaVersion: 1,
        id: "sonic.bapbap.pool-randomizer",
        type: "mod",
        name: "BAPBAP Pool Randomizer",
        summary: harnessPackages[1].summary,
        description: harnessPackages[1].description,
        imagePath: harnessPackages[1].imagePath,
        thumbnailPath: harnessPackages[1].thumbnailPath,
        gallery: gallery("Pool Randomizer", "#16224d", "#7f92ff"),
        tags: harnessPackages[1].tags,
        visual: harnessPackages[1].visual,
        supportedTracks: harnessPackages[1].supportedTracks,
        authors: [{ name: "Sonic0810", role: "Owner", profileUrl: "https://github.com/Sonic0810" }],
        owner: { name: "Sonic0810", profileUrl: "https://github.com/Sonic0810" },
        latestVersion: "1.0.0",
        versions: versionRefs("1.0.0"),
    },
    "sonic.bapbap.hp-numbers": {
        schemaVersion: 1,
        id: "sonic.bapbap.hp-numbers",
        type: "mod",
        name: "BAPBAP HP Numbers",
        summary: harnessPackages[2].summary,
        description: harnessPackages[2].description,
        imagePath: harnessPackages[2].imagePath,
        thumbnailPath: harnessPackages[2].thumbnailPath,
        gallery: gallery("HP Numbers", "#3d1f2a", "#ff8d8d"),
        tags: harnessPackages[2].tags,
        visual: harnessPackages[2].visual,
        supportedTracks: harnessPackages[2].supportedTracks,
        authors: [{ name: "Sonic0810", role: "Owner", profileUrl: "https://github.com/Sonic0810" }],
        owner: { name: "Sonic0810", profileUrl: "https://github.com/Sonic0810" },
        latestVersion: "1.0.1",
        versions: versionRefs("1.0.1"),
    },
    "sonic.bapbap.arena-random-chars": {
        schemaVersion: 1,
        id: "sonic.bapbap.arena-random-chars",
        type: "mod",
        name: "BAPBAP Arena Random Chars",
        summary: harnessPackages[3].summary,
        description: harnessPackages[3].description,
        imagePath: harnessPackages[3].imagePath,
        thumbnailPath: harnessPackages[3].thumbnailPath,
        gallery: gallery("Arena Random Chars", "#1d203b", "#b8beff"),
        tags: harnessPackages[3].tags,
        visual: harnessPackages[3].visual,
        supportedTracks: harnessPackages[3].supportedTracks,
        authors: [{ name: "Sonic0810", role: "Owner", profileUrl: "https://github.com/Sonic0810" }],
        owner: { name: "Sonic0810", profileUrl: "https://github.com/Sonic0810" },
        latestVersion: "1.0.0",
        versions: versionRefs("1.0.0"),
    },
    "sonic.bapbap.br-ui-old-but-gold": {
        schemaVersion: 1,
        id: "sonic.bapbap.br-ui-old-but-gold",
        type: "mod",
        name: "BR UI (Old But Gold)",
        summary: harnessPackages[4].summary,
        description: harnessPackages[4].description,
        imagePath: harnessPackages[4].imagePath,
        thumbnailPath: harnessPackages[4].thumbnailPath,
        gallery: gallery("BR UI", "#2a190f", "#ffb56f"),
        tags: harnessPackages[4].tags,
        visual: harnessPackages[4].visual,
        supportedTracks: harnessPackages[4].supportedTracks,
        authors: [{ name: "Sonic0810", role: "Owner", profileUrl: "https://github.com/Sonic0810" }],
        owner: { name: "Sonic0810", profileUrl: "https://github.com/Sonic0810" },
        latestVersion: "1.0.0",
        versions: versionRefs("1.0.0"),
    },
    "sonic.bapbap.fps-camera": {
        schemaVersion: 1,
        id: "sonic.bapbap.fps-camera",
        type: "mod",
        name: "BAPFPS (First/Third Person)",
        summary: harnessPackages[5].summary,
        description: harnessPackages[5].description,
        heroImagePath: gallery("BAPFPS Hero", "#17253f", "#8bd8ff")[0],
        imagePath: harnessPackages[5].imagePath,
        thumbnailPath: harnessPackages[5].thumbnailPath,
        gallery: gallery("BAPFPS", "#17253f", "#8bd8ff"),
        tags: harnessPackages[5].tags,
        visual: harnessPackages[5].visual,
        supportedTracks: harnessPackages[5].supportedTracks,
        authors: [{ name: "Sonic0810", role: "Owner", profileUrl: "https://github.com/Sonic0810" }],
        owner: { name: "Sonic0810", profileUrl: "https://github.com/Sonic0810" },
        latestVersion: "0.2.0",
        versions: versionRefs("0.2.0"),
    },
    "sonic.bapbap.asset-dumper": {
        schemaVersion: 1,
        id: "sonic.bapbap.asset-dumper",
        type: "tool",
        name: "BAPBAP Asset Dumper",
        summary: harnessPackages[6].summary,
        description: harnessPackages[6].description,
        imagePath: harnessPackages[6].imagePath,
        thumbnailPath: harnessPackages[6].thumbnailPath,
        gallery: gallery("Asset Dumper", "#20212b", "#d9e2ff"),
        tags: harnessPackages[6].tags,
        visual: harnessPackages[6].visual,
        supportedTracks: harnessPackages[6].supportedTracks,
        authors: [{ name: "Sonic0810", role: "Owner", profileUrl: "https://github.com/Sonic0810" }],
        owner: { name: "Sonic0810", profileUrl: "https://github.com/Sonic0810" },
        latestVersion: "1.0.0",
        versions: versionRefs("1.0.0"),
    },
    "jackmygoodman.bapbap.boss-rush-qol": {
        schemaVersion: 1,
        id: "jackmygoodman.bapbap.boss-rush-qol",
        type: "mod",
        name: "BossRushQoL",
        summary: harnessPackages[7].summary,
        description: harnessPackages[7].description,
        imagePath: harnessPackages[7].imagePath,
        thumbnailPath: harnessPackages[7].thumbnailPath,
        gallery: [bossRushImage],
        tags: harnessPackages[7].tags,
        visual: harnessPackages[7].visual,
        supportedTracks: harnessPackages[7].supportedTracks,
        authors: [{ name: "JackMyGoodMan", role: "Creator" }],
        owner: { name: "JackMyGoodMan" },
        latestVersion: "1.0.0",
        versions: versionRefs("1.0.0"),
    },
};

export const harnessContentStates: Record<string, ContentStateMap> = {
    "profile-standard": {
        "release::sonic.bapbap.hp-numbers": { status: "installed-enabled", version: "1.0.1" },
        "release::sonic.bapbap.pool-randomizer": { status: "installed-disabled", version: "1.0.0" },
    },
    "profile-creator-kit": {
        "release::sonic.bapbap.asset-dumper": { status: "installed-enabled", version: "1.0.0" },
    },
    "profile-boss-rush": {
        "release::jackmygoodman.bapbap.boss-rush-qol": { status: "installed-enabled", version: "1.0.0" },
        "release::sonic.bapbap.fps-camera": { status: "installed-enabled", version: "0.2.0" },
        "release::sonic.bapbap.br-ui-old-but-gold": { status: "installed-disabled", version: "1.0.0" },
    },
};

export const harnessConfigEntriesByInstance: Record<string, ConfigFileEntry[]> = {
    "profile-standard": [
        { path: "UserData/settings.json", section: "UserData", size: 184, modifiedAtUtc: "2026-03-07T12:00:00Z" },
        { path: "Mods/Config/BAPBAP.HPNumbers.cfg", section: "Mods/Config", size: 96, modifiedAtUtc: "2026-03-07T11:58:00Z" },
    ],
    "profile-creator-kit": [{ path: "UserData/settings.json", section: "UserData", size: 212, modifiedAtUtc: "2026-03-07T12:08:00Z" }],
    "profile-boss-rush": [
        { path: "UserData/settings.json", section: "UserData", size: 164, modifiedAtUtc: "2026-03-07T11:42:00Z" },
        { path: "Mods/Config/BossRushQoL.cfg", section: "Mods/Config", size: 88, modifiedAtUtc: "2026-03-07T11:41:00Z" },
    ],
};

export const harnessConfigContentByPath: Record<string, ConfigFileContent> = {
    "UserData/settings.json": {
        path: "UserData/settings.json",
        extension: ".json",
        content: JSON.stringify({ profile: "standard", fullscreen: false, volume: 0.72 }, null, 2),
    },
    "Mods/Config/BAPBAP.HPNumbers.cfg": {
        path: "Mods/Config/BAPBAP.HPNumbers.cfg",
        extension: ".cfg",
        content: "showThousandsSeparator=true\nshowShieldValues=true\n",
    },
    "Mods/Config/BossRushQoL.cfg": {
        path: "Mods/Config/BossRushQoL.cfg",
        extension: ".cfg",
        content: "infiniteRerolls=true\nshowBossHints=true\n",
    },
};

export const harnessUpdaterState: LauncherUpdaterState = {
    status: "upToDate",
    configured: true,
    currentVersion: "0.1.0",
    updateAvailable: false,
    latestVersion: "0.1.0",
    notes: "",
    publishedAtUtc: "2026-03-01T15:00:00Z",
    channel: "stable",
    checkedAtUtc: "2026-03-07T12:00:00Z",
};

export const harnessLaunchRuntimeState: LaunchRuntimeState = {
    status: "idle",
    recentLogs: [],
};

export const harnessInstallState: InstanceInstallState = {
    status: "idle",
};

export const harnessRadioState: RadioState = {
    ...createEmptyRadioState(),
    sync: {
        status: "ready",
        stationName: "BAPBAP Radio",
        stationSubtitle: "Harness soundtrack station",
        stationArtworkUrl: standardImage,
        libraryVersion: "fixture-1",
        trackCount: 3,
        availableTrackCount: 3,
        importedTrackCount: 0,
        storagePath: "C:/Harness/Radio",
        importsPath: "C:/Harness/Radio/Imports",
        lastSyncedAtUtc: "2026-03-07T12:00:00Z",
    },
    tracks: [
        {
            id: "radio-opening",
            title: "Opening Room",
            artists: ["BAPBAP OST"],
            group: "Vol. 1",
            durationMs: 124000,
            artworkUrl: standardImage,
            playbackUrl: harnessAudioFixture,
            artworkPath: standardImage,
            audioUrl: harnessAudioFixture,
            sha256: "fixture-opening",
            order: 0,
            availableOffline: true,
            source: "synced",
        },
        {
            id: "radio-boss",
            title: "Slime Crown",
            artists: ["BAPBAP OST"],
            group: "Vol. 1",
            durationMs: 139000,
            artworkUrl: bossRushImage,
            playbackUrl: harnessAudioFixture,
            artworkPath: bossRushImage,
            audioUrl: harnessAudioFixture,
            sha256: "fixture-boss",
            order: 1,
            availableOffline: true,
            source: "synced",
        },
        {
            id: "radio-lobby",
            title: "Lobby Drift",
            artists: ["BAPBAP OST"],
            group: "Vol. 1",
            durationMs: 97000,
            artworkUrl: standardImage,
            playbackUrl: harnessAudioFixture,
            artworkPath: standardImage,
            audioUrl: harnessAudioFixture,
            sha256: "fixture-lobby",
            order: 2,
            availableOffline: true,
            source: "synced",
        },
    ],
    playlists: [
        {
            id: "playlist-lobby",
            name: "Lobby Loop",
            trackIds: ["radio-opening", "radio-lobby"],
        },
    ],
    favoriteTrackIds: ["radio-boss"],
    playback: {
        ...createEmptyRadioState().playback,
        currentTrackId: "radio-opening",
        collection: { kind: "all-tracks" },
    },
};
