export type WorkspaceViewId = "instances" | "launch" | "mods" | "settings";
export type ContentViewMode = "tiles" | "list";

export type ViewModeMutationPlan = {
    shouldMutate: boolean;
    nextViewMode: ContentViewMode;
    workspaceAfter: WorkspaceViewId;
};

export function planViewModeMutation(
    workspace: WorkspaceViewId,
    currentMode: ContentViewMode,
    requestedMode: ContentViewMode
): ViewModeMutationPlan {
    if (currentMode === requestedMode) {
        return {
            shouldMutate: false,
            nextViewMode: currentMode,
            workspaceAfter: workspace,
        };
    }
    return {
        shouldMutate: true,
        nextViewMode: requestedMode,
        workspaceAfter: workspace,
    };
}

