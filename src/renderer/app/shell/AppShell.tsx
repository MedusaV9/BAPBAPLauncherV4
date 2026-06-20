import { lazy, Suspense } from "react";
import { motion, useReducedMotion } from "motion/react";
import { TopNav } from "./TopNav";
import { UpdateBanner } from "./UpdateBanner";
import { SetupWizard } from "./SetupWizard";
import { useBootstrap } from "./useBootstrap";
import { useShellStore } from "../stores/useShellStore";
import { useAudioEngine } from "../audio/useAudioEngine";
import { BapButton } from "../../components/brand/BapButton";

const WORKSPACES = {
    instances: lazy(() => import("../workspaces/InstancesWorkspace").then(m => ({ default: m.InstancesWorkspace }))),
    launch: lazy(() => import("../workspaces/LaunchWorkspace").then(m => ({ default: m.LaunchWorkspace }))),
    mods: lazy(() => import("../workspaces/ModsWorkspace").then(m => ({ default: m.ModsWorkspace }))),
    radio: lazy(() => import("../workspaces/RadioWorkspace").then(m => ({ default: m.RadioWorkspace }))),
    tools: lazy(() => import("../workspaces/ToolsWorkspace").then(m => ({ default: m.ToolsWorkspace }))),
    settings: lazy(() => import("../workspaces/SettingsWorkspace").then(m => ({ default: m.SettingsWorkspace }))),
} as const;

function Splash() {
    return (
        <div className="flex h-screen items-center justify-center bg-background">
            <p className="font-display text-xl text-foreground">BAPBAP</p>
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
    const fatalMessage = useShellStore(s => s.fatalMessage);
    const reduceMotion = useReducedMotion();
    useAudioEngine();

    if (phase === "splash" || phase === "bootstrap") return <Splash />;
    if (phase === "fatal") return <Fatal message={fatalMessage ?? "Unknown error"} />;

    const Workspace = WORKSPACES[activeWorkspace];

    return (
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
            <SetupWizard />
            <TopNav />
            <UpdateBanner />
            <main className="min-h-0 flex-1 overflow-hidden">
                <Suspense fallback={<Splash />}>
                    <motion.div
                        key={activeWorkspace}
                        className="h-full"
                        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <Workspace />
                    </motion.div>
                </Suspense>
            </main>
        </div>
    );
}
