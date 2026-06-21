import { Home, Boxes, Package, Radio, Wrench, Settings, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import logoIcon from "../../assets/brand/BAPBAP_Desktop_Icon.png";
import { cn } from "../lib/utils";
import { useShellStore } from "../stores/useShellStore";
import { useNavVisibility } from "./useNavVisibility";
import type { WorkspaceId } from "../types/workspaces";

type NavItem = { id: WorkspaceId; label: string; icon: LucideIcon };

const ITEMS: NavItem[] = [
    { id: "launch", label: "Start", icon: Home },
    { id: "instances", label: "Instances", icon: Boxes },
    { id: "mods", label: "Mods", icon: Package },
    { id: "radio", label: "Radio", icon: Radio },
    { id: "tools", label: "Tools", icon: Wrench },
    { id: "settings", label: "Settings", icon: Settings },
];

export function TopNav() {
    const activeWorkspace = useShellStore(s => s.activeWorkspace);
    const setActiveWorkspace = useShellStore(s => s.setActiveWorkspace);
    const reduceMotion = useReducedMotion();
    const visible = useNavVisibility();

    return (
        <motion.nav
            className="glass-strong pointer-events-auto fixed left-1/2 top-4 z-40 flex h-12 items-center gap-1 rounded-full px-2 pr-3"
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

            {ITEMS.map(item => {
                const Icon = item.icon;
                const active = activeWorkspace === item.id;
                return (
                    <button
                        key={item.id}
                        onClick={() => setActiveWorkspace(item.id)}
                        className={cn(
                            "focus-ring relative flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors",
                            active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {active && (
                            <motion.span
                                layoutId="nav-active-pill"
                                className="absolute inset-0 rounded-full bg-white/10 ring-1 ring-white/15"
                                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 38 }}
                            />
                        )}
                        <Icon size={16} className="relative z-10 shrink-0" />
                        <span className="font-body relative z-10 hidden sm:inline">{item.label}</span>
                    </button>
                );
            })}
        </motion.nav>
    );
}
