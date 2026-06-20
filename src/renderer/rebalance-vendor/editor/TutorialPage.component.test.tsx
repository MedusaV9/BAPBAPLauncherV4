// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TutorialPage } from "./TutorialPage";

vi.mock("./motion", () => ({
    useAttentionPulse: () => React.createRef<HTMLDivElement>(),
    usePageEntranceMotion: () => React.createRef<HTMLDivElement>(),
    useTabTransition: () => ({ ref: React.createRef<HTMLElement>() }),
}));

describe("TutorialPage", () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    const bootstrap = {
        workspace: {
            workspaceRoot: "C:/Profiles/Standard/UserData/BalanceMod",
        },
    } as any;

    it("uses embedded-safe guidance copy inside the launcher", () => {
        render(
            <TutorialPage
                bootstrap={bootstrap}
                embedded
                mode="guided"
                onPageChange={() => undefined}
                onOpenFolder={() => undefined}
                onSnapshot={() => undefined}
                onDismissQuickStart={() => undefined}
                onStartInteractiveTour={() => undefined}
                onChangeMode={() => undefined}
            />
        );

        expect(screen.getByTestId("rebalance-tutorial-embedded")).toBeTruthy();
        expect(screen.getByText(/launcher already picked the profile/i)).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Utilities" }));

        expect(screen.getByRole("button", { name: "Open Profile Workspace" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Check selected profile" })).toBeTruthy();
        expect(screen.queryByText(/confirm the game folder once/i)).toBeNull();
    });
});
