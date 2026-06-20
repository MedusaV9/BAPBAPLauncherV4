// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";
import type { BootstrapPayload } from "./types";

vi.mock("./motion", () => ({
    useAttentionPulse: () => React.createRef<HTMLDivElement>(),
    usePageEntranceMotion: () => React.createRef<HTMLDivElement>(),
    useAnimatedCounter: (v: number) => v,
}));

vi.mock("./ui", () => ({
    Button: ({
        children,
        onPress,
        startContent: _startContent,
        ...props
    }: React.PropsWithChildren<{ onPress?: () => void; startContent?: React.ReactNode }> & Record<string, unknown>) => (
        <button type="button" onClick={onPress} {...props}>
            {children}
        </button>
    ),
}));

const bootstrap = {
    workspace: {
        workspaceRoot: "C:/Profiles/Creator Kit/UserData/BalanceMod",
    },
} as unknown as BootstrapPayload;

function createProps(overrides: Partial<React.ComponentProps<typeof DashboardPage>> = {}): React.ComponentProps<typeof DashboardPage> {
    return {
        bootstrap,
        embedded: false,
        showQuickStart: true,
        onDismissQuickStart: vi.fn(),
        onStartInteractiveTour: vi.fn(),
        onOpenFolder: vi.fn(),
        onSnapshot: vi.fn(),
        onRepairWorkspaceData: vi.fn(),
        onOpenChangeSomething: vi.fn(),
        onOpenCreateSomething: vi.fn(),
        onOpenGameMode: vi.fn(),
        onOpenSwap: vi.fn(),
        onOpenImportExport: vi.fn(),
        recentChangeTitle: "360 Scythe",
        lastDraftTitle: "Starter draft",
        unsavedDraftCount: 2,
        ...overrides,
    };
}

describe("DashboardPage component", () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it("renders the compact quick launcher actions in embedded mode", () => {
        const props = createProps({
            embedded: true,
            onOpenChangeSomething: vi.fn(),
            onStartInteractiveTour: vi.fn(),
            onOpenCreateSomething: vi.fn(),
            onOpenGameMode: vi.fn(),
            onOpenSwap: vi.fn(),
            onOpenImportExport: vi.fn(),
        });

        render(<DashboardPage {...props} />);

        expect(screen.getByTestId("dashboard-page")).toBeTruthy();
        expect(screen.getByText("Open one focused job")).toBeTruthy();
        expect(screen.getByText("360 Scythe")).toBeTruthy();
        expect(screen.getByText("Starter draft")).toBeTruthy();
        expect(screen.queryByText("2 drafts still open")).toBeNull();

        fireEvent.click(screen.getAllByRole("button", { name: "Continue file" })[0]);
        fireEvent.click(screen.getByRole("button", { name: "Open Game Mode" }));
        fireEvent.click(screen.getByRole("button", { name: "Create" }));
        fireEvent.click(screen.getByRole("button", { name: "Swap" }));
        fireEvent.click(screen.getByRole("button", { name: "Open Packs" }));

        expect(props.onOpenChangeSomething).toHaveBeenCalledTimes(1);
        expect(props.onOpenGameMode).toHaveBeenCalledTimes(1);
        expect(props.onOpenCreateSomething).toHaveBeenCalledTimes(1);
        expect(props.onOpenSwap).toHaveBeenCalledTimes(1);
        expect(props.onOpenImportExport).toHaveBeenCalledTimes(1);
    });

    it("keeps utility actions in the support strip outside embedded mode", () => {
        const props = createProps({
            embedded: false,
            onSnapshot: vi.fn(),
            onOpenFolder: vi.fn(),
        });

        render(<DashboardPage {...props} />);
        // Utility actions are icon-only buttons with accessible labels
        const snapshotBtn = screen.getByRole("button", { name: "Save snapshot" });
        const repairBtn = screen.getByRole("button", { name: "Repair workspace data" });
        const openFolderBtn = screen.getByRole("button", { name: "Open workspace folder" });

        fireEvent.click(snapshotBtn);
        expect(props.onSnapshot).toHaveBeenCalledTimes(1);

        fireEvent.click(repairBtn);
        expect(props.onRepairWorkspaceData).toHaveBeenCalledTimes(1);

        fireEvent.click(openFolderBtn);
        expect(props.onOpenFolder).toHaveBeenCalledWith("C:/Profiles/Creator Kit/UserData/BalanceMod");
    });
});
