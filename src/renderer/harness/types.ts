import type { WorkspaceId } from "../app/types/workspaces";

export type HarnessPanel = "none" | "effect-lab";
export type HarnessPreset = "default" | "messy-real" | "ribbon-demo";

export type V2HarnessState = {
    enabled: boolean;
    workspace: WorkspaceId;
    panel: HarnessPanel;
    preset: HarnessPreset;
};
