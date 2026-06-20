import { describe, expect, it } from "vitest";
import { planViewModeMutation } from "./view-mode-state";

describe("view mode mutation plan", () => {
    it("does not mutate when mode remains unchanged", () => {
        const plan = planViewModeMutation("mods", "tiles", "tiles");
        expect(plan.shouldMutate).toBe(false);
        expect(plan.nextViewMode).toBe("tiles");
        expect(plan.workspaceAfter).toBe("mods");
    });

    it("changes only view mode and keeps workspace stable", () => {
        const plan = planViewModeMutation("mods", "tiles", "list");
        expect(plan.shouldMutate).toBe(true);
        expect(plan.nextViewMode).toBe("list");
        expect(plan.workspaceAfter).toBe("mods");
    });
});

