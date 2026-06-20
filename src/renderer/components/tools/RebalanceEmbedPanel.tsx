import React from "react";
import type { InstalledInstance, InstalledInstanceSource } from "../../../shared/manifest";
import { api } from "../../api";
import {
    buildRebalanceEmbedSrc,
    buildRebalanceReadyRequestMessage,
    getTargetOrigin,
    handleRebalanceHostRequest,
    isValidMessageOrigin,
    type RebalanceHostMessage,
} from "./rebalance-embed-helpers";

type EmbeddedStatusPhase = "shell" | "bootstrap" | "catalog" | "sync" | "ready" | "error";

export type RebalanceEmbedPanelProps = {
    selectedInstance: InstalledInstance;
};

function resolveInstanceSource(instance: InstalledInstance): InstalledInstanceSource {
    if (instance.instanceSource) {
        return instance.instanceSource;
    }
    return instance.officialManaged ? "official-managed" : "steam-library";
}

export function RebalanceEmbedPanel({ selectedInstance }: RebalanceEmbedPanelProps) {
    const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
    const readyReceivedRef = React.useRef(false);
    const [phase, setPhase] = React.useState<EmbeddedStatusPhase>("shell");
    const [detail, setDetail] = React.useState("Loading Rebalance Studio…");

    const normalizedInstance = React.useMemo(
        () => ({ ...selectedInstance, instanceSource: resolveInstanceSource(selectedInstance) }),
        [selectedInstance]
    );

    const iframeSrc = React.useMemo(
        () => buildRebalanceEmbedSrc(normalizedInstance, window.location.href, { initialPage: "dashboard" }),
        [normalizedInstance]
    );

    React.useEffect(() => {
        readyReceivedRef.current = false;
        setPhase("shell");
    }, [iframeSrc]);

    React.useEffect(() => {
        async function onMessage(event: MessageEvent) {
            if (!isValidMessageOrigin(event)) return;
            const iframe = iframeRef.current;
            if (!iframe || event.source !== iframe.contentWindow) return;
            const payload = event.data as RebalanceHostMessage | undefined;
            if (!payload || payload.source !== "rebalance-embed") return;

            switch (payload.type) {
                case "ready":
                    readyReceivedRef.current = true;
                    return;
                case "status":
                    setPhase(payload.phase);
                    if (payload.detail) setDetail(payload.detail);
                    return;
                case "invoke":
                case "fileSrc": {
                    const response = await handleRebalanceHostRequest(api.rebalance, payload);
                    iframe.contentWindow?.postMessage(response, getTargetOrigin());
                    return;
                }
            }
        }

        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, []);

    function onIframeLoad() {
        // Ask the embed to replay its ready/status in case it fired before we listened.
        iframeRef.current?.contentWindow?.postMessage(
            buildRebalanceReadyRequestMessage(),
            getTargetOrigin()
        );
    }

    return (
        <div className="relative h-full w-full overflow-hidden rounded-xl border border-border bg-card">
            {phase !== "ready" && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background">
                    <p className="font-display text-sm text-foreground">Rebalance Studio</p>
                    <p className="text-xs text-muted-foreground">{detail}</p>
                </div>
            )}
            <iframe
                ref={iframeRef}
                src={iframeSrc}
                onLoad={onIframeLoad}
                title="Rebalance Studio"
                className="h-full w-full border-0"
                sandbox="allow-scripts allow-same-origin"
            />
        </div>
    );
}
