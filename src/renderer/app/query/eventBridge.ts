import type { QueryClient } from "@tanstack/react-query";
import type {
    LaunchRuntimeLogEntry,
} from "../../../shared/ipc";
import { api } from "../../api";
import { qk } from "./queryKeys";

const RUNTIME_LOG_BUFFER = 400;

const TERMINAL_INSTALL_STATUSES = new Set(["done", "error"]);
const TERMINAL_BUNDLE_UPDATE_STATUSES = new Set([
    "done",
    "failed",
    "check-failed",
    "signature-mismatch",
    "disk-full",
    "up-to-date",
]);

/**
 * Wires every `onXChanged` / `onRuntimeLog` IPC subscription into the Query
 * cache so components read live backend state through ordinary `useQuery`
 * hooks. Call exactly once at app root; the returned teardown unsubscribes
 * (guard against React StrictMode double-invocation by storing the result).
 */
export function installEventBridge(qc: QueryClient): () => void {
    const unsubs: Array<() => void> = [];

    unsubs.push(
        api.updater.onStateChanged(state => {
            qc.setQueryData(qk.updaterState, state);
        })
    );

    unsubs.push(
        api.manifest.onTrustedTimeChanged(state => {
            qc.setQueryData(qk.trustedTime, state);
        })
    );

    unsubs.push(
        api.instances.onInstallStateChanged(state => {
            qc.setQueryData(qk.installState, state);
            if (TERMINAL_INSTALL_STATUSES.has(state.status)) {
                qc.invalidateQueries({ queryKey: qk.instances });
            }
        })
    );

    unsubs.push(
        api.launch.onRuntimeStateChanged(state => {
            qc.setQueryData(qk.runtimeState, state);
        })
    );

    unsubs.push(
        api.launch.onRuntimeLog(entry => {
            qc.setQueryData<LaunchRuntimeLogEntry[]>(qk.runtimeLog, prev => {
                const next = [...(prev ?? []), entry];
                return next.length > RUNTIME_LOG_BUFFER
                    ? next.slice(next.length - RUNTIME_LOG_BUFFER)
                    : next;
            });
        })
    );

    unsubs.push(
        api.radio.onStateChanged(state => {
            qc.setQueryData(qk.radio, state);
        })
    );

    if (api.bundle.onInstallProgressChanged) {
        unsubs.push(
            api.bundle.onInstallProgressChanged(state => {
                qc.setQueryData(qk.bundleInstallProgress(state.bundleId), state);
            })
        );
    }

    if (api.bundle.onUpdateStateChanged) {
        unsubs.push(
            api.bundle.onUpdateStateChanged(state => {
                qc.setQueryData(qk.bundleUpdate(state.instanceId), state);
                if (TERMINAL_BUNDLE_UPDATE_STATUSES.has(state.status)) {
                    qc.invalidateQueries({ queryKey: qk.bundles });
                    qc.invalidateQueries({ queryKey: qk.instances });
                }
            })
        );
    }

    return () => {
        for (const unsub of unsubs) {
            try {
                unsub();
            } catch {
                // ignore teardown errors
            }
        }
    };
}
