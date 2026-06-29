import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stateful fake content backend so clicks round-trip through the real
// ModSetsBar + query hooks + cache.
type ModSet = { id: string; name: string };
const store = vi.hoisted(() => ({
    sets: [] as ModSet[],
    activeModSetId: "" as string,
    seq: 0,
}));

vi.mock("../../api", () => ({
    api: {
        content: {
            getModSets: async () => ({ sets: structuredClone(store.sets), activeModSetId: store.activeModSetId }),
            createModSet: async (vars: { instanceId: string; name: string }) => {
                store.seq += 1;
                const set = { id: `set-${store.seq}`, name: vars.name };
                store.sets.push(set);
                if (!store.activeModSetId) store.activeModSetId = set.id;
                return { sets: structuredClone(store.sets), activeModSetId: store.activeModSetId };
            },
            renameModSet: async (_i: string, modSetId: string, name: string) => {
                const s = store.sets.find(x => x.id === modSetId);
                if (s) s.name = name;
                return { sets: structuredClone(store.sets), activeModSetId: store.activeModSetId };
            },
            deleteModSet: async (_i: string, modSetId: string) => {
                store.sets = store.sets.filter(x => x.id !== modSetId);
                return { sets: structuredClone(store.sets), activeModSetId: store.activeModSetId };
            },
            activateModSet: async (_i: string, modSetId: string) => {
                store.activeModSetId = modSetId;
                return { sets: structuredClone(store.sets), activeModSetId: store.activeModSetId };
            },
        },
    },
}));

import { ModSetsBar } from "./ModSetsBar";

function renderBar() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
        createElement(QueryClientProvider, { client }, createElement(ModSetsBar, { instanceId: "inst-1" }))
    );
}

beforeEach(() => {
    store.sets = [];
    store.activeModSetId = "";
    store.seq = 0;
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("ModSetsBar", () => {
    it("shows the empty-state badge when there are no sets", async () => {
        renderBar();
        expect(await screen.findByText("No saved sets yet")).toBeTruthy();
    });

    it("creates a set via Enter and clears the input", async () => {
        renderBar();
        await screen.findByText("No saved sets yet");

        fireEvent.click(screen.getByRole("button", { name: /new set/i }));
        const input = screen.getByPlaceholderText("Set name…");
        fireEvent.change(input, { target: { value: "Speedrun" } });
        fireEvent.keyDown(input, { key: "Enter" });

        await waitFor(() => expect(screen.getByText("Speedrun")).toBeTruthy());
        // Input closed; New set button is back.
        expect(screen.getByRole("button", { name: /new set/i })).toBeTruthy();
    });

    it("cancels create on a blank submit instead of leaving the input stuck open (MOD-10)", async () => {
        renderBar();
        await screen.findByText("No saved sets yet");

        fireEvent.click(screen.getByRole("button", { name: /new set/i }));
        const input = screen.getByPlaceholderText("Set name…");
        fireEvent.blur(input);

        await waitFor(() => expect(screen.queryByPlaceholderText("Set name…")).toBeNull());
        expect(screen.getByRole("button", { name: /new set/i })).toBeTruthy();
    });

    it("renames a set via the pencil + Enter", async () => {
        store.sets = [{ id: "set-1", name: "Old" }];
        store.activeModSetId = "set-1";
        renderBar();
        await screen.findByText("Old");

        fireEvent.click(screen.getByTitle("Rename"));
        const input = screen.getByDisplayValue("Old");
        fireEvent.change(input, { target: { value: "New Name" } });
        fireEvent.keyDown(input, { key: "Enter" });

        await waitFor(() => expect(screen.getByText("New Name")).toBeTruthy());
    });

    it("offers delete only on the inactive set, and deleting removes it", async () => {
        store.sets = [
            { id: "set-1", name: "Active One" },
            { id: "set-2", name: "Other" },
        ];
        store.activeModSetId = "set-1";
        renderBar();
        await screen.findByText("Active One");

        // Only the inactive set exposes a Delete control.
        const deletes = screen.getAllByTitle("Delete");
        expect(deletes.length).toBe(1);

        fireEvent.click(deletes[0]);
        await waitFor(() => expect(screen.queryByText("Other")).toBeNull());
        expect(screen.getByText("Active One")).toBeTruthy();
    });
});
