import { 
  FolderOpen, 
  Gamepad2, 
  PackageOpen, 
  RefreshCcw, 
  Save, 
  Shuffle, 
  Sparkles, 
  Wand2,
  FileText,
  Package,
  Users,
  Layout,
  FileCode,
  Activity,
  ArrowRight
} from "lucide-react";

import { Button } from "./ui";
import { useAttentionPulse, usePageEntranceMotion, useAnimatedCounter } from "./motion";
import type { BootstrapPayload } from "./types";

export function DashboardPage({
  bootstrap,
  embedded = false,
  showQuickStart: _showQuickStart,
  onDismissQuickStart: _onDismissQuickStart,
  onStartInteractiveTour: _onStartInteractiveTour,
  onOpenFolder,
  onSnapshot,
  onRepairWorkspaceData,
  onOpenChangeSomething,
  onOpenCreateSomething,
  onOpenGameMode,
  onOpenSwap,
  onOpenImportExport,
  recentChangeTitle,
  lastDraftTitle,
  modifiedFileCount,
  totalFileCount,
}: {
  bootstrap: BootstrapPayload | null;
  embedded?: boolean;
  showQuickStart: boolean;
  onDismissQuickStart: () => void;
  onStartInteractiveTour: () => void;
  onOpenFolder: (path: string) => void;
  onSnapshot: () => void;
  onRepairWorkspaceData: () => void;
  onOpenChangeSomething: () => void;
  onOpenCreateSomething: () => void;
  onOpenGameMode: () => void;
  onOpenSwap: () => void;
  onOpenImportExport: () => void;
  recentChangeTitle?: string | null;
  lastDraftTitle?: string | null;
  unsavedDraftCount?: number;
  modifiedFileCount?: number;
  totalFileCount?: number;
}) {
  const workspace = bootstrap?.workspace;
  const summary = bootstrap?.summary;
  const pageMotionRef = usePageEntranceMotion();
  const primaryActionRef = useAttentionPulse<HTMLDivElement>(true);
  
  const heroPrimaryAction = recentChangeTitle
    ? {
        label: "Continue file",
        icon: <Sparkles className="h-4 w-4" />,
        action: onOpenChangeSomething,
      }
    : {
        label: "Open Change",
        icon: <Sparkles className="h-4 w-4" />,
        action: onOpenChangeSomething,
      };

  return (
    <div
      ref={pageMotionRef}
      className={`rebalance-page-content ${embedded ? "rebalance-home-launchpad--embedded" : ""}`}
      data-testid="dashboard-page"
    >
      {/* 1. Profile Status & Header Banner */}
      <section className="rebalance-home-profile-banner" data-motion-item>
        <div className="rebalance-home-profile-header">
          <div className="rebalance-home-profile-meta">
            <span className="rebalance-home-status-badge">
              <span className="rebalance-home-status-dot"></span>
              Workspace Active
            </span>
            <h2 className="rebalance-home-profile-title">Rebalance Studio Dashboard</h2>
            <p className="text-indigo-200/80 text-sm font-medium mb-1">Open one focused job</p>
            <p className="rebalance-home-profile-path" title={workspace?.workspaceRoot}>
              Active Profile: <code>{workspace?.workspaceRoot ? workspace.workspaceRoot.replace(/\\/g, '/').split('/').pop() : "None"}</code>
            </p>
          </div>
          <div className="rebalance-home-hero-actions">
            <div ref={primaryActionRef}>
              <Button color="primary" startContent={heroPrimaryAction.icon} onPress={heroPrimaryAction.action}>
                {heroPrimaryAction.label}
              </Button>
            </div>
            <Button color="secondary" startContent={<Gamepad2 className="h-4 w-4" />} onPress={onOpenGameMode}>
              Open Game Mode
            </Button>
            <Button color="secondary" startContent={<PackageOpen className="h-4 w-4" />} onPress={onOpenImportExport}>
              Open Packs
            </Button>
          </div>
        </div>
        {modifiedFileCount !== undefined && totalFileCount !== undefined && totalFileCount > 0 && (
          <div className="rebalance-workspace-health mt-4 border-t border-white/5 pt-4">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-indigo-200/60 font-medium">Workspace health</span>
              <span className="text-slate-300 font-semibold">
                {modifiedFileCount} of {totalFileCount} configs modified ({((modifiedFileCount / totalFileCount) * 100).toFixed(0)}%)
              </span>
            </div>
            <div className="rebalance-health-bar-track">
              <div
                className={`rebalance-health-bar-fill--success ${
                  modifiedFileCount / totalFileCount > 0.5
                    ? "rebalance-health-bar-fill--heavy"
                    : modifiedFileCount / totalFileCount > 0.25
                    ? "rebalance-health-bar-fill--warning"
                    : ""
                }`}
                style={{ width: `${Math.min(100, (modifiedFileCount / totalFileCount) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* 2. Resume Working Grid */}
      <section className="rebalance-home-section-title" data-motion-item>
        <h3>Active Workflows</h3>
      </section>

      <section className="rebalance-home-resume-grid" data-testid="rebalance-home-context-grid">
        <article className="rebalance-home-resume-card" data-motion-item onClick={onOpenChangeSomething} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenChangeSomething(); } }}>
          <div className="rebalance-home-card-header">
            <Sparkles className="h-5 w-5 text-indigo-400" />
            <span>Change Workflow</span>
          </div>
          <div className="rebalance-home-card-body">
            <h4>{recentChangeTitle ?? "Choose a file to edit"}</h4>
            <p>{recentChangeTitle ? "Continue editing this configuration file." : "Select an augment, item, or character from the catalog."}</p>
          </div>
          <div className="rebalance-home-card-footer">
            <Button color="ghost" size="sm" onPress={onOpenChangeSomething}>
              <span>{recentChangeTitle ? "Continue" : "Browse"}</span>
              <ArrowRight className="h-4 w-4 ml-1 inline-block" />
            </Button>
          </div>
        </article>

        <article className="rebalance-home-resume-card" data-motion-item onClick={onOpenCreateSomething} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenCreateSomething(); } }}>
          <div className="rebalance-home-card-header">
            <Wand2 className="h-5 w-5 text-amber-400" />
            <span>Create Workflow</span>
          </div>
          <div className="rebalance-home-card-body">
            <h4>{lastDraftTitle ?? "Start a new custom draft"}</h4>
            <p>{lastDraftTitle ? "Resume editing active custom augment." : "Build a clean augment from scratch with in-game preview."}</p>
          </div>
          <div className="rebalance-home-card-footer">
            <Button color="ghost" size="sm" onPress={onOpenCreateSomething}>
              <span>{lastDraftTitle ? "Resume" : "Start New"}</span>
              <ArrowRight className="h-4 w-4 ml-1 inline-block" />
            </Button>
          </div>
        </article>
      </section>

      {/* 3. Workspace Metrics Grid */}
      {summary && (
        <>
          <section className="rebalance-home-section-title" data-motion-item>
            <h3>Workspace Metrics</h3>
          </section>

          <section className="rebalance-home-metrics-grid" data-motion-item>
            <div className="rebalance-home-metric-card">
              <div className="rebalance-home-metric-header">
                <FileText className="h-4 w-4 text-indigo-400" />
                <span>Augments</span>
              </div>
              <div className="rebalance-home-metric-value rebalance-animated-counter">
                <AnimatedMetric value={summary.augmentCount} />
              </div>
              <div className="rebalance-home-metric-sub">PassiveSO + StatusEffect entries</div>
            </div>

            <div className="rebalance-home-metric-card">
              <div className="rebalance-home-metric-header">
                <Package className="h-4 w-4 text-[#5871ff]" />
                <span>Items</span>
              </div>
              <div className="rebalance-home-metric-value rebalance-animated-counter">
                <AnimatedMetric value={summary.itemCount} />
              </div>
              <div className="rebalance-home-metric-sub">Consumable + equipment configs</div>
            </div>

            <div className="rebalance-home-metric-card">
              <div className="rebalance-home-metric-header">
                <Users className="h-4 w-4 text-violet-400" />
                <span>Character Configs</span>
              </div>
              <div className="rebalance-home-metric-value rebalance-animated-counter">
                <AnimatedMetric value={summary.characterCount} />
              </div>
              <div className="rebalance-home-metric-sub">Players, NPCs, enemy variants &amp; bots</div>
            </div>

            <div className="rebalance-home-metric-card">
              <div className="rebalance-home-metric-header">
                <Layout className="h-4 w-4 text-sky-400" />
                <span>Native UI</span>
              </div>
              <div className="rebalance-home-metric-value rebalance-animated-counter">
                <AnimatedMetric value={summary.nativeUiCount} />
              </div>
              <div className="rebalance-home-metric-sub">In-game settings panels</div>
            </div>

            <div className="rebalance-home-metric-card">
              <div className="rebalance-home-metric-header">
                <FileCode className="h-4 w-4 text-amber-400" />
                <span>Custom Drafts</span>
              </div>
              <div className="rebalance-home-metric-value rebalance-animated-counter">
                <AnimatedMetric value={summary.customCount} />
              </div>
              <div className="rebalance-home-metric-sub">User-created augments</div>
            </div>

            <div className="rebalance-home-metric-card rebalance-home-metric-card--highlighted">
              <div className="rebalance-home-metric-header">
                <Activity className="h-4 w-4 text-[#5871ff]" />
                <span>Total Configs</span>
              </div>
              <div className="rebalance-home-metric-value text-[#f2f5ff] rebalance-animated-counter">
                <AnimatedMetric value={summary.totalCount} />
              </div>
              <div className="rebalance-home-metric-sub">All editable JSON files combined</div>
            </div>
          </section>
        </>
      )}

      {/* 4. Swap & Quick Utilities */}
      <section className="rebalance-home-section-title" data-motion-item>
        <h3>Workspace Actions</h3>
      </section>

      <section className="rebalance-home-launcher-grid" data-testid="rebalance-home-launcher-grid" data-motion-item>
        <article className="v2-card v2-card--compact v2-card--interactive" onClick={onOpenChangeSomething} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenChangeSomething(); } }}>
          <span className="rebalance-home-task-tile-icon"><Sparkles /></span>
          <span className="rebalance-home-task-tile-title">Change</span>
        </article>

        <article className="v2-card v2-card--compact v2-card--interactive" onClick={onOpenCreateSomething} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenCreateSomething(); } }}>
          <span className="rebalance-home-task-tile-icon"><Wand2 /></span>
          <span className="rebalance-home-task-tile-title">Create</span>
        </article>

        <article className="v2-card v2-card--compact v2-card--interactive" onClick={onOpenSwap} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenSwap(); } }}>
          <span className="rebalance-home-task-tile-icon"><Shuffle /></span>
          <span className="rebalance-home-task-tile-title">Swap</span>
        </article>
      </section>

      {/* 5. System Tools Toolbar */}
      <section className="rebalance-home-section-title" data-motion-item>
        <h3>System Tools</h3>
      </section>

      <section className="rebalance-home-utilities-toolbar" data-motion-item>
        <div className="rebalance-home-utility-item">
          <Button color="ghost" isIconOnly aria-label="Save snapshot" startContent={<Save className="h-4 w-4" />} onPress={onSnapshot} />
          <div className="rebalance-home-utility-item-text">
            <h5>Backup Snapshot</h5>
            <p>Save current configuration state</p>
          </div>
        </div>

        <div className="rebalance-home-utility-item">
          <Button color="ghost" isIconOnly aria-label="Repair workspace data" startContent={<RefreshCcw className="h-4 w-4" />} onPress={onRepairWorkspaceData} />
          <div className="rebalance-home-utility-item-text">
            <h5>Repair Support Files</h5>
            <p>Restore standard template assets</p>
          </div>
        </div>

        {workspace?.workspaceRoot ? (
          <div className="rebalance-home-utility-item">
            <Button color="ghost" isIconOnly aria-label="Open workspace folder" startContent={<FolderOpen className="h-4 w-4" />} onPress={() => onOpenFolder(workspace.workspaceRoot)} />
            <div className="rebalance-home-utility-item-text">
              <h5>Explore Files</h5>
              <p>Open workspace root folder</p>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function AnimatedMetric({ value }: { value: number }) {
  const display = useAnimatedCounter(value);
  return <>{display}</>;
}
