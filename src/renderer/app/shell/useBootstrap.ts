import { useEffect } from "react";
import { useShellStore } from "../stores/useShellStore";
import { api } from "../../api";
import { queryClient } from "../query/queryClient";
import { qk } from "../query/queryKeys";

/**
 * Drives the startup state machine: splash → bootstrap → ready | fatal.
 * Prefetches the data the shell needs before first paint; a hard failure
 * here is reported to the main process and surfaced as the fatal screen.
 */
export function useBootstrap() {
    const startupPhase = useShellStore(s => s.startupPhase);
    const setStartupPhase = useShellStore(s => s.setStartupPhase);
    const setFatal = useShellStore(s => s.setFatal);

    useEffect(() => {
        let cancelled = false;

        async function boot() {
            setStartupPhase("bootstrap");
            try {
                const [buildInfo, settings] = await Promise.all([
                    api.diagnostics.getBuildInfo(),
                    api.settings.getAll(),
                ]);
                if (cancelled) return;
                queryClient.setQueryData(qk.buildInfo, buildInfo);
                queryClient.setQueryData(qk.settings, settings);

                // Manifest is best-effort: the launcher still opens offline.
                try {
                    const index = await api.manifest.getIndex(false);
                    if (!cancelled) queryClient.setQueryData(qk.manifestIndex, index);
                } catch {
                    // offline / network failure — degrade gracefully
                }

                // Prefetch the Steam persona so the greeting renders immediately
                // when the splash appears, instead of popping in late once the
                // splash has already faded and the launcher is interactive.
                try {
                    const persona = await api.instances.getSteamPersonaName();
                    if (!cancelled) queryClient.setQueryData(qk.steamPersona, persona);
                } catch {
                    // Steam not installed / detection failed — greeting falls back to "Player"
                }

                if (!cancelled) setStartupPhase("ready");
            } catch (error) {
                if (cancelled) return;
                const message = error instanceof Error ? error.message : String(error);
                void api.diagnostics
                    .reportStartupFatal({
                        code: "V4_BOOTSTRAP_FAILED",
                        message,
                        context: error instanceof Error && error.stack ? { stack: error.stack } : undefined,
                    })
                    .catch(() => {});
                setFatal(message);
            }
        }

        void boot();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return startupPhase;
}
