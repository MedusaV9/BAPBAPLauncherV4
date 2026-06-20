import type { InstalledInstance } from "../../../shared/manifest";

const expectedOrigin: string = typeof window !== "undefined" ? window.location.origin : "";
const targetOrigin: string = expectedOrigin && expectedOrigin !== "null" ? expectedOrigin : "*";

export function getTargetOrigin(): string {
    return targetOrigin;
}

export function isValidMessageOrigin(event: MessageEvent): boolean {
    if (!expectedOrigin || expectedOrigin === "null") {
        return true;
    }
    return event.origin === expectedOrigin;
}

export type RebalanceHostMessage =
    | { source: "rebalance-embed"; type: "ready" }
    | {
          source: "rebalance-embed";
          type: "status";
          phase: "shell" | "bootstrap" | "catalog" | "sync" | "ready" | "error";
          progress?: number;
          detail?: string;
      }
    | { source: "rebalance-embed"; type: "invoke"; id: string; command: string; args?: Record<string, unknown> }
    | { source: "rebalance-embed"; type: "fileSrc"; id: string; targetPath: string };

export type RebalanceResponseMessage =
    | { source: "rebalance-host"; type: "invoke-result" | "fileSrc-result"; id: string; result: unknown }
    | { source: "rebalance-host"; type: "invoke-error" | "fileSrc-error"; id: string; error: string };

export type RebalanceBridgeApi = {
    invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    fileSrc: (targetPath: string) => Promise<unknown>;
};

export function buildRebalanceReadyRequestMessage() {
    return { source: "rebalance-host" as const, type: "request-ready" as const };
}

export function buildRebalanceProfileLabel(instance: InstalledInstance): string {
    return `${instance.profileName || instance.name} / ${instance.gameVersion || instance.version}`;
}

export function buildRebalanceEmbedSrc(
    instance: InstalledInstance,
    baseHref: string,
    options: { initialPage?: string } = {}
): string {
    const target = new URL("./rebalance.html", baseHref);
    target.searchParams.set("embedded", "1");
    target.searchParams.set("initialPage", options.initialPage ?? "dashboard");
    target.searchParams.set("workspaceRoot", instance.path);
    target.searchParams.set("profileLabel", buildRebalanceProfileLabel(instance));
    target.searchParams.set("track", instance.track || "bapbap");
    if (instance.instanceSource) {
        target.searchParams.set("instanceSource", instance.instanceSource);
    }
    if (instance.compatibilityWarning) {
        target.searchParams.set("compatibilityWarning", instance.compatibilityWarning);
    }
    return target.toString();
}

export async function handleRebalanceHostRequest(
    api: RebalanceBridgeApi,
    payload: Extract<RebalanceHostMessage, { type: "invoke" | "fileSrc" }>
): Promise<RebalanceResponseMessage> {
    try {
        if (payload.type === "invoke") {
            const result = await api.invoke(payload.command, payload.args);
            return { source: "rebalance-host", type: "invoke-result", id: payload.id, result };
        }
        const result = await api.fileSrc(payload.targetPath);
        return { source: "rebalance-host", type: "fileSrc-result", id: payload.id, result };
    } catch (error) {
        return {
            source: "rebalance-host",
            type: payload.type === "invoke" ? "invoke-error" : "fileSrc-error",
            id: payload.id,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
