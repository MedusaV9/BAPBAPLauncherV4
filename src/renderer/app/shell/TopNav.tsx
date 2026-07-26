import { Home, Boxes, Package, Radio, Wrench, Settings, Download, RefreshCw, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, LayoutGroup } from "motion/react";
import { useEffect, useState } from "react";
import logoIcon from "../../assets/brand/BAPBAP_Desktop_Icon.png";
import { cn } from "../lib/utils";
import { useShellStore } from "../stores/useShellStore";
import { useT } from "../i18n";
import { useNavVisibility } from "./useNavVisibility";
import type { WorkspaceId } from "../types/workspaces";
import { api } from "../../api";
import { useUpdaterState, useDownloadAndInstallUpdate } from "../query/hooks";
import {
    shouldShowLauncherUpdateBanner,
    getLauncherUpdateBannerTitle,
    getLauncherUpdatePrimaryAction,
    getLauncherUpdateProgressText,
    getLauncherUpdateMetaLine,
} from "../../helpers/launcher-update-ui";
import { Progress } from "../../components/ui/progress";
import { Button } from "../../components/ui/button";

function openExternal(url: string) {
    api.shell.openExternal(url).catch(err => {
        console.error("[openExternal] IPC failed, trying window.open:", err);
        window.open(url, "_blank");
    });
}

function DiscordIcon({ size }: { size: number }) {
    return (
        <svg width={size} height={size} viewBox="0 -28.5 256 256" version="1.1" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true">
            <path d="M216.856339,16.5966031 C200.285002,8.84328665 182.566144,3.2084988 164.041564,0 C161.766523,4.11318106 159.108624,9.64549908 157.276099,14.0464379 C137.583995,11.0849896 118.072967,11.0849896 98.7430163,14.0464379 C96.9108417,9.64549908 94.1925838,4.11318106 91.8971895,0 C73.3526068,3.2084988 55.6133949,8.86399117 39.0420583,16.6376612 C5.61752293,67.146514 -3.4433191,116.400813 1.08711069,164.955721 C23.2560196,181.510915 44.7403634,191.567697 65.8621325,198.148576 C71.0772151,190.971126 75.7283628,183.341335 79.7352139,175.300261 C72.104019,172.400575 64.7949724,168.822202 57.8887866,164.667963 C59.7209612,163.310589 61.5131304,161.891452 63.2445898,160.431257 C105.36741,180.133187 151.134928,180.133187 192.754523,160.431257 C194.506336,161.891452 196.298154,163.310589 198.110326,164.667963 C191.183787,168.842556 183.854737,172.420929 176.223542,175.320965 C180.230393,183.341335 184.861538,190.991831 190.096624,198.16893 C211.238746,191.588051 232.743023,181.531619 254.911949,164.955721 C260.227747,108.668201 245.831087,59.8662432 216.856339,16.5966031 Z M85.4738752,135.09489 C72.8290281,135.09489 62.4592217,123.290155 62.4592217,108.914901 C62.4592217,94.5396472 72.607595,82.7145587 85.4738752,82.7145587 C98.3405064,82.7145587 108.709962,94.5189427 108.488529,108.914901 C108.508531,123.290155 98.3405064,135.09489 85.4738752,135.09489 Z M170.525237,135.09489 C157.88039,135.09489 147.510584,123.290155 147.510584,108.914901 C147.510584,94.5396472 157.658606,82.7145587 170.525237,82.7145587 C183.391518,82.7145587 193.761324,94.5189427 193.539891,108.914901 C193.539891,123.290155 183.391518,135.09489 170.525237,135.09489 Z" />
        </svg>
    );
}

type NavItem = { id: WorkspaceId; labelKey: import("../i18n/en").StringKey; icon: LucideIcon };

const ITEMS: NavItem[] = [
    { id: "launch", labelKey: "nav.launch", icon: Home },
    { id: "instances", labelKey: "nav.instances", icon: Boxes },
    { id: "mods", labelKey: "nav.mods", icon: Package },
    { id: "radio", labelKey: "nav.radio", icon: Radio },
    { id: "tools", labelKey: "nav.tools", icon: Wrench },
    { id: "settings", labelKey: "nav.settings", icon: Settings },
];

export function TopNav({ reduceMotion: reduceMotionProp }: { reduceMotion?: boolean } = {}) {
    const t = useT();
    const activeWorkspace = useShellStore(s => s.activeWorkspace);
    const setActiveWorkspace = useShellStore(s => s.setActiveWorkspace);
    const osReducedMotion = useReducedMotion();
    const reduceMotion = reduceMotionProp ?? osReducedMotion;
    const visible = useNavVisibility(activeWorkspace);
    const { data: updaterState } = useUpdaterState();
    const downloadAndInstall = useDownloadAndInstallUpdate();
    const showUpdate = shouldShowLauncherUpdateBanner(updaterState ?? null);
    const [updateOpen, setUpdateOpen] = useState(false);
    const action = getLauncherUpdatePrimaryAction(updaterState ?? null);
    const progressText = getLauncherUpdateProgressText(updaterState ?? null);
    const downloading = updaterState?.status === "downloading";

    return (
        <>
            <motion.nav
            className="nav-glass pointer-events-auto fixed left-1/2 top-4 z-40 flex h-12 items-center gap-1 rounded-full px-2 pr-3"
            style={{ x: "-50%" }}
            initial={false}
            animate={{
                y: visible ? 0 : -80,
                opacity: visible ? 1 : 0,
            }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
        >
            <div className="ml-1 mr-1.5 flex items-center gap-2">
                <img src={logoIcon} alt="BAPBAP" className="h-7 w-7 rounded-full" />
            </div>

            <LayoutGroup id="topnav-active-pill-group">
                {ITEMS.map(item => {
                    const Icon = item.icon;
                    const active = activeWorkspace === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => {
                                if (active) return;
                                setActiveWorkspace(item.id);
                            }}
                            className={cn(
                                "focus-ring relative flex items-center gap-2 rounded-full px-3 py-1.5 text-sm",
                                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {active && (
                                <motion.span
                                    layoutId="nav-active-pill"
                                    className="absolute inset-0 rounded-full bg-white/10 ring-1 ring-white/15"
                                    transition={reduceMotion ? { duration: 0 } : { type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.28 }}
                                />
                            )}
                            <Icon size={16} className="relative z-10 shrink-0" />
                            <span className="font-body relative z-10 hidden sm:inline">{t(item.labelKey)}</span>
                        </button>
                    );
                })}
            </LayoutGroup>

            {showUpdate && (
                <button
                    onClick={() => setUpdateOpen(v => !v)}
                    className={cn(
                        "focus-ring ml-1 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-[0.08em] transition-colors",
                        updateOpen
                            ? "bg-accent/20 text-accent"
                            : "bg-accent/12 text-accent hover:bg-accent/20"
                    )}
                    aria-expanded={updateOpen}
                    aria-label="Launcher update available"
                >
                    <RefreshCw size={12} className={cn(downloading && "animate-spin")} />
                    <span className="hidden sm:inline">Update</span>
                </button>
            )}

            <div className="ml-auto flex items-center">
                <span className="mx-1.5 h-5 w-px bg-white/10" />
                <button
                    onClick={() => openExternal("https://discord.gg/YNptDZbhaS")}
                    className="focus-ring flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground hover:bg-white/5"
                    title="Join our Discord"
                    aria-label="Discord"
                >
                    <DiscordIcon size={16} />
                </button>
            </div>
        </motion.nav>

            {/* Update dropdown — anchored below the nav */}
            <AnimatePresence>
                {updateOpen && showUpdate && updaterState && (
                    <motion.div
                        key="update-dropdown"
                        className="fixed left-1/2 z-40 flex w-full max-w-md -translate-x-1/2 flex-col gap-4 rounded-2xl border border-border bg-popover p-5 shadow-soft-lg"
                        style={{ top: "calc(68px)" }}
                        initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
                        transition={{ duration: 0.18, ease: [0.28, 1, 0.4, 1] }}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h3 className="font-display text-sm uppercase text-foreground">
                                    {getLauncherUpdateBannerTitle(updaterState)}
                                </h3>
                                <p className="mt-1 font-mono text-[0.65rem] text-muted-foreground">
                                    {getLauncherUpdateMetaLine(updaterState)}
                                </p>
                                {updaterState.notes && (
                                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                                        {updaterState.notes}
                                    </p>
                                )}
                            </div>
                        </div>

                        {downloading && (
                            <div className="flex items-center gap-3">
                                <Progress value={updaterState.progressPercent ?? 0} className="h-2 flex-1" />
                                {progressText && (
                                    <span className="shrink-0 font-mono text-[0.6rem] text-muted-foreground">
                                        {progressText}
                                    </span>
                                )}
                            </div>
                        )}

                        {action.kind && (
                            <div className="flex justify-end">
                                <Button
                                    size="sm"
                                    variant="default"
                                    disabled={action.disabled || downloadAndInstall.isPending}
                                    onClick={() => downloadAndInstall.mutate(false)}
                                >
                                    <Download size={14} /> {action.label}
                                </Button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
