import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stateful fake content backend so the real ModDetailDialog round-trips its
// usePackageDetail query through the hook.
const back = vi.hoisted(() => ({
    detail: null as Record<string, unknown> | null,
}));

vi.mock("../../api", () => ({
    api: {
        content: {
            getPackageDetail: async () => (back.detail ? structuredClone(back.detail) : null),
        },
    },
}));

import { ModDetailDialog } from "./ModDetailDialog";

function renderDialog(props: Partial<Parameters<typeof ModDetailDialog>[0]> = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const onInstall = vi.fn();
    const onClose = vi.fn();
    render(
        createElement(
            QueryClientProvider,
            { client },
            createElement(ModDetailDialog, {
                channelId: "release",
                packageId: "mod-1",
                installed: false,
                busy: false,
                onInstall,
                onClose,
                ...props,
            })
        )
    );
    return { onInstall, onClose };
}

beforeEach(() => {
    back.detail = {
        schemaVersion: 1,
        id: "mod-1",
        type: "mod",
        name: "Cool Mod",
        summary: "A short summary",
        description: "The full description text.",
        tags: ["gameplay", "ui"],
        latestVersion: "2.3.0",
        owner: { name: "Modder" },
    };
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("ModDetailDialog (MOD-17)", () => {
    it("renders the mod's name, description, tags, version and author", async () => {
        renderDialog();
        expect(await screen.findByText("Cool Mod")).toBeTruthy();
        expect(screen.getByText("The full description text.")).toBeTruthy();
        expect(screen.getByText("gameplay")).toBeTruthy();
        expect(screen.getByText("Modder")).toBeTruthy();
        // version appears as v2.3.0
        expect(screen.getByText(/2\.3\.0/)).toBeTruthy();
    });

    it("calls onInstall with the latest version when Install is clicked", async () => {
        const { onInstall } = renderDialog();
        const install = await screen.findByRole("button", { name: /install/i });
        fireEvent.click(install);
        await waitFor(() => expect(onInstall).toHaveBeenCalledWith("2.3.0"));
    });

    it("shows an Installed disabled button instead of Install when already installed", async () => {
        renderDialog({ installed: true });
        const btn = (await screen.findByRole("button", { name: /installed/i })) as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
    });

    it("calls onClose from the Close button", async () => {
        const { onClose } = renderDialog();
        const close = await screen.findByRole("button", { name: /^close$/i });
        fireEvent.click(close);
        expect(onClose).toHaveBeenCalled();
    });

    it("does not query or render when packageId is null", async () => {
        renderDialog({ packageId: null });
        await new Promise(r => setTimeout(r, 20));
        expect(screen.queryByText("Cool Mod")).toBeNull();
    });
});
