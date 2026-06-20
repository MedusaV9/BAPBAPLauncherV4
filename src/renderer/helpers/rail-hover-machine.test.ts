import { describe, expect, it } from "vitest";
import { computeRailExpanded, transitionRailHover, type RailHoverSnapshot } from "./rail-hover-machine";

function snapshot(partial: Partial<RailHoverSnapshot> = {}): RailHoverSnapshot {
    return {
        manualCollapsed: true,
        hoverExpanded: false,
        closeTimerArmed: false,
        ...partial,
    };
}

describe("rail hover machine", () => {
    it("expands immediately on mouse enter when collapsed", () => {
        const next = transitionRailHover(snapshot({ manualCollapsed: true }), "mouseEnter");
        expect(next.hoverExpanded).toBe(true);
        expect(next.closeTimerArmed).toBe(false);
    });

    it("arms close timer on leave and collapses on timer", () => {
        const left = transitionRailHover(snapshot({ manualCollapsed: true, hoverExpanded: true }), "mouseLeave");
        expect(left.closeTimerArmed).toBe(true);
        const timed = transitionRailHover(left, "leaveTimerElapsed");
        expect(timed.hoverExpanded).toBe(false);
        expect(timed.closeTimerArmed).toBe(false);
    });

    it("re-enter before timeout cancels pending collapse", () => {
        const left = transitionRailHover(snapshot({ manualCollapsed: true, hoverExpanded: true }), "mouseLeave");
        const reenter = transitionRailHover(left, "mouseEnter");
        expect(reenter.hoverExpanded).toBe(true);
        expect(reenter.closeTimerArmed).toBe(false);
    });

    it("never uses hover expansion when manual collapse is disabled", () => {
        const entered = transitionRailHover(snapshot({ manualCollapsed: false, hoverExpanded: false }), "mouseEnter");
        expect(entered.hoverExpanded).toBe(false);
        expect(computeRailExpanded(false, entered.hoverExpanded)).toBe(true);
    });
});

