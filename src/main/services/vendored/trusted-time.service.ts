import { performance } from "node:perf_hooks";
import { ManifestClient } from "./manifest-client";
import type { TrustedTimeState } from "../../../shared/ipc";

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

type Listener = (state: TrustedTimeState) => void;

export class TrustedTimeService {
    private readonly manifests: ManifestClient;
    private readonly listeners = new Set<Listener>();
    private syncTimer: NodeJS.Timeout | null = null;
    private inFlightSync: Promise<TrustedTimeState> | null = null;
    private lastSyncPerfMs = 0;
    private state: TrustedTimeState = {
        status: "idle",
        configured: false,
        available: false,
    };

    constructor(manifests: ManifestClient) {
        this.manifests = manifests;
    }

    start(): void {
        if (this.syncTimer) {
            return;
        }
        void this.sync(true);
        this.syncTimer = setInterval(() => {
            void this.sync(false);
        }, SYNC_INTERVAL_MS);
    }

    stop(): void {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
    }

    onStateChanged(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    async getState(force = false): Promise<TrustedTimeState> {
        if (force || this.state.status === "idle") {
            return this.sync(force);
        }
        return { ...this.state };
    }

    async getTrustedNow(force = false): Promise<{ available: boolean; trustedNowMs?: number; state: TrustedTimeState }> {
        const state = await this.getState(force);
        if (!state.available || !Number.isFinite(state.trustedEpochMs)) {
            return {
                available: false,
                state,
            };
        }
        const delta = performance.now() - this.lastSyncPerfMs;
        return {
            available: true,
            trustedNowMs: Math.round((state.trustedEpochMs as number) + delta),
            state,
        };
    }

    private async sync(force: boolean): Promise<TrustedTimeState> {
        if (this.inFlightSync) {
            return this.inFlightSync;
        }

        const task = this.runSync(force)
            .catch(error => {
                const nextState: TrustedTimeState = {
                    status: "unavailable",
                    configured: Boolean(this.state.configured),
                    available: false,
                    sourceUrl: this.state.sourceUrl,
                    error: error instanceof Error ? error.message : String(error),
                };
                this.setState(nextState);
                return nextState;
            })
            .finally(() => {
                this.inFlightSync = null;
            });
        this.inFlightSync = task;
        return task;
    }

    private async runSync(force: boolean): Promise<TrustedTimeState> {
        const syncingState: TrustedTimeState = {
            ...this.state,
            status: "syncing",
            error: undefined,
        };
        this.setState(syncingState);

        const index = await this.manifests.getIndex(force);
        const sourceUrl = `${index.timeSourceUrl || ""}`.trim();
        if (!sourceUrl) {
            const unavailable: TrustedTimeState = {
                status: "unavailable",
                configured: false,
                available: false,
                error: "Manifest does not declare timeSourceUrl.",
            };
            this.setState(unavailable);
            return unavailable;
        }

        const dateHeader = await this.fetchDateHeader(sourceUrl);
        if (!dateHeader) {
            const unavailable: TrustedTimeState = {
                status: "unavailable",
                configured: true,
                available: false,
                sourceUrl,
                error: "Trusted time source did not return a valid HTTP Date header.",
            };
            this.setState(unavailable);
            return unavailable;
        }

        const trustedEpochMs = Date.parse(dateHeader);
        if (!Number.isFinite(trustedEpochMs)) {
            const unavailable: TrustedTimeState = {
                status: "unavailable",
                configured: true,
                available: false,
                sourceUrl,
                error: "Trusted time source returned an invalid HTTP Date header.",
            };
            this.setState(unavailable);
            return unavailable;
        }

        this.lastSyncPerfMs = performance.now();
        const nextState: TrustedTimeState = {
            status: "ready",
            configured: true,
            available: true,
            sourceUrl,
            trustedEpochMs,
            syncedAtUtc: new Date(trustedEpochMs).toISOString(),
        };
        this.setState(nextState);
        return nextState;
    }

    private async fetchDateHeader(sourceUrl: string): Promise<string | null> {
        let response = await fetch(sourceUrl, {
            method: "HEAD",
            cache: "no-store",
        }).catch(() => null);

        if (!response || !response.ok) {
            response = await fetch(sourceUrl, {
                method: "GET",
                cache: "no-store",
            }).catch(() => null);
        }

        if (!response || !response.ok) {
            return null;
        }

        const value = response.headers.get("date");
        return value?.trim() || null;
    }

    private setState(nextState: TrustedTimeState): void {
        this.state = nextState;
        for (const listener of this.listeners) {
            listener({ ...nextState });
        }
    }
}
