import { describe, expect, it, vi } from "vitest";
import type { InstalledInstance } from "../../../shared/manifest";
import {
    buildRebalanceProfileLabel,
    buildRebalanceEmbedSrc,
    buildRebalanceReadyRequestMessage,
    handleRebalanceHostRequest,
    isValidMessageOrigin,
    type RebalanceBridgeApi,
    type RebalanceHostMessage,
} from "./rebalance-embed-helpers";

function instance(overrides: Partial<InstalledInstance> = {}): InstalledInstance {
    return {
        id: "inst-1",
        profileName: "My Profile",
        versionId: "v1",
        gameVersion: "1.2.0",
        name: "Fallback Name",
        version: "0.0.9",
        track: "bapbap",
        path: "C:/games/inst-1",
        officialManaged: true,
        lastUpdatedUtc: "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}

describe("buildRebalanceProfileLabel", () => {
    it("prefers profileName + gameVersion", () => {
        expect(buildRebalanceProfileLabel(instance())).toBe("My Profile / 1.2.0");
    });

    it("falls back to name + version when profileName/gameVersion are empty", () => {
        expect(buildRebalanceProfileLabel(instance({ profileName: "", gameVersion: "" }))).toBe("Fallback Name / 0.0.9");
    });
});

describe("buildRebalanceEmbedSrc", () => {
    const base = "https://app.local/index.html";

    it("sets the core embed params and defaults initialPage to dashboard", () => {
        const url = new URL(buildRebalanceEmbedSrc(instance(), base));
        expect(url.pathname.endsWith("/rebalance.html")).toBe(true);
        expect(url.searchParams.get("embedded")).toBe("1");
        expect(url.searchParams.get("initialPage")).toBe("dashboard");
        expect(url.searchParams.get("workspaceRoot")).toBe("C:/games/inst-1");
        expect(url.searchParams.get("track")).toBe("bapbap");
    });

    it("honors an explicit initialPage", () => {
        const url = new URL(buildRebalanceEmbedSrc(instance(), base, { initialPage: "editor" }));
        expect(url.searchParams.get("initialPage")).toBe("editor");
    });

    it("omits optional params when absent and includes them when present", () => {
        const without = new URL(buildRebalanceEmbedSrc(instance(), base));
        expect(without.searchParams.has("instanceSource")).toBe(false);
        expect(without.searchParams.has("compatibilityWarning")).toBe(false);

        const withOpt = new URL(
            buildRebalanceEmbedSrc(instance({ instanceSource: "steam-library", compatibilityWarning: "old build" }), base)
        );
        expect(withOpt.searchParams.get("instanceSource")).toBe("steam-library");
        expect(withOpt.searchParams.get("compatibilityWarning")).toBe("old build");
    });

    it("defaults track to bapbap when empty", () => {
        const url = new URL(buildRebalanceEmbedSrc(instance({ track: "" }), base));
        expect(url.searchParams.get("track")).toBe("bapbap");
    });
});

describe("buildRebalanceReadyRequestMessage", () => {
    it("returns the host request-ready envelope", () => {
        expect(buildRebalanceReadyRequestMessage()).toEqual({ source: "rebalance-host", type: "request-ready" });
    });
});

describe("isValidMessageOrigin", () => {
    it("accepts an event whose origin matches the current origin", () => {
        expect(isValidMessageOrigin({ origin: window.location.origin } as MessageEvent)).toBe(true);
    });
});

describe("handleRebalanceHostRequest", () => {
    function bridge(over: Partial<RebalanceBridgeApi> = {}): RebalanceBridgeApi {
        return {
            invoke: vi.fn().mockResolvedValue({ ok: true }),
            fileSrc: vi.fn().mockResolvedValue("file://served"),
            ...over,
        };
    }

    it("forwards an invoke and wraps the result", async () => {
        const api = bridge();
        const payload = { source: "rebalance-embed", type: "invoke", id: "a", command: "read_library_metadata", args: { x: 1 } } as Extract<RebalanceHostMessage, { type: "invoke" }>;

        const res = await handleRebalanceHostRequest(api, payload);

        expect(api.invoke).toHaveBeenCalledWith("read_library_metadata", { x: 1 });
        expect(res).toEqual({ source: "rebalance-host", type: "invoke-result", id: "a", result: { ok: true } });
    });

    it("forwards a fileSrc and wraps the result", async () => {
        const api = bridge();
        const payload = { source: "rebalance-embed", type: "fileSrc", id: "b", targetPath: "art.png" } as Extract<RebalanceHostMessage, { type: "fileSrc" }>;

        const res = await handleRebalanceHostRequest(api, payload);

        expect(api.fileSrc).toHaveBeenCalledWith("art.png");
        expect(res).toEqual({ source: "rebalance-host", type: "fileSrc-result", id: "b", result: "file://served" });
    });

    it("maps an invoke rejection to invoke-error with the message", async () => {
        const api = bridge({ invoke: vi.fn().mockRejectedValue(new Error("not allowed")) });
        const payload = { source: "rebalance-embed", type: "invoke", id: "c", command: "danger" } as Extract<RebalanceHostMessage, { type: "invoke" }>;

        const res = await handleRebalanceHostRequest(api, payload);

        expect(res).toEqual({ source: "rebalance-host", type: "invoke-error", id: "c", error: "not allowed" });
    });

    it("maps a fileSrc rejection to fileSrc-error", async () => {
        const api = bridge({ fileSrc: vi.fn().mockRejectedValue(new Error("outside workspace")) });
        const payload = { source: "rebalance-embed", type: "fileSrc", id: "d", targetPath: "../escape.png" } as Extract<RebalanceHostMessage, { type: "fileSrc" }>;

        const res = await handleRebalanceHostRequest(api, payload);

        expect(res).toEqual({ source: "rebalance-host", type: "fileSrc-error", id: "d", error: "outside workspace" });
    });
});
