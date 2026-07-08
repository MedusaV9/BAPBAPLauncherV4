import { lazy, Suspense, useEffect, useState, useDeferredValue } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { TopNav } from "./TopNav";
import { SetupWizard } from "./SetupWizard";
import { StartupSplash } from "./StartupSplash";
import { useBootstrap } from "./useBootstrap";
import { useShellStore } from "../stores/useShellStore";
import { useAudioEngine } from "../audio/useAudioEngine";
import { useSettings } from "../query/hooks";
import { BapButton } from "../../components/brand/BapButton";

const WORKSPACES = {
    instances: lazy(() => import("../workspaces/InstancesWorkspace").then(m => ({ default: m.InstancesWorkspace }))),
    launch: lazy(() => import("../workspaces/LaunchWorkspace").then(m => ({ default: m.LaunchWorkspace }))),
    mods: lazy(() => import("../workspaces/ModsWorkspace").then(m => ({ default: m.ModsWorkspace }))),
    radio: lazy(() => import("../workspaces/RadioWorkspace").then(m => ({ default: m.RadioWorkspace }))),
    tools: lazy(() => import("../workspaces/ToolsWorkspace").then(m => ({ default: m.ToolsWorkspace }))),
    settings: lazy(() => import("../workspaces/SettingsWorkspace").then(m => ({ default: m.SettingsWorkspace }))),
} as const;

function WorkspaceFallback() {
    return (
        <div className="flex h-full items-center justify-center bg-background">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Loading workspace…</p>
        </div>
    );
}

function Fatal({ message }: { message: string }) {
    return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center">
            <h1 className="font-display text-2xl text-destructive">Startup failed</h1>
            <p className="max-w-md text-sm text-muted-foreground">{message}</p>
            <BapButton onClick={() => location.reload()} showChevron={false}>
                Retry
            </BapButton>
        </div>
    );
}

export function AppShell() {
    const phase = useBootstrap();
    const activeWorkspace = useShellStore(s => s.activeWorkspace);
    const deferredWorkspace = useDeferredValue(activeWorkspace);
    const fatalMessage = useShellStore(s => s.fatalMessage);
    const osReducedMotion = useReducedMotion();
    const { data: settings } = useSettings();
    const reduceMotion = osReducedMotion || settings?.uiMotionEnabled === false;
    useAudioEngine();

    const [minTimeElapsed, setMinTimeElapsed] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setMinTimeElapsed(true), reduceMotion ? 600 : 2000);
        return () => clearTimeout(timer);
    }, [reduceMotion]);

    const [visited, setVisited] = useState<Record<string, boolean>>(() => ({
        [activeWorkspace]: true,
    }));

    useEffect(() => {
        setVisited(prev => {
            if (prev[activeWorkspace]) return prev;
            return { ...prev, [activeWorkspace]: true };
        });
    }, [activeWorkspace]);

    if (phase === "fatal") return <Fatal message={fatalMessage ?? "Unknown error"} />;

    const splashVisible = phase !== "ready" || !minTimeElapsed;

    return (
        <>
            <AnimatePresence>
                {splashVisible && (
                    <motion.div
                        key="startup-splash"
                        className="fixed inset-0 z-[100]"
                        initial={false}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <StartupSplash />
                    </motion.div>
                )}
            </AnimatePresence>

            {phase === "ready" && (
                <div className="flex h-screen w-screen flex-col overflow-hidden text-foreground">
                    <a
                        href="#main-content"
                        className="sr-only rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                        Skip to content
                    </a>
                    <SetupWizard />
                    <TopNav reduceMotion={reduceMotion} />
                    <main id="main-content" tabIndex={-1} className="relative min-h-0 flex-1 overflow-hidden">
                        {Object.entries(WORKSPACES).map(([key, Workspace]) => {
                            const isVisited = visited[key];
                            if (!isVisited) return null;

                            // If Tools workspace is locked and not currently active, unmount it to free resources.
                            if (key === "tools" && !settings?.toolsUnlocked && deferredWorkspace !== "tools") {
                                return null;
                            }

                            const isActive = key === deferredWorkspace;
                            return (
                                <Suspense key={key} fallback={isActive ? <WorkspaceFallback /> : null}>
                                    <motion.div
                                        className="absolute inset-0 h-full w-full"
                                        initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                                        animate={
                                            isActive
                                                ? { opacity: 1, y: 0, display: "block", pointerEvents: "auto" }
                                                : {
                                                      opacity: 0,
                                                      y: reduceMotion ? 0 : 4,
                                                      transitionEnd: { display: "none" },
                                                      pointerEvents: "none",
                                                  }
                                        }
                                        transition={{ duration: 0.18, ease: [0.28, 1, 0.4, 1] }}
                                    >
                                        <Workspace />
                                    </motion.div>
                                </Suspense>
                            );
                        })}
                    </main>
                </div>
            )}
        </>
    );
}
