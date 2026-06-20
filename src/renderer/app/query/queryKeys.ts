export const qk = {
    buildInfo: ["diagnostics", "buildInfo"] as const,
    updaterState: ["updater", "state"] as const,
    settings: ["settings"] as const,

    manifestIndex: ["manifest", "index"] as const,
    gameVersions: ["manifest", "gameVersions"] as const,
    channel: (channelId?: string) => ["manifest", "channel", channelId ?? "default"] as const,
    trustedTime: ["manifest", "trustedTime"] as const,

    instances: ["instances", "list"] as const,
    installState: ["instances", "installState"] as const,

    runtimeState: ["launch", "runtimeState"] as const,
    runtimeLog: ["launch", "runtimeLog"] as const,

    packages: (channelId?: string) => ["content", "packages", channelId ?? "default"] as const,
    packageDetail: (channelId: string, packageId: string) =>
        ["content", "detail", channelId, packageId] as const,
    contentStates: (instanceId: string) => ["content", "states", instanceId] as const,
    modSets: (instanceId: string) => ["content", "modSets", instanceId] as const,

    configList: (instanceId: string) => ["config", "list", instanceId] as const,
    configFile: (instanceId: string, filePath: string) => ["config", "file", instanceId, filePath] as const,

    radio: ["radio", "state"] as const,

    bundles: ["bundle", "list"] as const,
    bundleInstallProgress: (bundleId: string) => ["bundle", "installProgress", bundleId] as const,
    bundleUpdate: (instanceId: string) => ["bundle", "update", instanceId] as const,
} as const;
