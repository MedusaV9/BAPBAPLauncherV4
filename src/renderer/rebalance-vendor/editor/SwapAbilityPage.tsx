import { RefreshCw, Save, Search } from "lucide-react";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { Button, Card, CardBody, CardHeader, Input, Spinner } from "./ui";
import { SectionCard, resolveFriendlyName, IconPreview } from "./common";
import { materializeRuntimeDocument } from "./document";
import { useOverlayDrawerAnimation, usePageEntranceMotion } from "./motion";
import type { CatalogEntry, JsonValue, RuntimeDocument } from "./types";

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

interface LoadedEntryState {
  document?: RuntimeDocument;
  draftOverrides: Record<string, JsonValue>;
  draftOperations: unknown[];
  loading: boolean;
  saving: boolean;
  error?: string;
}

interface AbilitySwapSource {
  sourceTargetKey: string;
  displayName: string;
  commandLabel?: string;
  runtimeType?: string;
  characterKey?: string;
  characterDisplayName?: string;
  slotIndex?: number;
  slotLabel?: string;
  previewLabel?: string;
  compatibility?: string;
  sameCharacter?: boolean;
  sameSlot?: boolean;
  recommended?: boolean;

  iconPreviewPath?: string | null;
  iconCropX?: number | null;
  iconCropY?: number | null;
  iconCropWidth?: number | null;
  iconCropHeight?: number | null;
  iconSourceWidth?: number | null;
  iconSourceHeight?: number | null;
}

interface AbilitySwapSlot {
  slotIndex: number;
  slotLabel: string;
  sourceTargetKey: string;
  currentTargetKey?: string;
  currentDisplayName?: string;
  currentCommandLabel?: string;
  currentCharacterKey?: string;
  currentCharacterDisplayName?: string;
  sourceCharacterKey?: string;
  sourceCharacterDisplayName?: string;
  sourceSlotIndex?: number;
  sourceSlotLabel?: string;
  sourceDisplayName?: string;
  sourceCommandLabel?: string;
  compatibility?: string;
  previewLabel?: string;
  rollbackSourceTargetKey?: string;
  rollbackDisplayName?: string;
  statusMessage?: string;

  iconPreviewPath?: string | null;
  iconCropX?: number | null;
  iconCropY?: number | null;
  iconCropWidth?: number | null;
  iconCropHeight?: number | null;
  iconSourceWidth?: number | null;
  iconSourceHeight?: number | null;

  rollbackIconPreviewPath?: string | null;
  rollbackIconCropX?: number | null;
  rollbackIconCropY?: number | null;
  rollbackIconCropWidth?: number | null;
  rollbackIconCropHeight?: number | null;
  rollbackIconSourceWidth?: number | null;
  rollbackIconSourceHeight?: number | null;
}

interface SwapCatalogMetadata {
  sourceTargetKey: string;
  displayName?: string;
  commandLabel?: string;
  runtimeType?: string;
  characterKey?: string;
  characterDisplayName?: string;
  slotIndex?: number;
  slotLabel?: string;
  previewLabel?: string;

  iconPreviewPath?: string | null;
  iconCropX?: number | null;
  iconCropY?: number | null;
  iconCropWidth?: number | null;
  iconCropHeight?: number | null;
  iconSourceWidth?: number | null;
  iconSourceHeight?: number | null;
}

const SWAP_SOURCE_RENDER_BATCH = 36;

export function SwapAbilityPage({
  entries,
  sourceEntries = [],
  selectedEntry,
  selectedState,
  embedded = false,
  onSelectEntry,
  onUpdateValue,
  onSave,
  onReload,
}: {
  entries: CatalogEntry[];
  sourceEntries?: CatalogEntry[];
  selectedEntry: CatalogEntry | null;
  selectedState?: LoadedEntryState;
  embedded?: boolean;
  onSelectEntry: (entryId: string) => void;
  onUpdateValue: (item: { path: string; valueType?: string; defaultValue?: JsonValue }, value: string | boolean) => void;
  onSave: () => void;
  onReload: () => void;
}) {
  const pageMotionRef = usePageEntranceMotion();
  const [sidebarExpanded, setSidebarExpanded] = useState(() => !selectedEntry?.id);
  const document = useMemo(
    () => selectedState?.document
      ? materializeRuntimeDocument(selectedState.document, selectedState.draftOverrides ?? {}, [])
      : undefined,
    [selectedState?.document, selectedState?.draftOverrides],
  );
  const sourceMetadata = useMemo(() => buildSwapCatalogMetadataMap(sourceEntries), [sourceEntries]);
  const slots = useMemo(() => deriveSwapSlots(document, sourceMetadata), [document, sourceMetadata]);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(0);
  const [activeSourcePanel, setActiveSourcePanel] = useState<"recommended" | "other">("recommended");
  const [sourceSearch, setSourceSearch] = useState("");
  const [sourceDrawerOpen, setSourceDrawerOpen] = useState(false);
  const deferredSourceSearch = useDeferredValue(sourceSearch);
  const [inspectedSourceTargetKey, setInspectedSourceTargetKey] = useState("");
  const [visibleSourceLimit, setVisibleSourceLimit] = useState(SWAP_SOURCE_RENDER_BATCH);
  const drawerPortalTarget = typeof globalThis.document === "undefined" ? null : globalThis.document.body;
  const sourceDrawerAnim = useOverlayDrawerAnimation<HTMLDivElement>(sourceDrawerOpen);
  const sourceDrawerMotionRef = sourceDrawerAnim.ref;
  const selectedSlot = slots[selectedSlotIndex] ?? slots[0] ?? null;
  const originalIdentityNote = selectedSlot ? buildOriginalSlotIdentityNote(selectedSlot) : null;
  const currentIdentityNote = selectedSlot ? buildSlotIdentityNote(selectedSlot) : null;
  const sources = useMemo(
    () => deriveSwapSources(document, selectedSlot, sourceEntries, sourceMetadata),
    [document, selectedSlot, sourceEntries, sourceMetadata],
  );
  const visibleSources = useMemo(() => {
    const needle = deferredSourceSearch.trim().toLowerCase();
    if (!needle) {
      return sources;
    }
    return sources.filter((source) =>
      [
        source.displayName,
        source.commandLabel,
        source.characterDisplayName,
        source.slotLabel,
        source.previewLabel,
        source.runtimeType,
        source.compatibility,
        source.sourceTargetKey,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [deferredSourceSearch, sources]);
  const characterLabel = resolveFriendlyName(
    readStringValue(document, "characterDisplayName"),
    deriveSwapDocumentCharacterLabel(document, slots),
    resolveSwapEntryLabel(selectedEntry),
    readStringValue(document, "displayName"),
    readStringValue(document, "resolvedName"),
  );
  const recommendedSources = useMemo(
    () => visibleSources.filter((source) => source.recommended),
    [visibleSources],
  );
  const secondarySources = useMemo(
    () => visibleSources.filter((source) => !source.recommended),
    [visibleSources],
  );
  const activeSourceCollection = useMemo(() => {
    if (activeSourcePanel === "recommended" && recommendedSources.length) {
      return recommendedSources;
    }
    if (activeSourcePanel === "other" && secondarySources.length) {
      return secondarySources;
    }
    return recommendedSources.length ? recommendedSources : secondarySources;
  }, [activeSourcePanel, recommendedSources, secondarySources]);
  const renderAllVisibleSources = deferredSourceSearch.trim().length > 0;
  const renderedSourceCollection = useMemo(() => {
    if (renderAllVisibleSources) {
      return activeSourceCollection;
    }
    return activeSourceCollection.slice(0, visibleSourceLimit);
  }, [activeSourceCollection, renderAllVisibleSources, visibleSourceLimit]);
  const canLoadMoreSources = !renderAllVisibleSources && renderedSourceCollection.length < activeSourceCollection.length;
  const inspectedSource = useMemo(() => {
    const currentPool = activeSourceCollection.length ? activeSourceCollection : visibleSources;
    if (!currentPool.length) {
      return null;
    }
    return (
      currentPool.find((source) => source.sourceTargetKey === inspectedSourceTargetKey)
      ?? currentPool.find((source) => source.sourceTargetKey === selectedSlot?.sourceTargetKey)
      ?? currentPool[0]
    );
  }, [activeSourceCollection, inspectedSourceTargetKey, selectedSlot?.sourceTargetKey, visibleSources]);
  const isSidebarCollapsed = Boolean(selectedEntry && !sidebarExpanded);

  useEffect(() => {
    if (selectedSlotIndex < slots.length) {
      return;
    }
    setSelectedSlotIndex(0);
  }, [selectedSlotIndex, slots.length]);

  useEffect(() => {
    setSourceSearch("");
    setSourceDrawerOpen(false);
    setActiveSourcePanel("recommended");
    setInspectedSourceTargetKey("");
    setVisibleSourceLimit(SWAP_SOURCE_RENDER_BATCH);
  }, [selectedEntry?.id]);

  useEffect(() => {
    if (selectedEntry?.id) {
      setSidebarExpanded(false);
    }
  }, [selectedEntry?.id]);

  useEffect(() => {
    if (activeSourcePanel === "recommended" && recommendedSources.length) {
      return;
    }
    if (secondarySources.length) {
      setActiveSourcePanel("other");
      return;
    }
    setActiveSourcePanel("recommended");
  }, [activeSourcePanel, recommendedSources.length, secondarySources.length]);

  useEffect(() => {
    setVisibleSourceLimit(SWAP_SOURCE_RENDER_BATCH);
  }, [activeSourcePanel, deferredSourceSearch, selectedSlot?.slotIndex]);

  useEffect(() => {
    if (!activeSourceCollection.length) {
      if (inspectedSourceTargetKey) {
        setInspectedSourceTargetKey("");
      }
      return;
    }
    if (activeSourceCollection.some((source) => source.sourceTargetKey === inspectedSourceTargetKey)) {
      return;
    }
    const preferredSource =
      activeSourceCollection.find((source) => source.sourceTargetKey === selectedSlot?.sourceTargetKey)
      ?? activeSourceCollection[0];
    if (preferredSource && preferredSource.sourceTargetKey !== inspectedSourceTargetKey) {
      setInspectedSourceTargetKey(preferredSource.sourceTargetKey);
    }
  }, [activeSourceCollection, inspectedSourceTargetKey, selectedSlot?.sourceTargetKey]);

  const applySourceToSelectedSlot = (sourceTargetKey: string) => {
    if (!selectedSlot) {
      return;
    }
    onUpdateValue(
      {
        path: `slots[${selectedSlot.slotIndex}].sourceTargetKey`,
        valueType: "string",
        defaultValue: selectedSlot.currentTargetKey ?? selectedSlot.sourceTargetKey,
      },
      sourceTargetKey,
    );
  };

  const restoreSelectedSlot = () => {
    if (!selectedSlot) {
      return;
    }
    applySourceToSelectedSlot(selectedSlot.rollbackSourceTargetKey ?? selectedSlot.currentTargetKey ?? "");
  };

  return (
    <div ref={pageMotionRef} className={`task-layout task-layout--swap ${isSidebarCollapsed ? "is-sidebar-collapsed" : ""}`}>
      <aside className="task-sidebar v2-card thin-scrollbar" data-motion-item>
        <div className="task-sidebar-head">
          <p className="atelier-kicker">Swap ability</p>
          <h2 className="task-title">Choose one swap file</h2>
          <p className="task-copy">Open one character file, then swap one slot at a time with the real in-game ability source.</p>
        </div>
        <div className="task-sidebar-body">
          {entries.map((entry) => (
            (() => {
              return (
                <button
                  key={entry.id}
                  className={`task-record ${entry.id === selectedEntry?.id ? "is-active" : ""}`}
                  onClick={() => {
                    onSelectEntry(entry.id);
                    setSidebarExpanded(false);
                  }}
                  type="button"
                >
                  <p title={resolveSwapEntryLabel(entry)}>{resolveSwapEntryLabel(entry)}</p>
                </button>
              );
            })()
          ))}
        </div>
      </aside>

      <section className="task-main">
        <Card className="v2-card border-none shadow-none" data-motion-item>
          <CardHeader className="task-header">
            <div>
              <p className="atelier-kicker">Swap ability</p>
              <h3 className="task-title">{selectedEntry ? `${characterLabel}` : "Choose one swap file"}</h3>
              <p className="task-copy">
                {embedded
                  ? `Work inside ${characterLabel}. Pick one slot, inspect one source, then save.`
                  : `Work inside ${characterLabel}. Pick one slot, inspect one source, then save.`}
              </p>
            </div>
            <div className="task-header-actions">
              {selectedEntry ? (
                <Button variant="flat" onPress={() => setSidebarExpanded(true)}>
                  Browse swap files
                </Button>
              ) : null}
              <Button variant="flat" startContent={<RefreshCw className="h-4 w-4" />} onPress={onReload}>
                Reload
              </Button>
              <Button color="primary" startContent={<Save className="h-4 w-4" />} onPress={onSave}>
                Save
              </Button>
            </div>
          </CardHeader>
          <CardBody className="task-body">
            {selectedState?.loading ? (
              <div className="task-empty">
                <Spinner size="sm" />
                <p>Loading the selected character swap file...</p>
              </div>
            ) : null}
            {selectedState?.error ? <div className="task-error">{selectedState.error}</div> : null}
            {!document && !selectedState?.loading && !selectedState?.error ? (
              <div className="task-empty-card">
                <p>Choose a character on the left to load its swap slots and available replacement sources.</p>
              </div>
            ) : null}
            {document ? (
              <>
                <div
                  className="task-swap-studio"
                  data-testid="rebalance-swap-workspace"
                  style={{
                    alignItems: "stretch",
                    display: "grid",
                    gap: "clamp(1rem, 1.35vw, 1.6rem)",
                    gridTemplateColumns: "minmax(0, 1fr)",
                    width: "100%",
                  }}
                >
                  <SectionCard
                    className="task-swap-slot-rail"
                    title="Ability slots"
                    subtitle={embedded ? "Keep one slot in focus." : "Choose one slot and keep that mapping in focus."}
                  >
                    <div className="task-swap-slot-list" data-testid="rebalance-swap-slot-list">
                      {slots.map((slot, index) => {
                        const isActive = selectedSlot?.slotIndex === slot.slotIndex;
                        return (
                          <button
                            key={slot.slotIndex}
                            type="button"
                            className={`task-choice task-swap-slot ${isActive ? "is-active" : ""}`}
                            data-testid="rebalance-swap-slot-card"
                            onClick={() => setSelectedSlotIndex(index)}
                          >
                            <div className="min-w-0">
                              <p>{slot.slotLabel}</p>
                              <p>{buildSlotSummary(slot)}</p>
                            </div>
                            <div className="task-swap-badges">
                              {slot.sourceTargetKey !== (slot.rollbackSourceTargetKey ?? slot.currentTargetKey ?? slot.sourceTargetKey) ? (
                                <span className="task-swap-badge is-strong">Changed</span>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </SectionCard>

                  <div
                    className="task-swap-stage"
                    style={{
                      gridColumn: "1 / -1",
                      justifySelf: "stretch",
                      margin: 0,
                      maxWidth: "none",
                      width: "100%",
                    }}
                  >
                    {selectedSlot ? (
                      <>
                        <div
                          className="task-swap-summary-grid"
                          style={{
                            display: "grid",
                            gap: "clamp(1rem, 1.5vw, 2rem)",
                            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                            width: "100%",
                          }}
                        >
                          <SectionCard
                            className="task-swap-summary-card relative overflow-hidden bg-gradient-to-b from-[#13192c] to-[#0b0e1a] border border-white/5"
                            title="Original Ability Mapping"
                            subtitle="Standard settings exported by the game"
                          >
                            <div className="flex flex-col gap-4 p-4 rounded-xl bg-white/2 border border-white/5">
                              <div className="flex items-center gap-4">
                                <IconPreview
                                  previewPath={selectedSlot.rollbackIconPreviewPath}
                                  cropX={selectedSlot.rollbackIconCropX}
                                  cropY={selectedSlot.rollbackIconCropY}
                                  cropWidth={selectedSlot.rollbackIconCropWidth}
                                  cropHeight={selectedSlot.rollbackIconCropHeight}
                                  sourceWidth={selectedSlot.rollbackIconSourceWidth}
                                  sourceHeight={selectedSlot.rollbackIconSourceHeight}
                                  size={64}
                                  className="rounded-xl border border-white/10 shadow-lg"
                                />
                                <div className="min-w-0">
                                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Original</span>
                                  <div className="text-base font-bold text-slate-100 truncate">
                                    {buildOriginalSlotSourceLabel(selectedSlot)}
                                  </div>
                                  <p className="text-xs text-[var(--accent-cool)] font-medium truncate">
                                    {selectedSlot.currentCharacterDisplayName ?? "Unknown Character"}
                                  </p>
                                </div>
                              </div>
                              <div className="border-t border-white/5 pt-3 flex flex-col gap-1.5 text-xs text-slate-400">
                                <div className="flex justify-between">
                                  <span>Original Source Key:</span>
                                  <span className="font-mono text-[10px] text-slate-300 truncate max-w-[200px]" title={selectedSlot.rollbackSourceTargetKey}>
                                    {selectedSlot.rollbackSourceTargetKey || "Unassigned"}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Standard Slot:</span>
                                  <span className="text-slate-300">{selectedSlot.slotLabel}</span>
                                </div>
                                {originalIdentityNote ? (
                                  <p className="task-source-note text-xs text-amber-500 mt-2">{originalIdentityNote}</p>
                                ) : null}
                              </div>
                            </div>
                          </SectionCard>

                          <SectionCard
                            className="task-swap-summary-card relative overflow-hidden bg-gradient-to-b from-[#13192c] to-[#0b0e1a] border border-[#5871ff]/15"
                            title="Workspace Active Mapping"
                            subtitle="Swapped ability currently loaded in game"
                          >
                            <div className="flex flex-col gap-4 p-4 rounded-xl bg-white/2 border border-white/5">
                              <div className="flex items-center gap-4">
                                <IconPreview
                                  previewPath={selectedSlot.iconPreviewPath}
                                  cropX={selectedSlot.iconCropX}
                                  cropY={selectedSlot.iconCropY}
                                  cropWidth={selectedSlot.iconCropWidth}
                                  cropHeight={selectedSlot.iconCropHeight}
                                  sourceWidth={selectedSlot.iconSourceWidth}
                                  sourceHeight={selectedSlot.iconSourceHeight}
                                  size={64}
                                  className="rounded-xl border border-[#5871ff]/30 shadow-lg"
                                />
                                <div className="min-w-0">
                                  <span className="text-[10px] uppercase tracking-wider text-[var(--accent-cool)] font-semibold">Active Swap</span>
                                  <div className="text-base font-bold text-slate-100 truncate">
                                    {buildPrimarySlotSourceLabel(selectedSlot)}
                                  </div>
                                  <p className="text-xs text-slate-400 font-medium truncate">
                                    {selectedSlot.sourceCharacterDisplayName ?? selectedSlot.currentCharacterDisplayName ?? "Different Character"}
                                  </p>
                                </div>
                              </div>
                              
                              <div className="task-inline-banner task-inline-banner--compact p-2.5 rounded-lg bg-[#0e162b] border border-[#5871ff]/10 text-xs flex flex-col gap-1">
                                <strong className="text-slate-200">{buildRollbackSummary(selectedSlot)}</strong>
                                <span className="task-inline-banner-copy text-slate-400">
                                  {selectedSlot.sourceTargetKey === (selectedSlot.rollbackSourceTargetKey ?? selectedSlot.currentTargetKey ?? selectedSlot.sourceTargetKey)
                                    ? "This slot is still on its exported source."
                                    : `Currently using ${buildPrimarySlotSourceLabel(selectedSlot)}.`}
                                </span>
                              </div>
                              
                              <div className="border-t border-white/5 pt-3 flex flex-col gap-1.5 text-xs text-slate-400">
                                <div className="flex justify-between">
                                  <span>Active Source Key:</span>
                                  <span className="font-mono text-[10px] text-[var(--accent-cool)] truncate max-w-[200px]" title={selectedSlot.sourceTargetKey}>
                                    {selectedSlot.sourceTargetKey === selectedSlot.rollbackSourceTargetKey ? "Same as original" : (selectedSlot.sourceTargetKey || "Unassigned")}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Status:</span>
                                  <span className={cx("font-semibold", selectedSlot.sourceTargetKey === selectedSlot.rollbackSourceTargetKey ? "text-slate-500" : "text-green-400")}>
                                    {selectedSlot.sourceTargetKey === selectedSlot.rollbackSourceTargetKey ? "Unchanged" : "Modified"}
                                  </span>
                                </div>
                                {currentIdentityNote ? (
                                  <p className="task-source-note text-xs text-amber-500 mt-2">{currentIdentityNote}</p>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex gap-2 mt-4 pt-2">
                              <Button
                                className="flex-1 min-h-[40px]"
                                variant="flat"
                                onPress={restoreSelectedSlot}
                              >
                                Restore original source
                              </Button>
                              <Button
                                className="flex-1 min-h-[40px]"
                                color="primary"
                                onPress={() => setSourceDrawerOpen(true)}
                              >
                                Browse sources
                              </Button>
                            </div>
                          </SectionCard>
                        </div>

                        {sourceDrawerAnim.shouldRender && drawerPortalTarget ? createPortal((
                          <div
                            ref={sourceDrawerMotionRef}
                            className="task-swap-source-drawer"
                            role="dialog"
                            aria-modal="true"
                            aria-label="Source browser"
                          >
                            <button
                              type="button"
                              data-motion-backdrop
                              className="task-swap-source-drawer-backdrop"
                              aria-label="Close source browser"
                              onClick={() => setSourceDrawerOpen(false)}
                            />
                            <SectionCard
                              data-motion-dialog
                              className="task-swap-source-browser"
                              title="Source browser"
                              subtitle={embedded ? "Inspect one source family, then apply." : "Inspect one source, compare it, then apply when ready."}
                            >
                              <div className="task-swap-source-drawer-actions">
                                <Button variant="flat" size="sm" onPress={() => setSourceDrawerOpen(false)}>
                                  Close browser
                                </Button>
                              </div>
                          {recommendedSources.length || secondarySources.length ? (
                            <div className="task-section-picker task-section-picker--inline">
                              <p className="task-section-picker-label">Source family</p>
                              <div className="task-segmented" role="tablist" aria-label="Ability source panels">
                                {recommendedSources.length ? (
                                  <button
                                    type="button"
                                    className={activeSourcePanel === "recommended" ? "is-active" : ""}
                                    aria-pressed={activeSourcePanel === "recommended"}
                                    onClick={() => setActiveSourcePanel("recommended")}
                                  >
                                    Recommended
                                  </button>
                                ) : null}
                                {secondarySources.length ? (
                                  <button
                                    type="button"
                                    className={activeSourcePanel === "other" ? "is-active" : ""}
                                    aria-pressed={activeSourcePanel === "other"}
                                    onClick={() => setActiveSourcePanel("other")}
                                  >
                                    Other sources
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ) : null}

                          <div className="task-swap-source-browser-shell">
                            <div className="task-swap-source-results">
                              <div className="task-swap-source-browser-head">
                                <div>
                                  <p className="task-section-eyebrow">
                                    {activeSourcePanel === "recommended" ? "Start here" : "Search wider"}
                                  </p>
                                  <h4 className="task-section-title">
                                    {activeSourcePanel === "recommended" ? "Recommended sources" : "Other sources"}
                                  </h4>
                                  <p className="task-section-subtitle">
                                    {activeSourcePanel === "recommended"
                                      ? "These stay closest to the current character and slot."
                                      : "Search outside the recommended pool only when you need a more experimental swap."}
                                  </p>
                                </div>
                                <span className="task-swap-source-count">
                                  {renderedSourceCollection.length === activeSourceCollection.length
                                    ? `${activeSourceCollection.length} shown`
                                    : `${renderedSourceCollection.length} of ${activeSourceCollection.length} shown`}
                                </span>
                              </div>
                              <Input
                                aria-label="Search ability sources"
                                placeholder="Find a source by character, slot, or name..."
                                startContent={<Search className="h-4 w-4 text-slate-500" />}
                                value={sourceSearch}
                                onValueChange={setSourceSearch}
                              />
                              {activeSourceCollection.length ? (
                                <div
                                  className="task-swap-source-list task-swap-source-list--studio"
                                  data-testid={activeSourcePanel === "recommended" ? "rebalance-swap-source-list" : "rebalance-swap-secondary-source-list"}
                                >
                                  {renderedSourceCollection.map((source) => (
                                    <SwapSourceCard
                                      key={source.sourceTargetKey}
                                      source={source}
                                      selectedSlot={selectedSlot}
                                      onUpdateValue={onUpdateValue}
                                      isInspecting={source.sourceTargetKey === inspectedSource?.sourceTargetKey}
                                      onInspect={setInspectedSourceTargetKey}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <div className="task-empty-card" data-testid="rebalance-swap-empty">
                                  <p>
                                    {sources.length
                                      ? "No sources match that search yet."
                                      : "This slot does not expose any alternate sources yet."}
                                  </p>
                                </div>
                              )}
                              {canLoadMoreSources ? (
                                <div className="task-swap-source-footer">
                                  <Button
                                    variant="flat"
                                    onPress={() => setVisibleSourceLimit((current) => current + SWAP_SOURCE_RENDER_BATCH)}
                                  >
                                    Show {Math.min(SWAP_SOURCE_RENDER_BATCH, activeSourceCollection.length - renderedSourceCollection.length)} more
                                  </Button>
                                </div>
                              ) : null}
                            </div>

                            <aside className="task-swap-source-detail">
                              {inspectedSource ? (
                                <div className="task-swap-source-detail-card">
                                  <p className="task-section-eyebrow">Inspected source</p>
                                  <h4>{buildSourceTitle(inspectedSource)}</h4>
                                  <p className="task-swap-source-detail-copy">{buildSourceOrigin(inspectedSource)}</p>
                                  {buildSourceIdentityNote(inspectedSource) ? (
                                    <p className="task-source-note">{buildSourceIdentityNote(inspectedSource)}</p>
                                  ) : null}
                                  <div className="task-swap-summary-metrics">
                                    <div>
                                      <span>Label</span>
                                      <strong>{buildSourceTitle(inspectedSource)}</strong>
                                    </div>
                                    <div>
                                      <span>Command</span>
                                      <strong>{inspectedSource.commandLabel ?? "No unique ability name yet"}</strong>
                                    </div>
                                    <div>
                                      <span>Target key</span>
                                      <strong>{inspectedSource.sourceTargetKey}</strong>
                                    </div>
                                  </div>
                                  <div className="task-inline-banner task-inline-banner--compact">
                                    <strong>{buildSourceRankLabel(inspectedSource)}</strong>
                                    <span className="task-inline-banner-copy">{buildSourceHint(inspectedSource)}</span>
                                  </div>
                                  <div className="task-swap-summary-actions">
                                    <Button
                                      color={inspectedSource.sourceTargetKey === selectedSlot.sourceTargetKey ? "primary" : "secondary"}
                                      variant={inspectedSource.sourceTargetKey === selectedSlot.sourceTargetKey ? undefined : "flat"}
                                      onPress={() => applySourceToSelectedSlot(inspectedSource.sourceTargetKey)}
                                    >
                                      {inspectedSource.sourceTargetKey === selectedSlot.sourceTargetKey ? "Selected now" : "Choose this source"}
                                    </Button>
                                    <Button variant="flat" onPress={restoreSelectedSlot}>
                                      Restore original
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="task-empty-card">
                                  <p>Select a source to inspect its name, origin, and mapping path here.</p>
                                </div>
                              )}
                            </aside>
                          </div>
                            </SectionCard>
                          </div>
                        ), drawerPortalTarget) : null}
                      </>
                    ) : (
                      <div className="task-empty-card" data-testid="rebalance-swap-empty">
                        <p>This character export does not expose any swappable slots yet.</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </CardBody>
        </Card>
      </section>
    </div>
  );
}

const SwapSourceCard = memo(function SwapSourceCard({
  source,
  selectedSlot,
  onUpdateValue,
  isInspecting,
  onInspect,
}: {
  source: AbilitySwapSource;
  selectedSlot: AbilitySwapSlot;
  onUpdateValue: (item: { path: string; valueType?: string; defaultValue?: JsonValue }, value: string | boolean) => void;
  isInspecting: boolean;
  onInspect: (sourceTargetKey: string) => void;
}) {
  const isActive = source.sourceTargetKey === selectedSlot.sourceTargetKey;
  const origin = buildSourceOrigin(source);
  const hint = buildSourceHint(source);
  const handleInspect = useCallback(() => onInspect(source.sourceTargetKey), [onInspect, source.sourceTargetKey]);
  const handleChoose = useCallback(
    () =>
      onUpdateValue(
        {
          path: `slots[${selectedSlot.slotIndex}].sourceTargetKey`,
          valueType: "string",
          defaultValue: selectedSlot.currentTargetKey ?? selectedSlot.sourceTargetKey,
        },
        source.sourceTargetKey,
      ),
    [onUpdateValue, selectedSlot.slotIndex, selectedSlot.currentTargetKey, selectedSlot.sourceTargetKey, source.sourceTargetKey],
  );

  return (
    <article
      key={source.sourceTargetKey}
      className={cx(
        "task-swap-source-card flex flex-col gap-3 p-4 rounded-xl border transition-all duration-200",
        isActive ? "border-[var(--accent-cool)] bg-[#131a31]" : "border-white/5 bg-[#090d16]/70 hover:border-white/15",
        isInspecting && "ring-2 ring-[var(--accent-cool)]/50"
      )}
      data-motion-result
      data-testid="rebalance-swap-source-card"
    >
      <div className="flex gap-3">
        <IconPreview
          previewPath={source.iconPreviewPath}
          cropX={source.iconCropX}
          cropY={source.iconCropY}
          cropWidth={source.iconCropWidth}
          cropHeight={source.iconCropHeight}
          sourceWidth={source.iconSourceWidth}
          sourceHeight={source.iconSourceHeight}
          size={48}
          className="rounded-lg border border-white/10 shrink-0"
        />
        <div className="min-w-0 flex-1 flex flex-col justify-center">
          <p className="font-semibold text-sm text-slate-100 truncate" title={buildSourceTitle(source)}>
            {buildSourceTitle(source)}
          </p>
          <p className="text-xs text-slate-400 truncate">{origin}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {source.recommended && (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            Recommended
          </span>
        )}
        <span className={cx(
          "px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase border",
          source.sameCharacter
            ? "bg-green-500/10 text-green-400 border-green-500/20"
            : "bg-slate-500/10 text-slate-400 border-slate-500/20"
        )}>
          {source.sameCharacter ? "Same Character" : "Cross-Character"}
        </span>
        <span className={cx(
          "px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase border",
          source.sameSlot
            ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
            : "bg-slate-500/10 text-slate-400 border-slate-500/20"
        )}>
          {source.sameSlot ? "Same Slot" : "Cross-Slot"}
        </span>
      </div>

      <div className="flex items-center gap-2 mt-1">
        <Button
          className="flex-1 min-h-[34px]"
          variant={isInspecting ? undefined : "flat"}
          color={isInspecting ? "primary" : "secondary"}
          onPress={handleInspect}
        >
          {isInspecting ? "Inspecting" : "Inspect"}
        </Button>
        <Button
          className="flex-1 min-h-[34px]"
          variant={isActive ? undefined : "flat"}
          color={isActive ? "primary" : "secondary"}
          onPress={handleChoose}
        >
          {isActive ? "Selected" : "Choose"}
        </Button>
      </div>
    </article>
  );
});

function deriveSwapSlots(
  document: RuntimeDocument | undefined,
  sourceMetadata: Map<string, SwapCatalogMetadata>,
): AbilitySwapSlot[] {
  const mergedSlotRecords = collectMergedSwapSlotRecords(document);
  const normalized = Array.from(mergedSlotRecords.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, slotRecord]) => normalizeSlot(slotRecord, sourceMetadata))
    .filter((item): item is AbilitySwapSlot => item !== null)
    .sort((left, right) => left.slotIndex - right.slotIndex);
  if (normalized.length > 0) {
    return normalized;
  }
  return [];
}

function deriveSwapSources(
  document: RuntimeDocument | undefined,
  selectedSlot: AbilitySwapSlot | null,
  sourceEntries: CatalogEntry[],
  sourceMetadata: Map<string, SwapCatalogMetadata>,
): AbilitySwapSource[] {
  const deduped = new Map<string, AbilitySwapSource>();

  const raw = Array.isArray(document?.["availableSources"]) ? (document?.["availableSources"] as unknown[]) : [];
  for (const source of raw
    .map((item) => normalizeSource(item, selectedSlot, sourceMetadata))
    .filter((item): item is AbilitySwapSource => item !== null)) {
    deduped.set(source.sourceTargetKey, source);
  }

  for (const source of deriveSwapSourcesFromAdvanced(document, selectedSlot, sourceMetadata)) {
    if (!deduped.has(source.sourceTargetKey)) {
      deduped.set(source.sourceTargetKey, source);
    }
  }

  for (const entry of sourceEntries) {
    const candidate = normalizeCatalogSource(entry, selectedSlot, sourceMetadata);
    if (candidate && !deduped.has(candidate.sourceTargetKey)) {
      deduped.set(candidate.sourceTargetKey, candidate);
    }
  }

  return Array.from(deduped.values()).sort((left, right) => compareSwapSources(left, right));
}

function deriveSwapSlotsFromAdvanced(
  document: RuntimeDocument | undefined,
  sourceMetadata: Map<string, SwapCatalogMetadata>,
): AbilitySwapSlot[] {
  const slots = collectAdvancedSwapSlotRecords(document);

  return Array.from(slots.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, slotRecord]) => normalizeSlot(slotRecord, sourceMetadata))
    .filter((item): item is AbilitySwapSlot => item !== null);
}

function collectMergedSwapSlotRecords(document: RuntimeDocument | undefined) {
  const slots = new Map<number, Record<string, unknown>>();
  const advancedSlots = collectAdvancedSwapSlotRecords(document);

  for (const [slotIndex, slotRecord] of advancedSlots.entries()) {
    slots.set(slotIndex, { ...slotRecord });
  }

  const raw = Array.isArray(document?.["slots"]) ? (document?.["slots"] as unknown[]) : [];
  raw.forEach((item, fallbackIndex) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const slotRecord = item as Record<string, unknown>;
    const slotIndex = readRecordNumber(slotRecord, "slotIndex") ?? fallbackIndex;
    const existing = slots.get(slotIndex) ?? { slotIndex };
    slots.set(slotIndex, { ...existing, ...slotRecord, slotIndex });
  });

  return slots;
}

function collectAdvancedSwapSlotRecords(document: RuntimeDocument | undefined) {
  const collected = collectAdvancedSwapValues(document);
  const slots = new Map<number, Record<string, unknown>>();

  for (const [path, value] of Object.entries(collected)) {
    const match = /^slots\[(\d+)\]\.([^.]+)$/.exec(path);
    if (!match) {
      continue;
    }
    const slotIndex = Number(match[1]);
    if (!Number.isFinite(slotIndex)) {
      continue;
    }
    const slotRecord = slots.get(slotIndex) ?? {};
    slotRecord[match[2]] = value;
    slots.set(slotIndex, slotRecord);
  }

  return new Map(
    Array.from(slots.entries()).map(([slotIndex, slotRecord]) => [slotIndex, { slotIndex, ...slotRecord }]),
  );
}

function deriveSwapSourcesFromAdvanced(
  document: RuntimeDocument | undefined,
  selectedSlot: AbilitySwapSlot | null,
  sourceMetadata: Map<string, SwapCatalogMetadata>,
): AbilitySwapSource[] {
  const collected = collectAdvancedSwapValues(document);
  const sources = new Map<number, Record<string, unknown>>();

  for (const [path, value] of Object.entries(collected)) {
    const match = /^availableSources\[(\d+)\]\.([^.]+)$/.exec(path);
    if (!match) {
      continue;
    }
    const sourceIndex = Number(match[1]);
    if (!Number.isFinite(sourceIndex)) {
      continue;
    }
    const sourceRecord = sources.get(sourceIndex) ?? {};
    sourceRecord[match[2]] = value;
    sources.set(sourceIndex, sourceRecord);
  }

  return Array.from(sources.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, sourceRecord]) => normalizeSource(sourceRecord, selectedSlot, sourceMetadata))
    .filter((item): item is AbilitySwapSource => item !== null)
    .sort((left, right) => compareSwapSources(left, right));
}

function collectAdvancedSwapValues(document: RuntimeDocument | undefined): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const field of document?.advanced?.fields ?? []) {
    if (!field.path) {
      continue;
    }
    const candidate =
      field.effectiveValue ??
      field.currentValue ??
      field.defaultValue ??
      document?.advanced?.effectiveValues?.[field.path];
    if (candidate !== undefined) {
      values[field.path] = candidate;
    }
  }

  for (const [path, value] of Object.entries(document?.advanced?.effectiveValues ?? {})) {
    if (value !== undefined && values[path] === undefined) {
      values[path] = value;
    }
  }

  return values;
}

function normalizeSlot(
  value: unknown,
  sourceMetadata: Map<string, SwapCatalogMetadata>,
): AbilitySwapSlot | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const slot = value as Record<string, unknown>;
  const currentTargetKey = readRecordString(slot, "currentTargetKey");
  const rollbackSourceTargetKey = readRecordString(slot, "rollbackSourceTargetKey");
  const rawSourceTargetKey = readRecordString(slot, "sourceTargetKey") ?? "";
  const effectiveCurrentTargetKey = currentTargetKey ?? rollbackSourceTargetKey ?? rawSourceTargetKey;
  const sourceTargetKey = rawSourceTargetKey || effectiveCurrentTargetKey || "";
  const currentMetadata = effectiveCurrentTargetKey ? sourceMetadata.get(effectiveCurrentTargetKey) : undefined;
  const selectedSourceMetadata = sourceTargetKey ? sourceMetadata.get(sourceTargetKey) : undefined;
  const metadata = currentMetadata ?? selectedSourceMetadata;
  const currentCharacterKey =
    readRecordString(slot, "currentCharacterKey")
    ?? currentMetadata?.characterKey
    ?? metadata?.characterKey
    ?? readCharacterKeyFromTarget(effectiveCurrentTargetKey);
  const currentCharacterDisplayName =
    pickReadableSwapText(readRecordString(slot, "currentCharacterDisplayName"), currentMetadata?.characterDisplayName, metadata?.characterDisplayName)
    ?? prettifyCharacterLabel(currentCharacterKey);
  const slotIndex = readRecordNumber(slot, "slotIndex") ?? metadata?.slotIndex ?? 0;
  const sourceCharacterKey =
    readRecordString(slot, "sourceCharacterKey")
    ?? selectedSourceMetadata?.characterKey
    ?? readCharacterKeyFromTarget(sourceTargetKey)
    ?? currentCharacterKey;
  const sourceCharacterDisplayName =
    pickReadableSwapText(readRecordString(slot, "sourceCharacterDisplayName"), selectedSourceMetadata?.characterDisplayName)
    ?? prettifyCharacterLabel(sourceCharacterKey);
  const sourceSlotIndex =
    readRecordNumber(slot, "sourceSlotIndex")
    ?? selectedSourceMetadata?.slotIndex
    ?? readSlotIndexFromTarget(sourceTargetKey)
    ?? slotIndex;
  const currentCommandLabel = pickSwapCommandLabel(
    currentCharacterDisplayName,
    readSlotIndexFromTarget(effectiveCurrentTargetKey) ?? slotIndex,
    readRecordString(slot, "currentCommandLabel"),
    readRecordString(slot, "sourceCommandLabel"),
    currentMetadata?.commandLabel,
    metadata?.commandLabel,
    readRecordString(slot, "currentDisplayName"),
    currentMetadata?.displayName,
    metadata?.displayName,
  );
  const slotLabel = pickReadableSlotLabel(readRecordString(slot, "slotLabel"), currentMetadata?.slotLabel, metadata?.slotLabel, slotIndex);
  const currentDisplayName = pickReadableSwapText(
    readRecordString(slot, "currentDisplayName"),
    currentMetadata?.displayName,
    metadata?.displayName,
  );
  const sourceDisplayName = pickReadableSwapText(
    readRecordString(slot, "sourceDisplayName"),
    selectedSourceMetadata?.displayName,
    metadata?.displayName,
  );
  const rollbackDisplayName = pickReadableSwapText(
    readRecordString(slot, "rollbackDisplayName"),
    currentDisplayName,
    currentMetadata?.displayName,
    metadata?.displayName,
  );
  return {
    slotIndex,
    slotLabel,
    sourceTargetKey,
    currentTargetKey: effectiveCurrentTargetKey ?? undefined,
    currentDisplayName:
      currentDisplayName ??
      buildAbilityDisplayName(currentCharacterDisplayName, readSlotIndexFromTarget(effectiveCurrentTargetKey)),
    currentCommandLabel,
    currentCharacterKey: currentCharacterKey ?? undefined,
    currentCharacterDisplayName: currentCharacterDisplayName ?? undefined,
    sourceCharacterKey: sourceCharacterKey ?? undefined,
    sourceCharacterDisplayName: sourceCharacterDisplayName ?? undefined,
    sourceSlotIndex: sourceSlotIndex ?? undefined,
    sourceSlotLabel: pickReadableSlotLabel(readRecordString(slot, "sourceSlotLabel"), selectedSourceMetadata?.slotLabel, sourceSlotIndex),
    sourceDisplayName:
      sourceDisplayName ??
      buildAbilityDisplayName(sourceCharacterDisplayName, sourceSlotIndex),
    sourceCommandLabel: pickSwapCommandLabel(
      sourceCharacterDisplayName,
      sourceSlotIndex,
      readRecordString(slot, "sourceCommandLabel"),
      selectedSourceMetadata?.commandLabel,
      currentCommandLabel,
      metadata?.commandLabel,
      sourceDisplayName,
    ),
    compatibility: readRecordString(slot, "compatibility") ?? undefined,
    previewLabel: pickReadableSwapText(readRecordString(slot, "previewLabel"), selectedSourceMetadata?.previewLabel, metadata?.previewLabel) ?? undefined,
    rollbackSourceTargetKey: rollbackSourceTargetKey ?? effectiveCurrentTargetKey ?? undefined,
    rollbackDisplayName:
      rollbackDisplayName ??
      buildAbilityDisplayName(currentCharacterDisplayName, readSlotIndexFromTarget(effectiveCurrentTargetKey)),
    statusMessage: readRecordString(slot, "statusMessage") ?? undefined,

    iconPreviewPath: selectedSourceMetadata?.iconPreviewPath ?? metadata?.iconPreviewPath ?? null,
    iconCropX: selectedSourceMetadata?.iconCropX ?? metadata?.iconCropX ?? null,
    iconCropY: selectedSourceMetadata?.iconCropY ?? metadata?.iconCropY ?? null,
    iconCropWidth: selectedSourceMetadata?.iconCropWidth ?? metadata?.iconCropWidth ?? null,
    iconCropHeight: selectedSourceMetadata?.iconCropHeight ?? metadata?.iconCropHeight ?? null,
    iconSourceWidth: selectedSourceMetadata?.iconSourceWidth ?? metadata?.iconSourceWidth ?? null,
    iconSourceHeight: selectedSourceMetadata?.iconSourceHeight ?? metadata?.iconSourceHeight ?? null,

    rollbackIconPreviewPath: currentMetadata?.iconPreviewPath ?? metadata?.iconPreviewPath ?? null,
    rollbackIconCropX: currentMetadata?.iconCropX ?? metadata?.iconCropX ?? null,
    rollbackIconCropY: currentMetadata?.iconCropY ?? metadata?.iconCropY ?? null,
    rollbackIconCropWidth: currentMetadata?.iconCropWidth ?? metadata?.iconCropWidth ?? null,
    rollbackIconCropHeight: currentMetadata?.iconCropHeight ?? metadata?.iconCropHeight ?? null,
    rollbackIconSourceWidth: currentMetadata?.iconSourceWidth ?? metadata?.iconSourceWidth ?? null,
    rollbackIconSourceHeight: currentMetadata?.iconSourceHeight ?? metadata?.iconSourceHeight ?? null,
  };
}

function normalizeSource(
  value: unknown,
  selectedSlot: AbilitySwapSlot | null,
  sourceMetadata: Map<string, SwapCatalogMetadata>,
): AbilitySwapSource | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Record<string, unknown>;
  const sourceTargetKey = readRecordString(source, "sourceTargetKey") ?? readRecordString(source, "targetKey") ?? "";
  if (!sourceTargetKey) {
    return null;
  }
  const metadata = sourceMetadata.get(sourceTargetKey);
  const characterKey =
    readRecordString(source, "characterKey")
    ?? metadata?.characterKey
    ?? readCharacterKeyFromTarget(sourceTargetKey);
  const characterDisplayName =
    pickReadableSwapText(readRecordString(source, "characterDisplayName"), metadata?.characterDisplayName)
    ?? prettifyCharacterLabel(characterKey);
  const slotIndex = readRecordNumber(source, "slotIndex") ?? metadata?.slotIndex ?? readSlotIndexFromTarget(sourceTargetKey);
  const slotLabel = pickReadableSlotLabel(readRecordString(source, "slotLabel"), metadata?.slotLabel, slotIndex);
  const sameCharacter = Boolean(
    readRecordBoolean(source, "sameCharacter") ??
      (selectedSlot?.currentCharacterKey && characterKey ? selectedSlot.currentCharacterKey === characterKey : false),
  );
  const sameSlot = Boolean(
    readRecordBoolean(source, "sameSlot") ??
      (selectedSlot && slotIndex !== null ? selectedSlot.slotIndex === slotIndex : false),
  );
  const recommended = Boolean(readRecordBoolean(source, "recommended") ?? (sameCharacter && sameSlot));
  const commandLabel = pickSwapCommandLabel(
    characterDisplayName,
    slotIndex,
    readRecordString(source, "commandLabel"),
    readRecordString(source, "label"),
    metadata?.commandLabel,
    readRecordString(source, "displayName"),
    metadata?.displayName,
  );
  return {
    sourceTargetKey,
    displayName:
      pickReadableSwapText(readRecordString(source, "displayName"), metadata?.displayName) ??
      buildAbilityDisplayName(characterDisplayName, slotIndex),
    commandLabel,
    runtimeType: readRecordString(source, "runtimeType") ?? metadata?.runtimeType ?? undefined,
    characterKey: characterKey ?? undefined,
    characterDisplayName: characterDisplayName ?? undefined,
    slotIndex: slotIndex ?? undefined,
    slotLabel: slotLabel ?? undefined,
    previewLabel: pickReadableSwapText(readRecordString(source, "previewLabel"), metadata?.previewLabel) ?? undefined,
    compatibility: readRecordString(source, "compatibility") ?? undefined,
    sameCharacter,
    sameSlot,
    recommended,

    iconPreviewPath: metadata?.iconPreviewPath ?? null,
    iconCropX: metadata?.iconCropX ?? null,
    iconCropY: metadata?.iconCropY ?? null,
    iconCropWidth: metadata?.iconCropWidth ?? null,
    iconCropHeight: metadata?.iconCropHeight ?? null,
    iconSourceWidth: metadata?.iconSourceWidth ?? null,
    iconSourceHeight: metadata?.iconSourceHeight ?? null,
  };
}

function normalizeCatalogSource(
  entry: CatalogEntry,
  selectedSlot: AbilitySwapSlot | null,
  sourceMetadata: Map<string, SwapCatalogMetadata>,
): AbilitySwapSource | null {
  const sourceTargetKey = entry.targetKey?.trim();
  if (!sourceTargetKey) {
    return null;
  }

  const metadata = sourceMetadata.get(sourceTargetKey) ?? buildSwapCatalogMetadata(entry);
  const characterKey = metadata?.characterKey ?? readCharacterKeyFromTarget(sourceTargetKey);
  const characterDisplayName = metadata?.characterDisplayName ?? prettifyCharacterLabel(characterKey);
  const slotIndex = metadata?.slotIndex ?? readSlotIndexFromTarget(sourceTargetKey);
  const sameCharacter = Boolean(
    selectedSlot?.currentCharacterKey && characterKey ? selectedSlot.currentCharacterKey === characterKey : false,
  );
  const sameSlot = Boolean(selectedSlot && slotIndex !== null ? selectedSlot.slotIndex === slotIndex : false);

  return {
    sourceTargetKey,
    displayName: metadata?.displayName ?? resolveFriendlyName(entry.displayName, entry.title, buildAbilityDisplayName(characterDisplayName, slotIndex)),
    commandLabel: metadata?.commandLabel,
    runtimeType: metadata?.runtimeType ?? entry.targetType ?? undefined,
    characterKey: characterKey ?? undefined,
    characterDisplayName,
    slotIndex: slotIndex ?? undefined,
    slotLabel: metadata?.slotLabel ?? (slotIndex !== null ? resolveAbilitySlotFallbackLabel(slotIndex) : undefined),
    previewLabel: metadata?.previewLabel ?? entry.subtitle ?? entry.relativePath,
    compatibility: sameCharacter ? "Current character" : "Different character",
    sameCharacter,
    sameSlot,
    recommended: sameCharacter && sameSlot,

    iconPreviewPath: metadata?.iconPreviewPath ?? entry.iconPreviewPath ?? null,
    iconCropX: metadata?.iconCropX ?? entry.iconCropX ?? null,
    iconCropY: metadata?.iconCropY ?? entry.iconCropY ?? null,
    iconCropWidth: metadata?.iconCropWidth ?? entry.iconCropWidth ?? null,
    iconCropHeight: metadata?.iconCropHeight ?? entry.iconCropHeight ?? null,
    iconSourceWidth: metadata?.iconSourceWidth ?? entry.iconSourceWidth ?? null,
    iconSourceHeight: metadata?.iconSourceHeight ?? entry.iconSourceHeight ?? null,
  };
}

function compareSwapSources(left: AbilitySwapSource, right: AbilitySwapSource) {
  const leftScore = (left.recommended ? 100 : 0) + (left.sameCharacter ? 20 : 0) + (left.sameSlot ? 10 : 0);
  const rightScore = (right.recommended ? 100 : 0) + (right.sameCharacter ? 20 : 0) + (right.sameSlot ? 10 : 0);
  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }
  return left.displayName.localeCompare(right.displayName);
}

function readStringValue(document: RuntimeDocument | undefined, key: string): string | undefined {
  const value = document?.[key];
  return typeof value === "string" ? value : undefined;
}

function readRecordString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function readRecordNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRecordBoolean(record: Record<string, unknown>, key: string): boolean | null {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function buildSwapCatalogMetadataMap(entries: CatalogEntry[]): Map<string, SwapCatalogMetadata> {
  const metadataByTargetKey = new Map<string, SwapCatalogMetadata>();
  for (const entry of entries) {
    const metadata = buildSwapCatalogMetadata(entry);
    if (!metadata) {
      continue;
    }
    const existing = metadataByTargetKey.get(metadata.sourceTargetKey);
    if (!existing || scoreSwapCatalogMetadata(metadata) > scoreSwapCatalogMetadata(existing)) {
      metadataByTargetKey.set(metadata.sourceTargetKey, metadata);
    }
  }
  return metadataByTargetKey;
}

function buildSwapCatalogMetadata(entry: CatalogEntry): SwapCatalogMetadata | null {
  const sourceTargetKey = entry.targetKey?.trim();
  if (!sourceTargetKey) {
    return null;
  }

  const characterKey = readCharacterKeyFromTarget(sourceTargetKey);
  const characterDisplayName = prettifyCharacterLabel(characterKey);
  const slotIndex = readSlotIndexFromTarget(sourceTargetKey);
  const displayName =
    pickReadableSwapText(humanizeSwapTitle(entry.title), humanizeSwapTitle(entry.displayName), entry.displayName, entry.title)
    ?? buildAbilityDisplayName(characterDisplayName, slotIndex);
  const slotLabel = slotIndex !== null ? resolveAbilitySlotFallbackLabel(slotIndex) : undefined;

  return {
    sourceTargetKey,
    displayName,
    commandLabel: pickSwapCommandLabel(characterDisplayName, slotIndex, entry.displayName, entry.title, displayName),
    runtimeType: entry.targetType ?? undefined,
    characterKey: characterKey ?? undefined,
    characterDisplayName,
    slotIndex: slotIndex ?? undefined,
    slotLabel,
    previewLabel: pickReadableSwapText(entry.subtitle, entry.relativePath) ?? undefined,
  };
}

function scoreSwapCatalogMetadata(metadata: SwapCatalogMetadata) {
  let score = 0;
  if (metadata.commandLabel && !isGenericSwapAbilityLabel(metadata.commandLabel)) {
    score += 6;
  }
  if (metadata.displayName && !looksTechnicalSwapText(metadata.displayName)) {
    score += 4;
  }
  if (metadata.previewLabel) {
    score += 1;
  }
  return score;
}

function pickReadableSwapText(...values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    const cleaned = sanitizeSwapCopy(value);
    if (cleaned) {
      return cleaned;
    }
  }
  return undefined;
}

function pickReadableSlotLabel(...values: Array<string | number | null | undefined>): string {
  const slotIndex = values.find((value): value is number => typeof value === "number" && Number.isFinite(value));
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const cleaned = sanitizeSwapAbilityLabel(value, { allowGenericSlotLabel: true });
    if (!cleaned) {
      continue;
    }
    if (/^(slot|ability slot)\s+\d+$/i.test(cleaned)) {
      const parsed = cleaned.match(/(\d+)/);
      const normalizedIndex = parsed ? Number(parsed[1]) - 1 : slotIndex ?? 0;
      return resolveAbilitySlotFallbackLabel(normalizedIndex);
    }
    return cleaned;
  }
  return resolveAbilitySlotFallbackLabel(slotIndex ?? 0);
}

function pickSwapAbilityLabel(...values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    const cleaned = sanitizeSwapCopy(value);
    if (!cleaned) {
      continue;
    }
    const compact = sanitizeSwapAbilityLabel(compactDisplayAgainstCharacter(cleaned));
    if (compact) {
      return compact;
    }
    const direct = sanitizeSwapAbilityLabel(cleaned);
    if (direct) {
      return direct;
    }
  }
  return undefined;
}

function pickSwapCommandLabel(
  characterDisplayName: string | null | undefined,
  slotIndex: number | null | undefined,
  ...values: Array<string | null | undefined>
): string | undefined {
  for (const value of values) {
    const cleaned = sanitizeSwapCopy(value);
    if (!cleaned) {
      continue;
    }

    for (const candidate of [
      humanizeSwapTitle(cleaned),
      compactDisplayAgainstCharacter(cleaned, characterDisplayName),
      cleaned,
    ]) {
      const label = sanitizeSwapAbilityLabel(candidate);
      if (!label || isGenericSwapAbilityLabel(label)) {
        continue;
      }
      if (looksLikeSwapContextLabel(label, characterDisplayName, slotIndex)) {
        continue;
      }
      return label;
    }
  }
  return undefined;
}

function readCharacterKeyFromTarget(targetKey?: string | null): string | null {
  if (!targetKey) {
    return null;
  }
  const match = targetKey.match(/^([^/]+)\//);
  return match?.[1] ?? null;
}

function readSlotIndexFromTarget(targetKey?: string | null): number | null {
  if (!targetKey) {
    return null;
  }
  const match = targetKey.match(/Ability\[(\d+)\]/i);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function prettifyCharacterLabel(characterKey?: string | null): string {
  if (!characterKey) {
    return "Unknown character";
  }
  const raw = characterKey.split("#")[0] ?? characterKey;
  return resolveFriendlyName(raw.replace(/[_-]+/g, " "));
}

function deriveSwapDocumentCharacterLabel(
  document: RuntimeDocument | undefined,
  slots: AbilitySwapSlot[],
): string | undefined {
  const slotWithCharacter = slots.find(
    (slot) => slot.currentCharacterDisplayName || slot.currentCharacterKey || slot.currentTargetKey || slot.sourceTargetKey,
  );
  const candidates = [
    readStringValue(document, "currentCharacterDisplayName"),
    slotWithCharacter?.currentCharacterDisplayName,
    slotWithCharacter?.currentCharacterKey ? prettifyCharacterLabel(slotWithCharacter.currentCharacterKey) : undefined,
    slotWithCharacter?.currentTargetKey ? prettifyCharacterLabel(readCharacterKeyFromTarget(slotWithCharacter.currentTargetKey)) : undefined,
    slotWithCharacter?.sourceTargetKey ? prettifyCharacterLabel(readCharacterKeyFromTarget(slotWithCharacter.sourceTargetKey)) : undefined,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value) => !/^unknown character$/i.test(value));

  if (!candidates.length) {
    return undefined;
  }

  return resolveFriendlyName(...candidates);
}

function resolveSwapEntryLabel(entry?: CatalogEntry | null): string {
  if (!entry) {
    return "Character file";
  }
  const titledCharacter = humanizeSwapTitle(entry.title);
  if (titledCharacter) {
    return titledCharacter;
  }
  const displayCharacter = humanizeSwapTitle(entry.displayName);
  if (displayCharacter) {
    return displayCharacter;
  }
  const fromTarget = readCharacterKeyFromTarget(entry.targetKey ?? undefined);
  if (fromTarget) {
    return prettifyCharacterLabel(fromTarget);
  }

  const fromPath = entry.relativePath?.match(/characters[\\/]+([^\\/]+)[\\/]+abilityswap\.json/i)?.[1];
  if (fromPath) {
    return prettifyCharacterFolder(fromPath);
  }

  const fromSubtitle = entry.subtitle?.match(/^([^/\\]+)[/\\]+AbilitySwap\.json$/i)?.[1];
  if (fromSubtitle) {
    return prettifyCharacterFolder(fromSubtitle);
  }
  return "Character file";
}

function prettifyCharacterFolder(segment: string): string {
  return resolveFriendlyName(segment.replace(/^\d+[_-]?/, "").replace(/[_-]+/g, " "));
}

function buildAbilityDisplayName(characterDisplayName?: string | null, slotIndex?: number | null) {
  const characterLabel = resolveFriendlyName(characterDisplayName, "Character");
  if (slotIndex === null || slotIndex === undefined) {
    return `${characterLabel} / Ability`;
  }
  return `${characterLabel} / ${resolveAbilitySlotFallbackLabel(slotIndex)}`;
}

function buildSlotSummary(slot: AbilitySwapSlot) {
  const sourceLabel = buildPrimarySlotSourceLabel(slot);
  if (sourceLabel && !stringEqualsNormalized(sourceLabel, slot.slotLabel)) {
    return `Using ${sourceLabel}`;
  }
  return "Using current source";
}

function buildSelectedSlotSummary(slot: AbilitySwapSlot) {
  const currentLabel = buildPrimarySlotSourceLabel(slot);
  const rollbackLabel = buildRollbackSlotLabel(slot);
  const fit = describeSwapFit({
    sameCharacter: true,
    sameSlot: true,
    compatibility: slot.compatibility,
  });
  if (!stringEqualsNormalized(currentLabel, rollbackLabel)) {
    return `Currently using ${currentLabel}. You can restore ${rollbackLabel} at any time.`;
  }
  if (fit) {
    return `Currently using ${currentLabel}. ${fit}.`;
  }
  return (
    sanitizeSwapCopy(slot.previewLabel) ??
    sanitizeSwapCopy(slot.statusMessage) ??
    `Currently using ${currentLabel}.`
  );
}

function buildOriginalSlotSourceLabel(slot: AbilitySwapSlot) {
  return (
    buildCompactSwapTitle({
      displayName: slot.rollbackDisplayName ?? slot.currentDisplayName ?? slot.sourceDisplayName,
      commandLabel: slot.currentCommandLabel ?? slot.sourceCommandLabel,
      slotLabel: slot.slotLabel,
      characterDisplayName: slot.currentCharacterDisplayName,
      slotIndex: slot.slotIndex,
    }) ??
    buildAbilityDisplayName(slot.currentCharacterDisplayName, slot.slotIndex)
  );
}

function buildOriginalSlotIdentityNote(slot: AbilitySwapSlot) {
  return buildAbilityIdentityNote({
    title: buildOriginalSlotSourceLabel(slot),
    commandLabel: slot.currentCommandLabel ?? slot.sourceCommandLabel,
    displayName: slot.rollbackDisplayName ?? slot.currentDisplayName ?? slot.sourceDisplayName,
    characterDisplayName: slot.currentCharacterDisplayName,
    slotLabel: slot.slotLabel,
    slotIndex: slot.slotIndex,
  });
}

function buildPrimarySlotSourceLabel(slot: AbilitySwapSlot) {
  const useSelectedSource = isSlotUsingSelectedSource(slot);
  const characterDisplayName = useSelectedSource
    ? slot.sourceCharacterDisplayName ?? slot.currentCharacterDisplayName
    : slot.currentCharacterDisplayName;
  const slotIndex = useSelectedSource ? slot.sourceSlotIndex ?? slot.slotIndex : slot.slotIndex;
  return (
    buildCompactSwapTitle({
      displayName: useSelectedSource ? slot.sourceDisplayName ?? slot.currentDisplayName : slot.currentDisplayName ?? slot.sourceDisplayName,
      commandLabel: useSelectedSource ? slot.sourceCommandLabel ?? slot.currentCommandLabel : slot.currentCommandLabel ?? slot.sourceCommandLabel,
      slotLabel: useSelectedSource ? slot.sourceSlotLabel ?? slot.slotLabel : slot.slotLabel,
      characterDisplayName,
      slotIndex,
    }) ??
    buildAbilityDisplayName(characterDisplayName, slotIndex)
  );
}

function buildCurrentSlotMeta(slot: AbilitySwapSlot) {
  const useSelectedSource = isSlotUsingSelectedSource(slot);
  const title = buildPrimarySlotSourceLabel(slot);
  const parts = [
    useSelectedSource ? slot.sourceCharacterDisplayName ?? slot.currentCharacterDisplayName : slot.currentCharacterDisplayName,
    useSelectedSource ? slot.sourceSlotLabel ?? slot.slotLabel : slot.slotLabel,
    sanitizeSwapCompatibility(slot.compatibility),
  ]
    .filter(Boolean)
    .filter((part) => !includesNormalizedSwapText(title, part));
  return parts.join(" / ") || null;
}

function buildSlotIdentityNote(slot: AbilitySwapSlot) {
  const useSelectedSource = isSlotUsingSelectedSource(slot);
  return buildAbilityIdentityNote({
    title: buildPrimarySlotSourceLabel(slot),
    commandLabel: useSelectedSource ? slot.sourceCommandLabel ?? slot.currentCommandLabel : slot.currentCommandLabel ?? slot.sourceCommandLabel,
    displayName: useSelectedSource ? slot.sourceDisplayName ?? slot.currentDisplayName : slot.currentDisplayName ?? slot.sourceDisplayName,
    characterDisplayName: useSelectedSource ? slot.sourceCharacterDisplayName ?? slot.currentCharacterDisplayName : slot.currentCharacterDisplayName,
    slotLabel: useSelectedSource ? slot.sourceSlotLabel ?? slot.slotLabel : slot.slotLabel,
    slotIndex: useSelectedSource ? slot.sourceSlotIndex ?? slot.slotIndex : slot.slotIndex,
  });
}

function buildRollbackSlotLabel(slot: AbilitySwapSlot) {
  return (
    buildCompactSwapTitle({
      displayName: slot.rollbackDisplayName,
      commandLabel: slot.currentCommandLabel ?? slot.sourceCommandLabel,
      slotLabel: slot.slotLabel,
      characterDisplayName: slot.currentCharacterDisplayName,
      slotIndex: slot.slotIndex,
    }) ?? buildPrimarySlotSourceLabel(slot)
  );
}

function buildRollbackSummary(slot: AbilitySwapSlot) {
  const rollbackLabel = buildRollbackSlotLabel(slot);
  if (stringEqualsNormalized(rollbackLabel, buildPrimarySlotSourceLabel(slot))) {
    return "Restore the original exported source for this slot.";
  }
  const context = [slot.currentCharacterDisplayName, slot.slotLabel]
    .filter(Boolean)
    .filter((part) => !includesNormalizedSwapText(rollbackLabel, part));
  if (context.length) {
    return `Restore ${rollbackLabel} for ${context.join(" / ")}.`;
  }
  if (slot.currentDisplayName) {
    return `Restore ${rollbackLabel} as the original source for this slot.`;
  }
  return "Restore the original source for this slot.";
}

function isSlotUsingSelectedSource(slot: AbilitySwapSlot) {
  return Boolean(
    slot.sourceTargetKey
    && slot.currentTargetKey
    && !stringEqualsNormalized(slot.sourceTargetKey, slot.currentTargetKey),
  );
}

function buildSourceOrigin(source: AbilitySwapSource) {
  const title = buildSourceTitle(source);
  const parts = [
    source.characterDisplayName,
    source.slotLabel && !stringEqualsNormalized(source.slotLabel, title) ? source.slotLabel : null,
    sanitizeSwapCompatibility(source.compatibility),
  ]
    .filter(Boolean)
    .filter((part) => !includesNormalizedSwapText(title, part));
  if (parts.length) {
    return parts.join(" / ");
  }
  if (source.recommended) {
    return "Closest match for the current character and slot";
  }
  if (source.sameCharacter) {
    return "Current character / different slot";
  }
  if (source.sameSlot) {
    return "Same slot on another character";
  }
  if (source.runtimeType && !/^ability$/i.test(source.runtimeType)) {
    return resolveFriendlyName(source.runtimeType);
  }
  return "Exported ability source";
}

function buildSourceRankLabel(source: AbilitySwapSource) {
  if (source.recommended) {
    return "Recommended";
  }
  if (source.sameCharacter) {
    return "Same character";
  }
  if (source.sameSlot) {
    return "Same slot";
  }
  return "Compatible";
}

function buildSourceHint(source: AbilitySwapSource) {
  const title = buildSourceTitle(source);
  const previewLabel = sanitizeSwapCopy(source.previewLabel);
  if (
    previewLabel
    && !isLowValueSwapPreviewLabel(previewLabel)
    && !includesNormalizedSwapText(title, previewLabel)
    && !includesNormalizedSwapText(previewLabel, title)
  ) {
    return previewLabel;
  }
  const fit = describeSwapFit(source);
  if (fit) {
    return fit;
  }
  if (source.recommended) {
    return "Safest place to start for this slot.";
  }
  if (source.runtimeType) {
    return resolveFriendlyName(source.runtimeType);
  }
  return "Available ability source";
}

function buildSourceIdentityNote(source: AbilitySwapSource) {
  return buildAbilityIdentityNote({
    title: buildSourceTitle(source),
    commandLabel: source.commandLabel,
    displayName: source.displayName,
    characterDisplayName: source.characterDisplayName,
    slotLabel: source.slotLabel,
    slotIndex: source.slotIndex,
  });
}

function buildSourceTitle(source: AbilitySwapSource) {
  return (
    buildCompactSwapTitle({
      displayName: source.displayName,
      commandLabel: source.commandLabel,
      slotLabel: source.slotLabel,
      characterDisplayName: source.characterDisplayName,
      slotIndex: source.slotIndex,
    }) ??
    buildAbilityDisplayName(source.characterDisplayName, source.slotIndex)
  );
}

function buildAbilityIdentityNote({
  title,
  commandLabel,
  displayName,
  characterDisplayName,
  slotLabel,
  slotIndex,
}: {
  title: string;
  commandLabel?: string | null;
  displayName?: string | null;
  characterDisplayName?: string | null;
  slotLabel?: string | null;
  slotIndex?: number | null;
}) {
  const rawDisplayLooksTechnical = looksTechnicalSwapText(displayName ?? "");
  const normalizedSlotLabel = sanitizeSwapAbilityLabel(slotLabel, { allowGenericSlotLabel: true });
  const fallbackSlotLabel = resolveAbilitySlotFallbackLabel(slotIndex ?? 0);
  const explicitCommand = sanitizeSwapAbilityLabel(commandLabel);
  if (explicitCommand && !isGenericSwapAbilityLabel(explicitCommand)) {
    return null;
  }

  const readableDisplay = sanitizeSwapAbilityLabel(
    humanizeSwapTitle(compactDisplayAgainstCharacter(displayName ?? "", characterDisplayName)) ?? displayName,
    { allowGenericSlotLabel: true },
  );
  if (
    readableDisplay
    && !rawDisplayLooksTechnical
    && !isGenericSwapAbilityLabel(readableDisplay)
    && !stringEqualsNormalized(readableDisplay, normalizedSlotLabel)
    && !stringEqualsNormalized(readableDisplay, fallbackSlotLabel)
    && !looksLikeSwapContextLabel(readableDisplay, characterDisplayName, slotIndex)
  ) {
    return null;
  }

  const contextLabel = buildCharacterSlotLabel(characterDisplayName, slotLabel, slotIndex);
  if (!contextLabel || stringEqualsNormalized(title, contextLabel)) {
    return `No unique ability name was exported here yet. This source points to ${contextLabel ?? "this slot"}.`;
  }
  return `No unique ability name was exported here yet. This source points to ${contextLabel}.`;
}

function sanitizeSwapCopy(value?: string | null) {
  if (!value) {
    return null;
  }
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned || looksTechnicalSwapText(cleaned)) {
    return null;
  }
  return cleaned;
}

function looksTechnicalSwapText(value: string) {
  return (
    /\\/.test(value) ||
    /^[a-z]:\//i.test(value) ||
    /userData|balancemod|runtime|abilityswap\.json|\.json$/i.test(value) ||
    /#[0-9]+\/ability\[\d+\]/i.test(value) ||
    /^ability\[\d+\]/i.test(value) ||
    /^abilities?\s*\/\s*\d+/i.test(value) ||
    /^character swap$/i.test(value) ||
    /^ability swap$/i.test(value) ||
    /^current$/i.test(value) ||
    /^original$/i.test(value) ||
    /^previous$/i.test(value) ||
    /^current character$/i.test(value) ||
    /^different character$/i.test(value) ||
    /^current character export$/i.test(value) ||
    /^character ability$/i.test(value)
  );
}

function buildCompactSwapTitle({
  displayName,
  commandLabel,
  slotLabel,
  characterDisplayName,
  slotIndex,
}: {
  displayName?: string | null;
  commandLabel?: string | null;
  slotLabel?: string | null;
  characterDisplayName?: string | null;
  slotIndex?: number | null;
}) {
  const explicitCommand = sanitizeSwapAbilityLabel(commandLabel);
  if (explicitCommand && !isGenericSwapAbilityLabel(explicitCommand)) {
    return explicitCommand;
  }

  const slotLabelValue = sanitizeSwapAbilityLabel(slotLabel, { allowGenericSlotLabel: true });
  const contextualSlotLabel = buildCharacterSlotLabel(characterDisplayName, slotLabelValue, slotIndex);
  const trimmedDisplay = sanitizeSwapCopy(displayName);
  if (trimmedDisplay) {
    const compact = compactDisplayAgainstCharacter(trimmedDisplay, characterDisplayName);
    const humanizedCompact = humanizeSwapTitle(compact);
    const humanizedDisplay = humanizeSwapTitle(trimmedDisplay);
    const compactLabel = sanitizeSwapAbilityLabel(humanizedCompact ?? compact, { allowGenericSlotLabel: true });
    if (compactLabel && !isGenericSwapAbilityLabel(compactLabel)) {
      if (
        contextualSlotLabel
        && (
          stringEqualsNormalized(compactLabel, slotLabelValue)
          || stringEqualsNormalized(compactLabel, resolveAbilitySlotFallbackLabel(slotIndex ?? 0))
        )
      ) {
        return contextualSlotLabel;
      }
      return compactLabel;
    }

    const fullLabel = sanitizeSwapAbilityLabel(humanizedDisplay ?? trimmedDisplay, { allowGenericSlotLabel: true });
    if (fullLabel && !isGenericSwapAbilityLabel(fullLabel)) {
      return fullLabel;
    }

    if (contextualSlotLabel) {
      return contextualSlotLabel;
    }

    if (compactLabel) {
      return compactLabel;
    }

    if (fullLabel) {
      return fullLabel;
    }
  }

  if (contextualSlotLabel) {
    return contextualSlotLabel;
  }

  return buildAbilityDisplayName(characterDisplayName, slotIndex);
}

function buildCharacterSlotLabel(
  characterDisplayName?: string | null,
  slotLabel?: string | null,
  slotIndex?: number | null,
) {
  const characterLabel = sanitizeSwapCopy(characterDisplayName)
    ? resolveFriendlyName(characterDisplayName)
    : null;
  const cleanedSlotLabel = sanitizeSwapAbilityLabel(slotLabel, { allowGenericSlotLabel: true });

  if (characterLabel && cleanedSlotLabel) {
    if (includesNormalizedSwapText(cleanedSlotLabel, characterLabel)) {
      return cleanedSlotLabel;
    }
    return `${characterLabel} / ${cleanedSlotLabel}`;
  }

  if (cleanedSlotLabel) {
    return cleanedSlotLabel;
  }

  return buildAbilityDisplayName(characterDisplayName, slotIndex);
}

function sanitizeSwapAbilityLabel(
  value?: string | null,
  options?: {
    allowGenericSlotLabel?: boolean;
  },
) {
  const cleaned = sanitizeSwapCopy(value);
  if (!cleaned) {
    return null;
  }

  if (/^ability\s*\d+$/i.test(cleaned) || /^ability slot\s*\d+$/i.test(cleaned)) {
    if (!options?.allowGenericSlotLabel) {
      return null;
    }
    const parsed = cleaned.match(/(\d+)/);
    const slotIndex = parsed ? Number(parsed[1]) - 1 : 0;
    return resolveAbilitySlotFallbackLabel(slotIndex);
  }

  if (
    /^ability\s*\d+\s*ability\s*\d+$/i.test(cleaned)
    || /^ability\s*\d+\s*\(ability\)$/i.test(cleaned)
    || /^ability\s*\d+\s*current$/i.test(cleaned)
  ) {
    return null;
  }

  if (/^(basic|special|tactical|ultimate)( attack| ability)?$/i.test(cleaned)) {
    return cleaned.replace(/\s+ability$/i, "").replace(/\s+attack$/i, "");
  }

  return cleaned;
}

function resolveAbilitySlotFallbackLabel(slotIndex: number): string {
  switch (slotIndex) {
    case 0:
      return "Basic";
    case 1:
      return "Special";
    case 2:
      return "Tactical";
    case 3:
      return "Ultimate";
    default:
      return `Ability Slot ${slotIndex + 1}`;
  }
}

function isGenericSwapAbilityLabel(value: string) {
  return /^ability\s*\d+$/i.test(value) || /^ability slot\s*\d+$/i.test(value);
}

function compactDisplayAgainstCharacter(value: string, characterDisplayName?: string | null) {
  const segments = value.split("/").map((segment) => segment.trim()).filter(Boolean);
  if (segments.length > 1) {
    return segments[segments.length - 1] ?? value;
  }

  if (characterDisplayName) {
    const escaped = escapeRegExp(characterDisplayName.trim());
    if (escaped) {
      const withoutPrefix = value.replace(new RegExp(`^${escaped}\\s+`, "i"), "").trim();
      if (withoutPrefix) {
        return withoutPrefix;
      }
    }
  }

  return value;
}

function humanizeSwapTitle(value?: string | null) {
  const cleaned = value?.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return null;
  }
  const humanized = cleaned
    .replace(/\(Ability\)/gi, "")
    .replace(/\bAbility\[(\d+)\]/gi, "Ability $1")
    .replace(/\bAbility(\d+)\b/gi, "Ability $1")
    .replace(/^Ability\s+\d+\s+Ability\s+(\d+)$/i, "Ability $1")
    .replace(/\b0+\s+Ability\s+(\d+)\b/gi, "Ability $1")
    .replace(/\s*\/\s*Ability Swap$/i, "")
    .replace(/\s*\/\s*Current$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!humanized || /^(character\s+)?ability swap$/i.test(humanized)) {
    return null;
  }

  return resolveFriendlyName(humanized);
}

function stringEqualsNormalized(left?: string | null, right?: string | null) {
  if (!left || !right) {
    return false;
  }
  return normalizeSwapCompareText(left) === normalizeSwapCompareText(right);
}

function normalizeSwapCompareText(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function includesNormalizedSwapText(container?: string | null, value?: string | null) {
  if (!container || !value) {
    return false;
  }
  const normalizedContainer = normalizeSwapCompareText(container);
  const normalizedValue = normalizeSwapCompareText(value);
  if (!normalizedContainer || !normalizedValue) {
    return false;
  }
  return normalizedContainer.includes(normalizedValue);
}

function looksLikeSwapContextLabel(
  value: string,
  characterDisplayName?: string | null,
  slotIndex?: number | null,
) {
  if (value.includes(" / ")) {
    return true;
  }
  const fallbackTitle = buildAbilityDisplayName(characterDisplayName, slotIndex);
  return stringEqualsNormalized(value, fallbackTitle);
}

function isLowValueSwapPreviewLabel(value: string) {
  return (
    /^abilities?\s*\/\s*(ability(\s*slot)?\s*\d+|\d+)/i.test(value) ||
    /^character ability$/i.test(value) ||
    /^current character export$/i.test(value) ||
    /^recommended$/i.test(value) ||
    /^compatible$/i.test(value)
  );
}

function sanitizeSwapCompatibility(value?: string | null) {
  const cleaned = sanitizeSwapCopy(value);
  if (!cleaned) {
    return null;
  }
  if (
    /^current character$/i.test(cleaned)
    || /^different character$/i.test(cleaned)
    || /^current$/i.test(cleaned)
    || /^compatible$/i.test(cleaned)
  ) {
    return null;
  }
  return cleaned;
}

function describeSwapFit(source: Pick<AbilitySwapSource, "sameCharacter" | "sameSlot" | "compatibility">) {
  if (source.sameCharacter && source.sameSlot) {
    return "Closest match for the current character and slot";
  }
  if (source.sameCharacter) {
    return "Different slot on the current character";
  }
  if (source.sameSlot) {
    return "Same slot from another character";
  }
  const compatibility = sanitizeSwapCompatibility(source.compatibility);
  if (compatibility) {
    return compatibility;
  }
  return "Compatible source for this slot";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
