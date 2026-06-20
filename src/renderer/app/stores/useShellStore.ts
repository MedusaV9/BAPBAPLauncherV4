import { create } from "zustand";
import type { WorkspaceId } from "../types/workspaces";

export type StartupPhase = "splash" | "bootstrap" | "ready" | "fatal";

type ShellState = {
    startupPhase: StartupPhase;
    fatalMessage: string | null;
    activeWorkspace: WorkspaceId;
    railCollapsed: boolean;
    railHoverExpanded: boolean;
    updateBannerDismissed: boolean;

    setStartupPhase: (phase: StartupPhase) => void;
    setFatal: (message: string) => void;
    setActiveWorkspace: (workspace: WorkspaceId) => void;
    setRailCollapsed: (collapsed: boolean) => void;
    setRailHoverExpanded: (expanded: boolean) => void;
    dismissUpdateBanner: () => void;
};

export const useShellStore = create<ShellState>(set => ({
    startupPhase: "splash",
    fatalMessage: null,
    activeWorkspace: "instances",
    railCollapsed: false,
    railHoverExpanded: false,
    updateBannerDismissed: false,

    setStartupPhase: phase => set({ startupPhase: phase }),
    setFatal: message => set({ startupPhase: "fatal", fatalMessage: message }),
    setActiveWorkspace: workspace => set({ activeWorkspace: workspace }),
    setRailCollapsed: collapsed => set({ railCollapsed: collapsed }),
    setRailHoverExpanded: expanded => set({ railHoverExpanded: expanded }),
    dismissUpdateBanner: () => set({ updateBannerDismissed: true }),
}));
