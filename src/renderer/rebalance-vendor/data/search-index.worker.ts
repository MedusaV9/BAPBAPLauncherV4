/**
 * Web Worker entry for the search index.
 *
 * The worker is intentionally tiny: it owns a single SearchIndex instance
 * (lazily constructed on the first message) and dispatches incoming messages
 * to the corresponding method on that index. It then posts a typed response
 * back to the main thread so the {@link ./search-index-client} can resolve
 * the matching pending Promise.
 *
 * Phase 3 Task 17 — Worker-Backed Search Index.
 */

import {
    createSearchIndex,
    type SearchIndex,
    type SearchQueryOptions,
    type SearchRecord,
} from "./search-index";

/**
 * The DOM lib types `self` as the `Window` object, but inside a real
 * `DedicatedWorkerGlobalScope` `self.postMessage` only takes a single
 * argument. We declare a minimal structural interface and cast through it
 * to avoid pulling in the WebWorker lib (which isn't enabled in the project
 * tsconfig).
 */
interface WorkerScope {
    addEventListener(
        type: "message",
        listener: (ev: MessageEvent) => void
    ): void;
    postMessage(message: unknown): void;
}

const ctx: WorkerScope = self as unknown as WorkerScope;

type IncomingType = "add" | "addMany" | "remove" | "clear" | "query";

interface IncomingMessage {
    type: IncomingType;
    id: number;
    payload?: unknown;
}

interface QueryPayload {
    text: string;
    opts?: SearchQueryOptions;
}

let index: SearchIndex | null = null;

function getIndex(): SearchIndex {
    if (index === null) {
        index = createSearchIndex();
    }
    return index;
}

ctx.addEventListener("message", (ev: MessageEvent) => {
    const msg = ev.data as IncomingMessage | null | undefined;
    if (!msg || typeof msg.id !== "number" || typeof msg.type !== "string") {
        return;
    }
    const { type, id, payload } = msg;
    try {
        const idx = getIndex();
        switch (type) {
            case "add": {
                idx.addRecord(payload as SearchRecord);
                ctx.postMessage({ type: "add-ok", id });
                return;
            }
            case "addMany": {
                idx.addRecords((payload as SearchRecord[]) ?? []);
                ctx.postMessage({ type: "addMany-ok", id });
                return;
            }
            case "remove": {
                idx.removeRecord(payload as string);
                ctx.postMessage({ type: "remove-ok", id });
                return;
            }
            case "clear": {
                idx.clear();
                ctx.postMessage({ type: "clear-ok", id });
                return;
            }
            case "query": {
                const { text, opts } = (payload ?? {}) as QueryPayload;
                const result = idx.query(text ?? "", opts);
                ctx.postMessage({ type: "query-result", id, result });
                return;
            }
            default: {
                ctx.postMessage({
                    type: "error",
                    id,
                    error: `Unknown message type: ${String(type)}`,
                });
            }
        }
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        ctx.postMessage({ type: "error", id, error });
    }
});

// Make this a module to satisfy `module: "ESNext"` even if no other exports
// are present.
export {};
