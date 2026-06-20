import React from "react";
import { createRoot } from "react-dom/client";
import "driver.js/dist/driver.css";
import "../rebalance-vendor/styles.css";
import { LauncherApp, type PageKey } from "../rebalance-vendor/editor/LauncherApp";
import { ErrorBoundary } from "../components/ErrorBoundary";

const container = document.getElementById("root");
if (!container) {
    throw new Error("Rebalance renderer root element not found.");
}

const searchParams = new URLSearchParams(window.location.search);
const requestedPage = searchParams.get("initialPage");
const pageAliases = new Map<string, PageKey>([
    ["dashboard", "dashboard"],
    ["home", "dashboard"],
    ["editor", "editor"],
    ["change", "editor"],
    ["gamemode", "gamemode"],
    ["game-mode", "gamemode"],
    ["game_mode", "gamemode"],
    ["library", "library"],
    ["add", "library"],
    ["insert", "library"],
    ["remove", "remove"],
    ["swap", "swap"],
    ["custom", "custom"],
    ["create", "custom"],
    ["packs", "packs"],
    ["settings", "settings"],
    ["tutorial", "tutorial"],
    ["help", "tutorial"],
]);
const initialPage: PageKey = pageAliases.get(requestedPage?.trim().toLowerCase() ?? "") ?? "dashboard";
const embedded = searchParams.get("embedded") === "1";
const profileLabel = searchParams.get("profileLabel");
const track = searchParams.get("track");
const instanceSource = searchParams.get("instanceSource");
const compatibilityWarning = searchParams.get("compatibilityWarning");
type EmbeddedStatusPhase = "shell" | "bootstrap" | "catalog" | "sync" | "ready" | "error";
type EmbeddedStatusSnapshot = {
    phase: EmbeddedStatusPhase;
    progress: number;
    detail: string;
};
let latestEmbeddedStatus: EmbeddedStatusSnapshot | null = null;

// PostMessage origin validation (Security: Requirement 3.1, 3.2, 3.3)
const expectedOrigin = window.location.origin;
const targetOrigin = expectedOrigin && expectedOrigin !== "null" ? expectedOrigin : "*";

function isValidMessageOrigin(event: MessageEvent): boolean {
    if (expectedOrigin && expectedOrigin !== "null") {
        // Standard origin check for http/https protocols
        return event.origin === expectedOrigin;
    }
    // file:// protocol fallback — origin is "null" string, validate source instead
    return event.source === window.parent;
}

if (embedded) {
    document.documentElement.classList.add("rebalance-embedded-document");
    document.body.classList.add("rebalance-embedded-document");
}

function postEmbeddedReady(): void {
    if (!embedded || window.parent === window) {
        return;
    }
    window.parent.postMessage({ source: "rebalance-embed", type: "ready" }, targetOrigin);
}

function postEmbeddedStatus(
    phase: EmbeddedStatusPhase,
    progress: number,
    detail: string
): void {
    latestEmbeddedStatus = { phase, progress, detail };
    if (!embedded || window.parent === window) {
        return;
    }
    window.parent.postMessage(
        {
            source: "rebalance-embed",
            type: "status",
            phase,
            progress,
            detail,
        },
        targetOrigin
    );
}

async function replayEmbeddedBridgeState(): Promise<void> {
    postEmbeddedReady();
    if (latestEmbeddedStatus) {
        postEmbeddedStatus(latestEmbeddedStatus.phase, latestEmbeddedStatus.progress, latestEmbeddedStatus.detail);
    }
}

createRoot(container).render(
    <React.StrictMode>
        <ErrorBoundary onError={(error, info) => console.error("[Rebalance] Render error:", error, info.componentStack)}>
            <LauncherApp
                embedded={embedded}
                initialPage={initialPage}
                workspaceRoot={searchParams.get("workspaceRoot")}
                profileLabel={profileLabel}
                track={track}
                instanceSource={instanceSource}
                compatibilityWarning={compatibilityWarning}
                onEmbeddedStatus={(status) => postEmbeddedStatus(status.phase, status.progress, status.detail)}
            />
        </ErrorBoundary>
    </React.StrictMode>
);

if (embedded && window.parent !== window) {
    postEmbeddedStatus("shell", 0.12, "Preparing the embedded Rebalance shell.");
    window.addEventListener("message", event => {
        if (!isValidMessageOrigin(event)) {
            return;
        }
        const payload = event.data as { source?: string; type?: string } | undefined;
        if (!payload || payload.source !== "rebalance-host" || payload.type !== "request-ready") {
            return;
        }
        void replayEmbeddedBridgeState();
    });
    void replayEmbeddedBridgeState();
}
