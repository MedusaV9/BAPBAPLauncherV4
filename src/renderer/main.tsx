import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./app/shell/AppShell";
import { queryClient } from "./app/query/queryClient";
import { installEventBridge } from "./app/query/eventBridge";
import "./styles/index.css";

function Root() {
    useEffect(() => installEventBridge(queryClient), []);
    return <AppShell />;
}

const container = document.getElementById("root");
if (!container) {
    throw new Error("Root element not found.");
}

createRoot(container).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <Root />
        </QueryClientProvider>
    </React.StrictMode>
);
