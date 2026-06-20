import { RefreshCw, Save, Search } from "lucide-react";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { PanelLeftClose } from "lucide-react";

import { Button, Card, CardBody, CardHeader, Input, Select, Spinner, Switch } from "./ui";
import { IconPreview, SectionCard, resolveFriendlyName, type ExperienceMode } from "./common";
import { SmartFilterChips } from "./components/SmartFilterChips";
import { HintPopover } from "./components/HintPopover";
import { formatJson, materializeRuntimeDocument, resolveSimpleValue } from "./document";
import { buildGameModeResearchTopics } from "./gameModeResearch";
import {
  createSmartFilterRegistry,
  type FilterableItem,
  type SmartFilterId,
} from "./helpers/filter-predicates";
import {
  loadSavedSearches,
  removeSearch,
  type SavedSearch,
} from "./helpers/saved-searches";
import { useCollapsibleSection, usePageEntranceMotion, useTabTransition } from "./motion";
import type {
  AdvancedField,
  CatalogEntry,
  CollectionEditor,
  GameModeIndexResponse,
  JsonValue,
  LibraryTemplateEntry,
  LibraryMetadataResponse,
  NamedCollectionSummary,
  NumericRange,
  RuntimeDocument,
  SimpleGroupEntry,
  TargetOperationEntry,
} from "./types";

interface LoadedEntryState {
  document?: RuntimeDocument;
  draftOverrides: Record<string, JsonValue>;
  draftOperations: TargetOperationEntry[];
  overrideText: string;
  overrideTextError?: string;
  loading: boolean;
  saving: boolean;
  error?: string;
  lastSavedAt?: string;
  lastBackupPath?: string | null;
}

interface SectionEntry extends SimpleGroupEntry {
  category: string;
}

interface AugmentTemplateSummary {
  id: number;
  label: string;
  subtitle: string;
  targetKey?: string;
  iconReference?: string;
  previewPath?: string;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  isVaulted?: boolean;
}

interface VaultedAugmentRow {
  id: number;
  label: string;
  subtitle: string;
  previewPath?: string;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  isVaulted: boolean;
}

interface NamedCollectionRow {
  key: string;
  order: number;
  value: string;
  label: string;
  subtitle: string;
  previewPath?: string;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  enabled?: boolean;
  editable?: boolean;
  sourcePath?: string;
}

interface NamedCollectionSection {
  path: string;
  section: GameModeSectionKey;
  title: string;
  subtitle: string;
  rows: NamedCollectionRow[];
  editable: boolean;
  defaultValues?: string[];
}

interface SnapshotCopyTarget {
  id: string;
  label: string;
  description: string;
}

type GameModeSectionKey = "rules" | "zone" | "lobby" | "bots" | "presets" | "experimental";

interface GameModeSidebarGroup {
  key: string;
  label: string;
  copy: string;
  entries: Array<{
    entry: CatalogEntry;
    sourcePresentation: ReturnType<typeof buildSourcePresentation>;
    sidebarMeta: string;
  }>;
}

const GAME_MODE_VAULT_RENDER_BATCH = 48;
const GAME_MODE_SECTION_ORDER: GameModeSectionKey[] = [
  "rules",
  "zone",
  "lobby",
  "bots",
  "presets",
  "experimental",
];

export function GameModePage({
  entries,
  search,
  onSearchChange,
  selectedEntry,
  selectedState,
  mode,
  onSelectEntry,
  onUpdateValue,
  onResetValue,
  onSetCollectionValue,
  onOverrideTextChange,
  onSave,
  onRevert,
  onReset,
  onReload,
  libraryMetadata,
  gameModeIndex,
  onRefreshGameModeIndex,
  snapshotCopyTargets,
  copySnapshotBusy,
  onCopySnapshotToTarget,
  embedded = false,
}: {
  entries: CatalogEntry[];
  search: string;
  onSearchChange: (value: string) => void;
  selectedEntry: CatalogEntry | null;
  selectedState?: LoadedEntryState;
  mode: ExperienceMode;
  onSelectEntry: (entryId: string) => void;
  onUpdateValue: (item: { path: string; valueType?: string; defaultValue?: JsonValue }, value: string | boolean) => void;
  onResetValue: (path: string) => void;
  onSetCollectionValue: (path: string, value: JsonValue[], defaultValue?: JsonValue) => void;
  onOverrideTextChange: (value: string) => void;
  onSave: () => void;
  onRevert: () => void;
  onReset: () => void;
  onReload: () => void;
  libraryMetadata: LibraryMetadataResponse | null;
  gameModeIndex: GameModeIndexResponse | null;
  onRefreshGameModeIndex: () => void;
  snapshotCopyTargets: SnapshotCopyTarget[];
  copySnapshotBusy?: boolean;
  onCopySnapshotToTarget: (targetId: string) => void;
  embedded?: boolean;
}) {
  const pageMotionRef = usePageEntranceMotion();
  const [sidebarExpanded, setSidebarExpanded] = useState(() => !selectedEntry?.id);
  const [vaultSearch, setVaultSearch] = useState("");
  const deferredVaultSearch = useDeferredValue(vaultSearch);
  // Phase 3 Task 16 — SmartFilterChips integration. Mounted above the augment
  // (vault) list. The vault row shape doesn't natively match FilterableItem,
  // so we shape-coerce iconPath←previewPath and hasOverride←isVaulted at the
  // call site. TODO: extend coercion when more list surfaces (rules/sources)
  // adopt the chips.
  const [activeFilters, setActiveFilters] = useState<Set<SmartFilterId>>(() => new Set());
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() => loadSavedSearches("gamemode"));
  const filterRegistry = useMemo(() => createSmartFilterRegistry(), []);
  const handleToggleSmartFilter = useCallback((id: SmartFilterId) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  const handleRemoveSavedSearch = useCallback((query: string) => {
    const remaining = removeSearch("gamemode", query);
    setSavedSearches(remaining);
  }, []);
  const handleApplySavedSearch = useCallback(
    (query: string) => {
      setVaultSearch(query);
    },
    [],
  );
  const [selectedSection, setSelectedSection] = useState<GameModeSectionKey>("rules");
  const [sectionSurface, setSectionSurface] = useState<"fields" | "collections">("fields");
  const [selectedSnapshotTargetId, setSelectedSnapshotTargetId] = useState("");
  const [selectedResearchTopicKey, setSelectedResearchTopicKey] = useState("");
  const [copiedResearchTopicKey, setCopiedResearchTopicKey] = useState("");
  const [utilityPanel, setUtilityPanel] = useState<"context" | "vault">("context");
  const [contextView, setContextView] = useState<"overview" | "research" | "raw">("overview");
  const [researchView, setResearchView] = useState<"jump" | "analysis">("jump");
  const [visibleVaultLimit, setVisibleVaultLimit] = useState(GAME_MODE_VAULT_RENDER_BATCH);
  const lastSourceKeyRef = useRef<string>("");
  const sectionStackRef = useRef<HTMLDivElement | null>(null);
  const [focusedResearchPath, setFocusedResearchPath] = useState("");
  const sectionTransitionRef = useTabTransition<HTMLDivElement>(selectedSection + "_" + sectionSurface);
  const utilityTransitionRef = useTabTransition<HTMLDivElement>(utilityPanel);
  const sortedEntries = useMemo(() => sortGameModeEntries(entries), [entries]);
  const sourceTitleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of sortedEntries) {
      const title = buildSourcePresentation(entry).title;
      counts.set(title, (counts.get(title) ?? 0) + 1);
    }
    return counts;
  }, [sortedEntries]);
  const groupedEntries = useMemo(
    () => buildGameModeSourceGroups(sortedEntries, sourceTitleCounts),
    [sortedEntries, sourceTitleCounts],
  );
  const baseDocument = selectedState?.document;
  const draftOverrides = selectedState?.draftOverrides ?? {};
  const draftOperations = selectedState?.draftOperations ?? [];
  const document = useMemo(
    () => baseDocument ? materializeRuntimeDocument(baseDocument, draftOverrides, draftOperations) : undefined,
    [baseDocument, draftOverrides, draftOperations],
  );
  const selectedSource = useMemo(() => buildSourcePresentation(selectedEntry, document), [document, selectedEntry]);

  const sectionEntries = useMemo(() => {
    const groups = document?.simpleSettings?.groups ?? [];
    return groups.flatMap((group) =>
      (group.entries ?? [])
        .filter((entry) => Boolean(entry.editable && entry.path))
        .filter((entry) => !isVaultedAugmentPath(entry.path))
        .filter((entry) => (mode === "guided" ? !isGuidedNoisePath(entry.path) : true))
        .map((entry) => ({
          ...entry,
          category: group.category,
        })),
    );
  }, [document, mode]);

  const advancedSectionEntries = useMemo(
    () => buildAdvancedGameModeEntries(document, sectionEntries, mode),
    [document, mode, sectionEntries],
  );
  const sectionMap = useMemo(
    () => buildGameModeSections([...sectionEntries, ...advancedSectionEntries]),
    [advancedSectionEntries, sectionEntries],
  );
  const augmentTemplates = useMemo(() => buildAugmentTemplates(document, libraryMetadata), [document, libraryMetadata]);
  const vaultState = useMemo(
    () => buildVaultState(document, augmentTemplates, draftOverrides),
    [augmentTemplates, document, draftOverrides],
  );
  const namedCollections = useMemo(
    () => buildNamedGameModeCollections(document, libraryMetadata, draftOverrides),
    [document, libraryMetadata, draftOverrides],
  );
  const researchTopics = useMemo(
    () => buildGameModeResearchTopics(document, selectedSource.title ?? document?.displayName ?? "Game Mode"),
    [document, selectedSource.title],
  );
  const selectedResearchTopic = useMemo(
    () =>
      researchTopics.find((topic) => topic.key === selectedResearchTopicKey) ??
      researchTopics[0] ??
      null,
    [researchTopics, selectedResearchTopicKey],
  );
  const researchJumpTargets = useMemo(
    () =>
      (selectedResearchTopic?.editableMatches ?? [])
        .map((match) => {
          const sectionKey = resolveResearchMatchSection(match, sectionMap, selectedResearchTopic?.key ?? "");
          return {
            ...match,
            sectionKey,
            sectionLabel: getSectionLabel(sectionKey),
            anchorId: buildGameModeFieldAnchorId(match.path),
          };
        })
        .filter((match, index, matches) => {
          return matches.findIndex((candidate) => candidate.path === match.path) === index;
        }),
    [sectionMap, selectedResearchTopic],
  );
  const hiddenGuidedNoiseCount = useMemo(
    () =>
      mode === "guided"
        ? (document?.simpleSettings?.groups ?? []).reduce(
            (count, group) =>
              count +
              (group.entries ?? []).filter(
                (entry) => Boolean(entry.editable && entry.path) && isGuidedNoisePath(entry.path),
              ).length,
            0,
          )
        : 0,
    [document, mode],
  );
  const modeProbe = useMemo(() => readGameModeProbe(gameModeIndex), [gameModeIndex]);
  const availableSections = useMemo(
    () =>
      GAME_MODE_SECTION_ORDER,
    [],
  );
  const sectionsWithContent = useMemo(
    () =>
      GAME_MODE_SECTION_ORDER.filter(
        (key) => sectionMap[key].length || namedCollections.some((collection) => collection.section === key),
      ),
    [namedCollections, sectionMap],
  );
  const activeSectionCollections = useMemo(
    () => namedCollections.filter((collection) => collection.section === selectedSection),
    [namedCollections, selectedSection],
  );
  const activeSectionHasFields = Boolean(sectionMap[selectedSection].length);
  const sectionExpandedRef = useCollapsibleSection<HTMLDivElement>(activeSectionHasFields || activeSectionCollections.length > 0);

  const vaultResults = useMemo(() => {
    const term = deferredVaultSearch.trim().toLowerCase();
    if (!term) {
      return vaultState.currentVaulted;
    }

    return vaultState.allTemplates
      .filter((entry) => `${entry.label} ${entry.subtitle} ${entry.id}`.toLowerCase().includes(term))
      .map((entry) => ({
        ...entry,
        isVaulted: vaultState.effectiveVaultedIds.has(entry.id),
      }))
      .slice(0, 40);
  }, [deferredVaultSearch, vaultState]);
  const renderedVaultResults = useMemo(
    () => vaultResults.slice(0, visibleVaultLimit),
    [vaultResults, visibleVaultLimit],
  );
  const canLoadMoreVaultResults = renderedVaultResults.length < vaultResults.length;

  useEffect(() => {
    if (!availableSections.length) {
      return;
    }
    const preferredSection = getDefaultSectionForSource(
      selectedSource.sourceKey,
      sectionsWithContent.length ? sectionsWithContent : availableSections,
    );
    if (lastSourceKeyRef.current !== selectedSource.sourceKey) {
      lastSourceKeyRef.current = selectedSource.sourceKey;
      setSelectedSection(preferredSection);
      return;
    }
    if (!availableSections.includes(selectedSection)) {
      setSelectedSection(preferredSection);
    }
  }, [availableSections, sectionsWithContent, selectedSection, selectedSource.sourceKey]);

  useEffect(() => {
    if (selectedSource.sourceKey !== "current_lobby") {
      return;
    }
    if (!snapshotCopyTargets.length) {
      setSelectedSnapshotTargetId("");
      return;
    }
    if (!snapshotCopyTargets.some((target) => target.id === selectedSnapshotTargetId)) {
      setSelectedSnapshotTargetId(snapshotCopyTargets[0]?.id ?? "");
    }
  }, [selectedSnapshotTargetId, selectedSource.sourceKey, snapshotCopyTargets]);

  useEffect(() => {
    setVisibleVaultLimit(GAME_MODE_VAULT_RENDER_BATCH);
  }, [deferredVaultSearch, utilityPanel, selectedEntry?.id]);

  useEffect(() => {
    if (!researchTopics.length) {
      if (selectedResearchTopicKey) {
        setSelectedResearchTopicKey("");
      }
      return;
    }
    if (!researchTopics.some((topic) => topic.key === selectedResearchTopicKey)) {
      setSelectedResearchTopicKey(researchTopics[0].key);
    }
  }, [researchTopics, selectedResearchTopicKey]);

  useEffect(() => {
    setFocusedResearchPath("");
  }, [selectedResearchTopicKey]);

  useEffect(() => {
    if (!activeSectionCollections.length) {
      setSectionSurface("fields");
      return;
    }
    if (!activeSectionHasFields) {
      setSectionSurface("collections");
    }
  }, [activeSectionCollections.length, activeSectionHasFields, selectedSection]);

  const isSidebarCollapsed = Boolean(selectedEntry && !sidebarExpanded);
  const showSidebar = !(embedded && isSidebarCollapsed);
  const sourceCountLabel = entries.length === 1 ? "1 source available" : `${entries.length} sources available`;

  useEffect(() => {
    if (selectedEntry?.id) {
      setSidebarExpanded(false);
    }
  }, [selectedEntry?.id]);

  const openResearchTarget = (path?: string, sectionKey?: GameModeSectionKey | null) => {
    const resolvedSection =
      (sectionKey && availableSections.includes(sectionKey) ? sectionKey : null) ??
      getDefaultSectionForResearchTopic(
        selectedResearchTopic?.key ?? "",
        sectionsWithContent.length ? sectionsWithContent : availableSections,
      );

    if (resolvedSection) {
      setSelectedSection(resolvedSection);
    }
    setFocusedResearchPath(path ?? "");

    if (typeof window === "undefined" || typeof globalThis.document === "undefined") {
      return;
    }

    const targetId = path ? buildGameModeFieldAnchorId(path) : buildGameModeSectionAnchorId(resolvedSection ?? selectedSection);
    window.setTimeout(() => {
      const targetElement =
        (targetId ? globalThis.document.getElementById(targetId) : null) ??
        sectionStackRef.current;
      targetElement?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 48);
  };

  const showBotSettingsNote = selectedSource.sourceKey !== "current_lobby" && !sectionsWithContent.includes("bots");
  const hasRawEditor = mode === "studio" && !embedded;
  const hasOverviewContext = Boolean(modeProbe) || Boolean(selectedSource.bridgeCopy) || showBotSettingsNote;
  const studioLayoutStyle = !embedded
    ? ({
        gridTemplateColumns: "minmax(0, 1fr)",
        gap: "0.88rem",
      } as const)
    : undefined;
  const supportColumnStyle = !embedded
    ? ({
        position: "static",
        gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))",
        gap: "0.82rem",
        overflow: "visible",
        paddingRight: 0,
      } as const)
    : undefined;
  const editColumnStyle = !embedded
    ? ({
        minWidth: 0,
        display: "grid",
        alignContent: "start",
        gap: "0.82rem",
      } as const)
    : undefined;
  const topControlsStyle = {
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: "0.72rem",
    padding: "0.74rem 0.86rem",
  } as const;
  const pickerStackStyle = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    alignItems: "start",
    gap: "0.48rem",
  } as const;
  const segmentedButtonStyle = {
    minHeight: "2.48rem",
    padding: "0.58rem 0.92rem",
    fontSize: "0.84rem",
  } as const;
  const contextViews = useMemo<Array<{ key: "overview" | "research" | "raw"; label: string }>>(() => {
    const views: Array<{ key: "overview" | "research" | "raw"; label: string }> = [];
    if (hasOverviewContext) {
      views.push({ key: "overview", label: "Context" });
    }
    if (selectedResearchTopic) {
      views.push({ key: "research", label: "Research" });
    }
    if (hasRawEditor) {
      views.push({ key: "raw", label: "Raw" });
    }
    return views;
  }, [hasOverviewContext, hasRawEditor, selectedResearchTopic]);
  const hasContextTools = contextViews.length > 0;

  useEffect(() => {
    if (!contextViews.length) {
      return;
    }
    if (!contextViews.some((entry) => entry.key === contextView)) {
      setContextView(contextViews[0].key);
    }
  }, [contextView, contextViews]);

  const hasVaultTools = Boolean(vaultState.allTemplates.length);
  const utilityViews = useMemo<Array<{ key: "context" | "vault"; label: string }>>(() => {
    const views: Array<{ key: "context" | "vault"; label: string }> = [];
    if (hasContextTools) {
      views.push({ key: "context", label: "Utilities" });
    }
    if (hasVaultTools) {
      views.push({ key: "vault", label: `Vault (${vaultState.effectiveVaultedIds.size})` });
    }
    return views;
  }, [hasContextTools, hasVaultTools, vaultState.effectiveVaultedIds.size]);

  useEffect(() => {
    if (utilityPanel === "context" && !hasContextTools) {
      if (hasVaultTools) {
        setUtilityPanel("vault");
      }
      return;
    }
    if (utilityPanel === "vault" && !hasVaultTools) {
      if (hasContextTools) {
        setUtilityPanel("context");
      }
    }
  }, [hasContextTools, hasVaultTools, utilityPanel]);

  // Phase 3 Task 16 — chip row for the augment-by-name list. Visual-only for
  // this round: chips show the active state and savedSearches, the toggle
  // handler updates state, but the vault row coercion is not yet wired into
  // `vaultResults`. TODO(Phase 3 Task 16): adapt VaultedAugmentRow into
  // FilterableItem (iconPath ← previewPath, hasOverride ← isVaulted) and
  // run `filterRegistry.buildActive(activeFilters)` over the rendered list.
  const smartFilterChipsForVault = (
    <div data-testid="gamemode-smart-filter-chips" style={{ marginBottom: 8 }}>
      <SmartFilterChips
        activeFilters={activeFilters}
        onToggle={handleToggleSmartFilter}
        savedSearches={savedSearches}
        onRemoveSavedSearch={handleRemoveSavedSearch}
        onApplySavedSearch={handleApplySavedSearch}
      />
    </div>
  );

  const supportPanels = (
    <>
      <SectionCard
        className="task-gamemode-source-summary"
        title={selectedSource.title ?? "Choose one game mode source"}
        subtitle={
          selectedSource.heroCopy
          ?? selectedEntry?.subtitle
          ?? "Keep one rules source locked in view, then edit one category at a time."
        }
      >
        <div className="task-gamemode-source-summary-meta">
          <div className="task-gamemode-source-summary-chip">
            <span>Best for</span>
            <strong>{selectedSource.bestFor}</strong>
          </div>
          <div className="task-gamemode-source-summary-chip" title={selectedSource.applyTimingBody}>
            <span>Applies</span>
            <strong>{selectedSource.applyTimingTitle}</strong>
          </div>
        </div>
        <div className="task-gamemode-source-summary-actions">
          <Button variant="flat" onPress={() => setSidebarExpanded(true)}>
            Change source
          </Button>
        </div>
      </SectionCard>

      {selectedSource.sourceKey === "current_lobby" ? (
        <SectionCard
          className="task-gamemode-snapshot-card"
          title="Copy this live snapshot"
          subtitle="Use the live lobby as a reference, then copy the overlapping values into a safer restart-first target before you save."
        >
          {snapshotCopyTargets.length ? (
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <Select
                label="Restart-safe target"
                value={selectedSnapshotTargetId}
                options={snapshotCopyTargets.map((target) => ({
                  label: target.label,
                  value: target.id,
                  description: target.description,
                }))}
                onValueChange={setSelectedSnapshotTargetId}
                description="Presets are the normal choice. Use the lobby structure file only when you need to carry team or player-cap style values forward."
              />
              <div className="flex items-end">
                <Button
                  color="secondary"
                  isDisabled={!selectedSnapshotTargetId || copySnapshotBusy}
                  onPress={() => onCopySnapshotToTarget(selectedSnapshotTargetId)}
                >
                  {copySnapshotBusy ? "Copying..." : "Copy into target"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="task-empty-card">
              <p>No restart-safe target is ready yet. Open Current Preset or a saved preset once, then come back here.</p>
            </div>
          )}
        </SectionCard>
      ) : null}

      <div ref={utilityTransitionRef} className="space-y-4">
      {hasContextTools && utilityPanel === "context" ? (
        <SectionCard
          className="task-gamemode-context-card"
          title="Context and utilities"
          subtitle="Keep this secondary. Stay in the section stack for normal edits, then use one helper surface here when you need extra context."
          actions={<HintPopover hintId="advanced-section" />}
        >
          <div className="task-stack">
            {contextViews.length > 1 ? (
              <div className="task-section-picker task-section-picker--inline">
                <p className="task-section-picker-label">Utility surface</p>
                <div className="task-segmented">
                  {contextViews.map((entry) => (
                    <button
                      key={entry.key}
                      aria-pressed={contextView === entry.key}
                      className={contextView === entry.key ? "is-active" : ""}
                      onClick={() => setContextView(entry.key)}
                      type="button"
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {contextView === "overview" && hasOverviewContext ? (
              <div className="task-utility-stack">
                {modeProbe ? (
                  <div className="task-note task-gamemode-probe-note">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p>
                          Live mode detected: <strong>{modeProbe.currentLabel}</strong>
                          {modeProbe.currentGameModeId !== null ? ` (ID ${modeProbe.currentGameModeId})` : ""}
                        </p>
                        <p className="mt-2">Known modes: {modeProbe.entryLabels.join(", ")}</p>
                      </div>
                      <Button size="sm" variant="flat" onPress={onRefreshGameModeIndex}>
                        Refresh mode probe
                      </Button>
                    </div>
                  </div>
                ) : null}

                {selectedSource.bridgeCopy ? (
                  <div className="task-note task-gamemode-bridge-note">
                    <p>{selectedSource.bridgeCopy}</p>
                  </div>
                ) : null}

                {showBotSettingsNote ? (
                  <div className="task-note task-gamemode-bot-note">
                    <p>
                      Bot settings live in <strong>Live Snapshot</strong>. Open that source when you want bot count,
                      difficulty, or other lobby-owned values, then copy what you need into a restart-safe target.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {contextView === "research" && selectedResearchTopic ? (
              <div className="task-stack">
                <div className="task-research-actions">
                  <Button
                    size="sm"
                    color="secondary"
                    onPress={() => openResearchTarget(researchJumpTargets[0]?.path, researchJumpTargets[0]?.sectionKey)}
                  >
                    Open editable fields
                  </Button>
                  <Button
                    size="sm"
                    variant="flat"
                    onPress={() => copyResearchSummary(selectedResearchTopic.key, selectedResearchTopic.summaryText, setCopiedResearchTopicKey)}
                  >
                    {copiedResearchTopicKey === selectedResearchTopic.key ? "Copied" : "Copy summary"}
                  </Button>
                </div>

                <div className="task-section-picker task-section-picker--inline">
                  <p className="task-section-picker-label">Insight surface</p>
                  <div className="task-segmented">
                    {researchTopics.map((topic) => (
                      <button
                        key={topic.key}
                        aria-pressed={selectedResearchTopic.key === topic.key}
                        className={selectedResearchTopic.key === topic.key ? "is-active" : ""}
                        onClick={() => setSelectedResearchTopicKey(topic.key)}
                        type="button"
                      >
                        {topic.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="task-section-picker task-section-picker--inline">
                  <p className="task-section-picker-label">Research view</p>
                  <div className="task-segmented">
                    <button type="button" className={researchView === "jump" ? "is-active" : ""} onClick={() => setResearchView("jump")}>
                      Jump to field
                    </button>
                    <button type="button" className={researchView === "analysis" ? "is-active" : ""} onClick={() => setResearchView("analysis")}>
                      Analysis
                    </button>
                  </div>
                </div>

                {researchView === "jump" ? (
                  researchJumpTargets.length ? (
                    <div className="task-research-list task-gamemode-jump-list">
                      {researchJumpTargets.map((match) => (
                        <button
                          key={match.path}
                          className="task-research-match"
                          onClick={() => openResearchTarget(match.path, match.sectionKey)}
                          title={`Jump to ${match.label} - Path: ${match.path} (Current Value: ${match.valuePreview})`}
                          type="button"
                        >
                          <span>{match.label}</span>
                          <strong>{match.valuePreview}</strong>
                          <p>{match.sectionLabel} | {match.path}</p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="task-empty-card">
                      <p>This topic does not have a direct guided jump yet. Use the copied summary when you need the raw paths.</p>
                    </div>
                  )
                ) : (
                  <div className="task-utility-stack">
                    {selectedResearchTopic.stats.length ? (
                      <div className="task-info-grid task-info-grid--stack">
                        {selectedResearchTopic.stats.map((stat) => (
                          <div key={stat.label} className="task-info-card">
                            <p>{stat.label}</p>
                            <strong>{stat.value}</strong>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {selectedResearchTopic.highlights.length ? (
                      <div className="task-research-panel">
                        <p className="task-research-panel-title">{selectedResearchTopic.label}</p>
                        <p className="task-muted">{selectedResearchTopic.subtitle}</p>
                        <div className="task-research-list">
                          {selectedResearchTopic.highlights.map((line) => (
                            <div key={line} className="task-note">
                              <p>{line}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {selectedResearchTopic.collectionLabels.length ? (
                      <div className="task-research-panel">
                        <p className="task-research-panel-title">Captured collections</p>
                        <div className="task-research-list">
                          {selectedResearchTopic.collectionLabels.map((line) => (
                            <div key={line} className="task-note">
                              <p>{line}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {selectedResearchTopic.summaryText ? (
                      <div className="task-stack">
                        <p className="task-muted">Copyable summary</p>
                        <textarea
                          className="task-json-input task-research-copy"
                          readOnly
                          rows={10}
                          value={selectedResearchTopic.summaryText}
                        />
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {contextView === "raw" && hasRawEditor ? (
              <div className="task-stack">
                <div className="task-button-row">
                  <Button variant="flat" onPress={onRevert}>
                    Revert to last saved state
                  </Button>
                  <Button variant="flat" onPress={onReset}>
                    Reset this file to defaults
                  </Button>
                </div>
                <textarea
                  className="task-json-input"
                  rows={12}
                  value={selectedState?.overrideText ?? "{}"}
                  onChange={(event) => onOverrideTextChange(event.currentTarget.value)}
                />
                {selectedState?.overrideTextError ? <div className="task-error">{selectedState.overrideTextError}</div> : null}
                <div className="task-json-preview">
                  <pre>{formatJson(document?.overrides ?? {})}</pre>
                </div>
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {hasVaultTools && utilityPanel === "vault" ? (
        <SectionCard
          className="task-gamemode-vault"
          title="Vaulted augments"
          subtitle="Search by name instead of scrolling through raw numbers. Turn a switch on to vault an augment, or off to allow it again."
        >
          <div className="task-vault-head">
            <Input
              aria-label="Search vaulted augments"
              placeholder="Search augments by name"
              startContent={<Search className="h-4 w-4 text-slate-500" />}
              value={vaultSearch}
              onValueChange={setVaultSearch}
            />
            <p className="task-muted">
              {canLoadMoreVaultResults
                ? `${renderedVaultResults.length} of ${vaultResults.length} shown. Vaulted now: ${vaultState.effectiveVaultedIds.size}`
                : `Currently vaulted: ${vaultState.effectiveVaultedIds.size}`}
            </p>
          </div>
          <div className="task-gamemode-vault-progress-container mt-3 w-full">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Vault Ratio</span>
              <span>{vaultState.effectiveVaultedIds.size} / {vaultState.allTemplates.length} ({vaultState.allTemplates.length > 0 ? ((vaultState.effectiveVaultedIds.size / vaultState.allTemplates.length) * 100).toFixed(0) : 0}%)</span>
            </div>
            <div className="task-gamemode-progress-bar-track">
              <div
                className="task-gamemode-progress-bar-fill"
                style={{ width: `${vaultState.allTemplates.length > 0 ? (vaultState.effectiveVaultedIds.size / vaultState.allTemplates.length) * 100 : 0}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 mt-1">
              <span>{vaultState.allTemplates.length - vaultState.effectiveVaultedIds.size} Active</span>
              <span>{vaultState.effectiveVaultedIds.size} Vaulted</span>
            </div>
          </div>
          {smartFilterChipsForVault}
          <div className="task-vault-list thin-scrollbar">
            {renderedVaultResults.length ? (
              renderedVaultResults.map((entry) => (
                <div key={entry.id} className="task-vault-row">
                  {entry.previewPath ? (
                    <IconPreview
                      previewPath={entry.previewPath}
                      cropX={entry.cropX}
                      cropY={entry.cropY}
                      cropWidth={entry.cropWidth}
                      cropHeight={entry.cropHeight}
                      sourceWidth={entry.sourceWidth}
                      sourceHeight={entry.sourceHeight}
                      className="task-icon-preview"
                      size={52}
                    />
                  ) : (
                    <div className="task-icon-fallback">{entry.id}</div>
                  )}
                  <div className="task-vault-copy">
                    <p>{entry.label}</p>
                    <p>{entry.subtitle}</p>
                  </div>
                  <div className="task-vault-toggle">
                    <p>{entry.isVaulted ? "Vaulted" : "Allowed"}</p>
                    <Switch
                      isSelected={entry.isVaulted}
                      onValueChange={(nextValue) => toggleVaultedAugment(nextValue, entry, vaultState, onSetCollectionValue)}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="task-empty-card">
                <p>No augment matches this search yet.</p>
              </div>
            )}
          </div>
          {canLoadMoreVaultResults ? (
            <div className="task-vault-footer">
              <Button variant="flat" onPress={() => setVisibleVaultLimit((current) => current + GAME_MODE_VAULT_RENDER_BATCH)}>
                Show {Math.min(GAME_MODE_VAULT_RENDER_BATCH, vaultResults.length - renderedVaultResults.length)} more
              </Button>
            </div>
          ) : null}
        </SectionCard>
      ) : null}
      </div>
    </>
  );

  return (
    <div ref={pageMotionRef} className={`task-layout task-layout--gamemode ${isSidebarCollapsed ? "is-sidebar-collapsed" : ""}`}>
      {showSidebar ? (
      <aside className="task-sidebar v2-card thin-scrollbar" data-motion-item>
        {!isSidebarCollapsed ? (
          <Button
            className="task-sidebar-dismiss"
            variant="flat"
            aria-label="Close source browser"
            onPress={() => setSidebarExpanded(false)}
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        ) : null}
        <div className="task-sidebar-head">
          <p className="atelier-kicker">Game Mode</p>
          <h2 className="task-title" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            Choose one source
            <HintPopover hintId="file-picker" />
          </h2>
          <p className="task-copy">
            Start with <strong>Current Preset</strong>. Switch source only when you need a different scope.
          </p>
          <Input
            aria-label="Search game mode files"
            placeholder="Search sources"
            startContent={<Search className="h-4 w-4 text-slate-500" />}
            value={search}
            onValueChange={onSearchChange}
          />
        </div>
        <div className="task-sidebar-body task-sidebar-body--grouped">
          {groupedEntries.length ? (
            groupedEntries.map((group) => (
              <section key={group.key} className="task-sidebar-group">
                <div className="task-sidebar-group-head">
                  <p className="task-sidebar-group-label">{group.label}</p>
                  <p className="task-sidebar-group-copy">{group.copy}</p>
                </div>
                <div className="task-sidebar-group-records">
                  {group.entries.map(({ entry, sourcePresentation, sidebarMeta }) => (
                    <button
                      key={entry.id}
                      className={`task-record ${entry.id === selectedEntry?.id ? "is-active" : ""}`}
                      onClick={() => {
                        onSelectEntry(entry.id);
                        setSidebarExpanded(false);
                      }}
                      type="button"
                    >
                      <p title={sourcePresentation.title}>{sourcePresentation.title}</p>
                      {sidebarMeta ? <p title={sidebarMeta}>{sidebarMeta}</p> : null}
                    </button>
                  ))}
                </div>
              </section>
            ))
          ) : (
            <div className="task-empty-card">
              <p>No game mode sources match this search right now.</p>
            </div>
          )}
        </div>
      </aside>
      ) : null}

      <section className="task-main">
        <Card className="v2-card border-none shadow-none" data-motion-item>
          <CardHeader className="task-header">
            <div>
              <p className="atelier-kicker">Game Mode</p>
              <h3 className="task-title">{selectedSource.title ?? "Choose a game mode source"}</h3>
              <p className="task-copy">
                {document?.simpleSettings?.whatThisConfigDoes ??
                  selectedSource.heroCopy ??
                  "Choose one source from the left, then edit one section at a time."}
              </p>
            </div>
            <div className="task-header-actions">
              {isSidebarCollapsed && !document ? (
                <Button variant="flat" onPress={() => setSidebarExpanded(true)}>
                  Browse sources
                </Button>
              ) : null}
              <Button variant="flat" startContent={<RefreshCw className="h-4 w-4" />} onPress={onReload}>
                Reload
              </Button>
              <Button variant="flat" onPress={onReset}>
                Reset this file
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
                <p>Loading the selected game mode file...</p>
              </div>
            ) : null}
            {selectedState?.error ? <div className="task-error">{selectedState.error}</div> : null}

            {document ? (
              <>
                {embedded ? (
                  <div className="task-gamemode-control-column task-gamemode-control-column--embedded" style={supportColumnStyle}>
                    {supportPanels}
                  </div>
                ) : null}
                <div className="task-gamemode-studio" style={studioLayoutStyle}>
                {isSidebarCollapsed && !embedded ? (
                  <div className="task-focus-selector-bar">
                    <div className="task-focus-selector-copy">
                      <div className="task-focus-selector-line">
                        <span className="task-focus-selector-kicker">Active source</span>
                        <strong>{selectedSource.title ?? "Choose one game mode source"}</strong>
                      </div>
                      <span>{selectedSource.heroCopy ?? selectedEntry?.subtitle ?? "Keep one rules source locked in view, then edit one category at a time."}</span>
                    </div>
                    <Button variant="flat" onPress={() => setSidebarExpanded(true)}>
                      Change source
                    </Button>
                  </div>
                ) : null}
                {!embedded ? (
                  <div className="task-gamemode-control-column" style={supportColumnStyle}>
                  <SectionCard
                    className="task-gamemode-source-summary"
                    title={selectedSource.title ?? "Choose one game mode source"}
                    subtitle={
                      selectedSource.heroCopy
                      ?? selectedEntry?.subtitle
                      ?? "Keep one rules source locked in view, then edit one category at a time."
                    }
                  >
                    <div className="task-gamemode-source-summary-meta">
                      <div className="task-gamemode-source-summary-chip">
                        <span>Best for</span>
                        <strong>{selectedSource.bestFor}</strong>
                      </div>
                      <div className="task-gamemode-source-summary-chip" title={selectedSource.applyTimingBody}>
                        <span>Applies</span>
                        <strong>{selectedSource.applyTimingTitle}</strong>
                      </div>
                    </div>
                    <div className="task-gamemode-source-summary-actions">
                      <Button variant="flat" onPress={() => setSidebarExpanded(true)}>
                        Change source
                      </Button>
                    </div>
                  </SectionCard>

                  {selectedSource.sourceKey === "current_lobby" ? (
                    <SectionCard
                      className="task-gamemode-snapshot-card"
                      title="Copy this live snapshot"
                      subtitle="Use the live lobby as a reference, then copy the overlapping values into a safer restart-first target before you save."
                    >
                      {snapshotCopyTargets.length ? (
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                          <Select
                            label="Restart-safe target"
                            value={selectedSnapshotTargetId}
                            options={snapshotCopyTargets.map((target) => ({
                              label: target.label,
                              value: target.id,
                              description: target.description,
                            }))}
                            onValueChange={setSelectedSnapshotTargetId}
                            description="Presets are the normal choice. Use the lobby structure file only when you need to carry team or player-cap style values forward."
                          />
                          <div className="flex items-end">
                            <Button
                              color="secondary"
                              isDisabled={!selectedSnapshotTargetId || copySnapshotBusy}
                              onPress={() => onCopySnapshotToTarget(selectedSnapshotTargetId)}
                            >
                              {copySnapshotBusy ? "Copying..." : "Copy into target"}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="task-empty-card">
                          <p>No restart-safe target is ready yet. Open Current Preset or a saved preset once, then come back here.</p>
                        </div>
                      )}
                    </SectionCard>
                  ) : null}

                  {hasContextTools && utilityPanel === "context" ? (
                    <SectionCard
                      className="task-gamemode-context-card"
                      title="Context and utilities"
                      subtitle="Keep this secondary. Stay in the section stack for normal edits, then use one helper surface here when you need extra context."
                      actions={<HintPopover hintId="advanced-section" />}
                    >
                      <div className="task-stack">
                        {contextViews.length > 1 ? (
                          <div className="task-section-picker task-section-picker--inline">
                            <p className="task-section-picker-label">Utility surface</p>
                            <div className="task-segmented">
                              {contextViews.map((entry) => (
                                <button
                                  key={entry.key}
                                  aria-pressed={contextView === entry.key}
                                  className={contextView === entry.key ? "is-active" : ""}
                                  onClick={() => setContextView(entry.key)}
                                  type="button"
                                >
                                  {entry.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {contextView === "overview" && hasOverviewContext ? (
                          <div className="task-utility-stack">
                            {modeProbe ? (
                              <div className="task-note task-gamemode-probe-note">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p>
                                      Live mode detected: <strong>{modeProbe.currentLabel}</strong>
                                      {modeProbe.currentGameModeId !== null ? ` (ID ${modeProbe.currentGameModeId})` : ""}
                                    </p>
                                    <p className="mt-2">Known modes: {modeProbe.entryLabels.join(", ")}</p>
                                  </div>
                                  <Button size="sm" variant="flat" onPress={onRefreshGameModeIndex}>
                                    Refresh mode probe
                                  </Button>
                                </div>
                              </div>
                            ) : null}

                            {selectedSource.bridgeCopy ? (
                              <div className="task-note task-gamemode-bridge-note">
                                <p>{selectedSource.bridgeCopy}</p>
                              </div>
                            ) : null}

                            {showBotSettingsNote ? (
                              <div className="task-note task-gamemode-bot-note">
                                <p>
                                  Bot settings live in <strong>Live Snapshot</strong>. Open that source when you want bot count,
                                  difficulty, or other lobby-owned values, then copy what you need into a restart-safe target.
                                </p>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {contextView === "research" && selectedResearchTopic ? (
                          <div className="task-stack">
                            <div className="task-research-actions">
                              <Button
                                size="sm"
                                color="secondary"
                                onPress={() => openResearchTarget(researchJumpTargets[0]?.path, researchJumpTargets[0]?.sectionKey)}
                              >
                                Open editable fields
                              </Button>
                              <Button
                                size="sm"
                                variant="flat"
                                onPress={() => copyResearchSummary(selectedResearchTopic.key, selectedResearchTopic.summaryText, setCopiedResearchTopicKey)}
                              >
                                {copiedResearchTopicKey === selectedResearchTopic.key ? "Copied" : "Copy summary"}
                              </Button>
                            </div>

                            <div className="task-section-picker task-section-picker--inline">
                              <p className="task-section-picker-label">Insight surface</p>
                              <div className="task-segmented">
                                {researchTopics.map((topic) => (
                                  <button
                                    key={topic.key}
                                    aria-pressed={selectedResearchTopic.key === topic.key}
                                    className={selectedResearchTopic.key === topic.key ? "is-active" : ""}
                                    onClick={() => setSelectedResearchTopicKey(topic.key)}
                                    type="button"
                                  >
                                    {topic.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="task-section-picker task-section-picker--inline">
                              <p className="task-section-picker-label">Research view</p>
                              <div className="task-segmented">
                                <button type="button" className={researchView === "jump" ? "is-active" : ""} onClick={() => setResearchView("jump")}>
                                  Jump to field
                                </button>
                                <button type="button" className={researchView === "analysis" ? "is-active" : ""} onClick={() => setResearchView("analysis")}>
                                  Analysis
                                </button>
                              </div>
                            </div>

                            {researchView === "jump" ? (
                              researchJumpTargets.length ? (
                                <div className="task-research-list task-gamemode-jump-list">
                                  {researchJumpTargets.map((match) => (
                                    <button
                                      key={match.path}
                                      className="task-research-match"
                                      onClick={() => openResearchTarget(match.path, match.sectionKey)}
                                      title={`Jump to ${match.label} - Path: ${match.path} (Current Value: ${match.valuePreview})`}
                                      type="button"
                                    >
                                      <span>{match.label}</span>
                                      <strong>{match.valuePreview}</strong>
                                      <p>{match.sectionLabel} | {match.path}</p>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="task-empty-card">
                                  <p>This topic does not have a direct guided jump yet. Use the copied summary when you need the raw paths.</p>
                                </div>
                              )
                            ) : (
                              <div className="task-utility-stack">
                                {selectedResearchTopic.stats.length ? (
                                  <div className="task-info-grid task-info-grid--stack">
                                    {selectedResearchTopic.stats.map((stat) => (
                                      <div key={stat.label} className="task-info-card">
                                        <p>{stat.label}</p>
                                        <strong>{stat.value}</strong>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}

                                {selectedResearchTopic.highlights.length ? (
                                  <div className="task-research-panel">
                                    <p className="task-research-panel-title">{selectedResearchTopic.label}</p>
                                    <p className="task-muted">{selectedResearchTopic.subtitle}</p>
                                    <div className="task-research-list">
                                      {selectedResearchTopic.highlights.map((line) => (
                                        <div key={line} className="task-note">
                                          <p>{line}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}

                                {selectedResearchTopic.collectionLabels.length ? (
                                  <div className="task-research-panel">
                                    <p className="task-research-panel-title">Captured collections</p>
                                    <div className="task-research-list">
                                      {selectedResearchTopic.collectionLabels.map((line) => (
                                        <div key={line} className="task-note">
                                          <p>{line}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}

                                {selectedResearchTopic.summaryText ? (
                                  <div className="task-stack">
                                    <p className="task-muted">Copyable summary</p>
                                    <textarea
                                      className="task-json-input task-research-copy"
                                      readOnly
                                      rows={10}
                                      value={selectedResearchTopic.summaryText}
                                    />
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </div>
                        ) : null}

                        {contextView === "raw" && hasRawEditor ? (
                          <div className="task-stack">
                            <div className="task-button-row">
                              <Button variant="flat" onPress={onRevert}>
                                Revert to last saved state
                              </Button>
                              <Button variant="flat" onPress={onReset}>
                                Reset this file to defaults
                              </Button>
                            </div>
                            <textarea
                              className="task-json-input"
                              rows={12}
                              value={selectedState?.overrideText ?? "{}"}
                              onChange={(event) => onOverrideTextChange(event.currentTarget.value)}
                            />
                            {selectedState?.overrideTextError ? <div className="task-error">{selectedState.overrideTextError}</div> : null}
                            <div className="task-json-preview">
                              <pre>{formatJson(document.overrides ?? {})}</pre>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </SectionCard>
                  ) : null}

                  {hasVaultTools && utilityPanel === "vault" ? (
                    <SectionCard
                      className="task-gamemode-vault"
                      title="Vaulted augments"
                      subtitle="Search by name instead of scrolling through raw numbers. Turn a switch on to vault an augment, or off to allow it again."
                    >
                      <div className="task-vault-head">
                        <Input
                          aria-label="Search vaulted augments"
                          placeholder="Search augments by name"
                          startContent={<Search className="h-4 w-4 text-slate-500" />}
                          value={vaultSearch}
                          onValueChange={setVaultSearch}
                        />
                        <p className="task-muted">
                          {canLoadMoreVaultResults
                            ? `${renderedVaultResults.length} of ${vaultResults.length} shown. Vaulted now: ${vaultState.effectiveVaultedIds.size}`
                            : `Currently vaulted: ${vaultState.effectiveVaultedIds.size}`}
                        </p>
                      </div>
                      <div className="task-gamemode-vault-progress-container mt-3 w-full">
                        <div className="flex justify-between text-xs text-slate-400 mb-1">
                          <span>Vault Ratio</span>
                          <span>{vaultState.effectiveVaultedIds.size} / {vaultState.allTemplates.length} ({vaultState.allTemplates.length > 0 ? ((vaultState.effectiveVaultedIds.size / vaultState.allTemplates.length) * 100).toFixed(0) : 0}%)</span>
                        </div>
                        <div className="task-gamemode-progress-bar-track">
                          <div
                            className="task-gamemode-progress-bar-fill"
                            style={{ width: `${vaultState.allTemplates.length > 0 ? (vaultState.effectiveVaultedIds.size / vaultState.allTemplates.length) * 100 : 0}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                          <span>{vaultState.allTemplates.length - vaultState.effectiveVaultedIds.size} Active</span>
                          <span>{vaultState.effectiveVaultedIds.size} Vaulted</span>
                        </div>
                      </div>
                      {smartFilterChipsForVault}
                      <div className="task-vault-list thin-scrollbar">
                        {renderedVaultResults.length ? (
                          renderedVaultResults.map((entry) => {
                            return (
                              <div key={entry.id} className="task-vault-row">
                                {entry.previewPath ? (
                                  <IconPreview
                                    previewPath={entry.previewPath}
                                    cropX={entry.cropX}
                                    cropY={entry.cropY}
                                    cropWidth={entry.cropWidth}
                                    cropHeight={entry.cropHeight}
                                    sourceWidth={entry.sourceWidth}
                                    sourceHeight={entry.sourceHeight}
                                    className="task-icon-preview"
                                    size={52}
                                  />
                                ) : (
                                  <div className="task-icon-fallback">{entry.id}</div>
                                )}
                                <div className="task-vault-copy">
                                  <p>{entry.label}</p>
                                  <p>{entry.subtitle}</p>
                                </div>
                                <div className="task-vault-toggle">
                                  <p>{entry.isVaulted ? "Vaulted" : "Allowed"}</p>
                                  <Switch
                                    isSelected={entry.isVaulted}
                                    onValueChange={(nextValue) => toggleVaultedAugment(nextValue, entry, vaultState, onSetCollectionValue)}
                                  />
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="task-empty-card">
                            <p>No augment matches this search yet.</p>
                          </div>
                        )}
                      </div>
                      {canLoadMoreVaultResults ? (
                        <div className="task-vault-footer">
                          <Button variant="flat" onPress={() => setVisibleVaultLimit((current) => current + GAME_MODE_VAULT_RENDER_BATCH)}>
                            Show {Math.min(GAME_MODE_VAULT_RENDER_BATCH, vaultResults.length - renderedVaultResults.length)} more
                          </Button>
                        </div>
                      ) : null}
                    </SectionCard>
                  ) : null}
                </div>
                ) : null}

                <div className="task-gamemode-edit-column" style={editColumnStyle}>
                  <div className="task-gamemode-top-controls" style={topControlsStyle}>
                    {availableSections.length ? (
                      <div className="task-section-picker task-section-picker--inline task-gamemode-section-picker" style={pickerStackStyle}>
                        <div className="task-segmented">
                          {availableSections.map((sectionKey) => (
                            <button
                              key={sectionKey}
                              aria-pressed={selectedSection === sectionKey}
                              className={selectedSection === sectionKey ? "is-active" : ""}
                              onClick={() => setSelectedSection(sectionKey)}
                              style={segmentedButtonStyle}
                              type="button"
                            >
                              {getSectionLabel(sectionKey)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {utilityViews.length > 1 ? (
                      <div className="task-section-picker task-section-picker--inline task-gamemode-utility-nav" style={pickerStackStyle}>
                        <div className="task-segmented">
                          {utilityViews.map((view) => (
                            <button
                              key={view.key}
                              aria-pressed={utilityPanel === view.key}
                              className={utilityPanel === view.key ? "is-active" : ""}
                              onClick={() => setUtilityPanel(view.key)}
                              style={segmentedButtonStyle}
                              type="button"
                            >
                              {view.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {mode === "guided" && hiddenGuidedNoiseCount ? (
                      <div className="task-gamemode-guided-note">
                        <p className="task-muted">
                          Start with named controls. Raw stays tucked away for indexed paths only.
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="task-gamemode-meta-row">
                    <div className="task-gamemode-section-heading" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span>Editing</span>
                      <strong>{getSectionLabel(selectedSection)}</strong>
                      {selectedSection === "zone" ? <HintPopover hintId="match-rules-zone" /> : null}
                      {selectedSection === "bots" ? <HintPopover hintId="match-rules-bots" /> : null}
                    </div>
                    {(activeSectionHasFields && activeSectionCollections.length) ? (
                      <div className="task-gamemode-surface-picker" style={pickerStackStyle}>
                        <span>View</span>
                        <div className="task-segmented">
                          <button
                            type="button"
                            className={sectionSurface === "fields" ? "is-active" : ""}
                            aria-pressed={sectionSurface === "fields"}
                            onClick={() => setSectionSurface("fields")}
                            style={segmentedButtonStyle}
                          >
                            Editable fields
                          </button>
                          <button
                            type="button"
                            className={sectionSurface === "collections" ? "is-active" : ""}
                            aria-pressed={sectionSurface === "collections"}
                            onClick={() => setSectionSurface("collections")}
                            style={segmentedButtonStyle}
                          >
                            Collections ({activeSectionCollections.length})
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div ref={sectionStackRef} className="task-section-stack task-gamemode-section-stack">
                    <div ref={sectionTransitionRef}>
                      <div ref={sectionExpandedRef}>
                    {activeSectionHasFields && sectionSurface === "fields"
                      ? renderSection(
                          selectedSection,
                          getSectionLabel(selectedSection),
                          sectionMap[selectedSection],
                          document,
                          baseDocument,
                          selectedState,
                          onUpdateValue,
                          onResetValue,
                          focusedResearchPath,
                        )
                      : null}
                    {activeSectionCollections.length && sectionSurface === "collections"
                      ? activeSectionCollections.map((collection) =>
                          renderNamedCollectionSection(collection, onSetCollectionValue),
                        )
                      : null}
                    {!activeSectionHasFields && !activeSectionCollections.length ? (
                      <SectionCard
                        title={getSectionLabel(selectedSection)}
                        subtitle={describeSection(getSectionLabel(selectedSection))}
                      >
                        <div className="task-empty-card">
                          <p>
                            This source does not expose editable {getSectionLabel(selectedSection).toLowerCase()} values yet.
                          </p>
                        </div>
                      </SectionCard>
                    ) : null}
                    </div>
                  </div>
                </div>
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

function renderSection(
  sectionKey: GameModeSectionKey,
  title: string,
  entries: SectionEntry[],
  document: RuntimeDocument | undefined,
  baseDocument: RuntimeDocument | undefined,
  selectedState: LoadedEntryState | undefined,
  onUpdateValue: (item: { path: string; valueType?: string; defaultValue?: JsonValue }, value: string | boolean) => void,
  onResetValue: (path: string) => void,
  focusedResearchPath: string,
) {
  if (!document || !entries.length) {
    return null;
  }

  return (
    <div id={buildGameModeSectionAnchorId(sectionKey)}>
      <GameModeSectionCard
        sectionKey={sectionKey}
        title={title}
        entries={entries}
        document={document}
        baseDocument={baseDocument}
        selectedState={selectedState}
        onUpdateValue={onUpdateValue}
        onResetValue={onResetValue}
        focusedResearchPath={focusedResearchPath}
      />
    </div>
  );
}

/** Memoized game mode value browser row. */
const GameModeValueRow = memo(function GameModeValueRow({
  entry,
  currentValue,
  standardValue,
  isActive,
  isResearchFocused,
  onSelect,
}: {
  entry: SectionEntry;
  currentValue: JsonValue | undefined;
  standardValue: JsonValue | undefined;
  isActive: boolean;
  isResearchFocused: boolean;
  onSelect: (path: string) => void;
}) {
  const handleClick = useCallback(() => onSelect(entry.path), [entry.path, onSelect]);
  const state = useMemo(
    () => summarizeGameModeRowState(currentValue, standardValue),
    [currentValue, standardValue],
  );
  return (
    <button
      key={entry.path}
      id={buildGameModeFieldAnchorId(entry.path)}
      type="button"
      className={`task-value-browser-row ${isActive ? "is-active" : ""} ${isResearchFocused ? "is-research-focused" : ""}`}
      onClick={handleClick}
    >
      <div>
        <p>{entry.name}</p>
        <span>{entry.description ?? entry.path}</span>
      </div>
      <div className="task-value-browser-row-values">
        <span>
          <em>{state.label}</em>
          <strong>{state.value}</strong>
        </span>
      </div>
    </button>
  );
});

const GameModeSectionCard = memo(function GameModeSectionCard({
  sectionKey,
  title,
  entries,
  document,
  baseDocument,
  selectedState,
  onUpdateValue,
  onResetValue,
  focusedResearchPath,
}: {
  sectionKey: GameModeSectionKey;
  title: string;
  entries: SectionEntry[];
  document: RuntimeDocument;
  baseDocument: RuntimeDocument | undefined;
  selectedState: LoadedEntryState | undefined;
  onUpdateValue: (item: { path: string; valueType?: string; defaultValue?: JsonValue }, value: string | boolean) => void;
  onResetValue: (path: string) => void;
  focusedResearchPath: string;
}) {
  const facets = useMemo(() => buildGameModeFieldFacets(sectionKey, entries), [entries, sectionKey]);
  const [activeFacetKey, setActiveFacetKey] = useState<string>(() => pickDefaultGameModeFieldFacetKey(facets));
  const [fieldSearch, setFieldSearch] = useState("");
  const [activePath, setActivePath] = useState("");

  useEffect(() => {
    if (!facets.length) {
      if (activeFacetKey !== "all") {
        setActiveFacetKey("all");
      }
      return;
    }
    if (!facets.some((facet) => facet.key === activeFacetKey)) {
      setActiveFacetKey(pickDefaultGameModeFieldFacetKey(facets));
    }
  }, [activeFacetKey, facets]);

  const activeFacet = facets.find((facet) => facet.key === activeFacetKey) ?? facets[0] ?? null;
  const searchTerm = fieldSearch.trim().toLowerCase();
  const visibleEntries = useMemo(() => {
    const sourceEntries = activeFacet?.entries ?? entries;
    if (!searchTerm) {
      return sourceEntries;
    }
    return sourceEntries.filter((entry) =>
      [
        entry.name,
        entry.path,
        entry.description,
        entry.category,
        stringifyValue(entry.currentValue),
        stringifyValue(entry.defaultValue),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(searchTerm),
    );
  }, [activeFacet?.entries, entries, searchTerm]);
  const activeEntry = useMemo(
    () => visibleEntries.find((entry) => entry.path === activePath) ?? visibleEntries[0] ?? null,
    [activePath, visibleEntries],
  );
  const resetLabel = facets.length > 1 ? "Reset shown values" : "Reset section";
  const researchFacet = useMemo(
    () => (focusedResearchPath ? facets.find((facet) => facet.entries.some((entry) => entry.path === focusedResearchPath)) ?? null : null),
    [facets, focusedResearchPath],
  );

  useEffect(() => {
    setFieldSearch("");
  }, [activeFacetKey, sectionKey]);

  useEffect(() => {
    if (researchFacet && researchFacet.key !== activeFacetKey) {
      setActiveFacetKey(researchFacet.key);
    }
  }, [activeFacetKey, researchFacet]);

  useEffect(() => {
    if (!focusedResearchPath) {
      return;
    }
    if (!visibleEntries.some((entry) => entry.path === focusedResearchPath)) {
      return;
    }
    setActivePath(focusedResearchPath);
  }, [focusedResearchPath, visibleEntries]);

  useEffect(() => {
    if (!visibleEntries.length) {
      if (activePath) {
        setActivePath("");
      }
      return;
    }
    if (!visibleEntries.some((entry) => entry.path === activePath)) {
      setActivePath(visibleEntries[0]?.path ?? "");
    }
  }, [activePath, visibleEntries]);

  return (
    <SectionCard
      title={title}
      subtitle={describeSection(title)}
      actions={
        <div className="task-section-actions-inline">
          {facets.length > 1 ? (
            <span className="task-section-inline-status">
              Showing {visibleEntries.length} / {entries.length}
            </span>
          ) : null}
          <Button size="sm" variant="flat" onPress={() => resetSectionValues(visibleEntries, onResetValue)}>
            {resetLabel}
          </Button>
        </div>
      }
    >
      <div className="task-value-browser task-value-browser--editor task-gamemode-value-browser">
        {facets.length > 1 ? (
          <div className="task-gamemode-categories-grid mb-6" role="tablist" aria-label={`${title} value groups`}>
            {facets.map((facet) => (
              <button
                key={facet.key}
                type="button"
                aria-pressed={activeFacet?.key === facet.key}
                className={`task-gamemode-category-card task-value-browser-tab ${activeFacet?.key === facet.key ? "is-active" : ""}`}
                onClick={() => setActiveFacetKey(facet.key)}
              >
                <div className="task-gamemode-category-card-header">
                  <span className="task-gamemode-category-title">{facet.label}</span>
                  <span className="task-gamemode-category-badge">{facet.entries.length} fields</span>
                </div>
                <p className="task-gamemode-category-desc">{describeCategory(facet.key)}</p>
              </button>
            ))}
          </div>
        ) : null}

        {activeFacet?.entries.length > 6 ? (
          <div className="task-value-browser-toolbar-search task-gamemode-value-search">
            <Input
              aria-label={`Search ${title} values`}
              placeholder={`Search ${activeFacet.label.toLowerCase()}...`}
              value={fieldSearch}
              onValueChange={setFieldSearch}
            />
          </div>
        ) : null}

        <div className="task-value-browser-main task-value-browser-main--editor">
          <div className="task-value-browser-detail-shell">
            <div className="task-value-browser-entry-list thin-scrollbar">
              {visibleEntries.map((entry) => {
                const currentValue = resolveSimpleValue(baseDocument ?? document, entry, selectedState?.draftOverrides ?? {});
                return (
                  <GameModeValueRow
                    key={entry.path}
                    entry={entry}
                    currentValue={currentValue}
                    standardValue={entry.defaultValue}
                    isActive={activeEntry?.path === entry.path}
                    isResearchFocused={focusedResearchPath === entry.path}
                    onSelect={setActivePath}
                  />
                );
              })}
              {!visibleEntries.length ? (
                <div className="task-empty-card">
                  <p>No fields in this group match that search.</p>
                </div>
              ) : null}
            </div>

            <div className="task-value-browser-detail">
              {activeEntry ? (
                <GameModeInspectorField
                  entry={activeEntry}
                  value={resolveSimpleValue(baseDocument ?? document, activeEntry, selectedState?.draftOverrides ?? {})}
                  isResearchFocused={focusedResearchPath === activeEntry.path}
                  onChange={(value) =>
                    onUpdateValue(
                      {
                        path: activeEntry.path,
                        valueType: activeEntry.valueType,
                        defaultValue: activeEntry.defaultValue,
                      },
                      value,
                    )
                  }
                  onReset={() => onResetValue(activeEntry.path)}
                />
              ) : (
                <div className="task-empty-card">
                  <p>Choose one field from the list to inspect and edit it here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
});

function GameModeInspectorField({
  isResearchFocused,
  entry,
  value,
  onChange,
  onReset,
}: {
  isResearchFocused?: boolean;
  entry: SectionEntry;
  value: JsonValue | undefined;
  onChange: (value: string | boolean) => void;
  onReset: () => void;
}) {
  const type = (entry.valueType ?? "string").toLowerCase();
  const isDefault = JSON.stringify(value ?? null) === JSON.stringify(entry.defaultValue ?? null);
  const verifiedChoices = entry.verifiedChoices ?? [];
  return (
    <div className={`task-quick-control task-gamemode-inspector ${isResearchFocused ? "is-research-focused" : ""}`}>
      <div className="task-quick-control-head">
        <div className="task-quick-control-copy min-w-0 flex-1 space-y-1">
          <p className="task-quick-control-title break-words text-[1rem] font-semibold text-slate-100">{entry.name}</p>
          <p className="task-quick-control-description break-words text-[0.84rem] leading-6 text-slate-500">
            {entry.description ?? "A generated game mode value."}
          </p>
          <div className="task-quick-control-meta">
            <span>
              <strong>Current</strong>
              <em>{stringifyValue(value)}</em>
            </span>
            <span>
              <strong>Standard</strong>
              <em>{stringifyValue(entry.defaultValue)}</em>
            </span>
          </div>
          <div className="task-value-meta-badges">
            {entry.category ? <span className="task-value-meta-badge">{entry.category}</span> : null}
            {entry.valueRange ? <span className="task-value-meta-badge">{formatRange(entry.valueRange)}</span> : null}
            {entry.riskLevel === "experimental" ? (
              <span className="task-value-meta-badge">Experimental</span>
            ) : null}
            <span className="task-value-meta-badge">{entry.path}</span>
          </div>
        </div>
        <Button isDisabled={isDefault} size="sm" variant="flat" onPress={onReset}>
          Reset to standard
        </Button>
      </div>
      <div className="task-quick-control-value mt-4">
        {type === "boolean" ? (
          <div className="task-value-switch task-gamemode-switch">
            <span>{Boolean(value) ? "On" : "Off"}</span>
            <div className="flex items-center gap-2">
              <Switch isSelected={Boolean(value)} onValueChange={onChange} />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {verifiedChoices.length ? (
              <Select
                aria-label={entry.name}
                label={entry.name}
                value={stringifyValue(value)}
                options={verifiedChoices.map((choice) => ({
                  label: choice.label,
                  value: stringifyValue(choice.value),
                  description: choice.description,
                }))}
                onValueChange={onChange}
                description="Verified choices are the safest known in-game options for this setting."
              />
            ) : (
              <Input
                aria-label={entry.name}
                label={entry.name}
                type={type === "integer" || type === "number" ? "number" : "text"}
                value={stringifyValue(value)}
                onValueChange={onChange}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function renderNamedCollectionSection(
  collection: NamedCollectionSection,
  onSetCollectionValue: (path: string, value: JsonValue[], defaultValue?: JsonValue) => void,
) {
  if (!collection.rows.length) {
    return null;
  }

  return (
    <SectionCard
      key={collection.path}
      title={collection.title}
      subtitle={collection.subtitle}
      actions={
        collection.editable && collection.defaultValues ? (
          <Button
            size="sm"
            variant="flat"
            onPress={() => onSetCollectionValue(collection.path, collection.defaultValues ?? [], collection.defaultValues)}
          >
            Reset list
          </Button>
        ) : null
      }
    >
      <div className="task-vault-list thin-scrollbar">
        {collection.rows.map((row) => (
          <div key={row.key} className="task-vault-row">
            {row.previewPath ? (
              <IconPreview
                previewPath={row.previewPath}
                cropX={row.cropX}
                cropY={row.cropY}
                cropWidth={row.cropWidth}
                cropHeight={row.cropHeight}
                sourceWidth={row.sourceWidth}
                sourceHeight={row.sourceHeight}
                className="task-icon-preview"
                size={52}
              />
            ) : (
              <div className="task-icon-fallback">{buildReferenceFallback(row.label)}</div>
            )}
            <div className="task-vault-copy">
              <p>{row.label}</p>
              <p>{row.subtitle}</p>
            </div>
            <div className="task-vault-toggle">
              <p>
                {collection.editable ? (row.enabled ? "Allowed" : "Removed") : "Shown in this mode"}
              </p>
              {collection.editable ? (
                <Switch
                  isSelected={Boolean(row.enabled)}
                  onValueChange={(nextValue) => toggleNamedCollectionEntry(nextValue, row, collection, onSetCollectionValue)}
                />
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function buildGameModeSections(entries: SectionEntry[]) {
  const sections = {
    rules: [] as SectionEntry[],
    zone: [] as SectionEntry[],
    lobby: [] as SectionEntry[],
    bots: [] as SectionEntry[],
    presets: [] as SectionEntry[],
    experimental: [] as SectionEntry[],
  };

  for (const entry of entries) {
    const bucket = classifyGameModeEntry(entry);
    sections[bucket].push(entry);
  }

  return sections;
}

function buildAdvancedGameModeEntries(
  document: RuntimeDocument | undefined,
  existingEntries: SectionEntry[],
  mode: ExperienceMode,
): SectionEntry[] {
  if (!document) {
    return [];
  }

  const seenPaths = new Set(
    existingEntries
      .map((entry) => entry.path)
      .filter((path): path is string => typeof path === "string" && path.trim().length > 0),
  );
  const collectionRoots = new Set<string>();
  for (const editor of document.collectionEditors ?? []) {
    if (typeof editor.path === "string" && editor.path.trim()) {
      collectionRoots.add(editor.path.trim());
    }
  }
  for (const collection of document.namedCollections ?? []) {
    if (typeof collection.collectionId === "string" && collection.collectionId.trim()) {
      collectionRoots.add(collection.collectionId.trim());
    }
  }

  return (document.advanced?.fields ?? [])
    .filter((field) => isUsableGameModeAdvancedField(field, seenPaths, collectionRoots, mode))
    .map((field) => ({
      name: field.label ?? buildGameModeAdvancedLabel(field.path),
      path: field.path,
      editable: field.editable !== false,
      valueType: field.valueType,
      description: field.description ?? `Exported runtime value at ${field.path}.`,
      defaultValue: field.defaultValue,
      currentValue: field.effectiveValue ?? field.currentValue ?? field.defaultValue,
      valueRange: field.valueRange,
      vanillaRange: field.vanillaRange,
      extendedRange: field.extendedRange,
      riskLevel: field.riskLevel,
      verifiedChoices: field.verifiedChoices,
      category: field.category ?? inferGameModeAdvancedCategory(field.path),
    }));
}

function isUsableGameModeAdvancedField(
  field: AdvancedField,
  seenPaths: Set<string>,
  collectionRoots: Set<string>,
  mode: ExperienceMode,
) {
  if (typeof field.path !== "string" || !field.path.trim()) {
    return false;
  }

  const normalizedPath = field.path.trim();
  if (field.editable === false || seenPaths.has(normalizedPath)) {
    return false;
  }
  if (normalizedPath === "vaultedAugments" || isVaultedAugmentPath(normalizedPath)) {
    return false;
  }
  if (mode === "guided" && isGuidedNoisePath(normalizedPath)) {
    return false;
  }

  for (const root of collectionRoots) {
    if (
      normalizedPath === root ||
      normalizedPath.startsWith(`${root}[`) ||
      normalizedPath.startsWith(`${root}.`)
    ) {
      return false;
    }
  }

  return true;
}

function buildGameModeAdvancedLabel(path: string) {
  const segments = path
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const tail = segments.slice(-2);
  if (!tail.length) {
    return humanizeGameModePath(path);
  }
  return tail.map((segment) => humanizeGameModePath(segment)).join(" / ");
}

function buildGameModeFieldFacets(sectionKey: GameModeSectionKey, entries: SectionEntry[]) {
  const groups = new Map<string, { key: string; label: string; entries: SectionEntry[] }>();
  for (const entry of entries) {
    const key = classifyGameModeFieldFacet(sectionKey, entry);
    const label = getGameModeFieldFacetLabel(key);
    const existing = groups.get(key);
    if (existing) {
      existing.entries.push(entry);
      continue;
    }
    groups.set(key, { key, label, entries: [entry] });
  }

  return Array.from(groups.values()).sort((left, right) => {
    const priorityDelta = getGameModeFieldFacetPriority(left.key) - getGameModeFieldFacetPriority(right.key);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return left.label.localeCompare(right.label);
  });
}

function classifyGameModeFieldFacet(sectionKey: GameModeSectionKey, entry: SectionEntry) {
  const text = `${entry.category ?? ""} ${entry.name ?? ""} ${entry.path ?? ""} ${entry.description ?? ""}`.toLowerCase();
  const valueType = (entry.valueType ?? "").toLowerCase();
  const defaultText = stringifyValue(entry.defaultValue ?? "").toLowerCase();
  const currentText = stringifyValue(entry.currentValue ?? entry.defaultValue ?? "").toLowerCase();
  const valueText = `${defaultText} ${currentText}`;

  if (/\b(zone|ring|circle|storm|wall|shrink)\b/.test(text)) {
    return "zone-shape";
  }
  if (/\b(bot|ai|difficulty)\b/.test(text)) {
    return "bots";
  }
  if (/\b(player|team|party|slot|lobby|queue)\b/.test(text)) {
    return "players";
  }
  if (/\b(spawn|respawn|revive|death)\b/.test(text)) {
    return "spawns";
  }
  if (/\b(timer|time|duration|cooldown|delay)\b/.test(text)) {
    return "timers";
  }
  if (/\b(enable|disable|allow|force|lock)\b/.test(text)) {
    return "switches";
  }
  if (/\b(max|min|limit|count|cap|amount|slots?)\b/.test(text)) {
    return "limits";
  }
  if (valueType === "boolean") {
    return "switches";
  }
  if (valueType === "integer" || valueType === "number") {
    return "numbers";
  }
  if (/\b(passiveso|ability|augment|item:|status|buff|modifier|template)\b/.test(valueText)) {
    return "references";
  }
  if (/\b(augment|consumable|item|loot|drop|reward|draft|select)\b/.test(text)) {
    return "economy";
  }
  if (/\b(score|win|round|match|phase|flow|victory)\b/.test(text)) {
    return "match-flow";
  }
  if (/\b(damage|health|shield|stat|scaling|power)\b/.test(text)) {
    return "combat";
  }

  switch (sectionKey) {
    case "zone":
      return "zone-shape";
    case "bots":
      return "bots";
    case "lobby":
      return "players";
    case "presets":
      return "match-flow";
    default:
      return "general";
  }
}

function getGameModeFieldFacetLabel(key: string) {
  switch (key) {
    case "zone-shape":
      return "Zone";
    case "bots":
      return "Bots";
    case "players":
      return "Players";
    case "spawns":
      return "Spawns";
    case "timers":
      return "Timers";
    case "switches":
      return "Core switches";
    case "limits":
      return "Limits";
    case "numbers":
      return "Numbers";
    case "references":
      return "Linked assets";
    case "economy":
      return "Augments and loot";
    case "match-flow":
      return "Match flow";
    case "combat":
      return "Combat";
    default:
      return "General";
  }
}

function getGameModeFieldFacetPriority(key: string) {
  switch (key) {
    case "general":
      return 0;
    case "match-flow":
      return 1;
    case "timers":
      return 2;
    case "switches":
      return 3;
    case "limits":
      return 4;
    case "numbers":
      return 5;
    case "references":
      return 6;
    case "spawns":
      return 7;
    case "economy":
      return 8;
    case "players":
      return 9;
    case "combat":
      return 10;
    case "zone-shape":
      return 11;
    case "bots":
      return 12;
    default:
      return 9;
  }
}

function compactGameModeValue(value: JsonValue | undefined) {
  if (value === undefined) {
    return "Unset";
  }
  if (typeof value === "boolean") {
    return value ? "On" : "Off";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? `${value}` : value.toFixed(2).replace(/\.?0+$/, "");
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "Empty";
    }
    return trimmed.length > 22 ? `${trimmed.slice(0, 22)}...` : trimmed;
  }
  if (Array.isArray(value)) {
    return `${value.length} items`;
  }
  return "Object";
}

function summarizeGameModeRowState(currentValue: JsonValue | undefined, standardValue: JsonValue | undefined) {
  const currentLabel = compactGameModeValue(currentValue);
  const standardLabel = compactGameModeValue(standardValue);
  if (currentLabel === standardLabel) {
    return {
      label: "Standard",
      value: standardLabel,
    };
  }
  return {
    label: "Changed",
    value: currentLabel,
  };
}

function pickDefaultGameModeFieldFacetKey(facets: Array<{ key: string }>) {
  const firstFocusedFacet = facets.find((facet) => facet.key !== "general");
  return firstFocusedFacet?.key ?? facets[0]?.key ?? "all";
}

function inferGameModeAdvancedCategory(path: string) {
  const segments = path
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!segments.length) {
    return "Advanced";
  }

  const head = humanizeGameModePath(segments[0]!);
  const branch = segments[1] ? humanizeGameModePath(segments[1]!) : "";
  if (!branch || head === branch) {
    return head || "Advanced";
  }
  return `${head} / ${branch}`;
}

function humanizeGameModePath(rawPath: string) {
  return rawPath
    .replace(/\[(\d+)\]/g, " $1 ")
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function copyResearchSummary(
  topicKey: string,
  summaryText: string,
  onCopied: (topicKey: string) => void,
) {
  if (!summaryText || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return;
  }

  try {
    await navigator.clipboard.writeText(summaryText);
    onCopied(topicKey);
  } catch {
    // Ignore clipboard failures in locked-down desktop environments.
  }
}

function buildGameModeFieldAnchorId(path: string) {
  return `game-mode-field-${sanitizeAnchorToken(path)}`;
}

function buildGameModeSectionAnchorId(sectionKey: GameModeSectionKey) {
  return `game-mode-section-${sectionKey}`;
}

function sanitizeAnchorToken(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function classifyGameModeEntry(entry: SectionEntry): keyof ReturnType<typeof buildGameModeSections> {
  const text = `${entry.category} ${entry.name} ${entry.path}`.toLowerCase();
  if ((entry.riskLevel ?? "").toLowerCase() === "experimental") {
    return "experimental";
  }
  if (text.includes("bot")) {
    return "bots";
  }
  if (text.includes("preset") || text.includes("gamemode") || text.includes("game mode")) {
    return "presets";
  }
  if (text.includes("zone")) {
    return "zone";
  }
  if (text.includes("lobby") || text.includes("team")) {
    return "lobby";
  }
  return "rules";
}

function buildNamedGameModeCollections(
  document: RuntimeDocument | undefined,
  libraryMetadata: LibraryMetadataResponse | null,
  draftOverrides: Record<string, JsonValue>,
): NamedCollectionSection[] {
  if (!document) {
    return [];
  }

  const collectionEditors = document.collectionEditors ?? [];
  const resolver = buildNamedReferenceResolver(document, libraryMetadata);
  const explicitCollections = collectionEditors
    .map((editor) => buildNamedCollectionSection(editor, document, draftOverrides, resolver))
    .filter((collection): collection is NamedCollectionSection => Boolean(collection?.rows.length));
  const summaryCollections = (document.namedCollections ?? [])
    .map((collection) => buildNamedCollectionSummarySection(collection, draftOverrides, resolver))
    .filter((collection): collection is NamedCollectionSection => Boolean(collection?.rows.length));

  const mergedCollections = new Map<string, NamedCollectionSection>();
  for (const collection of explicitCollections) {
    mergedCollections.set(collection.path, collection);
  }
  for (const collection of summaryCollections) {
    if (!mergedCollections.has(collection.path)) {
      mergedCollections.set(collection.path, collection);
    }
  }

  return Array.from(mergedCollections.values());
}

function buildNamedCollectionSection(
  editor: CollectionEditor,
  document: RuntimeDocument,
  draftOverrides: Record<string, JsonValue>,
  resolver: ReturnType<typeof buildNamedReferenceResolver>,
): NamedCollectionSection | null {
  if (editor.path === "availableItems") {
    const defaultValues = collectFlatCollectionValues(document, editor.path, "defaultValue");
    const currentValues = collectFlatCollectionValues(document, editor.path, "currentValue");
    const overrideValues = readStringArrayOverride(draftOverrides[editor.path]);
    const effectiveValues = overrideValues ?? currentValues;
    const allValues = Array.from(new Set([...defaultValues, ...effectiveValues]));
    const enabledValues = new Set(effectiveValues);
    const rows = allValues
      .map((value, index) => {
        const sourcePath = `${editor.path}[${index}]`;
        const resolved = resolver(value, sourcePath);
        return {
          key: `${editor.path}:${value}`,
          order: index,
          value,
          label: resolved.label,
          subtitle: resolved.subtitle,
          previewPath: resolved.previewPath,
          cropX: resolved.cropX,
          cropY: resolved.cropY,
          cropWidth: resolved.cropWidth,
          cropHeight: resolved.cropHeight,
          sourceWidth: resolved.sourceWidth,
          sourceHeight: resolved.sourceHeight,
          enabled: enabledValues.has(value),
          editable: true,
          sourcePath,
        } satisfies NamedCollectionRow;
      })
      .sort((left, right) => left.label.localeCompare(right.label));

    return {
      path: editor.path,
      section: "rules",
      title: "Allowed items",
      subtitle: "Use real item names here instead of raw config slots. Turn one item off when you want it removed from the arena item pool.",
      rows,
      editable: true,
      defaultValues,
    };
  }

  if (editor.path === "availableEntities" || editor.path === "availableMapEntities") {
    const currentValues = collectNestedCollectionValues(document, editor.path);
    const rows = Array.from(new Set(currentValues))
      .map((value, index) => {
        const resolved = resolver(value, `${editor.path}[${index}]`);
        return {
          key: `${editor.path}:${value}`,
          order: index,
          value,
          label: resolved.label,
          subtitle: resolved.subtitle,
          previewPath: resolved.previewPath,
          cropX: resolved.cropX,
          cropY: resolved.cropY,
          cropWidth: resolved.cropWidth,
          cropHeight: resolved.cropHeight,
          sourceWidth: resolved.sourceWidth,
          sourceHeight: resolved.sourceHeight,
          editable: false,
        } satisfies NamedCollectionRow;
      })
      .sort((left, right) => left.label.localeCompare(right.label));

    if (!rows.length) {
      return null;
    }

    return {
      path: editor.path,
      section: "experimental",
      title: editor.path === "availableEntities" ? "Arena entities" : "Map entities",
      subtitle:
        "These runtime collections are shown with resolved names so you can inspect what the mode currently uses without scrolling raw indexed paths.",
      rows,
      editable: false,
    };
  }

  return null;
}

function buildNamedCollectionSummarySection(
  collection: NamedCollectionSummary,
  draftOverrides: Record<string, JsonValue>,
  resolver: ReturnType<typeof buildNamedReferenceResolver>,
): NamedCollectionSection | null {
  const items = Array.isArray(collection.items) ? collection.items : [];
  if (!items.length) {
    return null;
  }

  const editable = items.every((item) => typeof item.value === "string" && Boolean(item.value));
  const defaultValues = editable
    ? items.map((item) => item.value).filter((value): value is string => typeof value === "string" && Boolean(value))
    : undefined;
  const overrideValues = editable ? readStringArrayOverride(draftOverrides[collection.collectionId]) : null;
  const enabledValues = new Set(overrideValues ?? defaultValues ?? []);

  const rows = items
    .map((item) => {
      const sourcePath = item.sourcePath ?? `${collection.collectionId}[${item.index}]`;
      const stringValue = typeof item.value === "string" ? item.value : null;
      const resolved = stringValue ? resolver(stringValue, sourcePath) : null;
      return {
        key: `${collection.collectionId}:${item.index}:${stringValue ?? item.displayName ?? "entry"}`,
        order: item.index,
        value: stringValue ?? summarizeNamedCollectionValue(item.value),
        label:
          item.displayName ??
          resolved?.label ??
          (stringValue ? prettifyReferenceLabel(stringValue) : `Entry ${item.index + 1}`),
        subtitle:
          item.subtitle ??
          resolved?.subtitle ??
          summarizeNamedCollectionValue(item.value) ??
          "Named collection entry",
        previewPath: item.iconPreviewPath ?? resolved?.previewPath,
        cropX: item.iconCropX ?? resolved?.cropX,
        cropY: item.iconCropY ?? resolved?.cropY,
        cropWidth: item.iconCropWidth ?? resolved?.cropWidth,
        cropHeight: item.iconCropHeight ?? resolved?.cropHeight,
        sourceWidth: item.iconSourceWidth ?? resolved?.sourceWidth,
        sourceHeight: item.iconSourceHeight ?? resolved?.sourceHeight,
        enabled: editable ? enabledValues.has(stringValue ?? "") : true,
        editable,
        sourcePath,
      } satisfies NamedCollectionRow;
    })
    .sort((left, right) => left.order - right.order);

  return {
    path: collection.collectionId,
    section: classifyNamedCollectionSummary(collection),
    title: collection.label,
    subtitle: buildNamedCollectionSummarySubtitle(collection, editable),
    rows,
    editable,
    defaultValues,
  };
}

function toggleNamedCollectionEntry(
  nextValue: boolean,
  row: NamedCollectionRow,
  collection: NamedCollectionSection,
  onSetCollectionValue: (path: string, value: JsonValue[], defaultValue?: JsonValue) => void,
) {
  if (!collection.editable) {
    return;
  }

  const currentValues = new Set(
    collection.rows.filter((entry) => entry.enabled).map((entry) => entry.value).filter(Boolean),
  );
  if (nextValue) {
    currentValues.add(row.value);
  } else {
    currentValues.delete(row.value);
  }

  const nextValues = collection.rows
    .filter((entry) => currentValues.has(entry.value))
    .sort((left, right) => left.order - right.order)
    .map((entry) => entry.value)

  onSetCollectionValue(collection.path, nextValues, collection.defaultValues ?? []);
}

function buildNamedReferenceResolver(
  document: RuntimeDocument,
  libraryMetadata: LibraryMetadataResponse | null,
) {
  type PreviewMeta = {
    label?: string;
    previewPath?: string;
    cropX?: number;
    cropY?: number;
    cropWidth?: number;
    cropHeight?: number;
    sourceWidth?: number;
    sourceHeight?: number;
  };

  const previewByPath = new Map<string, PreviewMeta>();
  const previewByReference = new Map<string, PreviewMeta>();
  for (const choice of document.referenceChoices ?? []) {
    if (choice.path) {
      previewByPath.set(choice.path, {
        label: choice.previewLabel,
        previewPath: choice.previewPath,
        cropX: choice.cropX,
        cropY: choice.cropY,
        cropWidth: choice.cropWidth,
        cropHeight: choice.cropHeight,
        sourceWidth: choice.sourceWidth,
        sourceHeight: choice.sourceHeight,
      });
    }
    if (choice.currentReference) {
      previewByReference.set(choice.currentReference, {
        label: choice.previewLabel,
        previewPath: choice.previewPath,
        cropX: choice.cropX,
        cropY: choice.cropY,
        cropWidth: choice.cropWidth,
        cropHeight: choice.cropHeight,
        sourceWidth: choice.sourceWidth,
        sourceHeight: choice.sourceHeight,
      });
    }
  }

  const iconPreviewByReference = new Map<string, PreviewMeta>();
  const templateByKey = new Map<string, LibraryTemplateEntry>();
  for (const icon of libraryMetadata?.icons ?? []) {
    const references = [
      typeof icon.value === "string" ? icon.value : null,
      typeof icon.reference === "string" ? icon.reference : null,
      icon.spriteName ? `Sprite:${icon.spriteName}` : null,
      typeof icon.sourcePassiveKey === "string" ? icon.sourcePassiveKey : null,
    ].filter((value): value is string => Boolean(value));

    for (const reference of references) {
      const previewPath = normalizePreviewPath(icon.previewPath);
      if (previewPath) {
        iconPreviewByReference.set(reference, {
          previewPath,
          cropX: icon.cropX,
          cropY: icon.cropY,
          cropWidth: icon.cropWidth,
          cropHeight: icon.cropHeight,
          sourceWidth: icon.sourceWidth,
          sourceHeight: icon.sourceHeight,
        });
      }
    }
  }

  for (const template of libraryMetadata?.templates ?? []) {
    const keys = [
      typeof template.label === "string" ? template.label : null,
      typeof template.targetKey === "string" ? template.targetKey : null,
      typeof template.displayName === "string" ? template.displayName : null,
      typeof template.title === "string" ? template.title : null,
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => normalizeReferenceKey(value));

    for (const key of keys) {
      templateByKey.set(key, template);
    }
  }

  return (reference: string, sourcePath?: string) => {
    const preview = (sourcePath ? previewByPath.get(sourcePath) : null) ?? previewByReference.get(reference);
    const template = templateByKey.get(normalizeReferenceKey(reference));
    const resolvedTitle =
      template?.label ??
      template?.displayName ??
      template?.targetKey ??
      template?.title ??
      reference;
    const iconReference = template?.iconReference;
    const fallbackIcon = iconReference ? iconPreviewByReference.get(iconReference) : undefined;

    return {
      label: resolveFriendlyName(preview?.label, template?.displayName, template?.title, prettifyReferenceLabel(resolvedTitle)),
      subtitle: buildReferenceSubtitle(template?.displayName ?? template?.targetKey ?? reference, reference),
      previewPath: normalizePreviewPath(preview?.previewPath) ?? fallbackIcon?.previewPath ?? undefined,
      cropX: preview?.cropX ?? fallbackIcon?.cropX,
      cropY: preview?.cropY ?? fallbackIcon?.cropY,
      cropWidth: preview?.cropWidth ?? fallbackIcon?.cropWidth,
      cropHeight: preview?.cropHeight ?? fallbackIcon?.cropHeight,
      sourceWidth: preview?.sourceWidth ?? fallbackIcon?.sourceWidth,
      sourceHeight: preview?.sourceHeight ?? fallbackIcon?.sourceHeight,
    };
  };
}

function collectFlatCollectionValues(
  document: RuntimeDocument,
  rootPath: string,
  valueKey: "defaultValue" | "currentValue",
) {
  return (document.advanced?.fields ?? [])
    .filter(
      (field) =>
        typeof field.path === "string" &&
        new RegExp(`^${escapeRegExp(rootPath)}\\[(\\d+)\\]$`, "i").test(field.path),
    )
    .map((field) => ({
      index: parseCollectionIndex(field.path),
      value: typeof field[valueKey] === "string" ? field[valueKey] : null,
    }))
    .filter((field): field is { index: number; value: string } => field.index !== null && Boolean(field.value))
    .sort((left, right) => left.index - right.index)
    .map((field) => field.value);
}

function collectNestedCollectionValues(document: RuntimeDocument, rootPath: string) {
  return (document.advanced?.fields ?? [])
    .filter(
      (field) =>
        typeof field.path === "string" &&
        field.path.toLowerCase().startsWith(`${rootPath.toLowerCase()}[`) &&
        typeof field.currentValue === "string",
    )
    .map((field) => field.currentValue)
    .filter((value): value is string => Boolean(value));
}

function readStringArrayOverride(value: JsonValue | undefined): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function parseCollectionIndex(path: string) {
  const match = path.match(/\[(\d+)\]/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function summarizeNamedCollectionValue(value: JsonValue | undefined) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (!value) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "Complex entry";
  }
}

function classifyNamedCollectionSummary(collection: NamedCollectionSummary): GameModeSectionKey {
  const text = [collection.collectionId, collection.label, collection.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (text.includes("bot")) {
    return "bots";
  }
  if (text.includes("preset") || text.includes("game mode") || text.includes("gamemode")) {
    return "presets";
  }
  if (text.includes("team") || text.includes("lobby")) {
    return "lobby";
  }
  if (
    text.includes("fishing") ||
    text.includes("loot") ||
    text.includes("trash") ||
    text.includes("drop") ||
    text.includes("spawn") ||
    text.includes("entity") ||
    text.includes("map")
  ) {
    return "zone";
  }
  return "rules";
}

function buildNamedCollectionSummarySubtitle(collection: NamedCollectionSummary, editable: boolean) {
  if (collection.description) {
    return collection.description;
  }
  if (editable) {
    return "Toggle one entry at a time using the resolved names from the runtime export.";
  }
  return "Inspect the current exported entries here without digging through raw nested runtime paths.";
}

function normalizeReferenceKey(raw: string) {
  return raw
    .replace(/^[^:]+:/, "")
    .replace(/#\d+$/, "")
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function prettifyReferenceLabel(raw: string) {
  const trimmed = raw.replace(/^[^:]+:/, "").replace(/#\d+$/, "").trim();
  if (!trimmed) {
    return "Unknown entry";
  }

  return trimmed
    .replace(/^P_/, "")
    .replace(/^Consumable_/, "")
    .replace(/^PrefabConfig_?/, "")
    .replace(/^GameObject_?/, "")
    .replace(/^Entity_?/, "")
    .replace(/_/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => normalizePrettyWord(word))
    .join(" ");
}

function buildReferenceSubtitle(primary: string, reference: string) {
  const referenceKind = describeReferenceKind(reference);
  const cleanedPrimary = primary.replace(/#\d+$/, "").trim();
  if (cleanedPrimary && !looksTechnicalSubtitle(cleanedPrimary)) {
    return cleanedPrimary;
  }
  return referenceKind ?? "Referenced entry";
}

function buildAugmentSubtitle(targetKey?: string | null, preferred?: string | null) {
  const cleanedPreferred = preferred?.replace(/#\d+$/, "").trim();
  if (cleanedPreferred && !looksTechnicalSubtitle(cleanedPreferred) && !/^id\b/i.test(cleanedPreferred)) {
    return cleanedPreferred;
  }

  const cleanedKey = targetKey?.replace(/#\d+$/, "").trim() ?? "";
  if (/buff|stat|health|damage|cooldown/i.test(cleanedKey)) {
    return "Stat augment";
  }
  if (/passive|augment|firewave|toxic|tempo|burn|poison/i.test(cleanedKey)) {
    return "Standard augment";
  }
  return "Augment";
}

function looksTechnicalSubtitle(value: string) {
  return /[:#]/.test(value) || /^(p_|consumable_|gameobject_|entity_|prefabconfig_)/i.test(value);
}

function describeReferenceKind(reference: string) {
  const prefix = reference.split(":")[0]?.toLowerCase() ?? "";
  switch (prefix) {
    case "consumable":
      return "Consumable item";
    case "passiveso":
      return "Passive effect";
    case "gameobject":
      return "Scene object";
    case "entity":
      return "Arena entity";
    case "sprite":
      return "Game icon";
    default:
      return null;
  }
}

function buildReferenceFallback(label: string) {
  const compact = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return compact || "?";
}

function normalizePreviewPath(previewPath?: string) {
  if (!previewPath) {
    return undefined;
  }
  if (/^(https?:\/\/|data:|blob:)/i.test(previewPath)) {
    return previewPath;
  }
  if (/\.(png|jpe?g|webp|gif|svg)$/i.test(previewPath)) {
    return previewPath;
  }
  if (/\\Sprite\\.+\.asset$/i.test(previewPath)) {
    return previewPath.replace(/\\Sprite\\/i, "\\Texture2D\\").replace(/\.asset$/i, ".png");
  }
  return undefined;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildAugmentTemplates(
  document: RuntimeDocument | undefined,
  libraryMetadata: LibraryMetadataResponse | null,
): AugmentTemplateSummary[] {
  type PreviewMeta = {
    previewPath?: string;
    cropX?: number;
    cropY?: number;
    cropWidth?: number;
    cropHeight?: number;
    sourceWidth?: number;
    sourceHeight?: number;
  };

  const iconsById = new Map<number, PreviewMeta>();
  const iconsByReference = new Map<string, PreviewMeta>();
  for (const icon of libraryMetadata?.icons ?? []) {
    const iconRecord = icon as typeof icon & { passiveId?: number; previewPath?: string; spriteName?: string };
    const previewPath = normalizePreviewPath(iconRecord.previewPath);
    if (typeof iconRecord.passiveId === "number" && previewPath) {
      iconsById.set(iconRecord.passiveId, {
        previewPath,
        cropX: iconRecord.cropX,
        cropY: iconRecord.cropY,
        cropWidth: iconRecord.cropWidth,
        cropHeight: iconRecord.cropHeight,
        sourceWidth: iconRecord.sourceWidth,
        sourceHeight: iconRecord.sourceHeight,
      });
    }
    if (iconRecord.spriteName && previewPath) {
      iconsByReference.set(`Sprite:${iconRecord.spriteName}`, {
        previewPath,
        cropX: iconRecord.cropX,
        cropY: iconRecord.cropY,
        cropWidth: iconRecord.cropWidth,
        cropHeight: iconRecord.cropHeight,
        sourceWidth: iconRecord.sourceWidth,
        sourceHeight: iconRecord.sourceHeight,
      });
    }
  }

  const summaryEntries = document?.gameModeSummary?.vaultedAugments ?? [];
  if (summaryEntries.length) {
    return summaryEntries
      .filter((entry) => typeof entry.augmentId === "number")
      .map((entry) => {
        const fallbackPreview =
          iconsById.get(entry.augmentId) ??
          (entry.iconReference ? iconsByReference.get(entry.iconReference) : undefined);
        return {
          id: entry.augmentId,
          label: resolveFriendlyName(entry.displayName, entry.augmentKey, `Augment ${entry.augmentId}`),
          subtitle: buildAugmentSubtitle(entry.augmentKey, entry.subtitle),
          targetKey: entry.augmentKey,
          iconReference: entry.iconReference,
          previewPath: entry.iconPreviewPath ?? fallbackPreview?.previewPath,
          cropX: entry.iconCropX ?? fallbackPreview?.cropX,
          cropY: entry.iconCropY ?? fallbackPreview?.cropY,
          cropWidth: entry.iconCropWidth ?? fallbackPreview?.cropWidth,
          cropHeight: entry.iconCropHeight ?? fallbackPreview?.cropHeight,
          sourceWidth: entry.iconSourceWidth ?? fallbackPreview?.sourceWidth,
          sourceHeight: entry.iconSourceHeight ?? fallbackPreview?.sourceHeight,
          isVaulted: Boolean(entry.vaulted),
        };
      })
      .sort((left, right) => left.label.localeCompare(right.label));
  }

  if (!libraryMetadata) {
    return [];
  }

  return (libraryMetadata.templates ?? [])
    .filter((entry) => entry.targetType === "Passive" && typeof entry.id === "number")
    .map((entry) => {
      const fallbackPreview =
        (entry.id !== undefined ? iconsById.get(entry.id) : undefined) ??
        (entry.iconReference ? iconsByReference.get(entry.iconReference) : undefined);
      return {
        id: entry.id as number,
        label: resolveFriendlyName(entry.title, entry.displayName, entry.targetKey, `Augment ${entry.id}`),
        subtitle: buildAugmentSubtitle(entry.targetKey, entry.displayName),
        targetKey: entry.targetKey,
        iconReference: entry.iconReference,
        previewPath: fallbackPreview?.previewPath,
        cropX: fallbackPreview?.cropX,
        cropY: fallbackPreview?.cropY,
        cropWidth: fallbackPreview?.cropWidth,
        cropHeight: fallbackPreview?.cropHeight,
        sourceWidth: fallbackPreview?.sourceWidth,
        sourceHeight: fallbackPreview?.sourceHeight,
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}

function buildVaultState(
  document: RuntimeDocument | undefined,
  augmentTemplates: AugmentTemplateSummary[],
  draftOverrides: Record<string, JsonValue>,
) {
  const templateById = new Map<number, AugmentTemplateSummary>(augmentTemplates.map((entry) => [entry.id, entry]));
  const baseEntries = (document?.advanced?.fields ?? [])
    .filter((field) => isVaultedAugmentPath(field.path))
    .map((field) => ({
      index: parseVaultIndex(field.path),
      id: toNumericId(field.effectiveValue ?? field.currentValue ?? field.defaultValue),
    }))
    .filter((field): field is { index: number; id: number } => field.index !== null && field.id !== null)
    .sort((left, right) => left.index - right.index);

  const summaryVaultedIds = augmentTemplates.filter((entry) => entry.isVaulted).map((entry) => entry.id);
  const defaultVaultedIds = summaryVaultedIds.length ? summaryVaultedIds : baseEntries.map((entry) => entry.id);
  const overrideVaultedIds = Array.isArray(draftOverrides.vaultedAugments)
    ? draftOverrides.vaultedAugments.map((value) => toNumericId(value)).filter((value): value is number => value !== null)
    : null;
  const effectiveVaultedIds = new Set<number>(overrideVaultedIds ?? defaultVaultedIds);

  const currentVaulted = Array.from(effectiveVaultedIds)
    .map((id) => {
      const template = templateById.get(id);
      return {
        id,
        label: resolveFriendlyName(template?.label, template?.targetKey, `Augment ${id}`),
        subtitle: buildAugmentSubtitle(template?.targetKey, template?.subtitle),
        previewPath: template?.previewPath,
        cropX: template?.cropX,
        cropY: template?.cropY,
        cropWidth: template?.cropWidth,
        cropHeight: template?.cropHeight,
        sourceWidth: template?.sourceWidth,
        sourceHeight: template?.sourceHeight,
        isVaulted: true,
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label));

  return {
    allTemplates: augmentTemplates,
    currentVaulted,
    effectiveVaultedIds,
    defaultVaultedIds,
  };
}

function toggleVaultedAugment(
  nextValue: boolean,
  row: VaultedAugmentRow,
  vaultState: ReturnType<typeof buildVaultState>,
  onSetCollectionValue: (path: string, value: JsonValue[], defaultValue?: JsonValue) => void,
) {
  const nextIds = Array.from(vaultState.effectiveVaultedIds);
  const hasId = vaultState.effectiveVaultedIds.has(row.id);
  if (nextValue && !hasId) {
    nextIds.push(row.id);
  } else if (!nextValue && hasId) {
    const nextIndex = nextIds.indexOf(row.id);
    if (nextIndex >= 0) {
      nextIds.splice(nextIndex, 1);
    }
  } else {
    return;
  }

  onSetCollectionValue(
    "vaultedAugments",
    nextIds.sort((left, right) => left - right),
    vaultState.defaultVaultedIds,
  );
}

function isVaultedAugmentPath(path?: string | null): boolean {
  return typeof path === "string" && /^vaultedAugments\[\d+\]$/i.test(path);
}

function parseVaultIndex(path: string): number | null {
  const match = path.match(/\[(\d+)\]/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function toNumericId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringifyValue(value: JsonValue | undefined): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return String(value);
}

function formatRange(range: NumericRange) {
  const minimum = range.minimum ?? 0;
  const maximum = range.maximum ?? 0;
  const unit = range.unit ? ` ${range.unit}` : "";
  return `${minimum} to ${maximum}${unit}`;
}

function sortGameModeEntries(entries: CatalogEntry[]) {
  return [...entries].sort((left, right) => {
    const priorityDifference = getGameModeEntryPriority(left) - getGameModeEntryPriority(right);
    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    return left.title.localeCompare(right.title);
  });
}

function getGameModeEntryPriority(entry: CatalogEntry) {
  const text = `${entry.title} ${entry.subtitle} ${entry.targetType ?? ""}`.toLowerCase();
  if (text.includes("current preset")) {
    return 0;
  }
  if (text.includes("current lobby") || text.includes("live snapshot") || text.includes("arenalobby")) {
    return 1;
  }
  if (text.includes("saved")) {
    return 2;
  }
  if (text.includes("arena game mode")) {
    return 3;
  }
  if (text.includes("lobby config")) {
    return 4;
  }
  return 5;
}

function describeCategory(key: string) {
  switch (key) {
    case "zone-shape": return "Zone shapes, ring shrinks, and wall speed settings.";
    case "bots": return "AI bot count, behavior settings, and difficulties.";
    case "players": return "Max players, team setups, and lobby configuration.";
    case "spawns": return "Spawn points, respawn timers, and invulnerability.";
    case "timers": return "Global game timers, round delays, and cooldown limits.";
    case "switches": return "Core toggle features, active switches, and overrides.";
    case "limits": return "Lobby size boundaries and item slot constraints.";
    case "numbers": return "General numerical parameters and score values.";
    case "references": return "SO assets, map entity paths, and prefab models.";
    case "economy": return "Loot tables, item drop chances, and chest rewards.";
    case "match-flow": return "Win conditions, phase delays, and round counts.";
    case "combat": return "Damage ratios, health levels, and combat modifiers.";
    default: return "General game settings and advanced config flags.";
  }
}

function describeSection(section: string) {
  switch (section) {
    case "Rules":
      return "Core scoring, augment flow, and match-wide rule changes.";
    case "Zone":
      return "How the zone behaves and how dangerous it becomes.";
    case "Lobby":
      return "Player count, teams, and the visible lobby setup.";
    case "Bots":
      return "How many bots join and how difficult they are.";
    case "Presets":
      return "Preset selection and game-mode level picks.";
    default:
      return "Change one game mode value at a time.";
  }
}

function normalizePrettyWord(word: string) {
  const lower = word.toLowerCase();
  if (lower === "hp") {
    return "HP";
  }
  if (lower === "ui") {
    return "UI";
  }
  if (lower === "aoe") {
    return "AOE";
  }
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function resetSectionValues(
  entries: SectionEntry[],
  onResetValue: (path: string) => void,
) {
  const uniquePaths = Array.from(new Set(entries.map((entry) => entry.path)));
  uniquePaths.forEach((path) => onResetValue(path));
}

function isGuidedNoisePath(path?: string | null) {
  if (typeof path !== "string") {
    return false;
  }

  return (
    /^availableItems\[\d+\]$/i.test(path) ||
    /^availableEntities\[\d+\]$/i.test(path) ||
    /^availableMapEntities\[\d+\]$/i.test(path) ||
    /^scoresByRound\[\d+\]$/i.test(path) ||
    /^vaultedAugments\[\d+\]$/i.test(path)
  );
}

function getSectionLabel(sectionKey: GameModeSectionKey) {
  switch (sectionKey) {
    case "rules":
      return "Rules";
    case "zone":
      return "Zone";
    case "lobby":
      return "Lobby";
    case "bots":
      return "Bots";
    case "presets":
      return "Presets";
    case "experimental":
      return "Experimental";
    default:
      return "Rules";
  }
}

function resolveResearchMatchSection(
  match: { label: string; path: string; description?: string },
  sectionMap: ReturnType<typeof buildGameModeSections>,
  topicKey: string,
): GameModeSectionKey {
  const directSection = (Object.keys(sectionMap) as GameModeSectionKey[]).find((sectionKey) =>
    sectionMap[sectionKey].some((entry) => entry.path === match.path),
  );

  if (directSection) {
    return directSection;
  }

  const text = `${match.label} ${match.path} ${match.description ?? ""}`.toLowerCase();
  if (text.includes("bot")) {
    return "bots";
  }
  if (text.includes("preset") || text.includes("gamemode") || text.includes("game mode")) {
    return "presets";
  }
  if (
    text.includes("zone") ||
    text.includes("spawn") ||
    text.includes("respawn") ||
    text.includes("entity") ||
    text.includes("loot") ||
    text.includes("map") ||
    text.includes("fishing")
  ) {
    return "zone";
  }
  if (text.includes("lobby") || text.includes("team")) {
    return "lobby";
  }

  return getDefaultSectionForResearchTopic(topicKey, ["rules", "zone", "lobby", "bots", "presets", "experimental"]);
}

function getDefaultSectionForResearchTopic(
  topicKey: string,
  availableSections: GameModeSectionKey[],
): GameModeSectionKey {
  const preferredOrder: GameModeSectionKey[] =
    topicKey === "map-systems"
      ? ["zone", "presets", "rules", "lobby", "bots", "experimental"]
      : topicKey === "drops-and-loot"
        ? ["zone", "rules", "presets", "lobby", "bots", "experimental"]
        : topicKey === "spawns-and-entities"
          ? ["zone", "bots", "rules", "presets", "lobby", "experimental"]
          : topicKey === "modifiers-and-rules"
            ? ["rules", "lobby", "presets", "zone", "bots", "experimental"]
            : ["rules", "zone", "lobby", "bots", "presets", "experimental"];

  return preferredOrder.find((sectionKey) => availableSections.includes(sectionKey)) ?? availableSections[0] ?? "rules";
}

function getDefaultSectionForSource(
  sourceKey: string,
  availableSections: GameModeSectionKey[],
): GameModeSectionKey {
  const preferredOrder: GameModeSectionKey[] =
    sourceKey === "current_lobby"
      ? ["lobby", "bots", "rules", "zone", "presets", "experimental"]
      : sourceKey === "arena_game_mode"
        ? ["rules", "zone", "experimental", "presets", "lobby", "bots"]
        : sourceKey === "lobby_config"
          ? ["lobby", "bots", "rules", "zone", "presets", "experimental"]
          : sourceKey === "saved_preset"
            ? ["presets", "rules", "zone", "lobby", "bots", "experimental"]
            : ["rules", "zone", "presets", "lobby", "bots", "experimental"];

  return preferredOrder.find((key) => availableSections.includes(key)) ?? availableSections[0] ?? "rules";
}

function buildSourcePresentation(entry: CatalogEntry | null, document?: RuntimeDocument) {
  const text = `${entry?.title ?? ""} ${entry?.subtitle ?? ""} ${entry?.targetType ?? ""}`.toLowerCase();
  const runtimeSourceRole = typeof document?.sourceRole === "string" ? document.sourceRole.toLowerCase() : "";
  const applyTiming = typeof document?.applyTiming === "string" ? document.applyTiming.toLowerCase() : "";

  if (
    runtimeSourceRole === "current_lobby" ||
    text.includes("current lobby") ||
    text.includes("live snapshot") ||
    text.includes("arenalobby")
  ) {
    return {
      sourceKey: "current_lobby",
      title: "Live Snapshot",
      sidebarCopy: "Current lobby",
      heroCopy: "Read the live lobby state here, then copy the settings you want into a safer preset flow.",
      guidance: "Best for inspection and copying, not for broad editing.",
      bestFor: "Lobby size, teams, bots, and live values.",
      applyTimingTitle: mapApplyTimingTitle(applyTiming || "restart_recommended"),
      applyTimingBody:
        applyTiming === "restart_recommended"
          ? "Restart, then reopen the lobby for a clean verification."
          : "Treat this as a reference snapshot first, then test from a fresh lobby.",
      bridgeCopy: "Need scoring, zone speed, or a reusable ruleset? Open Current Preset. Need arena-only rules? Open Arena Game Mode.",
    };
  }

  if (runtimeSourceRole === "arena_game_mode" || text.includes("arena game mode")) {
    return {
      sourceKey: "arena_game_mode",
      title: "Arena Game Mode",
      sidebarCopy: "Advanced rules",
      heroCopy: "Use this for arena-only rules that the standard preset does not cover.",
      guidance: "Open this when Current Preset or Live Snapshot does not include the setting you need.",
      bestFor: "Hidden rules, deep zone behaviour, respawns, and experiments.",
      applyTimingTitle: mapApplyTimingTitle(applyTiming || "next_match"),
      applyTimingBody:
        applyTiming === "restart_recommended"
          ? "These settings are safest to verify after a restart."
          : "Save, then start a fresh match from the lobby to test them cleanly.",
      bridgeCopy: "Need the simpler scoring and zone controls first? Open Current Preset.",
    };
  }

  if (runtimeSourceRole === "lobby_config" || text.includes("lobby config")) {
    return {
      sourceKey: "lobby_config",
      title: "Lobby Config",
      sidebarCopy: "Lobby structure",
      heroCopy: "Change the lobby shell here, including team layout and player caps.",
      guidance: "Use this for lobby structure, not core match tuning.",
      bestFor: "Team labels, max players, and structural lobby values.",
      applyTimingTitle: mapApplyTimingTitle(applyTiming || "next_match"),
      applyTimingBody: "These changes are safest to verify by re-opening the custom lobby or starting a fresh match setup.",
      bridgeCopy: "Need the currently observed lobby values instead? Open Live Snapshot.",
    };
  }

  if (runtimeSourceRole === "saved_preset" || text.includes("saved")) {
    return {
      sourceKey: "saved_preset",
      title: entry?.title ?? "Saved Preset",
      sidebarCopy: "Saved preset",
      heroCopy: "Use this saved preset when you want a reusable named setup for later.",
      guidance: "Edit one saved preset when you want something you can switch back to.",
      bestFor: "Reusable stored rulesets you want to keep around.",
      applyTimingTitle: mapApplyTimingTitle(applyTiming || "next_match"),
      applyTimingBody: "Save this preset, then select it in the custom lobby before you start the next match.",
      bridgeCopy: "Need the currently active rules first? Open Current Preset.",
    };
  }

  return {
    sourceKey: "current_preset",
    title: "Current Preset",
    sidebarCopy: "Current rules",
    heroCopy: "Start here for scoring, zone pace, and the main match systems.",
    guidance: "Use this first, then move to other sources when you need a different scope.",
    bestFor: "Scoring, zone, presets, and the main match rules.",
    applyTimingTitle: mapApplyTimingTitle(applyTiming || "next_match"),
    applyTimingBody:
      applyTiming === "now"
        ? "Some values may update while the lobby is open, but the safest test is still to start a new match."
        : "Treat these as next-match settings. Save, then start a new match to confirm the result.",
    bridgeCopy: "Need arena-only rules? Open Arena Game Mode. Need the currently observed lobby values? Open Live Snapshot.",
  };
}

function shouldShowGameModeSidebarCopy(sourceKey: string) {
  return sourceKey === "current_lobby" || sourceKey === "arena_game_mode" || sourceKey === "lobby_config";
}

function resolveGameModeSidebarMeta(
  entry: CatalogEntry,
  sourcePresentation: ReturnType<typeof buildSourcePresentation>,
  isDuplicateTitle: boolean,
) {
  if (!isDuplicateTitle) {
    return shouldShowGameModeSidebarCopy(sourcePresentation.sourceKey) ? sourcePresentation.sidebarCopy : "";
  }

  return (
    sanitizeGameModeSidebarMeta(entry.subtitle, sourcePresentation.title, sourcePresentation.sidebarCopy) ??
    prettifyGameModeRelativePath(entry.relativePath) ??
    (shouldShowGameModeSidebarCopy(sourcePresentation.sourceKey) ? sourcePresentation.sidebarCopy : "")
  );
}

function sanitizeGameModeSidebarMeta(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (!value) {
      continue;
    }
    const cleaned = value.trim().replace(/\s+/g, " ");
    if (!cleaned) {
      continue;
    }
    if (looksTechnicalGameModeMeta(cleaned)) {
      continue;
    }
    return cleaned;
  }
  return null;
}

function looksTechnicalGameModeMeta(value: string) {
  return /userData|balancemod|runtime|library|\.json|^[a-z]:\\/i.test(value);
}

function prettifyGameModeRelativePath(relativePath?: string | null) {
  if (!relativePath) {
    return null;
  }
  const segments = relativePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((segment) => segment.replace(/\.json$/i, "").replace(/[_-]+/g, " "))
    .map((segment) => resolveFriendlyName(segment));
  if (!segments.length) {
    return null;
  }
  return segments.slice(-2).join(" / ");
}

function buildGameModeSourceGroups(
  entries: CatalogEntry[],
  sourceTitleCounts: Map<string, number>,
): GameModeSidebarGroup[] {
  const groupDefinitions = [
    {
      key: "current_preset",
      label: "Start here",
      copy: "Main match rules, zone pace, and preset flow.",
      matches: new Set(["current_preset"]),
    },
    {
      key: "current_lobby",
      label: "Live lobby",
      copy: "Current observed lobby values and bot state.",
      matches: new Set(["current_lobby"]),
    },
    {
      key: "saved_preset",
      label: "Saved presets",
      copy: "Reusable named setups you can switch back to later.",
      matches: new Set(["saved_preset"]),
    },
    {
      key: "deep_sources",
      label: "Deep sources",
      copy: "Advanced arena and lobby structures only when presets are missing the setting.",
      matches: new Set(["arena_game_mode", "lobby_config"]),
    },
  ];

  const groupedEntries = new Map<string, GameModeSidebarGroup>();
  const usedEntryIds = new Set<string>();

  for (const definition of groupDefinitions) {
    const matchingEntries = entries
      .map((entry) => {
        const sourcePresentation = buildSourcePresentation(entry);
        return { entry, sourcePresentation };
      })
      .filter(({ sourcePresentation }) => definition.matches.has(sourcePresentation.sourceKey))
      .map(({ entry, sourcePresentation }) => {
        const isDuplicateTitle = (sourceTitleCounts.get(sourcePresentation.title) ?? 0) > 1;
        return {
          entry,
          sourcePresentation,
          sidebarMeta: resolveGameModeSidebarMeta(entry, sourcePresentation, isDuplicateTitle),
        };
      });

    if (!matchingEntries.length) {
      continue;
    }

    matchingEntries.forEach(({ entry }) => usedEntryIds.add(entry.id));
    groupedEntries.set(definition.key, {
      key: definition.key,
      label: definition.label,
      copy: definition.copy,
      entries: matchingEntries,
    });
  }

  const otherEntries = entries
    .filter((entry) => !usedEntryIds.has(entry.id))
    .map((entry) => {
      const sourcePresentation = buildSourcePresentation(entry);
      const isDuplicateTitle = (sourceTitleCounts.get(sourcePresentation.title) ?? 0) > 1;
      return {
        entry,
        sourcePresentation,
        sidebarMeta: resolveGameModeSidebarMeta(entry, sourcePresentation, isDuplicateTitle),
      };
    });

  if (otherEntries.length) {
    groupedEntries.set("other", {
      key: "other",
      label: "Other sources",
      copy: "Special cases and extra files that do not fit the main editing flow.",
      entries: otherEntries,
    });
  }

  return Array.from(groupedEntries.values());
}

function mapApplyTimingTitle(applyTiming: string) {
  switch (applyTiming) {
    case "now":
      return "Applies now";
    case "restart_recommended":
      return "Restart required";
    default:
      return "Next match";
  }
}

function readGameModeProbe(response: GameModeIndexResponse | null) {
  const raw = response?.raw;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, JsonValue>;
  const entriesRaw = Array.isArray(record.entries) ? record.entries : [];
  const entryLabels = entriesRaw
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const candidate = entry as Record<string, JsonValue>;
      const displayName = typeof candidate.displayName === "string" ? candidate.displayName : null;
      const modeKey = typeof candidate.modeKey === "string" ? candidate.modeKey : null;
      return displayName ?? modeKey;
    })
    .filter((value): value is string => Boolean(value));

  const currentDisplayName = typeof record.currentDisplayName === "string" ? record.currentDisplayName : null;
  const currentModeKey = typeof record.currentModeKey === "string" ? record.currentModeKey : null;
  const currentGameModeId =
    typeof record.currentGameModeId === "number" && Number.isFinite(record.currentGameModeId)
      ? record.currentGameModeId
      : null;

  return {
    currentLabel: currentDisplayName ?? currentModeKey ?? "Unknown",
    currentGameModeId,
    entryLabels: entryLabels.length ? entryLabels : ["No confirmed modes exported yet"],
  };
}
