import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import "../styles/index.css";
import { createHarnessApi } from "./mock-api";
import { resolveHarnessState } from "./state";
import { queryClient } from "../app/query/queryClient";
import { installEventBridge } from "../app/query/eventBridge";

window.__V2_HARNESS__ = true;
window.__V2_HARNESS_API__ = createHarnessApi();
resolveHarnessState(window.location.search);

async function bootstrapHarness(): Promise<void> {
    const rootElement = document.getElementById("root");
    if (!rootElement) {
        throw new Error("Harness root element not found.");
    }

    const { AppShell } = await import("../app/shell/AppShell");

    function HarnessRoot() {
        useEffect(() => installEventBridge(queryClient), []);
        return <AppShell />;
    }

    createRoot(rootElement).render(
        <React.StrictMode>
            <QueryClientProvider client={queryClient}>
                <HarnessRoot />
            </QueryClientProvider>
        </React.StrictMode>
    );
}

void bootstrapHarness();
