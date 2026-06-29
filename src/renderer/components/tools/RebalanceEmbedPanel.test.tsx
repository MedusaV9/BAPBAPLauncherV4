import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InstalledInstance } from "../../../shared/manifest";

vi.mock("../../api", () => ({
    api: {
        rebalance: {
            invoke: vi.fn(),
            fileSrc: vi.fn(),
        },
    },
}));

import { RebalanceEmbedPanel } from "./RebalanceEmbedPanel";

function instance(): InstalledInstance {
    return {
        id: "inst-1",
        profileName: "Standard",
        versionId: "latest",
        gameVersion: "1.0.0",
        name: "Standard",
        version: "1.0.0",
        track: "bapbap",
        path: "C:/BAPBAP/Standard",
        officialManaged: true,
        officialTrack: "bapbap",
        lastUpdatedUtc: "2026-06-23T00:00:00.000Z",
    };
}

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("RebalanceEmbedPanel", () => {
    it("shows status progress from the embedded Rebalance app (TOO-07)", async () => {
        render(createElement(RebalanceEmbedPanel, { selectedInstance: instance() }));
        const iframe = screen.getByTitle("Rebalance Studio") as HTMLIFrameElement;

        window.dispatchEvent(
            new MessageEvent("message", {
                origin: window.location.origin,
                source: iframe.contentWindow,
                data: {
                    source: "rebalance-embed",
                    type: "status",
                    phase: "catalog",
                    progress: 42,
                    detail: "Reading catalog",
                },
            })
        );

        expect(await screen.findByText("Reading catalog")).toBeTruthy();
        expect(screen.getByText("catalog · 42%")).toBeTruthy();
        expect(screen.getByLabelText("Rebalance loading progress").querySelector("div")?.getAttribute("style")).toContain("42%");
    });

    it("clears the loading overlay when a bare ready message arrives (TOO-06)", async () => {
        render(createElement(RebalanceEmbedPanel, { selectedInstance: instance() }));
        const iframe = screen.getByTitle("Rebalance Studio") as HTMLIFrameElement;

        window.dispatchEvent(
            new MessageEvent("message", {
                origin: window.location.origin,
                source: iframe.contentWindow,
                data: { source: "rebalance-embed", type: "ready" },
            })
        );

        await waitFor(() => expect(screen.queryByText("Rebalance Studio")).toBeNull());
    });
});
