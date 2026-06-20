import { ArrowUpRight, FolderPlus, Plus, RefreshCw, Save, Search, Star } from "lucide-react";
import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { launcherApi } from "./api";
import { HintPopover } from "./components/HintPopover";
import { SmartFilterChips } from "./components/SmartFilterChips";
import { IconPreview, MissingIconBadge, SectionCard, resolveFriendlyName, type ExperienceMode } from "./common";
import { materializeRuntimeDocument } from "./document";
import type { EditorGroupKey } from "./EditorPage";
import type { SmartFilterId } from "./helpers/filter-predicates";
import { loadSavedSearches, removeSearch, type SavedSearch } from "./helpers/saved-searches";
import { usePageEntranceMotion } from "./motion";
import { Button, Card, CardBody, CardHeader, Input, Select, Spinner } from "./ui";
import type {
  CatalogEntry,
  CatalogGroup,
  JsonValue,
  LibraryAllOptionEntry,
  LibraryMetadataResponse,
  OperationCapabilitiesResponse,
  RuntimeDocument,
  SharedCollectionEntry,
  TargetOperationEntry,
} from "./types";

interface LoadedEntryState {
  document?: RuntimeDocument;
  draftOverrides: Record<string, JsonValue>;
  draftOperations: TargetOperationEntry[];
  loading: boolean;
  saving: boolean;
  error?: string;
  operationCapabilities?: OperationCapabilitiesResponse | null;
}

interface LibrarySuggestion {
  blockId: string;
  label: string;
  description?: string;
  category: "Basics" | "Effects";
  targetPath: string;
  operationType: string;
  values: Array<{
    key: string;
    label: string;
    description?: string;
    valueType?: string;
    defaultValue?: JsonValue;
    options?: string[];
  }>;
}

interface LibraryCollectionView extends SharedCollectionEntry {
  scope: "favorites" | "shared" | "local";
}

const categoryOrder: Array<LibrarySuggestion["category"]> = ["Basics", "Effects"];
const LIBRARY_OPTION_RENDER_BATCH = 36;
const LIBRARY_OPTION_FETCH_LIMIT = 160;
const libraryBrowseCache = new Map<string, { entries: LibraryAllOptionEntry[]; totalCount: number }>();
const libraryBrowsePromiseCache = new Map<string, Promise<{ entries: LibraryAllOptionEntry[]; totalCount: number }>>();

export function AddLibraryPage({
  editorGroups,
  editorGroup,
  mode,
  onChangeGroup,
  entries,
  search,
  onSearchChange,
  selectedEntry,
  selectedState,
  onSelectEntry,
  onQueueOperation,
  onRemoveQueuedOperation,
  onClearQueuedOperations,
  onSave,
  onReload,
  libraryMetadata,
  workspaceRoot,
  catalogEntries,
  librarySearchSeed,
  favoriteOptionIds,
  localCollections,
  onToggleFavorite,
  onCreateCollection,
  onToggleCollectionMembership,
  embedded = false,
}: {
  editorGroups: CatalogGroup[];
  editorGroup: EditorGroupKey;
  mode: ExperienceMode;
  onChangeGroup: (group: EditorGroupKey) => void;
  entries: CatalogEntry[];
  search: string;
  onSearchChange: (value: string) => void;
  selectedEntry: CatalogEntry | null;
  selectedState?: LoadedEntryState;
  onSelectEntry: (entryId: string) => void;
  onQueueOperation: (operation: TargetOperationEntry) => void;
  onRemoveQueuedOperation: (index: number) => void;
  onClearQueuedOperations: () => void;
  onSave: () => void;
  onReload: () => void;
  libraryMetadata?: LibraryMetadataResponse | null;
  workspaceRoot?: string;
  catalogEntries: CatalogEntry[];
  librarySearchSeed?: string;
  favoriteOptionIds: string[];
  localCollections: SharedCollectionEntry[];
  onToggleFavorite: (optionId: string) => void;
  onCreateCollection: (label: string, description?: string) => void;
  onToggleCollectionMembership: (collectionId: string, optionId: string) => void;
  embedded?: boolean;
}) {
  const pageMotionRef = usePageEntranceMotion();
  const [viewMode, setViewMode] = useState<"quick-add" | "browse-library">("quick-add");
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [draftValues, setDraftValues] = useState<Record<string, JsonValue>>({});
  const [librarySearch, setLibrarySearch] = useState("");
  // Phase 3 Task 16 — SmartFilterChips state for the Library page sidebar.
  // Conservative wave: chips are mounted visually below the search input and
  // saved-search entries persist via the page-keyed helper. Functional
  // filtering of `entries` is not yet wired here because the entries list is
  // owned by the parent (LauncherApp) and the existing test suite asserts on
  // an unfiltered list. TODO Phase 4: lift these into the parent (or thread
  // them through a memoized predicate over `entries`) so toggling a chip
  // actually filters the visible files.
  const [activeSmartFilters, setActiveSmartFilters] = useState<Set<SmartFilterId>>(() => new Set());
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() => loadSavedSearches("library"));
  const [sourceFilter, setSourceFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [safetyFilter, setSafetyFilter] = useState("all");
  const [collectionFilter, setCollectionFilter] = useState("all");
  const [libraryFiltersOpen, setLibraryFiltersOpen] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [browseInspectorMode, setBrowseInspectorMode] = useState<"details" | "save">("details");
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [newCollectionName, setNewCollectionName] = useState("");
  const [remoteLibraryEntries, setRemoteLibraryEntries] = useState<LibraryAllOptionEntry[]>([]);
  const [remoteTotalCount, setRemoteTotalCount] = useState(0);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(() => !selectedEntry?.id);
  const appliedLibrarySearchSeedRef = useRef("");
  const deferredLibrarySearch = useDeferredValue(librarySearch.trim());
  const [visibleLibraryOptionLimit, setVisibleLibraryOptionLimit] = useState(LIBRARY_OPTION_RENDER_BATCH);
  const hasTargetSelection = Boolean(selectedEntry?.id);
  const showTargetChooser = sidebarExpanded || !hasTargetSelection;

  const document = selectedState?.document
    ? materializeRuntimeDocument(selectedState.document, selectedState.draftOverrides ?? {}, selectedState.draftOperations ?? [])
    : undefined;
  const suggestions = useMemo(
    () => deriveLibrarySuggestions(document, selectedState?.operationCapabilities),
    [document, selectedState?.operationCapabilities],
  );
  const visibleSuggestions = useMemo(
    () =>
      [...suggestions].sort((left, right) => {
        const categoryDelta = categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category);
        return categoryDelta !== 0 ? categoryDelta : left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
      }),
    [suggestions],
  );
  const suggestionSignature = useMemo(
    () => visibleSuggestions.map((item) => item.blockId).join("|"),
    [visibleSuggestions],
  );
  const selectedSuggestion = visibleSuggestions.find((item) => item.blockId === selectedBlockId) ?? visibleSuggestions[0] ?? null;
  const queuedAdds = (selectedState?.draftOperations ?? []).filter((entry) => entry.mode === "library" || entry.mode === "library-add");
  const collectionViews = useMemo<LibraryCollectionView[]>(
    () => [
      { id: "favorites", label: "Favorites", description: "Your personal shortlist.", optionIds: favoriteOptionIds, scope: "favorites" },
      ...(libraryMetadata?.sharedCollections ?? []).map((entry) => ({ ...entry, scope: "shared" as const })),
      ...localCollections.map((entry) => ({ ...entry, scope: "local" as const })),
    ],
    [favoriteOptionIds, libraryMetadata?.sharedCollections, localCollections],
  );
  const filteredLibraryOptions = useMemo(() => {
    const favoriteSet = new Set(favoriteOptionIds);
    return [...remoteLibraryEntries].sort((left, right) => {
      const leftFavorite = favoriteSet.has(left.optionId) ? 1 : 0;
      const rightFavorite = favoriteSet.has(right.optionId) ? 1 : 0;
      if (leftFavorite !== rightFavorite) return rightFavorite - leftFavorite;
      return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
    });
  }, [favoriteOptionIds, remoteLibraryEntries]);
  const renderedLibraryOptions = useMemo(
    () => filteredLibraryOptions.slice(0, visibleLibraryOptionLimit),
    [filteredLibraryOptions, visibleLibraryOptionLimit],
  );
  const canLoadMoreLibraryOptions = renderedLibraryOptions.length < filteredLibraryOptions.length;
  const selectedLibraryOption = filteredLibraryOptions.find((entry) => entry.optionId === selectedOptionId) ?? filteredLibraryOptions[0] ?? null;
  const selectedLibrarySourceEntry = useMemo(
    () => resolveCatalogEntryForOption(selectedLibraryOption, catalogEntries),
    [catalogEntries, selectedLibraryOption],
  );
  const selectedCollectionContainsOption = selectedLibraryOption
    ? (collectionViews.find((entry) => entry.id === selectedCollectionId)?.optionIds ?? []).includes(selectedLibraryOption.optionId)
    : false;

  useEffect(() => {
    setSelectedBlockId((current) => {
      if (current && visibleSuggestions.some((item) => item.blockId === current)) {
        return current;
      }
      return visibleSuggestions[0]?.blockId ?? null;
    });
  }, [selectedEntry?.id, suggestionSignature, visibleSuggestions]);

  useEffect(() => {
    if (selectedEntry?.id) {
      setSidebarExpanded(false);
    }
  }, [selectedEntry?.id]);

  useEffect(() => {
    const seed = librarySearchSeed?.trim() ?? "";
    if (!seed || appliedLibrarySearchSeedRef.current === seed) {
      return;
    }
    appliedLibrarySearchSeedRef.current = seed;
    setViewMode("browse-library");
    setLibrarySearch(seed);
    setLibraryFiltersOpen(false);
  }, [librarySearchSeed]);

  useEffect(() => {
    if (!selectedSuggestion) {
      setDraftValues({});
      return;
    }
    setDraftValues(Object.fromEntries(selectedSuggestion.values.map((value) => [value.key, value.defaultValue ?? ""])));
  }, [selectedSuggestion?.blockId]);

  useEffect(() => {
    if (!filteredLibraryOptions.length) {
      setSelectedOptionId(null);
      return;
    }
    if (!filteredLibraryOptions.some((entry) => entry.optionId === selectedOptionId)) {
      setSelectedOptionId(filteredLibraryOptions[0].optionId);
    }
  }, [filteredLibraryOptions, selectedOptionId]);

  useEffect(() => {
    setBrowseInspectorMode("details");
  }, [selectedOptionId, viewMode]);

  useEffect(() => {
    setVisibleLibraryOptionLimit(LIBRARY_OPTION_RENDER_BATCH);
  }, [categoryFilter, collectionFilter, deferredLibrarySearch, safetyFilter, sourceFilter, viewMode, selectedEntry?.id]);

  useEffect(() => {
    if (!selectedCollectionId && localCollections.length) setSelectedCollectionId(localCollections[0].id);
    if (selectedCollectionId && !localCollections.some((entry) => entry.id === selectedCollectionId)) {
      setSelectedCollectionId(localCollections[0]?.id ?? "");
    }
  }, [localCollections, selectedCollectionId]);

  useEffect(() => {
    if (viewMode !== "browse-library" || !workspaceRoot) {
      return;
    }

    const optionIds = collectionFilter === "all"
      ? undefined
      : collectionViews.find((entry) => entry.id === collectionFilter)?.optionIds?.filter((value): value is string => Boolean(value));
    const browseCacheKey = buildLibraryBrowseCacheKey({
      workspaceRoot,
      search: deferredLibrarySearch,
      category: categoryFilter !== "all" ? categoryFilter : undefined,
      source: sourceFilter !== "all" ? sourceFilter : undefined,
      safety: safetyFilter !== "all" ? safetyFilter : undefined,
      optionIds,
    });
    let cancelled = false;
    setLibraryError(null);
    const cachedResponse = libraryBrowseCache.get(browseCacheKey);
    if (cachedResponse) {
      startTransition(() => {
        setRemoteLibraryEntries(cachedResponse.entries);
        setRemoteTotalCount(cachedResponse.totalCount);
      });
      setLibraryLoading(false);
      return;
    }

    setLibraryLoading(true);
    const request =
      libraryBrowsePromiseCache.get(browseCacheKey)
      ?? launcherApi.listLibraryEntries({
          workspaceRoot,
          search: deferredLibrarySearch || undefined,
          category: categoryFilter !== "all" ? categoryFilter : undefined,
          source: sourceFilter !== "all" ? sourceFilter : undefined,
          safety: safetyFilter !== "all" ? safetyFilter : undefined,
          optionIds,
          limit: LIBRARY_OPTION_FETCH_LIMIT,
        });

    if (!libraryBrowsePromiseCache.has(browseCacheKey)) {
      libraryBrowsePromiseCache.set(browseCacheKey, request);
    }

    void request.then((response) => {
      if (cancelled) {
        return;
      }
      libraryBrowseCache.set(browseCacheKey, response);
      startTransition(() => {
        setRemoteLibraryEntries(response.entries);
        setRemoteTotalCount(response.totalCount);
      });
    }).catch((error) => {
      if (cancelled) {
        return;
      }
      setRemoteLibraryEntries([]);
      setRemoteTotalCount(0);
      setLibraryError(error instanceof Error ? error.message : "The library could not be loaded right now.");
    }).finally(() => {
      libraryBrowsePromiseCache.delete(browseCacheKey);
      if (!cancelled) {
        setLibraryLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [categoryFilter, collectionFilter, collectionViews, deferredLibrarySearch, safetyFilter, sourceFilter, viewMode, workspaceRoot]);

  useEffect(() => {
    if (!workspaceRoot || !selectedEntry?.id) {
      return;
    }
    const browseCacheKey = buildLibraryBrowseCacheKey({
      workspaceRoot,
      search: "",
      category: undefined,
      source: undefined,
      safety: undefined,
      optionIds: undefined,
    });
    if (libraryBrowseCache.has(browseCacheKey) || libraryBrowsePromiseCache.has(browseCacheKey)) {
      return;
    }
    const request = launcherApi.listLibraryEntries({
      workspaceRoot,
      limit: LIBRARY_OPTION_FETCH_LIMIT,
    });
    libraryBrowsePromiseCache.set(browseCacheKey, request);
    void request
      .then((response) => {
        libraryBrowseCache.set(browseCacheKey, response);
      })
      .finally(() => {
        libraryBrowsePromiseCache.delete(browseCacheKey);
      });
  }, [selectedEntry?.id, workspaceRoot]);

  const categoryOptions = useMemo(
    () => [
      { label: "All categories", value: "all" },
      ...makeUniqueOptions(
        [...(libraryMetadata?.allOptionCategories ?? []), ...filteredLibraryOptions.map((entry) => entry.category)],
        normalizeLibraryLabel,
      ),
    ],
    [filteredLibraryOptions, libraryMetadata?.allOptionCategories],
  );
  const sourceOptions = [
    { label: "All sources", value: "all" },
    { label: "Normal game values", value: "normal" },
    { label: "Game mode settings", value: "arena" },
    { label: "DevArguments settings", value: "dev-only" },
    { label: "Custom content", value: "custom" },
  ];
  const safetyOptions = useMemo(
    () => [{ label: "All safety levels", value: "all" }, ...makeUniqueOptions([...(libraryMetadata?.allOptionSafetyLevels ?? []), "safe", "medium", "advanced", "experimental"])],
    [libraryMetadata?.allOptionSafetyLevels],
  );
  const collectionOptions = useMemo(
    () => [{ label: "All collections", value: "all" }, ...collectionViews.map((entry) => ({ label: entry.label, value: entry.id }))],
    [collectionViews],
  );
  const activeLibraryFilters = useMemo(() => {
    const filters: Array<{ key: string; label: string }> = [];
    if (categoryFilter !== "all") {
      filters.push({ key: "category", label: `Category: ${resolveSelectOptionLabel(categoryOptions, categoryFilter)}` });
    }
    if (sourceFilter !== "all") {
      filters.push({ key: "source", label: `Source: ${resolveSelectOptionLabel(sourceOptions, sourceFilter)}` });
    }
    if (safetyFilter !== "all") {
      filters.push({ key: "safety", label: `Safety: ${resolveSelectOptionLabel(safetyOptions, safetyFilter)}` });
    }
    if (collectionFilter !== "all") {
      filters.push({ key: "collection", label: `Collection: ${resolveSelectOptionLabel(collectionOptions, collectionFilter)}` });
    }
    return filters;
  }, [categoryFilter, collectionFilter, categoryOptions, collectionOptions, safetyFilter, safetyOptions, sourceFilter]);
  const activeLibraryFilterCount = activeLibraryFilters.length;

  useEffect(() => {
    if (viewMode !== "browse-library") {
      setLibraryFiltersOpen(false);
    }
  }, [viewMode]);

  function openSourceFile() {
    if (!selectedLibrarySourceEntry) return;
    if (selectedLibrarySourceEntry.group !== editorGroup) onChangeGroup(selectedLibrarySourceEntry.group as typeof editorGroup);
    onSelectEntry(selectedLibrarySourceEntry.id);
  }

  function clearLibraryFilters() {
    setCategoryFilter("all");
    setSourceFilter("all");
    setSafetyFilter("all");
    setCollectionFilter("all");
  }

  function createCollection() {
    if (!newCollectionName.trim()) return;
    onCreateCollection(newCollectionName);
    setNewCollectionName("");
  }

  return (
    <div
      ref={pageMotionRef}
      className={`task-layout task-layout--library ${!showTargetChooser ? "is-sidebar-collapsed" : ""}`}
      data-testid="rebalance-library-layout"
    >
      {showTargetChooser ? (
      <aside className="task-sidebar soft-panel thin-scrollbar" data-motion-item>
        <div className="task-sidebar-head">
          <p className="atelier-kicker">Library</p>
          <h2 className="task-title" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            Choose one target
            <HintPopover hintId="file-picker" />
          </h2>
          <p className="task-copy">Pick the existing file that should receive one reusable block or one copied stored value.</p>
          <div className="task-group-list">
            {editorGroups.filter((group) => ["augments", "items", "characters", "managers", "gamemode"].includes(group.key)).map((group) => (
              <button key={group.key} className={`task-group-button ${group.key === editorGroup ? "is-active" : ""}`} onClick={() => onChangeGroup(group.key as typeof editorGroup)} type="button">
                {displayEditorGroupLabel(group.key as EditorGroupKey, group.label)}
              </button>
            ))}
          </div>
          <Input aria-label="Search files for library flow" placeholder="Search files" startContent={<Search className="h-4 w-4 text-slate-500" />} value={search} onValueChange={onSearchChange} />
          {/*
            Phase 3 Task 16 — SmartFilterChips mount.
            TODO Phase 4: thread `activeSmartFilters` into a filtered view of
            `entries` (or push the predicate up to the parent) so toggling a
            chip actually filters the visible files. Doing so safely requires
            reshaping the parent-owned `entries` prop without breaking the
            existing LauncherApp tests, so this conservative integration only
            mounts the chips visually and persists saved searches through the
            helper.
          */}
          <div data-testid="library-smart-filter-chips" style={{ marginTop: 8 }}>
            <SmartFilterChips
              activeFilters={activeSmartFilters}
              onToggle={(id) => {
                setActiveSmartFilters((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) {
                    next.delete(id);
                  } else {
                    next.add(id);
                  }
                  return next;
                });
              }}
              savedSearches={savedSearches}
              onRemoveSavedSearch={(query) => setSavedSearches(removeSearch("library", query))}
              onApplySavedSearch={(query) => onSearchChange(query)}
            />
          </div>
        </div>
        <div className="task-sidebar-body">
          {entries.map((entry) => (
            <button
              key={entry.id}
              className={`task-record ${entry.id === selectedEntry?.id ? "is-active" : ""}`}
              onClick={() => {
                onSelectEntry(entry.id);
                setSidebarExpanded(false);
              }}
              type="button"
            >
              <div className="flex items-center gap-3">
                {entry.iconPreviewPath ? (
                  <IconPreview
                    previewPath={entry.iconPreviewPath}
                    cropX={entry.iconCropX}
                    cropY={entry.iconCropY}
                    cropWidth={entry.iconCropWidth}
                    cropHeight={entry.iconCropHeight}
                    sourceWidth={entry.iconSourceWidth}
                    sourceHeight={entry.iconSourceHeight}
                    size={48}
                    className="task-record-icon"
                  />
                ) : shouldRequireCatalogIcon(entry) ? (
                  <MissingIconBadge className="task-record-icon" label="Missing icon" subtitle="Target" />
                ) : null}
                <div className="min-w-0">
                  <p title={entry.title}>{entry.title}</p>
                  <p title={entry.subtitle}>{entry.subtitle}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>
      ) : null}

      <section className="task-main">
        <Card className="soft-panel border-none shadow-none" data-motion-item>
          <CardHeader className="task-header">
            <div>
              <p className="atelier-kicker">Add</p>
              <h3 className="task-title">{selectedEntry ? "Add to existing file" : "Choose one target"}</h3>
              <p className="task-copy">Keep one target fixed, then queue a guided block or reuse one stored value. Create stays the place for brand-new augment cards with live preview.</p>
            </div>
            <div className="task-header-actions">
              <Button variant="flat" startContent={<RefreshCw className="h-4 w-4" />} onPress={onReload}>Reload</Button>
              <span style={{ display: "inline-flex", alignItems: "center" }}>
                <Button color="primary" startContent={<Save className="h-4 w-4" />} onPress={onSave}>Save</Button>
                <HintPopover hintId="save-action" />
              </span>
            </div>
          </CardHeader>
          <CardBody className="task-body">
            {selectedState?.loading ? <div className="task-empty"><Spinner size="sm" /><p>Loading the selected file...</p></div> : null}
            {selectedState?.error ? <div className="task-error">{selectedState.error}</div> : null}
            {document ? (
              <>
                <div className="task-focus-selector-bar task-focus-selector-bar--library">
                <div className="task-focus-selector-copy">
                  <div className="task-focus-selector-line">
                    <span className="task-focus-selector-kicker">Existing target</span>
                    <strong>{selectedEntry?.title ?? "Choose one file"}</strong>
                  </div>
                  <span>
                    {selectedEntry?.subtitle ? `${selectedEntry.subtitle} · ` : ""}
                    Add only edits an existing file. Use Create when you want a brand-new augment card.
                  </span>
                </div>
                  <Button variant="flat" onPress={() => setSidebarExpanded(true)}>
                    Change target
                  </Button>
                </div>
                <div className="task-segmented">
                  <button className={viewMode === "quick-add" ? "is-active" : ""} onClick={() => setViewMode("quick-add")} type="button">Guided block</button>
                  <button className={viewMode === "browse-library" ? "is-active" : ""} onClick={() => setViewMode("browse-library")} type="button">Copy stored value</button>
                </div>
                {viewMode === "quick-add" ? (
                  <div className="space-y-5">
                    <div className="task-workspace-shell task-workspace-shell--single">
                      <div className="task-workspace-main task-library-quick-add-workspace">
                        <SectionCard
                          className="task-library-block-picker"
                          title="Choose one block"
                          subtitle="Pick one guided block first, tune its values, and queue it into the selected file."
                          actions={<HintPopover hintId="effect-add" />}
                        >
                          <div className="task-list">
                            {visibleSuggestions.length ? visibleSuggestions.map((item) => (
                              <button key={item.blockId} className={`task-choice ${selectedSuggestion?.blockId === item.blockId ? "is-active" : ""}`} onClick={() => setSelectedBlockId(item.blockId)} type="button">
                                <p>{item.label}</p>
                                <p>{item.description ?? "A reusable gameplay block for this file."}</p>
                              </button>
                            )) : <div className="task-empty-card"><p>No guided add blocks were generated for this file yet.</p></div>}
                          </div>
                        </SectionCard>
                        {selectedSuggestion ? (
                          <SectionCard className="task-library-block-editor" title={selectedSuggestion.label} subtitle={selectedSuggestion.description ?? "Fill in the values you want, then add this block to the selected file."}>
                            <div className="space-y-4">
                              {selectedSuggestion.values.map((field) => (
                                <div key={field.key}>
                                  {field.options?.length ? (
                                    <Select label={field.label} value={String(draftValues[field.key] ?? field.defaultValue ?? field.options[0] ?? "")} options={field.options.map((option) => ({ label: option, value: option }))} onValueChange={(value) => setDraftValues((current) => ({ ...current, [field.key]: value }))} description={field.description} />
                                  ) : (
                                    <Input label={field.label} type={normalizeInputType(field.valueType)} value={String(draftValues[field.key] ?? field.defaultValue ?? "")} onValueChange={(value) => setDraftValues((current) => ({ ...current, [field.key]: normalizeFieldValue(value, field.valueType) }))} description={field.description} />
                                  )}
                                </div>
                              ))}
                              <div className="flex flex-wrap gap-3">
                                <Button color="primary" startContent={<Plus className="h-4 w-4" />} onPress={() => onQueueOperation({ type: selectedSuggestion.operationType, path: selectedSuggestion.targetPath, mode: "library-add", sourceTargetKey: selectedSuggestion.blockId, value: { blockId: selectedSuggestion.blockId, category: selectedSuggestion.category, values: draftValues } as unknown as JsonValue })}>
                                  Add this block
                                </Button>
                              </div>
                            </div>
                          </SectionCard>
                        ) : null}
                        <SectionCard
                          className="task-library-target-summary"
                          title="Target summary"
                          subtitle="Add stays tied to the selected file. Switch to Create when you want a new augment card with live preview."
                        >
                          <div className="task-stack">
                            <div className="task-inline-card">
                              <div>
                                <p>{selectedEntry?.title ?? "No target selected"}</p>
                                <p>{selectedEntry?.subtitle ?? "Choose the file that should receive the new block."}</p>
                              </div>
                              <p className="task-muted">{queuedAdds.length ? `${queuedAdds.length} queued` : "Ready"}</p>
                            </div>
                            <p className="task-muted">This flow writes into an existing file. It does not generate a new card shell.</p>
                          </div>
                        </SectionCard>
                        {(mode === "studio" && !embedded) || queuedAdds.length > 0 ? (
                          <SectionCard
                            className="task-library-queue-card"
                            title="Queued adds"
                            subtitle="Keep this short. Review what will be written, then save the file."
                          >
                            <div className="task-stack">
                              {queuedAdds.length ? queuedAdds.map((entry, index) => (
                                <div key={`${entry.path}-${index}`} className="task-inline-card">
                                  <div><p>{entry.sourceTargetKey ?? "Queued block"}</p><p>{entry.path}</p></div>
                                  <Button variant="flat" onPress={() => onRemoveQueuedOperation(index)}>Remove</Button>
                                </div>
                              )) : <p className="task-muted">No library additions are queued for this file yet.</p>}
                              {queuedAdds.length ? <Button variant="flat" onPress={onClearQueuedOperations}>Clear queued adds</Button> : null}
                            </div>
                          </SectionCard>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <SectionCard title="Copy existing" subtitle="Search the discovered library, inspect one exported value, then reuse only the one entry you actually need.">
                      <div className="space-y-3">
                        <Input label="Search" value={librarySearch} onValueChange={setLibrarySearch} placeholder="Find HP, damage, zone, poison..." startContent={<Search className="h-4 w-4 text-slate-500" />} />
                        <div className="task-library-filter-shell task-library-filter-shell--compact">
                          <div className="task-library-filter-meta">
                            <div className="task-library-filter-summary">
                              <p className="task-muted">Search first, then open filters only when the list still feels noisy.</p>
                              {activeLibraryFilterCount ? (
                                <div className="task-library-active-filter-pills" role="list" aria-label="Active library filters">
                                  {activeLibraryFilters.map((filter) => (
                                    <span key={filter.key} className="task-library-active-filter-pill" role="listitem">
                                      {filter.label}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            <div className="task-library-filter-actions">
                              <span className="task-library-result-count">
                                {libraryLoading
                                  ? "Loading..."
                                  : (renderedLibraryOptions.length === filteredLibraryOptions.length
                                    ? `${remoteTotalCount} result${remoteTotalCount === 1 ? "" : "s"}`
                                    : `${renderedLibraryOptions.length} of ${filteredLibraryOptions.length}`)}
                              </span>
                              <Button size="sm" variant="flat" onPress={() => setLibraryFiltersOpen((current) => !current)}>
                                {libraryFiltersOpen ? "Hide filters" : activeLibraryFilterCount ? `Filters (${activeLibraryFilterCount})` : "Filters"}
                              </Button>
                              {activeLibraryFilterCount ? (
                                <Button size="sm" variant="flat" onPress={clearLibraryFilters}>
                                  Clear
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          {libraryFiltersOpen ? (
                            <div className="task-library-filter-grid">
                              <Select label="Category" value={categoryFilter} options={categoryOptions} onValueChange={setCategoryFilter} />
                              <Select label="Source" value={sourceFilter} options={sourceOptions} onValueChange={setSourceFilter} />
                              <Select label="Safety" value={safetyFilter} options={safetyOptions} onValueChange={setSafetyFilter} />
                              <Select label="Collection" value={collectionFilter} options={collectionOptions} onValueChange={setCollectionFilter} />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </SectionCard>
                    <div className="task-split">
                      <div className="task-library-option-rail">
                        <div className="task-list" data-testid="rebalance-library-option-list">
                          {libraryLoading ? <div className="task-empty-card"><Spinner size="sm" /><p>Loading library results...</p></div> : null}
                          {!libraryLoading && libraryError ? <div className="task-empty-card"><p>{libraryError}</p></div> : null}
                          {!libraryLoading && !libraryError && renderedLibraryOptions.length ? renderedLibraryOptions.map((entry) => (
                            <button key={entry.optionId} className={`task-choice task-choice--library-result ${selectedLibraryOption?.optionId === entry.optionId ? "is-active" : ""}`} onClick={() => setSelectedOptionId(entry.optionId)} type="button">
                              <div className="flex items-start gap-3">
                                {entry.iconPreviewPath ? (
                                  <IconPreview
                                    previewPath={entry.iconPreviewPath}
                                    cropX={entry.iconCropX}
                                    cropY={entry.iconCropY}
                                    cropWidth={entry.iconCropWidth}
                                    cropHeight={entry.iconCropHeight}
                                    sourceWidth={entry.iconSourceWidth}
                                    sourceHeight={entry.iconSourceHeight}
                                    className="task-icon-preview shrink-0"
                                    size={44}
                                  />
                                ) : shouldRequireLibraryIcon(entry) ? (
                                  <MissingIconBadge className="task-icon-preview shrink-0" label="Missing icon" subtitle="Gameplay card" />
                                ) : null}
                                <div className="min-w-0 task-library-result-copy">
                                  <p>{resolveFriendlyName(entry.resolvedName, entry.displayName, entry.label, entry.targetKey)}{favoriteOptionIds.includes(entry.optionId) ? " - saved" : ""}</p>
                                  <p>{buildOptionSubline(entry)}</p>
                                </div>
                              </div>
                            </button>
                          )) : null}
                          {!libraryLoading && !libraryError && !filteredLibraryOptions.length ? <div className="task-empty-card"><p>No library options match these filters right now.</p></div> : null}
                        </div>
                        {canLoadMoreLibraryOptions ? (
                          <div className="task-library-results-footer">
                            <Button variant="flat" onPress={() => setVisibleLibraryOptionLimit((current) => current + LIBRARY_OPTION_RENDER_BATCH)}>
                              Show {Math.min(LIBRARY_OPTION_RENDER_BATCH, filteredLibraryOptions.length - renderedLibraryOptions.length)} more
                            </Button>
                          </div>
                        ) : null}
                      </div>
                      <div className="task-library-inspector-shell space-y-5">
                        {selectedLibraryOption ? (
                          <SectionCard title={resolveFriendlyName(selectedLibraryOption.resolvedName, selectedLibraryOption.displayName, selectedLibraryOption.label, selectedLibraryOption.targetKey)} subtitle={selectedLibraryOption.description ?? "A discovered gameplay value from the current runtime export."}>
                            <div className="space-y-4">
                              <div className="task-section-picker task-section-picker--inline">
                                <p className="task-section-picker-label">Inspector surface</p>
                                <div className="task-segmented">
                                  <button type="button" className={browseInspectorMode === "details" ? "is-active" : ""} onClick={() => setBrowseInspectorMode("details")}>
                                    Inspect value
                                  </button>
                                  <button type="button" className={browseInspectorMode === "save" ? "is-active" : ""} onClick={() => setBrowseInspectorMode("save")}>
                                    Save for later
                                  </button>
                                </div>
                              </div>
                              <div className="task-inline-card">
                                <div className="flex min-w-0 items-center gap-3">
                                  {selectedLibraryOption.iconPreviewPath ? (
                                    <IconPreview
                                      previewPath={selectedLibraryOption.iconPreviewPath}
                                      cropX={selectedLibraryOption.iconCropX}
                                      cropY={selectedLibraryOption.iconCropY}
                                      cropWidth={selectedLibraryOption.iconCropWidth}
                                      cropHeight={selectedLibraryOption.iconCropHeight}
                                      sourceWidth={selectedLibraryOption.iconSourceWidth}
                                      sourceHeight={selectedLibraryOption.iconSourceHeight}
                                      className="task-icon-preview shrink-0"
                                      size={44}
                                    />
                                  ) : (
                                    <MissingIconBadge
                                      className="task-icon-preview shrink-0"
                                      label={shouldRequireLibraryIcon(selectedLibraryOption) ? "Missing icon" : "No icon"}
                                      subtitle={shouldRequireLibraryIcon(selectedLibraryOption) ? "Gameplay card" : "Technical value"}
                                    />
                                  )}
                                  <div className="min-w-0">
                                    <p>{resolveFriendlyName(selectedLibraryOption.resolvedName, selectedLibraryOption.displayName, selectedLibraryOption.targetKey)}</p>
                                    <p>{selectedLibraryOption.file ?? selectedLibraryOption.path}</p>
                                  </div>
                                </div>
                                <p className="task-muted">{normalizeLibraryLabel(selectedLibraryOption.sourceGroup ?? selectedLibraryOption.source ?? "")}</p>
                              </div>
                              <div className="task-library-action-row flex flex-wrap gap-3">
                                <Button variant="flat" startContent={<Star className="h-4 w-4" />} onPress={() => onToggleFavorite(selectedLibraryOption.optionId)}>
                                  {favoriteOptionIds.includes(selectedLibraryOption.optionId) ? "Remove from favorites" : "Save to favorites"}
                                </Button>
                                <Button
                                  variant="flat"
                                  startContent={<ArrowUpRight className="h-4 w-4" />}
                                  isDisabled={!selectedLibrarySourceEntry}
                                  onPress={selectedLibrarySourceEntry ? openSourceFile : undefined}
                                  title={selectedLibrarySourceEntry ? "Open the exported source file for this value." : "No source file is available for this exported value."}
                                >
                                  Open source file
                                </Button>
                              </div>
                              {browseInspectorMode === "details" ? (
                                <>
                                  <div className="task-library-value-stack">
                                    <div className="space-y-2">
                                      <p className="task-muted">Current value</p>
                                      <p>{formatValue(selectedLibraryOption.currentValue)}</p>
                                    </div>
                                    <div className="space-y-2">
                                      <p className="task-muted">Default value</p>
                                      <p>{formatValue(selectedLibraryOption.defaultValue)}</p>
                                    </div>
                                  </div>
                                  {selectedLibraryOption.valueRange || selectedLibraryOption.vanillaRange || selectedLibraryOption.extendedRange ? (
                                    <div className="space-y-2">
                                      <p className="task-muted">Range</p>
                                      <p>{formatRange(selectedLibraryOption.valueRange ?? selectedLibraryOption.extendedRange ?? selectedLibraryOption.vanillaRange)}</p>
                                      {selectedLibraryOption.beyondVanilla ? <p className="task-muted">This option can go beyond the usual in-game limit when the mod supports it.</p> : null}
                                    </div>
                                  ) : null}
                                  {selectedLibraryOption.source === "dev-only" || selectedLibraryOption.riskLevel === "experimental" ? <div className="task-note"><p>Experimental: this comes from DevArguments or another risky source. It can be useful, but it may also break a match or crash the game.</p></div> : null}
                                </>
                              ) : (
                                <div className="task-stack">
                                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                                    <Input label="Create a new collection" value={newCollectionName} onValueChange={setNewCollectionName} placeholder="Example: My favorite HP values" />
                                    <div className="flex items-end"><Button variant="flat" startContent={<FolderPlus className="h-4 w-4" />} onPress={createCollection}>Create collection</Button></div>
                                  </div>
                                  {localCollections.length ? (
                                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                                      <Select label="Save this option to a collection" value={selectedCollectionId} options={localCollections.map((entry) => ({ label: entry.label, value: entry.id }))} onValueChange={setSelectedCollectionId} />
                                      <div className="flex items-end"><Button variant="flat" onPress={() => selectedCollectionId ? onToggleCollectionMembership(selectedCollectionId, selectedLibraryOption.optionId) : undefined}>{selectedCollectionContainsOption ? "Remove from collection" : "Save to collection"}</Button></div>
                                    </div>
                                  ) : <p className="task-muted">Create your first personal collection to keep useful values together.</p>}
                                  {collectionViews.length ? (
                                    <div className="task-library-collection-stack">
                                      {collectionViews.map((collection) => (
                                        <div key={collection.id} className="task-inline-card">
                                          <div><p>{collection.label}</p><p>{collection.description ?? "A saved library collection."}</p></div>
                                          <p className="task-muted">{collection.optionIds?.length ?? 0} items</p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          </SectionCard>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </CardBody>
        </Card>
      </section>
    </div>
  );
}

function deriveLibrarySuggestions(document: RuntimeDocument | undefined, capabilities: OperationCapabilitiesResponse | null | undefined): LibrarySuggestion[] {
  const fromDocument = Array.isArray(document?.librarySuggestions) ? (document.librarySuggestions as unknown[]) : [];
  const normalizedDocument = fromDocument.map(normalizeSuggestion).filter((item): item is LibrarySuggestion => item !== null);
  if (normalizedDocument.length) return normalizedDocument;
  return capabilities?.capabilities?.filter((item) => item.kind === "add" || item.kind === "replace").map((item) => ({
    blockId: `${item.kind}:${item.path}`,
    label: item.label,
    description: item.description,
    category: inferCategory(item.label, item.description),
    targetPath: item.path,
    operationType: item.kind,
    values: [{ key: "value", label: item.label, description: item.description, valueType: item.valueType ?? "string", defaultValue: item.defaultValue, options: item.options }],
  })) ?? [];
}

function normalizeSuggestion(value: unknown): LibrarySuggestion | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  const fields = Array.isArray(entry.fields) ? entry.fields : [];
  return {
    blockId: String(entry.blockId ?? entry.id ?? entry.key ?? ""),
    label: String(entry.label ?? entry.name ?? "Library block"),
    description: typeof entry.description === "string" ? entry.description : undefined,
    category: String(entry.category).toLowerCase().includes("effect") ? "Effects" : "Basics",
    targetPath: String(entry.targetPath ?? entry.path ?? ""),
    operationType: String(entry.operationType ?? entry.kind ?? "add"),
    values: fields.map((field, index) => normalizeField(field, index)).filter((field): field is LibrarySuggestion["values"][number] => field !== null),
  };
}

function normalizeField(value: unknown, index: number): LibrarySuggestion["values"][number] | null {
  if (!value || typeof value !== "object") return null;
  const field = value as Record<string, unknown>;
  return {
    key: String(field.key ?? field.path ?? `value${index + 1}`),
    label: String(field.label ?? field.name ?? `Value ${index + 1}`),
    description: typeof field.description === "string" ? field.description : undefined,
    valueType: typeof field.valueType === "string" ? field.valueType : "string",
    defaultValue: (field.defaultValue ?? field.value ?? "") as JsonValue,
    options: Array.isArray(field.options) ? field.options.map((item) => String(item)) : undefined,
  };
}

function inferCategory(label?: string, description?: string): LibrarySuggestion["category"] {
  const text = `${label ?? ""} ${description ?? ""}`.toLowerCase();
  return text.includes("poison") || text.includes("burn") || text.includes("status") || text.includes("effect") ? "Effects" : "Basics";
}

function buildLibraryBrowseCacheKey({
  workspaceRoot,
  search,
  category,
  source,
  safety,
  optionIds,
}: {
  workspaceRoot: string;
  search?: string;
  category?: string;
  source?: string;
  safety?: string;
  optionIds?: string[];
}) {
  return JSON.stringify({
    workspaceRoot,
    search: (search ?? "").trim().toLowerCase(),
    category: category ?? "",
    source: source ?? "",
    safety: safety ?? "",
    optionIds: [...(optionIds ?? [])].sort(),
  });
}

function buildQuickAddPreview(
  preview: RuntimeDocument["cardPreview"] | null | undefined,
  suggestion: LibrarySuggestion | null,
  draftValues: Record<string, JsonValue>,
) {
  if (!preview && !suggestion) {
    return null;
  }

  const basePreview: NonNullable<RuntimeDocument["cardPreview"]> = preview
    ? {
        ...preview,
        statLines: [...(preview.statLines ?? [])],
        largeCard: preview.largeCard
          ? {
              ...preview.largeCard,
              statLines: [...(preview.largeCard.statLines ?? preview.statLines ?? [])],
            }
          : undefined,
        compactCard: preview.compactCard
          ? {
              ...preview.compactCard,
              statLines: [...(preview.compactCard.statLines ?? preview.statLines ?? [])],
            }
          : undefined,
      }
    : {
        title: suggestion?.label ?? "Pending change",
        description: suggestion?.description,
        cardKind: "augment",
        sourceHint: "Add from Library",
        iconStatus: "missing",
        statLines: [],
      };

  if (!suggestion) {
    return basePreview;
  }

  const valueSummary = suggestion.values
    .map((field) => {
      const value = draftValues[field.key] ?? field.defaultValue;
      if (value === undefined || value === "") {
        return null;
      }
      return suggestion.values.length === 1
        ? formatValue(value)
        : `${field.label}: ${formatValue(value)}`;
    })
    .filter((value): value is string => Boolean(value))
    .join(" • ");

  basePreview.statLines = [
    ...(basePreview.statLines ?? []),
    {
      label: suggestion.label,
      value: valueSummary || "Pending value",
      category: suggestion.category,
    },
  ];
  if (basePreview.largeCard) {
    basePreview.largeCard.statLines = [...basePreview.statLines];
  }
  if (basePreview.compactCard) {
    basePreview.compactCard.statLines = [...basePreview.statLines];
  }

  basePreview.sourceHint = `${preview?.sourceHint ?? "Existing target"} + pending add`;
  return basePreview;
}

function resolveSelectOptionLabel(options: Array<{ label: string; value: string }>, value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function normalizeFieldValue(value: string, valueType?: string): JsonValue {
  const type = (valueType ?? "string").toLowerCase();
  if (type === "boolean") return value === "true";
  if (type === "integer") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (type === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return value;
}

function normalizeInputType(valueType?: string): "text" | "number" {
  const type = (valueType ?? "string").toLowerCase();
  return type === "integer" || type === "number" ? "number" : "text";
}

function makeUniqueOptions(
  values: Array<string | undefined>,
  labelFormatter: (value: string) => string = (value) => value,
): Array<{ label: string; value: string }> {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).map((value) => ({ label: labelFormatter(value), value }));
}

function resolveCatalogEntryForOption(option: LibraryAllOptionEntry | null, entries: CatalogEntry[]): CatalogEntry | null {
  if (!option?.file) return null;
  const normalizedFile = option.file.replace(/\\/g, "/").toLowerCase();
  return entries.find((entry) => entry.relativePath.replace(/\\/g, "/").toLowerCase().endsWith(normalizedFile)) ?? null;
}

function buildOptionSubline(option: LibraryAllOptionEntry): string {
  const parts = [
    normalizeLibraryLabel(option.category),
    normalizeLibraryLabel(option.sourceGroup ?? option.source ?? ""),
    option.riskLevel === "experimental" ? "Experimental" : null,
  ].filter((value): value is string => Boolean(value));
  return parts.join(" / ");
}

function normalizeLibraryLabel(value: string): string {
  switch (value) {
    case "Arena Settings":
      return "Game Mode";
    case "arena":
      return "Game Mode";
    case "nativeui":
      return "Dev Settings";
    default:
      return value;
  }
}

function shouldRequireCatalogIcon(entry: CatalogEntry): boolean {
  const group = (entry.group ?? "").toLowerCase();
  const targetType = (entry.targetType ?? "").toLowerCase();
  return group === "augments" || group === "items" || group === "custom" || targetType === "passive" || targetType === "item";
}

function shouldRequireLibraryIcon(entry: LibraryAllOptionEntry): boolean {
  const targetType = (entry.targetType ?? "").toLowerCase();
  return targetType === "passive" || targetType === "item";
}

function displayEditorGroupLabel(group: EditorGroupKey, fallback: string): string {
  switch (group) {
    case "gamemode":
      return "Game Mode";
    case "nativeui":
      return "Dev Settings";
    default:
      return fallback;
  }
}

function formatValue(value: JsonValue | undefined): string {
  if (value === undefined) return "Not exported";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function formatRange(range: LibraryAllOptionEntry["valueRange"] | LibraryAllOptionEntry["extendedRange"] | LibraryAllOptionEntry["vanillaRange"]): string {
  if (!range) return "No range data";
  const minimum = range.minimum ?? "open";
  const maximum = range.maximum ?? "open";
  const step = range.step ?? 1;
  const unit = range.unit ? ` ${range.unit}` : "";
  return `${minimum} to ${maximum}${unit} in steps of ${step}${range.unclamped ? " and the mod can push beyond the normal slider limits." : ""}`;
}
