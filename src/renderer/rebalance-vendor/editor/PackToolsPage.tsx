import { Button, Card, CardBody, CardHeader, Checkbox, Input, Select, Switch } from "./ui";
import { Download, FolderDown, FolderOpen, PackageOpen, RefreshCw, Save, Upload } from "lucide-react";
import { useEffect, useState } from "react";

import {
  PathCard,
} from "./common";
import { usePageEntranceMotion, useTabTransition } from "./motion";
import type { CatalogGroup } from "./types";
import type {
  ConfigPackConflictStrategy,
  ConfigPackPreviewResponse,
  ConfigPackReceiptSummary,
  InstalledPackSummary,
} from "./configPacks";

interface PackFormState {
  packId: string;
  packVersion: string;
  name: string;
  description: string;
  author: string;
  outputPath: string;
  preview?: ConfigPackPreviewResponse | null;
  busy: boolean;
}

interface ImportFormState {
  packPath: string;
  conflictStrategy: ConfigPackConflictStrategy;
  createBackup: boolean;
  preview?: ConfigPackPreviewResponse | null;
  busy: boolean;
}

export function PackToolsPage({
  embedded = false,
  catalogGroups,
  selectedPaths,
  onTogglePath,
  onSelectGroup,
  onClearSelection,
  exportState,
  onExportStateChange,
  onPickExportPath,
  onPreviewExport,
  onExportPack,
  importState,
  onImportStateChange,
  onPickImportPath,
  onPreviewImport,
  onImportPack,
  onDropPackToMod,
  installedPacks,
  onRefreshInstalledPacks,
  onSetActivePack,
  receipts,
  onRefreshReceipts,
  onOpenFolder,
}: {
  embedded?: boolean;
  catalogGroups: CatalogGroup[];
  selectedPaths: string[];
  onTogglePath: (path: string) => void;
  onSelectGroup: (groupKey: string) => void;
  onClearSelection: () => void;
  exportState: PackFormState;
  onExportStateChange: (patch: Partial<PackFormState>) => void;
  onPickExportPath: () => void;
  onPreviewExport: () => void;
  onExportPack: () => void;
  importState: ImportFormState;
  onImportStateChange: (patch: Partial<ImportFormState>) => void;
  onPickImportPath: () => void;
  onPreviewImport: () => void;
  onImportPack: () => void;
  onDropPackToMod: () => void;
  installedPacks: InstalledPackSummary[];
  onRefreshInstalledPacks: () => void;
  onSetActivePack: (packId: string) => void;
  receipts: ConfigPackReceiptSummary[];
  onRefreshReceipts: () => void;
  onOpenFolder: (path: string) => void;
}) {
  const pageMotionRef = usePageEntranceMotion();
  const [activeTask, setActiveTask] = useState<"export" | "import" | "installed">("installed");
  const tabTransitionRef = useTabTransition<HTMLDivElement>(activeTask);
  const [activeInstalledPanel, setActiveInstalledPanel] = useState<"packs" | "receipts">("packs");
  const subTabTransitionRef = useTabTransition<HTMLDivElement>(activeInstalledPanel);
  const [exportStep, setExportStep] = useState<number>(1);
  const [importStep, setImportStep] = useState<number>(1);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      onImportStateChange({ packPath: (file as any).path });
    }
  };

  const exportGroups = catalogGroups.filter((group) => group.entries.length > 0);
  const [activeExportGroupKey, setActiveExportGroupKey] = useState<string>("");
  const activePack = installedPacks.find((pack) => pack.active) ?? null;
  const hasInstalledPacks = installedPacks.length > 0;
  const totalContentFiles = installedPacks.reduce((total, pack) => total + pack.contentFileCount, 0);
  const totalArenaPresets = installedPacks.reduce((total, pack) => total + pack.arenaPresetCount, 0);
  const activePackStatus = activePack
    ? `${activePack.contentFileCount} files / ${activePack.arenaPresetCount} presets`
    : "None active";
  const lastPackActivity = activePack?.activatedAtUtc ?? receipts[0]?.importedAtUtc ?? "No recent activity";
  const activeExportGroup = exportGroups.find((group) => group.key === activeExportGroupKey) ?? exportGroups[0] ?? null;
  const surfaceClass = embedded ? "v2-card rounded-[24px] border-none shadow-none" : "v2-card rounded-[30px] border-none shadow-none";
  const headingClass = embedded ? "text-xl font-semibold text-slate-100" : "text-xl font-semibold text-slate-950";
  const heroHeadingClass = embedded ? "text-2xl font-semibold text-slate-100" : "text-2xl font-semibold text-slate-950";
  const copyClass = embedded ? "text-sm text-slate-400" : "text-sm text-slate-500";
  const cardSurfaceClass = embedded
    ? "rounded-[24px] border border-[var(--line)] bg-[var(--bg-1)] px-4 py-4 shadow-[0_12px_28px_rgba(0,0,0,0.2)]"
    : "rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]";
  const summarySurfaceClass = embedded
    ? "rounded-[20px] border border-[var(--line)] bg-[var(--bg-1)] px-4 py-4"
    : "rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4";
  const emptySurfaceClass = embedded
    ? "rounded-[24px] border border-dashed border-white/10 bg-[#10161d] px-4 py-4 text-sm leading-6 text-slate-400"
    : "rounded-[24px] border border-dashed border-slate-200 bg-white/75 px-4 py-4 text-sm leading-6 text-slate-500";
  const activeSurfaceClass = embedded
    ? "rounded-[24px] border border-[#5871ff]/26 bg-[#5871ff]/8 px-4 py-4"
    : "rounded-[24px] border border-[#5871ff]/24 bg-[#5871ff]/7 px-4 py-4";
  const strongCopyClass = embedded ? "font-medium text-slate-100" : "font-medium text-slate-900";
  const subtleCopyClass = embedded ? "text-sm text-slate-400" : "text-sm text-slate-500";
  const detailCopyClass = embedded ? "mt-3 space-y-2 text-sm text-slate-400" : "mt-3 space-y-2 text-sm text-slate-600";
  const taskOptions = [
    {
      key: "installed" as const,
      label: "Installed",
      title: "Manage installed packs",
      body: "Switch the one active pack here. Open receipts only when you need history or backups.",
    },
    {
      key: "import" as const,
      label: "Import",
      title: "Bring in one pack",
      body: "Preview the archive first, then decide whether it should apply now or wait for the next launch.",
    },
    {
      key: "export" as const,
      label: "Export",
      title: "Share one focused pack",
      body: "Pick only the files you mean to share, preview the result, then save the `.rbpack` archive.",
    },
  ];
  const activeTaskDefinition = taskOptions.find((task) => task.key === activeTask) ?? taskOptions[0];
  const embeddedToolbarHeading =
    activeTask === "installed"
      ? "Installed packs"
      : activeTask === "import"
        ? "Import pack"
        : "Export pack";
  const toolbarStatusCopy = activePack
    ? embedded
      ? `${activePack.name} is active now.`
      : `${activePack.name} v${activePack.packVersion} is active now.`
    : activeTask === "installed"
      ? embedded
        ? "No active pack yet."
        : "No active pack yet. Import one, then activate it here."
      : activeTask === "import"
        ? embedded
          ? "Preview before applying."
          : "Preview the pack first, then apply it now or on the next launch."
        : embedded
          ? "Export only changed files."
          : "Export only the files you actually changed so shared packs stay focused.";
  const showInstalledSurfacePicker = hasInstalledPacks || receipts.length > 0;
  const isEmbeddedEmptyInstalled = embedded && activeTask === "installed" && !hasInstalledPacks;

  useEffect(() => {
    if (!exportGroups.length) {
      if (activeExportGroupKey) {
        setActiveExportGroupKey("");
      }
      return;
    }
    if (!exportGroups.some((group) => group.key === activeExportGroupKey)) {
      setActiveExportGroupKey(exportGroups[0].key);
    }
  }, [activeExportGroupKey, exportGroups]);

  return (
    <div
      ref={pageMotionRef}
      className={`space-y-4 ${activeTask === "installed" && !hasInstalledPacks ? "rebalance-utility-shell rebalance-utility-shell--packs" : ""}`}
      data-testid={embedded ? "rebalance-packs-embedded" : "rebalance-packs-standalone"}
    >
      <Card className={surfaceClass} data-motion-item>
        <CardBody className="space-y-2 px-6 py-4">
          <div className="pack-toolbar-shell">
            <div className="pack-toolbar-copy">
              <p className="atelier-kicker">Packs</p>
              <h3 className={embedded ? headingClass : heroHeadingClass}>{embedded ? embeddedToolbarHeading : "Content packs"}</h3>
              {!embedded ? <p className={copyClass}>Import, export, or switch one pack without turning this page into a utility wall.</p> : null}
            </div>
            <div className={`pack-toolbar-actions ${embedded ? "pack-toolbar-actions--embedded" : ""}`}>
              <div className="task-section-picker task-section-picker--inline pack-toolbar-task-picker">
                <div className="task-segmented" role="tablist" aria-label="Pack tasks">
                  {taskOptions.map((task) => (
                    <button
                      key={task.key}
                      type="button"
                      className={activeTask === task.key ? "is-active" : ""}
                      aria-pressed={activeTask === task.key}
                      onClick={() => setActiveTask(task.key)}
                    >
                      {task.label}
                    </button>
                  ))}
                </div>
              </div>
              {!embedded ? (
                <div className="pack-toolbar-status">
                  <strong>{activeTaskDefinition.title}</strong>
                  <span className="task-inline-banner-copy">{toolbarStatusCopy}</span>
                </div>
              ) : null}
            </div>
          </div>
          {embedded ? (
            <div className="pack-toolbar-inline-copy">
              <strong>{activeTaskDefinition.title}</strong>
              <span>{toolbarStatusCopy}</span>
            </div>
          ) : null}
          {activeTask === "installed" ? (
            <div className="pack-production-summary" aria-label="Pack status summary">
              <div className="pack-production-summary-item pack-production-summary-item--active">
                <span>Active pack</span>
                <strong>{activePack?.name ?? "No active pack"}</strong>
                <em>{activePackStatus}</em>
              </div>
              <div className="pack-production-summary-item">
                <span>Installed</span>
                <strong>{installedPacks.length}</strong>
                <em>{receipts.length} receipts</em>
              </div>
              <div className="pack-production-summary-item">
                <span>Pack contents</span>
                <strong>{totalContentFiles}</strong>
                <em>{totalArenaPresets} arena presets</em>
              </div>
              <div className="pack-production-summary-item">
                <span>Last activity</span>
                <strong>{lastPackActivity}</strong>
                <em>Import or activation</em>
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <div ref={tabTransitionRef} className="space-y-4">
      {activeTask === "export" ? (
        <>
          <Card className={surfaceClass} data-motion-item>
            <CardHeader className="px-6 py-5">
              <div>
                <p className="atelier-kicker">Export</p>
                <h3 className={headingClass}>Build one focused pack</h3>
                {!embedded ? <p className={copyClass}>Keep one export surface open at a time so file trimming and pack metadata do not fight each other.</p> : null}
              </div>
            </CardHeader>
            <CardBody className="space-y-4 px-6 pb-6 pt-0">
              {/* Export Stepper Progress Header */}
              <div className="task-pack-stepper" role="tablist" aria-label="Export Progress Stepper">
                <span className="flex items-center flex-1">
                  <button
                    type="button"
                    className={`task-pack-step ${exportStep === 1 ? "is-active" : ""} ${exportStep > 1 ? "is-completed" : ""}`}
                    onClick={() => setExportStep(1)}
                  >
                    <span className="task-pack-step-num">1</span>
                    <span>Select Files</span>
                  </button>
                  <div className={`task-pack-stepper-connector ${exportStep > 1 ? "is-completed" : ""} ${exportStep === 1 ? "is-active" : ""}`} />
                </span>
                <span className="flex items-center flex-1">
                  <button
                    type="button"
                    className={`task-pack-step ${exportStep === 2 ? "is-active" : ""} ${exportStep > 2 ? "is-completed" : ""}`}
                    onClick={() => setExportStep(2)}
                  >
                    <span className="task-pack-step-num">2</span>
                    <span>Pack Details</span>
                  </button>
                  <div className={`task-pack-stepper-connector ${exportStep > 2 ? "is-completed" : ""} ${exportStep === 2 ? "is-active" : ""}`} />
                </span>
                <span className="flex items-center">
                  <button
                    type="button"
                    className={`task-pack-step ${exportStep === 3 ? "is-active" : ""}`}
                    onClick={() => setExportStep(3)}
                  >
                    <span className="task-pack-step-num">3</span>
                    <span>Build Pack</span>
                  </button>
                </span>
              </div>

              {exportStep === 1 ? (
                <>
                  <div className={summarySurfaceClass}>
                    <p className={strongCopyClass}>Selected files right now: {selectedPaths.length}</p>
                    <p className={`mt-2 leading-6 ${copyClass}`}>
                      Build the pack around one clear idea, then stay inside one library group at a time while you trim the file list.
                    </p>
                  </div>
                  {exportGroups.length ? (
                    <div className="task-value-browser task-value-browser--split task-pack-browser">
                      <div className="task-value-browser-nav task-pack-browser-nav">
                        <div className="task-value-browser-nav-copy">
                          <p className={strongCopyClass}>Library groups</p>
                          <p className={copyClass}>Keep one group in focus so the export list stops turning into a long checkbox wall.</p>
                        </div>
                        <div className="task-value-browser-nav-list">
                          {exportGroups.map((group) => {
                            const selectedCount = group.entries.filter((entry) => selectedPaths.includes(entry.absolutePath)).length;
                            return (
                              <button
                                key={group.key}
                                type="button"
                                className={`task-value-browser-pill ${activeExportGroup?.key === group.key ? "is-active" : ""}`}
                                onClick={() => setActiveExportGroupKey(group.key)}
                              >
                                <span>{group.label}</span>
                                <strong>{selectedCount}/{group.entries.length}</strong>
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {exportGroups.map((group) => (
                            <Button key={group.key} size="sm" variant="flat" onPress={() => onSelectGroup(group.key)}>
                              Add all {group.label}
                            </Button>
                          ))}
                          <Button size="sm" variant="flat" color="warning" onPress={onClearSelection}>
                            Clear selection
                          </Button>
                        </div>
                      </div>
                      <div className="task-value-browser-main task-pack-browser-main">
                        {activeExportGroup ? (
                          <div className={cardSurfaceClass}>
                            <p className={strongCopyClass}>{activeExportGroup.label}</p>
                            <p className={`mt-1 ${subtleCopyClass}`}>
                              {activeExportGroup.entries.filter((entry) => selectedPaths.includes(entry.absolutePath)).length} of {activeExportGroup.entries.length} entries are included right now.
                            </p>
                            <div className="task-pack-entry-list mt-4">
                              {activeExportGroup.entries.map((entry) => (
                                <Checkbox key={entry.id} isSelected={selectedPaths.includes(entry.absolutePath)} onValueChange={() => onTogglePath(entry.absolutePath)}>
                                  <span className={strongCopyClass}>{entry.title}</span>
                                  <span className={`ml-2 ${embedded ? "text-slate-400" : "text-slate-500"}`}>{entry.subtitle}</span>
                                </Checkbox>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className={emptySurfaceClass}>
                            No exportable groups are ready yet. Once the launcher has discovered content files, they will appear here.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className={emptySurfaceClass}>
                      No exportable groups are ready yet. Add runtime content first, then come back here to bundle a pack.
                    </div>
                  )}
                  <div className="flex justify-end mt-4">
                    <Button color="primary" onPress={() => setExportStep(2)}>
                      Next: Pack details
                    </Button>
                  </div>
                </>
              ) : null}

              {exportStep === 2 ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  <Input label="Pack name" value={exportState.name} onValueChange={(value) => onExportStateChange({ name: value })} />
                  <Input label="Pack version" value={exportState.packVersion} onValueChange={(value) => onExportStateChange({ packVersion: value })} />
                  <Input label="Pack ID" value={exportState.packId} onValueChange={(value) => onExportStateChange({ packId: value })} />
                  <Input label="Author" value={exportState.author} onValueChange={(value) => onExportStateChange({ author: value })} />
                  <Input
                    className="xl:col-span-2"
                    label="Description"
                    value={exportState.description}
                    onValueChange={(value) => onExportStateChange({ description: value })}
                  />
                  <div className="xl:col-span-2 flex justify-between mt-4">
                    <Button variant="flat" onPress={() => setExportStep(1)}>
                      Back to files
                    </Button>
                    <Button color="primary" onPress={() => setExportStep(3)}>
                      Next: Build pack
                    </Button>
                  </div>
                </div>
              ) : null}

              {exportStep === 3 ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  <Input
                    className="xl:col-span-2"
                    label="Where should the pack be saved?"
                    value={exportState.outputPath}
                    onValueChange={(value) => onExportStateChange({ outputPath: value })}
                    description="This should end with .rbpack."
                  />
                  <div className="xl:col-span-2 flex flex-wrap gap-3">
                    <Button variant="flat" startContent={<FolderOpen className="h-4 w-4" />} onPress={onPickExportPath}>
                      Choose save location
                    </Button>
                    <Button color="secondary" variant="flat" startContent={<PackageOpen className="h-4 w-4" />} onPress={onPreviewExport}>
                      Preview pack
                    </Button>
                    <Button color="primary" startContent={<Download className="h-4 w-4" />} onPress={onExportPack}>
                      Save pack
                    </Button>
                  </div>
                  {exportState.preview ? (
                    <div className={`xl:col-span-2 ${summarySurfaceClass}`}>
                      <p className={strongCopyClass}>{exportState.preview.manifest.name}</p>
                      <p className={`mt-2 ${subtleCopyClass}`}>{exportState.preview.fileCount} files, {exportState.preview.totalBytes} bytes.</p>
                      <div className={detailCopyClass}>
                        {exportState.preview.contents.map((content) => (
                          <p key={`${content.root}:${content.path}`}>{content.root} / {content.path}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="xl:col-span-2 flex justify-between mt-4">
                    <Button variant="flat" onPress={() => setExportStep(2)}>
                      Back to details
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardBody>
          </Card>
        </>
      ) : null}

      {activeTask === "import" ? (
        <Card className={surfaceClass} data-motion-item>
          <CardHeader className="px-6 py-5">
            <div>
              <p className="atelier-kicker">Import</p>
              <h3 className={headingClass}>Apply a pack</h3>
              {!embedded ? <p className={copyClass}>Preview first, then apply it now or send it to the game for the next launch.</p> : null}
            </div>
          </CardHeader>
          <CardBody className="space-y-4 px-6 pb-6 pt-0">
            {/* Import Stepper Progress Header */}
            <div className="task-pack-stepper" role="tablist" aria-label="Import Progress Stepper">
              <span className="flex items-center flex-1">
                <button
                  type="button"
                  className={`task-pack-step ${importStep === 1 ? "is-active" : ""} ${importStep > 1 ? "is-completed" : ""}`}
                  onClick={() => setImportStep(1)}
                >
                  <span className="task-pack-step-num">1</span>
                  <span>Select Pack</span>
                </button>
                <div className={`task-pack-stepper-connector ${importStep > 1 ? "is-completed" : ""} ${importStep === 1 ? "is-active" : ""}`} />
              </span>
              <span className="flex items-center flex-1">
                <button
                  type="button"
                  className={`task-pack-step ${importStep === 2 ? "is-active" : ""} ${importStep > 2 ? "is-completed" : ""}`}
                  onClick={() => setImportStep(2)}
                  disabled={!importState.preview}
                >
                  <span className="task-pack-step-num">2</span>
                  <span>Preview Contents</span>
                </button>
                <div className={`task-pack-stepper-connector ${importStep > 2 ? "is-completed" : ""} ${importStep === 2 ? "is-active" : ""}`} />
              </span>
              <span className="flex items-center">
                <button
                  type="button"
                  className={`task-pack-step ${importStep === 3 ? "is-active" : ""}`}
                  onClick={() => setImportStep(3)}
                  disabled={!importState.preview}
                >
                  <span className="task-pack-step-num">3</span>
                  <span>Apply Pack</span>
                </button>
              </span>
            </div>

            {importStep === 1 ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {/* Drag and Drop Zone Area */}
                <div className="xl:col-span-2">
                  <div
                    className={`task-pack-dropzone ${isDragging ? "is-dragging" : ""}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={onPickImportPath}
                  >
                    <div className="task-pack-dropzone-icon">
                      <Upload className="h-6 w-6" />
                    </div>
                    <div className="task-pack-dropzone-copy">
                      <strong>Drag & Drop pack file here</strong>
                      <span>Supports .zip or .rbpack archives. Or click to browse.</span>
                    </div>
                  </div>
                </div>

                <Input
                  className="xl:col-span-2"
                  label="Which pack do you want to apply?"
                  value={importState.packPath}
                  onValueChange={(value) => onImportStateChange({ packPath: value })}
                />
                <div className={cardSurfaceClass}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className={strongCopyClass}>Create a safety backup</p>
                      <p className={subtleCopyClass}>Recommended for almost every import.</p>
                    </div>
                    <Switch isSelected={importState.createBackup} onValueChange={(value) => onImportStateChange({ createBackup: value })} />
                  </div>
                </div>
                <div className={cardSurfaceClass}>
                  <Select
                    label="If files already exist"
                    value={importState.conflictStrategy}
                    options={[
                      { value: "replace-targeted-files", label: "Replace targeted files", description: "Best default for normal shared rebalance packs." },
                      { value: "merge-json-by-overrides", label: "Merge JSON by overrides", description: "Attempts a JSON merge for supported files." },
                    ]}
                    onValueChange={(value) => onImportStateChange({ conflictStrategy: value as ConfigPackConflictStrategy })}
                  />
                </div>
                <div className="xl:col-span-2 flex flex-wrap gap-3 mt-2">
                  <Button variant="flat" startContent={<FolderOpen className="h-4 w-4" />} onPress={onPickImportPath}>
                    Choose pack file
                  </Button>
                  <Button color="secondary" variant="flat" startContent={<PackageOpen className="h-4 w-4" />} onPress={onPreviewImport}>
                    Preview pack
                  </Button>
                </div>
                <div className="xl:col-span-2 flex justify-end mt-4">
                  <Button color="primary" isDisabled={!importState.packPath} onPress={() => { onPreviewImport(); setImportStep(2); }}>
                    Next: Preview contents
                  </Button>
                </div>
              </div>
            ) : null}

            {importStep === 2 ? (
              <div className="space-y-4">
                {importState.preview ? (
                  <div className={summarySurfaceClass}>
                    <p className={strongCopyClass}>{importState.preview.manifest.name}</p>
                    <p className={`mt-2 ${subtleCopyClass}`}>{importState.preview.fileCount} files.</p>
                    <div className={detailCopyClass}>
                      {importState.preview.contents.map((content) => (
                        <p key={`${content.root}:${content.path}`}>{content.root} / {content.path}</p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className={emptySurfaceClass}>
                    No pack preview available. Please go back to step 1 and select or preview a valid pack archive first.
                  </div>
                )}
                <div className="flex justify-between mt-4">
                  <Button variant="flat" onPress={() => setImportStep(1)}>
                    Back to setup
                  </Button>
                  <Button color="primary" isDisabled={!importState.preview} onPress={() => setImportStep(3)}>
                    Next: Apply pack
                  </Button>
                </div>
              </div>
            ) : null}

            {importStep === 3 ? (
              <div className="space-y-4">
                <div className={summarySurfaceClass}>
                  <p className={strongCopyClass}>Confirm actions</p>
                  <p className={`mt-2 ${copyClass}`}>Apply this pack immediately to update the workspace configurations, or drop it directly into the mod load folder to be sync'd on the next game launch.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button color="primary" startContent={<Upload className="h-4 w-4" />} onPress={onImportPack}>
                    Apply this pack now
                  </Button>
                  <Button variant="flat" startContent={<FolderDown className="h-4 w-4" />} onPress={onDropPackToMod}>
                    Send to the game for next launch
                  </Button>
                </div>
                <div className="flex justify-between mt-4">
                  <Button variant="flat" onPress={() => setImportStep(2)}>
                    Back to preview
                  </Button>
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {activeTask === "installed" ? (
        <>
          {isEmbeddedEmptyInstalled ? (
            <section className="pack-empty-embedded-stage" data-motion-item>
              <div className="pack-empty-embedded-stage-actions">
                <Button variant="flat" startContent={<RefreshCw className="h-4 w-4" />} onPress={onRefreshInstalledPacks}>
                  Refresh packs
                </Button>
              </div>
              <div className={`task-empty-workspace-grid pack-empty-workspace-grid pack-empty-workspace-grid--embedded`}>
                <div className={`${cardSurfaceClass} pack-installed-empty-shell pack-installed-empty-shell--compact`}>
                  <div>
                    <p className={strongCopyClass}>No content pack is installed yet</p>
                    <p className={`mt-2 ${copyClass}`}>
                      Import one shared pack or export the current changes as the first clean pack.
                    </p>
                  </div>
                  <div className="task-empty-workspace-pills">
                    <span className="task-empty-workspace-pill is-active">0 active packs</span>
                    <span className="task-empty-workspace-pill">0 install receipts</span>
                    <span className="task-empty-workspace-pill">Import or export next</span>
                  </div>
                </div>
                <div className={`${summarySurfaceClass} pack-installed-next-shell pack-installed-next-shell--compact`}>
                  <div>
                    <p className={strongCopyClass}>Next step</p>
                    <p className={`mt-2 ${copyClass}`}>
                      Use import when someone shared an `.rbpack`. Use export when this profile already contains the changes you want to share.
                    </p>
                  </div>
                  <div className="pack-installed-empty-actions">
                    <div>
                      <p className={strongCopyClass}>Start with import</p>
                      <p className={`mt-2 ${copyClass}`}>Bring in one `.rbpack`, preview it, then activate it here.</p>
                    </div>
                    <div>
                      <p className={strongCopyClass}>Or build one pack</p>
                      <p className={`mt-2 ${copyClass}`}>Export only the files you actually changed so sharing stays focused.</p>
                    </div>
                  </div>
                  <div className="task-button-row pack-installed-next-actions--compact">
                    <Button color="secondary" variant="flat" onPress={() => setActiveTask("import")}>
                      Open import
                    </Button>
                    <Button variant="flat" onPress={() => setActiveTask("export")}>
                      Open export
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          ) : (
          <Card className={surfaceClass} data-motion-item>
            <CardHeader className="px-6 py-4">
              <div>
                <p className="atelier-kicker">Installed</p>
                <h3 className={headingClass}>{embedded && !hasInstalledPacks ? "Next pack" : "Keep one pack active"}</h3>
                {!embedded ? (
                  <p className={copyClass}>
                    Gameplay content should stay single-source. Import, inspect, then switch exactly one pack on.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="flat" startContent={<RefreshCw className="h-4 w-4" />} onPress={onRefreshInstalledPacks}>
                  Refresh packs
                </Button>
              </div>
            </CardHeader>
            <CardBody className="space-y-3 px-6 pb-6 pt-0">
              {showInstalledSurfacePicker ? (
                <div className="task-section-picker task-section-picker--inline">
                  <p className="task-section-picker-label">Installed surface</p>
                  <div className="task-segmented" role="tablist" aria-label="Pack manage surfaces">
                    <button type="button" className={activeInstalledPanel === "packs" ? "is-active" : ""} onClick={() => setActiveInstalledPanel("packs")}>
                      Active packs
                    </button>
                    <button type="button" className={activeInstalledPanel === "receipts" ? "is-active" : ""} onClick={() => setActiveInstalledPanel("receipts")}>
                      History
                    </button>
                  </div>
                </div>
              ) : null}
              <div ref={subTabTransitionRef} className="space-y-3">
              {activeInstalledPanel === "packs" ? (
                <>
                  {hasInstalledPacks ? (
                    <div className="pack-manage-grid">
                      <div className={`${activePack ? activeSurfaceClass : summarySurfaceClass} pack-installed-summary-shell`}>
                        <div>
                          <p className={strongCopyClass}>{activePack ? activePack.name : "Choose the active pack"}</p>
                          <p className={`mt-2 ${copyClass}`}>
                            {activePack
                              ? `Version ${activePack.packVersion}. ${activePack.contentFileCount} content files and ${activePack.arenaPresetCount} arena preset${activePack.arenaPresetCount === 1 ? "" : "s"} are active right now.`
                              : "You already have installed packs. Pick exactly one to become the active gameplay source."}
                          </p>
                        </div>
                        {activePack ? (
                          <PathCard label="Installed pack" path={activePack.packRoot} onOpen={() => onOpenFolder(activePack.packRoot)} />
                        ) : null}
                      </div>

                      <div className={`${cardSurfaceClass} pack-installed-surface`}>
                        <div className="pack-installed-surface-head">
                          <div className="pack-installed-surface-copy">
                            <p className={strongCopyClass}>Installed packs</p>
                            <p className={subtleCopyClass}>Keep this list tight: review one candidate, then make it active.</p>
                          </div>
                          <Button size="sm" variant="flat" startContent={<RefreshCw className="h-4 w-4" />} onPress={onRefreshInstalledPacks}>
                            Refresh
                          </Button>
                        </div>
                        <div className="pack-installed-list">
                          {installedPacks.map((pack) => (
                            <div key={pack.packId} className={`pack-installed-card ${pack.active ? activeSurfaceClass : cardSurfaceClass}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className={strongCopyClass}>{pack.name}</p>
                                  <p className={`mt-1 ${subtleCopyClass}`}>
                                    {pack.packId} | v{pack.packVersion} | {pack.contentFileCount} content files | {pack.arenaPresetCount} presets
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  variant={pack.active ? undefined : "flat"}
                                  color={pack.active ? "primary" : undefined}
                                  isDisabled={pack.active}
                                  onPress={() => onSetActivePack(pack.packId)}
                                >
                                  {pack.active ? "Active now" : "Make active"}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={`task-empty-workspace-grid pack-empty-workspace-grid ${embedded ? "pack-empty-workspace-grid--embedded" : ""}`}>
                      <div className={`${cardSurfaceClass} pack-installed-empty-shell ${embedded ? "pack-installed-empty-shell--compact" : ""}`}>
                        <div>
                          <p className={strongCopyClass}>No content pack is installed yet</p>
                          <p className={`mt-2 ${copyClass}`}>
                            {embedded
                              ? "Import one shared pack or export the current changes as the first clean pack."
                              : "Start with one clean import or export path. Once the first pack exists, this page becomes the active pack switcher."}
                          </p>
                        </div>
                        <div className="task-empty-workspace-pills">
                          <span className="task-empty-workspace-pill is-active">0 active packs</span>
                          <span className="task-empty-workspace-pill">0 install receipts</span>
                          <span className="task-empty-workspace-pill">Import or export next</span>
                        </div>
                      </div>
                      <div className={`${summarySurfaceClass} pack-installed-next-shell ${embedded ? "pack-installed-next-shell--compact" : ""}`}>
                        <div>
                          <p className={strongCopyClass}>Next step</p>
                          <p className={`mt-2 ${copyClass}`}>
                            Use import when someone shared an `.rbpack`. Use export when this profile already contains the changes you want to share.
                          </p>
                        </div>
                        <div className="pack-installed-empty-actions">
                          <div>
                            <p className={strongCopyClass}>Start with import</p>
                            <p className={`mt-2 ${copyClass}`}>Bring in one `.rbpack`, preview it, then activate it here.</p>
                          </div>
                          <div>
                            <p className={strongCopyClass}>Or build one pack</p>
                            <p className={`mt-2 ${copyClass}`}>Export only the files you actually changed so sharing stays focused.</p>
                          </div>
                        </div>
                        <div className={`task-button-row ${embedded ? "pack-installed-next-actions--compact" : ""}`}>
                          <Button color="secondary" variant="flat" onPress={() => setActiveTask("import")}>
                            Open import
                          </Button>
                          <Button variant="flat" onPress={() => setActiveTask("export")}>
                            Open export
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className={summarySurfaceClass}>
                    <p className={strongCopyClass}>Recent imports and backups</p>
                    <p className={`mt-2 ${copyClass}`}>Open receipts only when you need to trace what was applied or recover from a backup.</p>
                    <div className="mt-3">
                      <Button variant="flat" startContent={<Save className="h-4 w-4" />} onPress={onRefreshReceipts}>
                        Refresh receipts
                      </Button>
                    </div>
                  </div>
                  {receipts.length ? (
                    receipts.map((receipt) => (
                      <div key={receipt.receiptPath} className={cardSurfaceClass}>
                        <p className={strongCopyClass}>{receipt.packId}</p>
                        <p className={`mt-1 ${subtleCopyClass}`}>Version {receipt.packVersion}. Imported files: {receipt.importedFileCount}.</p>
                        <p className={`mt-2 leading-6 ${copyClass}`}>Imported at {receipt.importedAtUtc}</p>
                        <div className="mt-3 space-y-3">
                          <PathCard label="Receipt" path={receipt.receiptPath} onOpen={() => onOpenFolder(receipt.receiptPath)} />
                          {receipt.backupPath ? <PathCard label="Backup" path={receipt.backupPath} onOpen={() => onOpenFolder(receipt.backupPath ?? "")} /> : null}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className={emptySurfaceClass}>
                      {embedded ? "No receipts yet." : "No import receipts yet. They will appear here after the first launcher import or PackDrop ingestion."}
                    </div>
                  )}
                </>
              )}
              </div>
            </CardBody>
          </Card>
          )}
        </>
      ) : null}
      </div>
    </div>
  );
}

