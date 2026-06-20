export type RailHoverSnapshot = {
    manualCollapsed: boolean;
    hoverExpanded: boolean;
    closeTimerArmed: boolean;
};

export type RailHoverEvent = "mouseEnter" | "mouseLeave" | "leaveTimerElapsed" | "manualCollapseDisabled";

export function transitionRailHover(state: RailHoverSnapshot, event: RailHoverEvent): RailHoverSnapshot {
    switch (event) {
        case "mouseEnter":
            if (!state.manualCollapsed) {
                return { ...state, hoverExpanded: false, closeTimerArmed: false };
            }
            return { ...state, hoverExpanded: true, closeTimerArmed: false };
        case "mouseLeave":
            if (!state.manualCollapsed) {
                return { ...state, hoverExpanded: false, closeTimerArmed: false };
            }
            return { ...state, closeTimerArmed: true };
        case "leaveTimerElapsed":
            if (!state.manualCollapsed || !state.closeTimerArmed) {
                return { ...state, closeTimerArmed: false };
            }
            return { ...state, hoverExpanded: false, closeTimerArmed: false };
        case "manualCollapseDisabled":
            return { ...state, manualCollapsed: false, hoverExpanded: false, closeTimerArmed: false };
        default:
            return state;
    }
}

export function computeRailExpanded(manualCollapsed: boolean, hoverExpanded: boolean): boolean {
    return !manualCollapsed || hoverExpanded;
}

