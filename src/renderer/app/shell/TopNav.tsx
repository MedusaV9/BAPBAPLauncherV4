import { Home, Boxes, Package, Radio, Wrench, Settings, type LucideIcon } from "lucide-react";
import logoIcon from "../../assets/brand/BAPBAP_Desktop_Icon.png";
import { cn } from "../lib/utils";
import { useShellStore } from "../stores/useShellStore";
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

    return (
        <nav className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card/60 px-4 backdrop-blur">
            <div className="mr-3 flex items-center gap-2">
                <img src={logoIcon} alt="BAPBAP" className="h-7 w-7 rounded-md" />
                <span className="font-display text-sm tracking-wide text-foreground">BAPBAP</span>
            </div>

            <div className="flex items-center gap-1">
                {ITEMS.map(item => {
                    const Icon = item.icon;
                    const active = activeWorkspace === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setActiveWorkspace(item.id)}
                            className={cn(
                                "focus-ring relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
                                active
                                    ? "bg-secondary text-foreground font-medium"
                                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                            )}
                        >
                            <Icon size={16} className="shrink-0" />
                            <span className="font-body">{item.label}</span>
                            {active && (
                                <span className="absolute inset-x-2 -bottom-[7px] h-0.5 rounded-full bg-accent" />
                            )}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
