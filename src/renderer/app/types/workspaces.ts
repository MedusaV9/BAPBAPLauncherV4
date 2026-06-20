export type WorkspaceId = "instances" | "launch" | "mods" | "radio" | "tools" | "settings";

export const WORKSPACE_IDS: readonly WorkspaceId[] = [
    "instances",
    "launch",
    "mods",
    "radio",
    "tools",
    "settings",
] as const;
