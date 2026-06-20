/**
 * Main-thread client for the worker-backed search index.
 *
 * If a `Worker` global is available (browser, Electron renderer) the client
 * spawns a module worker pointing at {@link ./search-index.worker} and routes
 * every method through `postMessage`. Each request is tagged with a numeric
 * id and matched up with a pending Promise so multiple in-flight queries
 * don't tangle.
 *
 * If `Worker` is unavailable (Node, jsdom without worker support, SSR, or any
 * environment where Worker construction throws) the client transparently
 * falls back to a synchronous in-process index. The async surface is
 * preserved — every method still returns a Promise — so callers don't need
 * to special-case the fallback.
 *
 * Phase 3 Task 17 — Worker-Backed Search Index.
 */

import {
    createSearchIndex,
    type SearchIndex,
    type SearchQueryOptions,
    type SearchRecord,
    type SearchResult,
} from "./search-index";

export interface SearchIndexClient {
    addRecords(records: SearchRecord[]): Promise<void>;
    removeRecord(id: string): Promise<void>;
    clear(): Promise<void>;
    query(text: string, opts?: SearchQueryOptions): Promise<SearchResult[]>;
    terminate(): void;
}

type WorkerRequest =
    | { type: "addMany"; id: number; payload: SearchRecord[] }
    | { type: "remove"; id: number; payload: string }
    | { type: "clear"; id: number; payload: null }
    | {
          type: "query";
          id: number;
          payload: { text: string; opts?: SearchQueryOptions };
      };

type WorkerResponse =
    | { type: "addMany-ok"; id: number }
    | { type: "add-ok"; id: number }
    | { type: "remove-ok"; id: number }
    | { type: "clear-ok"; id: number }
    | { type: "query-result"; id: number; result: SearchResult[] }
    | { type: "error"; id: number; error: string };

interface PendingEntry {
    resolve: (value: unknown) => void;
    reject: (err: Error) => void;
}

/**
 * Try to spawn a module worker. Returns `null` if Workers are not supported
 * in the current environment or construction throws (e.g. CSP restrictions,
 * missing `import.meta.url` resolver in some test runners).
 */
function tryCreateWorker(): Worker | null {
    if (typeof Worker === "undefined") return null;
    try {
        return new Worker(
            new URL("./search-index.worker.ts", import.meta.url),
            { type: "module" }
        );
    } catch {
        return null;
    }
}

function createFallbackClient(): SearchIndexClient {
    const idx: SearchIndex = createSearchIndex();
    return {
        addRecords(records) {
            idx.addRecords(records);
            return Promise.resolve();
        },
        removeRecord(id) {
            idx.removeRecord(id);
            return Promise.resolve();
        },
        clear() {
            idx.clear();
            return Promise.resolve();
        },
        query(text, opts) {
            return Promise.resolve(idx.query(text, opts));
        },
        terminate() {
            idx.clear();
        },
    };
}

function createWorkerClient(worker: Worker): SearchIndexClient {
    const pending = new Map<number, PendingEntry>();
    let nextRequestId = 0;

    worker.addEventListener("message", (ev: MessageEvent) => {
        const msg = ev.data as WorkerResponse | null | undefined;
        if (!msg || typeof msg.id !== "number") return;
        const entry = pending.get(msg.id);
        if (!entry) return;
        pending.delete(msg.id);
        if (msg.type === "error") {
            entry.reject(new Error(msg.error));
            return;
        }
        if (msg.type === "query-result") {
            entry.resolve(msg.result);
            return;
        }
        // Any *-ok response resolves with `undefined`.
        entry.resolve(undefined);
    });

    worker.addEventListener("error", (ev: ErrorEvent) => {
        const errorMsg = ev.message || "Worker error";
        for (const entry of pending.values()) {
            entry.reject(new Error(errorMsg));
        }
        pending.clear();
    });

    function send<T>(request: WorkerRequest): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            pending.set(request.id, {
                resolve: resolve as (value: unknown) => void,
                reject,
            });
            try {
                worker.postMessage(request);
            } catch (err) {
                pending.delete(request.id);
                reject(err instanceof Error ? err : new Error(String(err)));
            }
        });
    }

    return {
        addRecords(records) {
            return send<void>({
                type: "addMany",
                id: nextRequestId++,
                payload: records,
            });
        },
        removeRecord(id) {
            return send<void>({
                type: "remove",
                id: nextRequestId++,
                payload: id,
            });
        },
        clear() {
            return send<void>({
                type: "clear",
                id: nextRequestId++,
                payload: null,
            });
        },
        query(text, opts) {
            return send<SearchResult[]>({
                type: "query",
                id: nextRequestId++,
                payload: { text, opts },
            });
        },
        terminate() {
            try {
                worker.terminate();
            } catch {
                // ignore — best-effort cleanup
            }
            for (const entry of pending.values()) {
                entry.reject(new Error("Worker terminated"));
            }
            pending.clear();
        },
    };
}

export function createSearchIndexClient(): SearchIndexClient {
    const worker = tryCreateWorker();
    return worker ? createWorkerClient(worker) : createFallbackClient();
}
