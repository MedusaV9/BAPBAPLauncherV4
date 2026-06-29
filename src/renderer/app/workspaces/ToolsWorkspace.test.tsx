import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stateful fake backend so the real ToolsWorkspace unlock gate round-trips its
// unlockToolsTab mutation + settings invalidation through the query hooks.
const back = vi.hoisted(() => ({
    settings: {} as Record<string, unknown>,
    correctCode: "letmein",
    unlockCalls: [] as string[],
}));

vi.mock("../../api", () => ({
    api: {
        settings: {
            getAll: async () => structuredClone(back.settings),
            unlockToolsTab: async (code: string) => {
                back.unlockCalls.push(code);
                if (code === back.correctCode) {
                    back.settings.toolsUnlocked = true;
                    return true;
                }
                return false;
            },
        },
        instances: {
            list: async () => [],
        },
    },
}));

import { ToolsWorkspace } from "./ToolsWorkspace";

function renderTools() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(createElement(QueryClientProvider, { client }, createElement(ToolsWorkspace)));
}

beforeEach(() => {
    back.settings = { toolsUnlocked: false };
    back.unlockCalls = [];
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("ToolsWorkspace unlock gate (TOO-01/02)", () => {
    it("shows the unlock gate while tools are locked", async () => {
        renderTools();
        expect(await screen.findByText("Tools Vault")).toBeTruthy();
    });

    it("rejects a wrong code: surfaces the error message and clears the field (TOO-02)", async () => {
        renderTools();
        const input = (await screen.findByPlaceholderText("ENTER UNLOCK CODE")) as HTMLInputElement;

        fireEvent.change(input, { target: { value: "nope" } });
        fireEvent.keyDown(input, { key: "Enter" });

        await waitFor(() => expect(back.unlockCalls).toContain("nope"));
        // Field cleared on failure, and the still-locked gate remains.
        await waitFor(() => expect(input.value).toBe(""));
        expect(screen.getByText("Tools Vault")).toBeTruthy();
        expect(screen.getByText("That code didn't work.")).toBeTruthy();
    });

    it("accepts the correct code and reveals the unlocked workbench (TOO-01)", async () => {
        renderTools();
        const input = await screen.findByPlaceholderText("ENTER UNLOCK CODE");

        fireEvent.change(input, { target: { value: "letmein" } });
        fireEvent.keyDown(input, { key: "Enter" });

        // Settings invalidate → re-fetch with toolsUnlocked=true → workbench shows.
        await waitFor(() => expect(screen.queryByText("Tools Vault")).toBeNull());
        expect(screen.getByText("Unlocked")).toBeTruthy();
    });
});
