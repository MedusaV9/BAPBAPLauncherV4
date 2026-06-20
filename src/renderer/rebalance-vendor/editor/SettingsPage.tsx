import { Button, Card, CardBody, CardHeader, Input } from "./ui";
import { ArrowUpRight, FolderOpen, RefreshCw, RotateCcw, Save, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { ModeSwitch, PathCard, type ExperienceMode } from "./common";
import { usePageEntranceMotion } from "./motion";
import type { BootstrapPayload } from "./types";
import { applyTheme, getAvailableThemes, loadTheme, type ThemeId } from "./helpers/theme";
import { SECTION_TITLES } from "./copy";

export function SettingsPage({
  bootstrap,
  mode,
  embedded = false,
  profileLabel = null,
  track = null,
  instanceSource = null,
  compatibilityWarning = null,
  onChangeMode,
  workspaceInput,
  onWorkspaceInputChange,
  onChooseWorkspace,
  onApplyWorkspace,
  onRefreshCatalog,
  onSnapshot,
  onOpenFolder,
  onRestartSetup,
  onOpenPackTools,
  onSaveSettings,
  onResetDefaults,
}: {
  bootstrap: BootstrapPayload | null;
  mode: ExperienceMode;
  embedded?: boolean;
  profileLabel?: string | null;
  track?: string | null;
  instanceSource?: string | null;
  compatibilityWarning?: string | null;
  onChangeMode: (value: ExperienceMode) => void;
  workspaceInput: string;
  onWorkspaceInputChange: (value: string) => void;
  onChooseWorkspace: () => void;
  onApplyWorkspace: () => void;
  onRefreshCatalog: () => void;
  onSnapshot: () => void;
  onOpenFolder: (path: string) => void;
  onRestartSetup: () => void;
  onOpenPackTools: () => void;
  onSaveSettings?: () => void;
  onResetDefaults?: () => void;
}) {
  const workspace = bootstrap?.workspace;
  const trackLabel = track ? track.replace(/-/g, " ") : null;
  const profileSourceLabel = instanceSource === "steam-library" ? "Steam install" : "Launcher instance";
  const workspaceStatusLabel = workspace?.workspaceRoot ? "Linked" : "Missing";
  const backupStatusLabel = workspace?.backupRoot ? "Ready" : "Not configured";
  const pageMotionRef = usePageEntranceMotion();
  const [activeSettingsPanel, setActiveSettingsPanel] = useState<"maintenance" | "folders">("maintenance");

  // Phase 3 Task 21 — Theme variants. Workspace-keyed so each profile can
  // remember its own theme. Falls back to the default slot when no workspace
  // is bound yet. The body[data-theme] attribute is what the tokens-*.css
  // overlays react to, so the preview pane below updates automatically.
  const themeWorkspaceRoot = workspace?.workspaceRoot ?? null;
  const [theme, setTheme] = useState<ThemeId>(() => loadTheme(themeWorkspaceRoot));
  useEffect(() => {
    const persisted = loadTheme(themeWorkspaceRoot);
    setTheme(persisted);
    applyTheme(persisted, themeWorkspaceRoot);
  }, [themeWorkspaceRoot]);
  const themeOptions = getAvailableThemes();
  const handleSelectTheme = (next: ThemeId) => {
    setTheme(next);
    applyTheme(next, themeWorkspaceRoot);
  };
  const panelClass = embedded
    ? "v2-card border-[var(--line)] shadow-none"
    : "v2-card border-[var(--line)] shadow-none";
  const sectionTitleClass = embedded ? "text-xl font-semibold text-[var(--text)]" : "text-xl font-semibold text-[var(--text)]";
  const sectionCopyClass = embedded ? "text-sm text-[var(--text-muted)]" : "text-sm text-[var(--text-muted)]";
  const subheadingClass = embedded ? "font-semibold text-[var(--text)]" : "font-semibold text-[var(--text)]";
  const settingsRootTestId = embedded ? "rebalance-settings-embedded" : "rebalance-settings-standalone";
  const utilityPanelCard = (
    <Card className={panelClass} data-motion-item>
      <CardHeader className="px-6 py-5">
        <div>
          <p className="atelier-kicker">Utilities</p>
          <h3 className={sectionTitleClass}>Support panels</h3>
          {!embedded ? (
            <p className={sectionCopyClass}>
              Support tools and raw paths stay grouped here so the settings page keeps one clear focus at a time.
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardBody className="flex flex-col gap-[var(--space-md)] px-6 pb-6 pt-0">
        <div className="task-section-picker task-section-picker--inline">
          <p className="task-section-picker-label">Settings surface</p>
          <div className="task-segmented" role="tablist" aria-label="Settings surfaces">
            <button type="button" className={activeSettingsPanel === "maintenance" ? "is-active" : ""} aria-pressed={activeSettingsPanel === "maintenance"} onClick={() => setActiveSettingsPanel("maintenance")}>
              Maintenance
            </button>
            <button type="button" className={activeSettingsPanel === "folders" ? "is-active" : ""} aria-pressed={activeSettingsPanel === "folders"} onClick={() => setActiveSettingsPanel("folders")}>
              Folders
            </button>
          </div>
        </div>
        {activeSettingsPanel === "maintenance" ? (
          <div className="rebalance-settings-utility-grid">
            <div className="rebalance-settings-utility-card">
              <p className={subheadingClass}>Safety backup</p>
              <div className="flex flex-wrap gap-3">
                <Button color="secondary" variant="flat" startContent={<Save className="h-4 w-4" />} onPress={onSnapshot}>
                  Create snapshot
                </Button>
                {workspace?.backupRoot ? (
                  <Button variant="flat" startContent={<ArrowUpRight className="h-4 w-4" />} onPress={() => onOpenFolder(workspace.backupRoot)}>
                    Open backup folder
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="rebalance-settings-utility-card">
              <p className={subheadingClass}>Pack tools</p>
              <div className="flex flex-wrap gap-3">
                {embedded ? null : (
                  <Button color="secondary" variant="flat" startContent={<ArrowUpRight className="h-4 w-4" />} onPress={onOpenPackTools}>
                    Open pack tools
                  </Button>
                )}
                <Button variant="flat" startContent={<RefreshCw className="h-4 w-4" />} onPress={onRefreshCatalog}>
                  {embedded ? "Reload profile files" : "Refresh launcher data"}
                </Button>
                {embedded ? null : (
                  <Button variant="flat" startContent={<Sparkles className="h-4 w-4" />} onPress={onRestartSetup}>
                    Run first-time setup again
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="rebalance-settings-path-grid">
            {workspace ? (
              <>
                <PathCard label={embedded ? "Profile folder" : "Workspace Root"} path={workspace.workspaceRoot} onOpen={() => onOpenFolder(workspace.workspaceRoot)} />
                <PathCard label="Custom augments" path={workspace.customRoot} onOpen={() => onOpenFolder(workspace.customRoot)} />
                <PathCard label="Game Mode files" path={`${workspace.runtimeRoot}\\ArenaSettings`} onOpen={() => onOpenFolder(`${workspace.runtimeRoot}\\ArenaSettings`)} />
                {!embedded ? (
                  <>
                    <PathCard label="Runtime" path={workspace.runtimeRoot} onOpen={() => onOpenFolder(workspace.runtimeRoot)} />
                    <PathCard label="Dev exports" path={workspace.nativeUiRoot} onOpen={() => onOpenFolder(workspace.nativeUiRoot)} />
                    {workspace.arenaPresetsRoot ? (
                      <PathCard label="Game Mode presets" path={workspace.arenaPresetsRoot} onOpen={() => onOpenFolder(workspace.arenaPresetsRoot!)} />
                    ) : null}
                    {workspace.libraryRoot ? (
                      <PathCard label="Library" path={workspace.libraryRoot} onOpen={() => onOpenFolder(workspace.libraryRoot!)} />
                    ) : null}
                    {workspace.installedPacksRoot ? (
                      <PathCard label="Installed packs" path={workspace.installedPacksRoot} onOpen={() => onOpenFolder(workspace.installedPacksRoot!)} />
                    ) : null}
                    {workspace.modProjectRoot ? (
                      <PathCard label="Mod Project" path={workspace.modProjectRoot} onOpen={() => onOpenFolder(workspace.modProjectRoot!)} />
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        )}
        {embedded ? (
          <div className="rebalance-settings-inline-note">
            <p className="atelier-kicker">Safe defaults</p>
            <div className="rebalance-utility-note-list">
              <p>Leave the active profile alone unless you are switching to a different launcher instance.</p>
              <p>Use `Reload profile files` after external edits so the library cache stays current.</p>
              <p>Open raw folders only when a specific file path matters.</p>
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );

  return (
    <div ref={pageMotionRef} className="rebalance-utility-shell rebalance-utility-shell--settings rebalance-settings-layout" data-testid={settingsRootTestId}>
      <div className="rebalance-utility-stack">
        <div data-motion-item data-tour="settings-workspace">
          <Card className={panelClass}>
            <CardHeader className="px-6 py-5">
              <div>
                <p className="atelier-kicker">{embedded ? "Profile" : "Project folder"}</p>
                <h3 className={sectionTitleClass}>{embedded ? "Active profile" : "Where is your project folder?"}</h3>
                {!embedded ? (
                  <p className={sectionCopyClass}>
                    Point this at the normal game folder that contains bapbap.exe. UserData/BalanceMod is derived automatically, and missing runtime folders can be created later.
                  </p>
                ) : null}
              </div>
            </CardHeader>
            <CardBody className="flex flex-col gap-[var(--space-md)] px-6 pb-6 pt-0">
              {embedded ? (
                <div className="rebalance-settings-profile-shell">
                  <div className="rebalance-settings-profile-card">
                    <div className="rebalance-settings-profile-meta">
                      <p className="text-sm font-semibold text-[var(--text)]">{profileLabel ?? "Selected launcher profile"}</p>
                      <div className="rebalance-settings-profile-summary">
                        <span className="rebalance-settings-profile-badge">
                          {profileSourceLabel}
                        </span>
                        {trackLabel ? <span className="rebalance-settings-profile-badge">{trackLabel}</span> : null}
                      </div>
                      {workspace?.workspaceRoot ? (
                        <p className="rebalance-settings-profile-path" title={workspace.workspaceRoot}>
                          {workspace.workspaceRoot}
                        </p>
                      ) : null}
                    </div>
                    {workspace?.workspaceRoot ? (
                      <div className="rebalance-settings-profile-actions">
                        <Button variant="flat" startContent={<FolderOpen className="h-4 w-4" />} onPress={() => onOpenFolder(workspace.workspaceRoot)}>
                          Open profile folder
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {compatibilityWarning ? (
                    <div className="rebalance-settings-inline-warning">
                      {compatibilityWarning}
                    </div>
                  ) : null}
                  <div className="rebalance-settings-status-summary" aria-label="Profile status summary">
                    <div className="rebalance-settings-status-item rebalance-settings-status-item--active">
                      <span>Profile source</span>
                      <strong>{profileSourceLabel}</strong>
                    </div>
                    <div className="rebalance-settings-status-item">
                      <span>Track</span>
                      <strong>{trackLabel ?? "Default"}</strong>
                    </div>
                    <div className="rebalance-settings-status-item">
                      <span>Workspace</span>
                      <strong>{workspaceStatusLabel}</strong>
                    </div>
                    <div className="rebalance-settings-status-item">
                      <span>Backups</span>
                      <strong>{backupStatusLabel}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <Input
                    label="Game folder"
                    labelPlacement="outside"
                    value={workspaceInput}
                    onValueChange={onWorkspaceInputChange}
                    description="Pick the installed game folder that contains bapbap.exe."
                  />
                  <div className="flex flex-wrap gap-3">
                    <Button variant="flat" startContent={<FolderOpen className="h-4 w-4" />} onPress={onChooseWorkspace}>
                      Browse
                    </Button>
                    <Button color="primary" startContent={<ShieldCheck className="h-4 w-4" />} onPress={onApplyWorkspace}>
                      Use this folder
                    </Button>
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </div>

        {embedded ? utilityPanelCard : null}

        {embedded ? null : (
          <div data-motion-item>
            <Card className={panelClass}>
              <CardHeader className="px-6 py-5">
                <div>
                  <p className="atelier-kicker">App mode</p>
                  <h3 className={sectionTitleClass}>Keep the app simple or show more</h3>
                  <p className={sectionCopyClass}>
                    Guided Mode stays calmer. Studio Mode shows more controls.
                  </p>
                </div>
              </CardHeader>
              <CardBody className="flex flex-col gap-[var(--space-md)] px-6 pb-6 pt-0">
                <ModeSwitch value={mode} onChange={onChangeMode} />
                <div className="flex flex-col gap-[var(--space-sm)]" data-tour="settings-theme">
                  <p className="atelier-kicker">{SECTION_TITLES.appearance}</p>
                  <div
                    className="grid grid-cols-2 gap-2"
                    role="radiogroup"
                    aria-label={SECTION_TITLES.appearance}
                  >
                    {themeOptions.map((opt) => {
                      const active = theme === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          aria-pressed={active}
                          data-rebalance-pressable="true"
                          data-testid={`theme-option-${opt.id}`}
                          onClick={() => handleSelectTheme(opt.id)}
                          className={
                            "flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] " +
                            (active
                              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                              : "border-[var(--line)] text-[var(--text)] hover:border-[var(--accent)]")
                          }
                        >
                          <span className="text-sm font-semibold">{opt.label}</span>
                          <span className="text-xs text-[var(--text-muted)]">{opt.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="rebalance-theme-preview" data-mode={mode}>
                  <div className="rebalance-theme-preview-header">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Live Preview — {mode === "guided" ? "Guided" : "Studio"}</span>
                  </div>
                  <div className="rebalance-theme-preview-card">
                    <span className="rebalance-theme-preview-text">Sample Augment Card</span>
                    <span className="rebalance-theme-preview-muted">A quick look at how cards feel in this mode.</span>
                    <div className="rebalance-theme-preview-row">
                      <span className="rebalance-theme-preview-swatch" style={{ background: mode === "guided" ? "#6366f1" : "#5871ff" }} />
                      <span className="rebalance-theme-preview-swatch" style={{ background: mode === "guided" ? "#1e1b4b" : "#0c1222" }} />
                      <span className="rebalance-theme-preview-swatch" style={{ background: mode === "guided" ? "#e2e8f0" : "#f2f5ff" }} />
                    </div>
                    <input className="rebalance-theme-preview-input" readOnly value={mode === "guided" ? "Damage: 150" : "overrides.damage.base: 150"} tabIndex={-1} />
                    <div className="rebalance-theme-preview-row">
                      <span className="rebalance-theme-preview-btn rebalance-theme-preview-btn--primary">Save</span>
                      <span className="rebalance-theme-preview-btn rebalance-theme-preview-btn--ghost">Reset</span>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        )}

      </div>

      {embedded ? null : <div className="rebalance-utility-rail">{utilityPanelCard}</div>}

      <div className="rebalance-settings-actions">
        <Button color="primary" startContent={<Save className="h-4 w-4" />} onPress={onSaveSettings}>
          Save Settings
        </Button>
        <Button color="ghost" startContent={<RotateCcw className="h-4 w-4" />} onPress={onResetDefaults}>
          Reset to Defaults
        </Button>
      </div>
    </div>
  );
}
