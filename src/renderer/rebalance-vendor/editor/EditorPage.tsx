import { PanelLeftClose, RefreshCw, Search } from "lucide-react";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button, Card, CardBody, CardHeader, Input, Spinner } from "./ui";
import { IconPreview, MissingIconBadge, QuickEditControl, SectionCard, resolveFriendlyName, stringifyInlineSafe, type EffectReferenceOption, type ExperienceMode } from "./common";
import { BulkActionToolbar } from "./components/BulkActionToolbar";
import { FilePickerDrawer } from "./components/FilePickerDrawer";
import { HintPopover } from "./components/HintPopover";
import { SaveAction } from "./components/SaveAction";
import { SmartFilterChips } from "./components/SmartFilterChips";
import { VirtualizedList } from "./components/VirtualizedList";
import { createSmartFilterRegistry, type FilterableItem, type SmartFilterId } from "./helpers/filter-predicates";
import { useMultiSelect } from "./helpers/multi-select";
import { loadSavedSearches, removeSearch, saveSearch, type SavedSearch } from "./helpers/saved-searches";
import { formatJson, materializeRuntimeDocument, resolveFieldValue, resolveQuickValue, resolveSimpleValue, toEditableOverrideMap } from "./document";
import { useCollapsibleSection, usePageEntranceMotion, useSelectionChangeMotion, useSidebarCollapseMotion, useTabTransition } from "./motion";
import type {
  CatalogEntry,
  CatalogGroup,
  IconChoice,
  JsonValue,
  LibraryTemplateEntry,
  OperationCapabilitiesResponse,
  QuickEditEntry,
  ReferenceChoice,
  RuntimeDocument,
  SimpleGroupEntry,
  TargetOperationEntry,
} from "./types";

export type EditorGroupKey = "augments" | "items" | "characters" | "managers" | "gamemode" | "nativeui";

/** Memoized catalog entry row – rendered in long lists of files. */
const CatalogEntryRow = memo(function CatalogEntryRow({
  entry,
  isActive,
  onSelectEntry,
  collapseSidebarOnSelection,
  onCollapseSidebar,
  isDirty,
  dirtyCount,
}: {
  entry: CatalogEntry;
  isActive: boolean;
  onSelectEntry: (entryId: string) => void;
  collapseSidebarOnSelection: boolean;
  onCollapseSidebar: () => void;
  isDirty?: boolean;
  dirtyCount?: number;
}) {
  const handleClick = useCallback(() => {
    onSelectEntry(entry.id);
    if (collapseSidebarOnSelection) {
      onCollapseSidebar();
    }
  }, [entry.id, onSelectEntry, collapseSidebarOnSelection, onCollapseSidebar]);

  return (
    <button
      className={`task-record ${isActive ? "is-active border-l-[3px] border-l-[var(--accent-cool)] bg-[var(--bg-1)]" : ""}`}
      onClick={handleClick}
      type="button"
    >
      <div className="flex items-center gap-3 justify-between w-full">
        <div className="flex items-center gap-3 min-w-0">
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
            <p title={entry.title} className="truncate">{entry.title}</p>
            <p title={entry.subtitle} className="truncate text-xs text-slate-400">{entry.subtitle}</p>
          </div>
        </div>
        {isDirty && dirtyCount && dirtyCount > 0 ? (
          <span className="change-count-badge">{dirtyCount}</span>
        ) : isDirty ? (
          <span className="task-record__status task-record__status--dirty" />
        ) : null}
      </div>
    </button>
  );
});

/** Memoized value browser row – rendered in lists of all-value entries. */
const ValueBrowserRow = memo(function ValueBrowserRow({
  item,
  value,
  isActive,
  onSelect,
  isSelected,
  showCheckboxAlways,
  onToggleSelect,
}: {
  item: QuickEditEntry;
  value: JsonValue | undefined;
  isActive: boolean;
  onSelect: (path: string) => void;
  isSelected?: boolean;
  showCheckboxAlways?: boolean;
  onToggleSelect?: (path: string) => void;
}) {
  const handleClick = useCallback(() => onSelect(item.path), [item.path, onSelect]);
  const state = useMemo(
    () => summarizeEditorRowState(value ?? item.defaultValue, item.defaultValue),
    [value, item.defaultValue],
  );

  const button = (
    <button
      type="button"
      className={`task-value-browser-row ${isActive ? "is-active" : ""} ${onToggleSelect ? "flex-1" : ""}`}
      onClick={handleClick}
    >
      <div>
        <p>{item.setting}</p>
        <span>{item.path}</span>
      </div>
      <div className="task-value-browser-row-values">
        <span>
          <em>{state.label}</em>
          <strong>{state.value}</strong>
        </span>
      </div>
    </button>
  );

  if (!onToggleSelect) {
    return button;
  }

  return (
    <div className="group flex items-stretch gap-1" data-testid={`select-row-host-${item.path}`}>
      <input
        type="checkbox"
        aria-label={`Select ${item.setting}`}
        data-testid={`select-row-${item.path}`}
        checked={Boolean(isSelected)}
        onChange={() => onToggleSelect(item.path)}
        onClick={(event) => event.stopPropagation()}
        className={`shrink-0 self-center mx-1 transition-opacity ${
          showCheckboxAlways || isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
        }`}
      />
      {button}
    </div>
  );
});

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
  operationCapabilities?: OperationCapabilitiesResponse | null;
}

export function EditorPage({
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
  onUpdateValue,
  onResetValue,
  onOverrideTextChange,
  onSave,
  onRevert,
  onReset,
  onReload,
  flowLabel = "Change",
  selectionTitle = "Choose one file",
  selectionCopy = "Pick one file, change one value, save it, test it.",
  visibleGroups,
  emptyTitle = "Choose a file",
  emptyCopy = "Choose a file from the left side to begin.",
  supplementarySection,
  previewTitle = "In-game card",
  previewSubtitle = "Use this as the truth first, then change one value below it.",
  previewDisplayMode = "large",
  quickEditTitle = "Quick edits",
  quickEditSubtitle = "Change one field at a time and keep the rest out of view.",
  quickEditCollapsed = false,
  collapseSidebarOnSelection = true,
  embeddedCompact = false,
  libraryIcons = [],
  libraryTemplates = [],
  isEntryDirty,
  getEntryDirtyCount,
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
  onUpdateValue: (item: { path: string; valueType?: string; defaultValue?: JsonValue }, value: string | boolean) => void;
  onResetValue: (path: string) => void;
  onOverrideTextChange: (value: string) => void;
  onSave: () => void;
  onRevert: () => void;
  onReset: () => void;
  onReload: () => void;
  flowLabel?: string;
  selectionTitle?: string;
  selectionCopy?: string;
  visibleGroups?: EditorGroupKey[];
  emptyTitle?: string;
  emptyCopy?: string;
  supplementarySection?: ReactNode;
  previewTitle?: string;
  previewSubtitle?: string;
  previewDisplayMode?: "both" | "large" | "compact";
  quickEditTitle?: string;
  quickEditSubtitle?: string;
  quickEditCollapsed?: boolean;
  collapseSidebarOnSelection?: boolean;
  embeddedCompact?: boolean;
  libraryIcons?: IconChoice[];
  libraryTemplates?: LibraryTemplateEntry[];
  isEntryDirty?: (entryId: string) => boolean;
  getEntryDirtyCount?: (entryId: string) => number;
}) {
  const pageMotionRef = usePageEntranceMotion();
  const [sidebarExpanded, setSidebarExpanded] = useState(() => !selectedEntry?.id);
  const sidebarRef = useSidebarCollapseMotion<HTMLElement>(sidebarExpanded);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconSearch, setIconSearch] = useState("");
  const [workspaceView, setWorkspaceView] = useState<"quick" | "presentation" | "values" | "raw">("quick");
  const workspaceViewTransitionRef = useTabTransition<HTMLDivElement>(workspaceView);
  const [sidebarFilter, setSidebarFilter] = useState<"all" | "dirty">("all");
  const sidebarFilterTransitionRef = useTabTransition<HTMLDivElement>(sidebarFilter);

  // Phase 3 Task 16 — SmartFilterChips state + Phase 4 wiring. The chips
  // are rendered visually and ALSO funnel through `createSmartFilterRegistry()`
  // so toggling a chip actually filters the rendered list. When
  // `activeSmartFilters` is empty the predicate is a pass-through, leaving
  // the existing 11 EditorPage component tests behaviour unchanged.
  const [activeSmartFilters, setActiveSmartFilters] = useState<Set<SmartFilterId>>(new Set());
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() => loadSavedSearches("editor"));

  const smartFilterRegistry = useMemo(() => createSmartFilterRegistry<FilterableItem>(), []);
  const smartFilterPredicate = useMemo(
    () => smartFilterRegistry.buildActive(activeSmartFilters),
    [smartFilterRegistry, activeSmartFilters],
  );

  // Phase 3 Task 12 — opt-in FilePickerDrawer. The original sidebar STAYS
  // visible (so the existing 11 EditorPage tests still pass), but a small
  // 'Change file' trigger in the sidebar head opens a right-anchored drawer
  // that mirrors the current entries through the FilePickerDrawer contract.
  const [pickerDrawerOpen, setPickerDrawerOpen] = useState<boolean>(false);

  // Phase 3 Task 13 — multi-select foundations. The hook tracks which value
  // paths are currently selected for bulk actions. The actual checkboxes on
  // each value row are intentionally NOT wired here (Phase 4 deeper integration
  // owns the field renderer); this wave just mounts the hook + floating
  // <BulkActionToolbar /> at the bottom of the page so future stages can hook
  // the renderer up without re-shaping the EditorPage shell again.
  const multiSelect = useMultiSelect<string>();

  const filteredSidebarEntries = useMemo(() => {
    if (sidebarFilter === "dirty" && isEntryDirty) {
      return entries.filter((entry) => isEntryDirty(entry.id));
    }
    return entries;
  }, [entries, sidebarFilter, isEntryDirty]);

  const fileSearchInputRef = useRef<HTMLInputElement>(null);
  const catalogListRef = useRef<{ scrollToIndex: (index: number) => void }>(null);

  useEffect(() => {
    if (selectedEntry?.id) {
      const idx = filteredSidebarEntries.findIndex((e) => e.id === selectedEntry.id);
      if (idx !== -1) {
        catalogListRef.current?.scrollToIndex(idx);
      }
    }
  }, [selectedEntry?.id, filteredSidebarEntries]);

  // Preserve scroll position per editor group so switching groups restores where you left off
  const groupScrollPositions = useRef<Record<string, number>>({});
  const [catalogScrollTop, setCatalogScrollTop] = useState(0);
  const handleCatalogScroll = useCallback((scrollTop: number) => {
    groupScrollPositions.current[editorGroup] = scrollTop;
  }, [editorGroup]);
  // When the group changes, restore the saved scroll position for that group
  useEffect(() => {
    setCatalogScrollTop(groupScrollPositions.current[editorGroup] ?? 0);
  }, [editorGroup]);
  const baseDocument = selectedState?.document;
  const draftOverrides = selectedState?.draftOverrides ?? {};
  const draftOperations = selectedState?.draftOperations ?? [];
  // Phase 4 — bridge the smart-filter predicate to a path/value lookup so we
  // can map both QuickEditEntry rows and all-value rows into the
  // `FilterableItem` shape consumed by `createSmartFilterRegistry`.
  const hasOverride = useCallback(
    (path: string) => Object.prototype.hasOwnProperty.call(draftOverrides, path),
    [draftOverrides],
  );
  const document = useMemo(
    () => (
      baseDocument
        ? materializeRuntimeDocument(baseDocument, draftOverrides, draftOperations)
        : undefined
    ),
    [baseDocument, draftOperations, draftOverrides],
  );
  const selectedTitle = useMemo(() => resolveEditorSelectionTitle(selectedEntry, document), [document, selectedEntry]);
  const simpleGroups = useMemo(() => document?.simpleSettings?.groups ?? [], [document]);
  const primaryIconField = useMemo(() => (document ? resolvePrimaryIconField(document) : undefined), [document]);
  const iconChoices = useMemo(
    () => buildEditorIconChoiceCatalog(document?.iconChoices ?? [], libraryIcons),
    [document?.iconChoices, libraryIcons],
  );
  const filteredQuickEdit = useMemo(
    () => (
      primaryIconField
        ? (document?.quickEdit ?? []).filter((item) => item.path !== primaryIconField.path)
        : (document?.quickEdit ?? [])
    ),
    [document, primaryIconField],
  );
  const visibleQuickEditUnfiltered = useMemo(
    () => filteredQuickEdit.filter((item) => typeof item.path === "string" && item.path.trim()),
    [filteredQuickEdit],
  );
  const visibleQuickEdit = useMemo(
    () => {
      if (activeSmartFilters.size === 0) {
        return visibleQuickEditUnfiltered;
      }
      return visibleQuickEditUnfiltered.filter((entry) =>
        smartFilterPredicate({
          hasOverride: hasOverride(entry.path),
          iconPath: null,
          currentValue: entry.value,
        }),
      );
    },
    [activeSmartFilters, hasOverride, smartFilterPredicate, visibleQuickEditUnfiltered],
  );
  const quickSummaryItems = useMemo(
    () => filteredQuickEdit.filter((item) => !(typeof item.path === "string" && item.path.trim())),
    [filteredQuickEdit],
  );
  const hasDraftChanges = useMemo(
    () => {
      const baseOverrides = baseDocument ? toEditableOverrideMap(baseDocument) : {};
      const baseOperations = baseDocument?.operations?.entries ?? [];
      return (
        JSON.stringify(draftOverrides) !== JSON.stringify(baseOverrides)
        || JSON.stringify(draftOperations) !== JSON.stringify(baseOperations)
        || Boolean(selectedState?.overrideTextError)
        || selectedState?.overrideText !== formatJson(draftOverrides)
      );
    },
    [baseDocument, draftOperations, draftOverrides, selectedState?.overrideText, selectedState?.overrideTextError],
  );
  const allValueEntriesUnfiltered = useMemo(
    () => (
      document
        ? buildAllValueEntries({
            document,
            baseDocument: baseDocument ?? document,
            draftOverrides,
            excludedPaths: new Set([
              ...filteredQuickEdit.map((item) => item.path),
              ...(primaryIconField?.path ? [primaryIconField.path] : []),
            ]),
          })
        : []
    ),
    [baseDocument, document, draftOverrides, filteredQuickEdit, primaryIconField],
  );
  const allValueEntries = useMemo(
    () => {
      if (activeSmartFilters.size === 0) {
        return allValueEntriesUnfiltered;
      }
      return allValueEntriesUnfiltered.filter(({ item, value }) =>
        smartFilterPredicate({
          hasOverride: hasOverride(item.path),
          iconPath: null,
          currentValue: value ?? item.value,
        }),
      );
    },
    [activeSmartFilters, allValueEntriesUnfiltered, hasOverride, smartFilterPredicate],
  );
  const effectReferenceOptions = useMemo(
    () =>
      document
        ? buildKnownEffectReferenceOptions({
            allValueEntries,
            document,
            libraryTemplates,
            quickEditEntries: visibleQuickEdit,
          })
        : [],
    [allValueEntries, document, libraryTemplates, visibleQuickEdit],
  );
  const currentIconValue = useMemo(
    () => (
      document && primaryIconField
        ? stringifyInlineValue(resolveQuickValue(document, primaryIconField, draftOverrides))
        : ""
    ),
    [document, draftOverrides, primaryIconField],
  );
  const selectedIconChoice = useMemo(
    () => resolveMatchingIconChoice(iconChoices, currentIconValue),
    [currentIconValue, iconChoices],
  );
  const selectedIconLabel = useMemo(
    () => (
      selectedIconChoice
        ? resolveFriendlyName(selectedIconChoice.label, selectedIconChoice.spriteName, currentIconValue)
        : resolveFriendlyName(document?.cardPreview?.title, currentIconValue)
    ),
    [currentIconValue, document?.cardPreview?.title, selectedIconChoice],
  );
  const filteredIconChoices = useMemo(() => {
    const needle = iconSearch.trim().toLowerCase();
    if (!needle) {
      return iconChoices;
    }

    return iconChoices.filter((choice) => {
      const choiceValue = readIconChoiceWriteValue(choice).toLowerCase();
      const label = resolveFriendlyName(choice.label, choice.spriteName, choiceValue).toLowerCase();
      const description = choice.description?.toLowerCase() ?? "";
      return label.includes(needle) || choiceValue.includes(needle) || description.includes(needle);
    });
  }, [iconChoices, iconSearch]);
  const allowedGroups =
    visibleGroups ??
    (mode === "studio"
      ? (["augments", "items", "characters", "managers", "nativeui"] as EditorGroupKey[])
      : (["augments", "items", "characters"] as EditorGroupKey[]));

  // Phase 3 Task 12 — derived inputs for FilePickerDrawer. Group LABELS
  // are used as both the chip text and the matching field on items so the
  // drawer's group filter works without surfacing internal keys to users.
  const pickerGroupLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of editorGroups) {
      map.set(group.key, group.label);
    }
    return map;
  }, [editorGroups]);
  const pickerGroupOptions = useMemo(
    () =>
      editorGroups
        .filter((group) => allowedGroups.includes(group.key as EditorGroupKey))
        .map((group) => group.label),
    [editorGroups, allowedGroups],
  );
  const pickerActiveGroup = useMemo(
    () => pickerGroupLabelByKey.get(editorGroup) ?? null,
    [pickerGroupLabelByKey, editorGroup],
  );
  const pickerItems = useMemo(
    () =>
      entries.map((entry) => ({
        id: entry.id,
        label: entry.title,
        group: entry.group ? pickerGroupLabelByKey.get(entry.group) ?? entry.group : undefined,
        subtitle: entry.subtitle || undefined,
      })),
    [entries, pickerGroupLabelByKey],
  );
  const handlePickerSelectGroup = useCallback(
    (label: string | null) => {
      if (!label) {
        return;
      }
      const found = editorGroups.find((group) => group.label === label);
      if (found && allowedGroups.includes(found.key as EditorGroupKey)) {
        onChangeGroup(found.key as EditorGroupKey);
      }
    },
    [editorGroups, allowedGroups, onChangeGroup],
  );
  const handlePickerSelectItem = useCallback(
    (id: string) => {
      onSelectEntry(id);
      setPickerDrawerOpen(false);
    },
    [onSelectEntry],
  );
  const hasSelectableEntries = entries.length > 0;
  const isSidebarCollapsed = Boolean(collapseSidebarOnSelection && !sidebarExpanded && selectedEntry);
  const showSidebar = hasSelectableEntries ? !(embeddedCompact && isSidebarCollapsed) : Boolean(selectedEntry);
  const useSinglePanelEmptyState = !showSidebar && !document && !selectedState?.loading;
  const sourceCountLabel = entries.length === 1 ? "1 file available" : `${entries.length} files available`;
  const headerSummaryCopy = useMemo(() => {
    if (hasDraftChanges) {
      return "Unsaved changes in this file.";
    }

    const compactSummary =
      selectedEntry?.subtitle?.trim() ||
      document?.simpleSettings?.whatThisConfigDoes?.trim() ||
      emptyCopy;

    if (!embeddedCompact) {
      return compactSummary;
    }

    return compactSummary || "Edit one file at a time.";
  }, [document?.simpleSettings?.whatThisConfigDoes, embeddedCompact, emptyCopy, hasDraftChanges, selectedEntry?.subtitle]);

  useEffect(() => {
    if (collapseSidebarOnSelection && selectedEntry?.id) {
      setSidebarExpanded(false);
    }
  }, [collapseSidebarOnSelection, selectedEntry?.id]);

  useEffect(() => {
    setIconPickerOpen(false);
    setIconSearch("");
  }, [selectedEntry?.id]);

  const hasQuickWorkspaceContent = Boolean(document);
  const workspaceViews = useMemo(
    () => {
      const views: Array<{ key: "quick" | "presentation" | "values" | "raw"; label: string; body: string }> = [];
      if (hasQuickWorkspaceContent) {
        views.push({
          key: "quick",
          label: "Quick edit",
          body: "Keep only the named controls you are changing right now in view.",
        });
      }
      if (document && (primaryIconField || supplementarySection)) {
        views.push({
          key: "presentation",
          label: "Presentation",
          body: "Card art and file-specific presentation tools stay separate from the value editor.",
        });
      }
      if (allValueEntries.length) {
        views.push({
          key: "values",
          label: "All values",
          body: "Browse one exported value group at a time instead of opening the whole file at once.",
        });
      }
      if (document) {
        views.push({
          key: "raw",
          label: "Raw",
          body: "Fallback override editing stays separate from the normal editing surface.",
        });
      }
      return views;
    },
    [allValueEntries.length, document, hasQuickWorkspaceContent, primaryIconField, supplementarySection],
  );

  useEffect(() => {
    if (workspaceViews.some((view) => view.key === workspaceView)) {
      return;
    }
    setWorkspaceView(workspaceViews[0]?.key ?? "quick");
  }, [workspaceView, workspaceViews]);

  useEffect(() => {
    if (!iconPickerOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIconPickerOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [iconPickerOpen]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        if (document) {
          e.preventDefault();
          onSave();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        if (fileSearchInputRef.current) {
          e.preventDefault();
          fileSearchInputRef.current.focus();
          fileSearchInputRef.current.select();
        }
      }
      if (e.altKey && ["1", "2", "3", "4"].includes(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const targetViewKey = workspaceViews[idx]?.key;
        if (targetViewKey) {
          e.preventDefault();
          setWorkspaceView(targetViewKey);
        }
      }
      if (e.key === "Escape") {
        if (iconPickerOpen) {
          return;
        }
        if (search) {
          e.preventDefault();
          onSearchChange("");
        }
      }
      if (e.key === "ArrowDown" && !e.altKey) {
        const activeEl = window.document.activeElement as HTMLElement | null;
        const isEditingValue = activeEl && (
          (activeEl.tagName === "INPUT" && activeEl !== fileSearchInputRef.current) ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT"
        );
        if (!isEditingValue && entries.length > 0) {
          e.preventDefault();
          const currentIndex = entries.findIndex((entry) => entry.id === selectedEntry?.id);
          const nextIndex = currentIndex < entries.length - 1 ? currentIndex + 1 : 0;
          onSelectEntry(entries[nextIndex].id);
        }
      }
      if (e.key === "ArrowUp" && !e.altKey) {
        const activeEl = window.document.activeElement as HTMLElement | null;
        const isEditingValue = activeEl && (
          (activeEl.tagName === "INPUT" && activeEl !== fileSearchInputRef.current) ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT"
        );
        if (!isEditingValue && entries.length > 0) {
          e.preventDefault();
          const currentIndex = entries.findIndex((entry) => entry.id === selectedEntry?.id);
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : entries.length - 1;
          onSelectEntry(entries[prevIndex].id);
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [document, onSave, onSearchChange, search, iconPickerOpen, workspaceViews, selectedEntry?.id, entries, onSelectEntry]);

  const quickEditOverrideCount = useMemo(
    () => Object.keys(draftOverrides).length,
    [draftOverrides],
  );

  const quickEditSection = document ? (
    <>
      <div data-tour="editor-quick-edit">
        {quickEditCollapsed ? (
          <CollapsibleQuickEditSection
            title={quickEditTitle}
            subtitle={quickEditSubtitle}
            overrideCount={quickEditOverrideCount}
          >
            <QuickEditSectionBody
              visibleQuickEdit={visibleQuickEdit}
              summaryItems={quickSummaryItems}
              simpleGroups={simpleGroups}
              baseDocument={baseDocument ?? document}
              draftOverrides={draftOverrides}
              effectReferenceOptions={effectReferenceOptions}
              onUpdateValue={onUpdateValue}
              onResetValue={onResetValue}
            />
          </CollapsibleQuickEditSection>
        ) : (
          <SectionCard title={quickEditTitle} subtitle={quickEditSubtitle} overrideCount={quickEditOverrideCount}>
            <QuickEditSectionBody
              visibleQuickEdit={visibleQuickEdit}
              summaryItems={quickSummaryItems}
              simpleGroups={simpleGroups}
              baseDocument={baseDocument ?? document}
              draftOverrides={draftOverrides}
              effectReferenceOptions={effectReferenceOptions}
              onUpdateValue={onUpdateValue}
              onResetValue={onResetValue}
            />
          </SectionCard>
        )}
      </div>
    </>
  ) : null;

  const cardArtSection = document && primaryIconField && iconChoices.length ? (
    <SectionCard
      title="Card art"
      subtitle="Switch the visible card icon here. The gallery writes the correct icon reference for this file automatically."
    >
      <div className="task-editor-icon-shell">
        <div className="task-selected-icon-card task-selected-icon-card--chooser">
          <div className="task-selected-icon-visual">
            {selectedIconChoice?.previewPath || document.cardPreview?.iconPreviewPath ? (
              <IconPreview
                previewPath={selectedIconChoice?.previewPath ?? document.cardPreview?.iconPreviewPath}
                cropX={selectedIconChoice?.cropX ?? document.cardPreview?.iconCropX}
                cropY={selectedIconChoice?.cropY ?? document.cardPreview?.iconCropY}
                cropWidth={selectedIconChoice?.cropWidth ?? document.cardPreview?.iconCropWidth}
                cropHeight={selectedIconChoice?.cropHeight ?? document.cardPreview?.iconCropHeight}
                sourceWidth={selectedIconChoice?.sourceWidth ?? document.cardPreview?.iconSourceWidth}
                sourceHeight={selectedIconChoice?.sourceHeight ?? document.cardPreview?.iconSourceHeight}
                className="task-selected-icon-preview"
                fallback={<MissingIconBadge className="task-selected-icon-preview" label="Missing" subtitle="Icon" />}
                size={88}
              />
            ) : (
              <MissingIconBadge className="task-selected-icon-preview" label="Missing" subtitle="Icon" />
            )}
          </div>
          <div className="task-selected-icon-copy">
            <p>Current icon</p>
            <strong>{selectedIconLabel || "Choose another real game icon"}</strong>
            <span>The current file stores this at <code>{primaryIconField.path}</code>.</span>
            <div className="task-selected-icon-actions">
              <Button
                className="task-selected-icon-button"
                color="secondary"
                variant="flat"
                onPress={() => {
                  setIconSearch("");
                  setIconPickerOpen(true);
                }}
              >
                Browse all game icons
              </Button>
              <Button className="task-selected-icon-button" variant="flat" onPress={() => onResetValue(primaryIconField.path)}>
                Reset icon
              </Button>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  ) : null;

  const workflowSection = null;

  const rawOverridesSection = document ? (
    <SectionCard
      title="Raw overrides"
      subtitle={
        embeddedCompact
          ? "Keep this separate from the named controls. Open it only when the normal editing surface cannot expose the value you need."
          : "Use the raw override map only when the named controls above are not enough."
      }
      actions={
        <div className="task-button-row" style={{ alignItems: "center" }}>
          <HintPopover hintId="override-map" />
          <Button variant="flat" onPress={onRevert}>
            Revert to last saved state
          </Button>
          <Button variant="flat" onPress={onReset}>
            Reset to defaults
          </Button>
        </div>
      }
    >
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
    </SectionCard>
  ) : null;

  return (
    <div
      ref={pageMotionRef}
      className={`task-layout task-layout--editor ${collapseSidebarOnSelection && !sidebarExpanded ? "is-sidebar-collapsed" : ""} ${embeddedCompact ? "is-embedded-compact" : ""} ${useSinglePanelEmptyState ? "task-layout--single-panel" : ""}`}
      data-testid="rebalance-editor-layout"
    >
      {showSidebar ? (
        <aside
          ref={sidebarRef}
          className={`task-sidebar rebalance-sidebar thin-scrollbar ${collapseSidebarOnSelection && !sidebarExpanded ? "is-collapsed" : ""}`}
          data-motion-item
          data-testid="rebalance-editor-sidebar"
        >
          {collapseSidebarOnSelection && !isSidebarCollapsed ? (
            <Button
              className="task-sidebar-dismiss"
              variant="flat"
              aria-label="Close file browser"
              onPress={() => setSidebarExpanded(false)}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          ) : null}
          <div className="task-sidebar-head">
            <button
              type="button"
              data-testid="editor-file-picker-trigger"
              className="editor-file-picker-trigger"
              onClick={() => setPickerDrawerOpen(true)}
              aria-label="Open file picker drawer"
            >
              <span className="editor-file-picker-trigger-icon" aria-hidden="true">⇄</span>
              <span>Change file</span>
            </button>
            {embeddedCompact ? (
              <div className="task-sidebar-headline">
                <div className="task-sidebar-headline-copy">
                  <p className="atelier-kicker">{isSidebarCollapsed ? "Editing now" : "Files"}</p>
                  <h2 className="task-title task-title--compact" style={{ display: "inline-flex", alignItems: "center" }}>
                    {isSidebarCollapsed ? (selectedTitle || "Selected file") : selectionTitle}
                    <HintPopover hintId="file-picker" />
                  </h2>
                </div>
                {!isSidebarCollapsed ? <span className="task-sidebar-count-badge">{entries.length}</span> : null}
              </div>
            ) : (
              <>
                <p className="atelier-kicker">{flowLabel}</p>
                <h2 className="task-title" style={{ display: "inline-flex", alignItems: "center" }}>
                  {collapseSidebarOnSelection && !sidebarExpanded && selectedEntry ? "Current file" : selectionTitle}
                  <HintPopover hintId="file-picker" />
                </h2>
              </>
            )}
            {collapseSidebarOnSelection && !sidebarExpanded ? (
              <>
                <Button variant="flat" onPress={() => setSidebarExpanded(true)}>
                  Browse files
                </Button>
              </>
            ) : (
              <>
                {!embeddedCompact ? <p className="task-copy">{selectionCopy}</p> : null}
                <div className="task-group-list">
                  {editorGroups
                    .filter((group) => allowedGroups.includes(group.key as EditorGroupKey))
                    .map((group) => (
                      <button
                        key={group.key}
                        className={`task-group-button ${group.key === editorGroup ? "is-active" : ""}`}
                        onClick={() => onChangeGroup(group.key as EditorGroupKey)}
                        type="button"
                      >
                        {mode === "guided" ? simplifyGroupName(group.key as EditorGroupKey) : group.label}
                      </button>
                    ))}
                </div>
                <div className="task-sidebar-filters mb-3 flex gap-2">
                  <button
                    type="button"
                    style={{ minHeight: "28px" }}
                    className={`v2-nav-chip text-xs px-3 py-1 rounded-full border transition-all ${sidebarFilter === "all" ? "bg-[var(--accent)] border-[var(--accent)] text-white" : "border-slate-850 text-slate-400 hover:text-slate-200"}`}
                    onClick={() => setSidebarFilter("all")}
                  >
                    All files
                  </button>
                  <button
                    type="button"
                    style={{ minHeight: "28px" }}
                    className={`v2-nav-chip text-xs px-3 py-1 rounded-full border transition-all ${sidebarFilter === "dirty" ? "bg-amber-600/25 border-amber-500/40 text-amber-300" : "border-slate-855 text-slate-400 hover:text-slate-200"}`}
                    onClick={() => setSidebarFilter("dirty")}
                  >
                    Modified
                  </button>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", width: "100%" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Input
                      ref={fileSearchInputRef}
                      aria-label="Search files for change flow"
                      placeholder="Search files (Ctrl+F)"
                      startContent={<Search className="h-4 w-4 text-slate-500" />}
                      value={search}
                      onValueChange={onSearchChange}
                    />
                  </div>
                  <button
                    type="button"
                    data-testid="editor-pin-search-button"
                    aria-label="Pin current search"
                    onClick={() => {
                      const trimmed = search.trim();
                      if (trimmed) {
                        setSavedSearches(saveSearch("editor", trimmed));
                      }
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: "transparent",
                      border: "1px solid var(--line, rgba(40,52,86,0.4))",
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 12,
                      color: "var(--text-muted, #94a3b8)",
                      cursor: search.trim() ? "pointer" : "not-allowed",
                      whiteSpace: "nowrap",
                      opacity: search.trim() ? 1 : 0.6,
                    }}
                  >
                    Pin search
                  </button>
                </div>
                {/*
                  Phase 3 Task 16 — SmartFilterChips mount.
                  Phase 4: chip toggles drive `activeSmartFilters`, which feeds
                  `smartFilterPredicate` and is applied to `visibleQuickEdit`
                  and `allValueEntries` above. When no chips are active the
                  predicate is a pure pass-through, so the existing 11
                  EditorPage component tests are unaffected.
                */}
                <div data-testid="editor-smart-filter-chips" style={{ marginTop: 8 }}>
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
                    onRemoveSavedSearch={(query) => setSavedSearches(removeSearch("editor", query))}
                    onApplySavedSearch={(query) => onSearchChange(query)}
                  />
                </div>
              </>
            )}
          </div>
          <div className="task-sidebar-body">
            {collapseSidebarOnSelection && !sidebarExpanded && selectedEntry ? (
              <button className="task-sidebar-selection-pill" onClick={() => setSidebarExpanded(true)} type="button">
                <span className="task-sidebar-selection-row">
                  {selectedEntry.iconPreviewPath ? (
                    <IconPreview
                      previewPath={selectedEntry.iconPreviewPath}
                      cropX={selectedEntry.iconCropX}
                      cropY={selectedEntry.iconCropY}
                      cropWidth={selectedEntry.iconCropWidth}
                      cropHeight={selectedEntry.iconCropHeight}
                      sourceWidth={selectedEntry.iconSourceWidth}
                      sourceHeight={selectedEntry.iconSourceHeight}
                      size={42}
                      className="task-record-icon"
                    />
                  ) : shouldRequireCatalogIcon(selectedEntry) ? (
                    <MissingIconBadge className="task-record-icon" label="Missing icon" subtitle="Target" />
                  ) : null}
                  <span className="task-sidebar-selection-copy">
                    <strong title={selectedTitle}>{selectedTitle}</strong>
                    <span>{hasDraftChanges ? "Unsaved changes" : selectedEntry.subtitle || "Editing now"}</span>
                  </span>
                </span>
              </button>
            ) : (
              <div ref={sidebarFilterTransitionRef} style={{ height: "100%" }}>
                <VirtualizedList
                  listRef={catalogListRef}
                  items={filteredSidebarEntries}
                  itemHeight={72}
                  containerHeight="100%"
                  initialScrollTop={catalogScrollTop}
                  onScrollChange={handleCatalogScroll}
                  renderItem={(entry, _index, _style) => (
                    <CatalogEntryRow
                      key={entry.id}
                      entry={entry}
                      isActive={entry.id === selectedEntry?.id}
                      onSelectEntry={onSelectEntry}
                      collapseSidebarOnSelection={collapseSidebarOnSelection}
                      onCollapseSidebar={() => setSidebarExpanded(false)}
                      isDirty={isEntryDirty ? isEntryDirty(entry.id) : false}
                      dirtyCount={getEntryDirtyCount ? getEntryDirtyCount(entry.id) : 0}
                    />
                  )}
                  emptyState={
                    <div className="task-empty-card">
                      <p>No files match this search right now.</p>
                    </div>
                  }
                />
              </div>
            )}
          </div>
        </aside>
      ) : null}

      <section className="task-main" data-testid="rebalance-editor-main">
        <Card className="v2-card border-none shadow-none" data-motion-item>
          <CardHeader className="task-header task-header--editor">
            <div className="task-header-copy-block">
              <div className="task-header-meta">
                <span className="task-header-chip">{flowLabel}</span>
                {selectedEntry?.targetType ? <span className="task-header-chip">{selectedEntry.targetType}</span> : null}
                {hasDraftChanges ? <span className="task-header-chip task-header-chip--draft">Unsaved</span> : null}
              </div>
              <h3 className="task-title">{selectedTitle || emptyTitle}</h3>
              <p className="task-copy">{headerSummaryCopy}</p>
            </div>
            <div className="task-header-actions">
              {isSidebarCollapsed ? (
                <Button variant="flat" onPress={() => setSidebarExpanded(true)}>
                  Browse files
                </Button>
              ) : null}
              {embeddedCompact && hasSelectableEntries ? (
                <button
                  type="button"
                  data-testid="editor-file-picker-trigger-header"
                  className="editor-file-picker-trigger editor-file-picker-trigger--header"
                  onClick={() => setPickerDrawerOpen(true)}
                  aria-label="Open file picker drawer"
                >
                  <span className="editor-file-picker-trigger-icon" aria-hidden="true">⇄</span>
                  <span>Change file</span>
                </button>
              ) : null}
              <Button variant="flat" startContent={<RefreshCw className="h-4 w-4" />} onPress={onReload}>
                {embeddedCompact ? "Reload file" : "Reload"}
              </Button>
              {!embeddedCompact && document ? (
                <Button variant="flat" onPress={onReset}>
                  Reset all
                </Button>
              ) : null}
              {document ? (
                <div
                  className="editor-save-action-host"
                  data-testid="editor-save-action-host"
                  data-tour="editor-save"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  <SaveAction
                    onSave={onSave}
                    isSaving={Boolean(selectedState?.saving)}
                    isDirty={hasDraftChanges}
                    appliesAt="next-launch"
                  />
                  <HintPopover hintId="save-action" />
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardBody className="task-body">
            {selectedState?.loading ? (
              <div className="task-empty">
                <Spinner size="sm" />
                <p>Loading the selected file...</p>
              </div>
            ) : null}
            {selectedState?.error ? <div className="task-error">{selectedState.error}</div> : null}

            {document ? (
              <>
                {workflowSection}
                {workspaceViews.length > 1 ? (
                  <div className="task-section-picker task-section-picker--inline">
                    <div className="task-segmented" role="tablist" aria-label="Change panels">
                      {workspaceViews.map((view) => (
                        <button
                          key={view.key}
                          type="button"
                          className={workspaceView === view.key ? "is-active text-[var(--text)]" : "text-[var(--text-muted)]"}
                          aria-pressed={workspaceView === view.key}
                          onClick={() => setWorkspaceView(view.key)}
                        >
                          {view.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div ref={workspaceViewTransitionRef} className="space-y-4">
                {workspaceView === "quick" ? (
                  <>
                    {quickEditSection}
                  </>
                ) : null}
                {workspaceView === "presentation" ? (
                  <>
                    {supplementarySection}
                    {cardArtSection}
                  </>
                ) : null}
                {workspaceView === "values" && allValueEntries.length ? (
                  <SectionCard
                    title="All values"
                    subtitle="Open one category at a time, compare the current value against the stored standard, and reset the field inline."
                    actions={<HintPopover hintId="advanced-section" />}
                  >
                    <AllValueSections
                      entries={allValueEntries}
                      effectReferenceOptions={effectReferenceOptions}
                      onUpdateValue={onUpdateValue}
                      onResetValue={onResetValue}
                      multiSelectActive={multiSelect.count > 0}
                      isPathSelected={multiSelect.isSelected}
                      onTogglePathSelect={multiSelect.toggle}
                    />
                  </SectionCard>
                ) : null}
                {workspaceView === "raw" ? rawOverridesSection : null}
                </div>
              </>
            ) : null}
            {!document && !selectedState?.loading ? (
              <SectionCard
                title={showSidebar ? emptyTitle : "No exported file is ready yet"}
                subtitle={
                  showSidebar
                    ? emptyCopy
                    : "This workspace does not expose a readable file in the current category yet. Keep the shell compact, reload the profile, or switch to another source family."
                }
              >
                <div className="task-empty-workspace">
                  {!showSidebar ? (
                    <>
                      <div className="task-empty-workspace-pills" role="list" aria-label="Available source families">
                        {editorGroups
                          .filter((group) => allowedGroups.includes(group.key as EditorGroupKey))
                          .map((group) => (
                            <button
                              key={group.key}
                              type="button"
                              className={`task-empty-workspace-pill ${group.key === editorGroup ? "is-active" : ""}`}
                              onClick={() => onChangeGroup(group.key as EditorGroupKey)}
                            >
                              {mode === "guided" ? simplifyGroupName(group.key as EditorGroupKey) : group.label}
                            </button>
                          ))}
                      </div>
                      <div className="task-empty-workspace-grid">
                        <div className="task-simple-card task-simple-card--stacked">
                          <div>
                            <p>Current source family</p>
                            <strong>{editorGroups.find((group) => group.key === editorGroup)?.label ?? flowLabel}</strong>
                          </div>
                          <p>Reload after opening the instance, or switch families if this profile only exports another runtime area.</p>
                        </div>
                        <div className="task-simple-card task-simple-card--stacked">
                          <div>
                            <p>Next step</p>
                            <strong>Reload and check again</strong>
                          </div>
                          <p>The launcher only shows files the current workspace actually exported. Empty state should stay small until real data exists.</p>
                        </div>
                      </div>
                    </>
                  ) : null}
                  <div className="task-button-row">
                    <Button variant="flat" onPress={onReload}>
                      Reload this category
                    </Button>
                    {!showSidebar ? (
                      <Button variant="flat" onPress={() => onChangeGroup(allowedGroups[0] ?? editorGroup)}>
                        Jump to first source
                      </Button>
                    ) : null}
                  </div>
                </div>
              </SectionCard>
            ) : null}
          </CardBody>
        </Card>
      </section>
      {document && primaryIconField && iconChoices.length && iconPickerOpen ? (
        <div className="task-picker-overlay" role="dialog" aria-modal="true" aria-label="Choose a game icon" onClick={() => setIconPickerOpen(false)}>
          <div className="task-picker-dialog support-card" onClick={(event) => event.stopPropagation()}>
            <div className="task-picker-dialog-head">
              <div>
                <p className="atelier-kicker">Card art</p>
                <h3 className="task-title task-title--dialog">Choose a game icon</h3>
                <p className="task-copy task-copy--dialog">Pick one real game icon. We write the exact reference into <code>{primaryIconField.path}</code> and update the preview immediately.</p>
              </div>
              <Button variant="flat" onPress={() => setIconPickerOpen(false)}>
                Close
              </Button>
            </div>
            <div className="task-picker-dialog-tools">
              <Input
                aria-label="Search game icons"
                placeholder="Search icons by name or ID..."
                startContent={<Search className="h-4 w-4 text-slate-500" />}
                value={iconSearch}
                onValueChange={setIconSearch}
              />
              <div className="task-picker-target">
                <span>Editing now</span>
                <strong>Card art</strong>
              </div>
            </div>
            <div className="task-picker-dialog-body thin-scrollbar">
              <div className="task-icon-gallery task-icon-gallery--modal">
                {filteredIconChoices.map((choice, index) => {
                  const choiceValue = readIconChoiceWriteValue(choice);
                  const isActive = matchesIconChoice(choice, currentIconValue);
                  return (
                    <button
                      key={`${choiceValue}-${index}`}
                      className={`task-icon-choice ${isActive ? "is-active" : ""}`}
                      onClick={() => {
                        onUpdateValue(
                          { path: primaryIconField.path, valueType: primaryIconField.valueType, defaultValue: primaryIconField.defaultValue },
                          choiceValue,
                        );
                        setIconPickerOpen(false);
                      }}
                      type="button"
                    >
                      <div className="task-icon-choice-head">
                        {isActive ? <span className="task-icon-choice-badge">Selected</span> : null}
                      </div>
                      {choice.previewPath ? (
                        <IconPreview
                          previewPath={choice.previewPath}
                          cropX={choice.cropX}
                          cropY={choice.cropY}
                          cropWidth={choice.cropWidth}
                          cropHeight={choice.cropHeight}
                          sourceWidth={choice.sourceWidth}
                          sourceHeight={choice.sourceHeight}
                          className="task-icon-preview"
                          fallback={<MissingIconBadge label="Missing" subtitle="Icon" />}
                          size={64}
                        />
                      ) : (
                        <MissingIconBadge label="Missing" subtitle="Icon" />
                      )}
                      <div>
                        <p>{resolveFriendlyName(choice.label, choice.spriteName, choiceValue)}</p>
                        <p className="task-icon-choice-id">{choiceValue}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {!filteredIconChoices.length ? (
                <div className="task-empty-card">
                  <p>No icons match that search yet.</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {/*
        Phase 3 Task 12 — FilePickerDrawer mount.
        Purely additive: the original sidebar (rendered above when
        `showSidebar` is true) stays untouched so the existing 11
        EditorPage tests keep passing. Opening the drawer is opt-in via
        the 'Change file' trigger in the sidebar head.
      */}
      <FilePickerDrawer
        open={pickerDrawerOpen}
        items={pickerItems}
        activeId={selectedEntry?.id ?? null}
        groupOptions={pickerGroupOptions}
        activeGroup={pickerActiveGroup}
        onSelectGroup={handlePickerSelectGroup}
        onSelectItem={handlePickerSelectItem}
        onClose={() => setPickerDrawerOpen(false)}
      />
      {/*
        Phase 3 Task 13 — BulkActionToolbar mount.
        The toolbar self-hides when fewer than 2 fields are selected. Per-row
        checkboxes inside the all-values list (ValueBrowserRow) wire into
        `multiSelect.toggle` so users can build a selection; once there is
        at least one selection the BulkActionToolbar surfaces and
        `onResetSelected` calls `onResetValue` for each selected path.
      */}
      <div data-testid="editor-bulk-action-host">
        <BulkActionToolbar
          count={multiSelect.count}
          onResetSelected={() => {
            for (const path of multiSelect.selected) {
              onResetValue(path);
            }
            multiSelect.clear();
          }}
          onCopyValues={() => {
            const paths = Array.from(multiSelect.selected).join(", ");
            if (typeof navigator !== "undefined" && navigator.clipboard) {
              void navigator.clipboard.writeText(paths);
            }
          }}
          onCancel={() => multiSelect.clear()}
        />
      </div>
    </div>
  );
}

const CollapsibleQuickEditSection = memo(function CollapsibleQuickEditSection({
  title,
  subtitle,
  overrideCount,
  children,
}: {
  title: string;
  subtitle?: string;
  overrideCount?: number;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const contentRef = useCollapsibleSection<HTMLDivElement>(expanded);

  return (
    <section data-motion-item className="task-section-card support-card rounded-[22px] border-none px-5 py-5 shadow-none">
      <button
        type="button"
        className="task-section-head flex w-full flex-wrap items-center justify-between gap-3 cursor-pointer text-left"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <div className="task-section-copy flex items-center gap-2">
          <h4 className="text-[var(--type-subtitle-size)] text-[var(--text)] font-[var(--type-subtitle-weight)]">{title}</h4>
          {overrideCount != null && overrideCount > 0 ? (
            <span className="v2-badge--highlighted">{overrideCount}</span>
          ) : null}
        </div>
        <svg
          className={`h-4 w-4 text-[var(--text-muted)] transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      <div ref={contentRef} className="task-section-body mt-4">
        {subtitle ? <p className="task-muted mb-3 text-sm text-[var(--text-muted)]">{subtitle}</p> : null}
        {children}
      </div>
    </section>
  );
});

const QuickEditSectionBody = memo(function QuickEditSectionBody({
  visibleQuickEdit,
  summaryItems,
  simpleGroups,
  baseDocument,
  draftOverrides,
  effectReferenceOptions,
  onUpdateValue,
  onResetValue,
}: {
  visibleQuickEdit: QuickEditEntry[];
  summaryItems: QuickEditEntry[];
  simpleGroups: Array<{ entries: SimpleGroupEntry[] }>;
  baseDocument: RuntimeDocument;
  draftOverrides: Record<string, JsonValue>;
  effectReferenceOptions: EffectReferenceOption[];
  onUpdateValue: (item: { path: string; valueType?: string; defaultValue?: JsonValue }, value: string | boolean) => void;
  onResetValue: (path: string) => void;
}) {
  const summarySection = useMemo(() => summaryItems.length ? (
    <div className="task-quick-summary-strip" role="list" aria-label="Quick summaries">
      {summaryItems.map((item, index) => (
        <div key={`${item.setting}-${index}`} className="task-quick-summary-pill" role="listitem">
          <span>{item.setting}</span>
          <strong>{String(item.value ?? item.defaultValue ?? "—")}</strong>
        </div>
      ))}
    </div>
  ) : null, [summaryItems]);
  const fallbackSimpleEntries = useMemo(
    () =>
      simpleGroups
        .flatMap((group) => group.entries)
        .filter((entry) => typeof entry.path === "string" && entry.path.trim())
        .slice(0, 4),
    [simpleGroups],
  );
  const [activePath, setActivePath] = useState("");
  const quickEditListRef = useRef<{ scrollToIndex: (index: number) => void }>(null);
  const activeRowRef = useRef<HTMLButtonElement>(null);

  const quickInspectorEntries = useMemo(
    () =>
      visibleQuickEdit.map((item) => ({
        key: item.path,
        title: item.setting,
        subtitle: item.whatItDoes ?? item.category ?? "Editable value",
        currentValue: resolveQuickValue(baseDocument, item, draftOverrides),
        standardValue: item.defaultValue ?? item.value,
        item,
      })),
    [baseDocument, draftOverrides, visibleQuickEdit],
  );
  const fallbackInspectorEntries = useMemo(
    () =>
      fallbackSimpleEntries.map((entry) => ({
        key: entry.path,
        title: entry.name,
        subtitle: entry.description ?? "Generated value",
        currentValue: resolveSimpleValue(baseDocument, entry, draftOverrides),
        standardValue: entry.defaultValue,
        entry,
      })),
    [baseDocument, draftOverrides, fallbackSimpleEntries],
  );
  const inspectorEntries = quickInspectorEntries.length ? quickInspectorEntries : fallbackInspectorEntries;
  const activeQuickEntry = useMemo(
    () => quickInspectorEntries.find((entry) => entry.key === activePath) ?? quickInspectorEntries[0] ?? null,
    [activePath, quickInspectorEntries],
  );
  const activeFallbackEntry = useMemo(
    () => fallbackInspectorEntries.find((entry) => entry.key === activePath) ?? fallbackInspectorEntries[0] ?? null,
    [activePath, fallbackInspectorEntries],
  );

  useEffect(() => {
    if (!inspectorEntries.length) {
      if (activePath) {
        setActivePath("");
      }
      return;
    }
    if (!inspectorEntries.some((entry) => entry.key === activePath)) {
      setActivePath(inspectorEntries[0]?.key ?? "");
    }
  }, [activePath, inspectorEntries]);

  useEffect(() => {
    if (activePath) {
      const idx = inspectorEntries.findIndex((e) => e.key === activePath);
      if (idx !== -1) {
        if (quickInspectorEntries.length > 20) {
          quickEditListRef.current?.scrollToIndex(idx);
        } else if (activeRowRef.current && typeof activeRowRef.current.scrollIntoView === "function") {
          activeRowRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
    }
  }, [activePath, inspectorEntries, quickInspectorEntries.length]);

  useEffect(() => {
    const handleSettingKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "ArrowDown") {
        if (inspectorEntries.length > 0) {
          e.preventDefault();
          const currentIndex = inspectorEntries.findIndex((entry) => entry.key === activePath);
          const nextIndex = currentIndex < inspectorEntries.length - 1 ? currentIndex + 1 : 0;
          setActivePath(inspectorEntries[nextIndex].key);
        }
      }
      if (e.altKey && e.key === "ArrowUp") {
        if (inspectorEntries.length > 0) {
          e.preventDefault();
          const currentIndex = inspectorEntries.findIndex((entry) => entry.key === activePath);
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : inspectorEntries.length - 1;
          setActivePath(inspectorEntries[prevIndex].key);
        }
      }
    };

    window.addEventListener("keydown", handleSettingKeyDown);
    return () => window.removeEventListener("keydown", handleSettingKeyDown);
  }, [activePath, inspectorEntries]);

  if (visibleQuickEdit.length) {
    return (
      <>
        {summarySection}
        <div className="task-value-browser task-value-browser--quick">
          <div className="task-value-browser-main task-value-browser-main--quick">
            <div className="task-value-browser-entry-list thin-scrollbar">
              {quickInspectorEntries.length > 20 ? (
                <VirtualizedList
                  listRef={quickEditListRef}
                  items={quickInspectorEntries}
                  itemHeight={72}
                  overscan={5}
                  containerHeight="100%"
                  renderItem={(entry) => (
                    <button
                      key={entry.key}
                      type="button"
                      className={`task-value-browser-row ${activeQuickEntry?.key === entry.key ? "is-active" : ""}`}
                      onClick={() => setActivePath(entry.key)}
                    >
                      <div>
                        <p>{entry.title}</p>
                        <span>{entry.subtitle}</span>
                      </div>
                      {(() => {
                        const state = summarizeEditorRowState(entry.currentValue, entry.standardValue);
                        return (
                          <div className="task-value-browser-row-values">
                            <span>
                              <em>{state.label}</em>
                              <strong>{state.value}</strong>
                            </span>
                          </div>
                        );
                      })()}
                    </button>
                  )}
                  emptyState={
                    <div className="task-empty-card">
                      <p>No quick edit fields available.</p>
                    </div>
                  }
                />
              ) : (
                quickInspectorEntries.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    ref={activeQuickEntry?.key === entry.key ? activeRowRef : undefined}
                    className={`task-value-browser-row ${activeQuickEntry?.key === entry.key ? "is-active" : ""}`}
                    onClick={() => setActivePath(entry.key)}
                  >
                    <div>
                      <p>{entry.title}</p>
                      <span>{entry.subtitle}</span>
                    </div>
                    {(() => {
                      const state = summarizeEditorRowState(entry.currentValue, entry.standardValue);
                      return (
                        <div className="task-value-browser-row-values">
                          <span>
                            <em>{state.label}</em>
                            <strong>{state.value}</strong>
                          </span>
                        </div>
                      );
                    })()}
                  </button>
                ))
              )}
            </div>
            <div className="task-value-browser-detail">
              {activeQuickEntry ? (
                <QuickEditControl
                  key={activeQuickEntry.key}
                  item={activeQuickEntry.item}
                  value={activeQuickEntry.currentValue}
                  effectReferenceOptions={effectReferenceOptions}
                  onChange={(value) => onUpdateValue(activeQuickEntry.item, value)}
                  onReset={() => onResetValue(activeQuickEntry.item.path)}
                />
              ) : (
                <div className="task-empty-card">
                  <p>Choose one quick field to edit it here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {summarySection}
      <div className="task-value-browser task-value-browser--quick">
        <div className="task-value-browser-main task-value-browser-main--quick">
          <div className="task-value-browser-entry-list thin-scrollbar">
            {fallbackInspectorEntries.map((entry) => (
              <button
                key={entry.key}
                type="button"
                ref={activeFallbackEntry?.key === entry.key ? activeRowRef : undefined}
                className={`task-value-browser-row ${activeFallbackEntry?.key === entry.key ? "is-active" : ""}`}
                onClick={() => setActivePath(entry.key)}
              >
                <div>
                  <p>{entry.title}</p>
                  <span>{entry.subtitle}</span>
                </div>
                {(() => {
                  const state = summarizeEditorRowState(entry.currentValue, entry.standardValue);
                  return (
                    <div className="task-value-browser-row-values">
                      <span>
                        <em>{state.label}</em>
                        <strong>{state.value}</strong>
                      </span>
                    </div>
                  );
                })()}
              </button>
            ))}
          </div>
          <div className="task-value-browser-detail">
            {activeFallbackEntry ? (
              <div className="task-quick-control min-w-0 rounded-[18px] border border-white/8 bg-[#12181f] px-4 py-4">
                <div className="task-quick-control-head flex flex-wrap items-start justify-between gap-3">
                  <div className="task-quick-control-copy min-w-0 flex-1 space-y-1">
                    <p className="task-quick-control-title break-words text-[1rem] font-semibold text-slate-100">
                      {activeFallbackEntry.title}
                    </p>
                    <p className="task-quick-control-description break-words text-[0.84rem] leading-6 text-slate-500">
                      {activeFallbackEntry.subtitle}
                    </p>
                    <div className="task-quick-control-meta">
                      <span>
                        <strong>Current</strong>
                        <em title={stringifyInlineSafe(activeFallbackEntry.currentValue)}>
                          {formatEditorExactValue(activeFallbackEntry.currentValue)}
                        </em>
                      </span>
                      <span>
                        <strong>Standard</strong>
                        <em title={stringifyInlineSafe(activeFallbackEntry.standardValue)}>
                          {formatEditorExactValue(activeFallbackEntry.standardValue)}
                        </em>
                      </span>
                    </div>
                  </div>
                  <Button
                    className="task-quick-control-reset"
                    size="sm"
                    variant="flat"
                    onPress={() => onResetValue(activeFallbackEntry.entry.path)}
                  >
                    Reset to standard
                  </Button>
                </div>
                <div className="task-quick-control-value mt-4">
                  <Input
                    className="task-quick-control-field"
                    label={activeFallbackEntry.title}
                    type={normalizeInputType(activeFallbackEntry.entry.valueType)}
                    value={String(activeFallbackEntry.currentValue ?? "")}
                    onValueChange={(value) =>
                      onUpdateValue(
                        {
                          path: activeFallbackEntry.entry.path,
                          valueType: activeFallbackEntry.entry.valueType,
                          defaultValue: activeFallbackEntry.entry.defaultValue,
                        },
                        value,
                      )
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="task-empty-card">
                <p>Choose one generated field to edit it here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
});

const AllValueSections = memo(function AllValueSections({
  entries,
  effectReferenceOptions,
  onUpdateValue,
  onResetValue,
  multiSelectActive,
  isPathSelected,
  onTogglePathSelect,
}: {
  entries: Array<{ item: QuickEditEntry; value: JsonValue | undefined }>;
  effectReferenceOptions: EffectReferenceOption[];
  onUpdateValue: (item: { path: string; valueType?: string; defaultValue?: JsonValue }, value: string | boolean) => void;
  onResetValue: (path: string) => void;
  multiSelectActive?: boolean;
  isPathSelected?: (path: string) => boolean;
  onTogglePathSelect?: (path: string) => void;
}) {
  const groupedEntries = useMemo(() => groupAllValueEntries(entries), [entries]);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [activePath, setActivePath] = useState<string>("");
  const [entrySearch, setEntrySearch] = useState("");
  const deferredEntrySearch = useDeferredValue(entrySearch);
  const activeGroup = useMemo(
    () => groupedEntries.find((group) => group.category === activeCategory) ?? groupedEntries[0] ?? null,
    [activeCategory, groupedEntries],
  );
  const activeItems = useMemo(() => {
    if (!activeGroup) {
      return [];
    }
    const needle = deferredEntrySearch.trim().toLowerCase();
    if (!needle) {
      return activeGroup.items;
    }
    return activeGroup.items.filter(({ item }) =>
      [
        item.setting,
        item.path,
        item.whatItDoes,
        item.valueType,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [activeGroup, deferredEntrySearch]);
  const itemHeightFn = useCallback(
    (index: number) => isEffectReferenceEntry(activeItems[index]?.item) ? 96 : 72,
    [activeItems],
  );
  const activeEntry = useMemo(
    () => activeItems.find(({ item }) => item.path === activePath) ?? activeItems[0] ?? null,
    [activeItems, activePath],
  );
  const linkedEffectEntries = useMemo(() => {
    if (!activeEntry || !isEffectReferenceEntry(activeEntry.item)) {
      return [];
    }

    return groupedEntries
      .flatMap((group) => group.items.map((entry) => ({ ...entry, category: group.category })))
      .filter((entry) =>
        entry.item.path !== activeEntry.item.path &&
        isRelatedEffectField(activeEntry.item.path, entry.item.path),
      )
      .slice(0, 8);
  }, [activeEntry, groupedEntries]);
  const detailMotionRef = useSelectionChangeMotion<HTMLDivElement>(activeEntry?.item.path ?? activeGroup?.category ?? "empty");

  useEffect(() => {
    if (!groupedEntries.length) {
      if (activeCategory) {
        setActiveCategory("");
      }
      return;
    }
    if (!groupedEntries.some((group) => group.category === activeCategory)) {
      setActiveCategory(groupedEntries[0]?.category ?? "");
    }
  }, [activeCategory, groupedEntries]);

  useEffect(() => {
    setEntrySearch("");
  }, [activeCategory]);

  useEffect(() => {
    if (!activeItems.length) {
      if (activePath) {
        setActivePath("");
      }
      return;
    }
    if (!activeItems.some(({ item }) => item.path === activePath)) {
      setActivePath(activeItems[0]?.item.path ?? "");
    }
  }, [activeItems, activePath]);

  return (
    <div className="task-value-browser task-value-browser--editor">
      <div className="task-value-browser-toolbar">
        <div className="task-value-browser-toolbar-row">
          <div className="task-value-browser-toolbar-copy">
            <p className="task-section-eyebrow">All values</p>
            <h4 className="task-title task-title--compact">{activeGroup?.category ?? "Choose one category"}</h4>
          </div>
          <div className="task-value-browser-toolbar-meta">
            <strong>
              {activeItems.length === 1 ? "1 visible value" : `${activeItems.length} visible values`}
            </strong>
            <span>{activeGroup ? `${activeGroup.items.length} stored in this group` : "No values loaded"}</span>
          </div>
        </div>
        <div className="task-value-browser-tabs" role="tablist" aria-label="All value categories">
          {groupedEntries.map((group) => (
            <button
              key={group.category}
              type="button"
              className={`task-value-browser-tab ${group.category === activeGroup?.category ? "is-active" : ""}`}
              aria-pressed={group.category === activeGroup?.category}
              onClick={() => setActiveCategory(group.category)}
            >
              <span>{group.category}</span>
              <strong>{group.items.length}</strong>
            </button>
          ))}
        </div>
        {activeGroup?.items.length > 6 ? (
          <div className="task-value-browser-toolbar-search">
            <Input
              aria-label="Search values in the current category"
              placeholder={`Search ${activeGroup.category.toLowerCase()}...`}
              value={entrySearch}
              onValueChange={setEntrySearch}
            />
          </div>
        ) : null}
      </div>
      {activeGroup ? (
        <div className="task-value-browser-main task-value-browser-main--editor">
          <div className="task-value-browser-detail-shell">
            <div className="task-value-browser-entry-rail">
              <div className="task-value-browser-entry-list thin-scrollbar">
                <VirtualizedList
                  items={activeItems}
                  itemHeight={itemHeightFn}
                  overscan={5}
                  containerHeight="100%"
                  renderItem={({ item, value }, _index) => (
                    <ValueBrowserRow
                      key={item.path}
                      item={item}
                      value={value}
                      isActive={activeEntry?.item.path === item.path}
                      onSelect={setActivePath}
                      isSelected={isPathSelected ? isPathSelected(item.path) : false}
                      showCheckboxAlways={multiSelectActive}
                      onToggleSelect={onTogglePathSelect}
                    />
                  )}
                  emptyState={
                    <div className="task-empty-card">
                      <p>No values in this category match that search yet.</p>
                    </div>
                  }
                />
              </div>
            </div>
            <div className="task-value-browser-detail" ref={detailMotionRef}>
              {activeEntry ? (
                <div className="task-value-browser-detail-stack">
                  <QuickEditControl
                    key={activeEntry.item.path}
                    item={activeEntry.item}
                    value={activeEntry.value}
                    effectReferenceOptions={effectReferenceOptions}
                    onChange={(nextValue) => onUpdateValue(activeEntry.item, nextValue)}
                    onReset={() => onResetValue(activeEntry.item.path)}
                  />
                  {linkedEffectEntries.length ? (
                    <div className="task-linked-effect-jumpbar">
                      <div>
                        <p className="task-section-eyebrow">Effect fields</p>
                        <span>Open the nested PassiveSO values that belong to this effect.</span>
                      </div>
                      <div className="task-linked-effect-actions">
                        {linkedEffectEntries.map((entry) => (
                          <button
                            key={entry.item.path}
                            type="button"
                            onClick={() => {
                              setActiveCategory(entry.category);
                              setActivePath(entry.item.path);
                            }}
                          >
                            {entry.item.setting}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="task-empty-card">
                  <p>Choose one field from the list to inspect and edit it here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});

function buildAllValueEntries({
  document,
  baseDocument,
  draftOverrides,
  excludedPaths,
}: {
  document: RuntimeDocument;
  baseDocument: RuntimeDocument;
  draftOverrides: Record<string, JsonValue>;
  excludedPaths: Set<string>;
}): Array<{ item: QuickEditEntry; value: JsonValue | undefined }> {
  const items: Array<{ item: QuickEditEntry; value: JsonValue | undefined }> = [];
  const seen = new Set(excludedPaths);
  const referenceChoicesByPath = new Map(
    (document.referenceChoices ?? [])
      .filter((choice): choice is NonNullable<typeof document.referenceChoices>[number] => typeof choice?.path === "string" && choice.path.trim().length > 0)
      .map((choice) => [choice.path, choice] as const),
  );

  for (const group of document.simpleSettings?.groups ?? []) {
    for (const entry of group.entries ?? []) {
      if (typeof entry.path !== "string" || !entry.path.trim() || seen.has(entry.path)) {
        continue;
      }
      const referenceChoice = referenceChoicesByPath.get(entry.path);
      seen.add(entry.path);
      items.push({
        item: {
          setting: entry.name ?? humanizeEditorPath(entry.path),
          category: group.category ?? "General",
          path: entry.path,
          editable: entry.editable !== false,
          valueType: referenceChoice ? "string" : entry.valueType,
          allowCustomValue: referenceChoice?.allowCustomReference === true,
          value: entry.currentValue ?? entry.defaultValue ?? "",
          defaultValue: entry.defaultValue,
          whatItDoes: entry.description ?? describeReferenceChoice(referenceChoice),
          valueRange: entry.valueRange,
          vanillaRange: entry.vanillaRange,
          extendedRange: entry.extendedRange,
          riskLevel: entry.riskLevel,
          verifiedChoices: mergeVerifiedChoices(entry.verifiedChoices, referenceChoice),
          referenceChoice,
        },
        value: resolveSimpleValue(baseDocument, entry, draftOverrides),
      });
    }
  }

  for (const field of document.advanced?.fields ?? []) {
    if (typeof field.path !== "string" || !field.path.trim() || seen.has(field.path)) {
      continue;
    }
    const referenceChoice = referenceChoicesByPath.get(field.path);
    seen.add(field.path);
    items.push({
      item: {
        setting: field.label ?? humanizeEditorPath(field.path),
          category: field.category ?? "Advanced",
          path: field.path,
          editable: field.editable !== false,
          valueType: referenceChoice ? "string" : field.valueType,
          allowCustomValue: referenceChoice?.allowCustomReference === true,
          value: field.effectiveValue ?? field.currentValue ?? field.defaultValue ?? "",
        defaultValue: field.defaultValue,
        whatItDoes: field.description ?? describeReferenceChoice(referenceChoice),
        valueRange: field.valueRange,
        vanillaRange: field.vanillaRange,
        extendedRange: field.extendedRange,
        riskLevel: field.riskLevel,
        verifiedChoices: mergeVerifiedChoices(field.verifiedChoices, referenceChoice),
        referenceChoice,
      },
      value: resolveFieldValue(baseDocument, field, draftOverrides),
    });
  }

  const fallbackPaths = Array.from(
    new Set<string>([
      ...Object.keys(baseDocument.advanced?.effectiveValues ?? {}),
      ...Object.keys(document.advanced?.effectiveValues ?? {}),
      ...Object.keys(baseDocument.advanced?.defaults ?? {}),
      ...Object.keys(document.advanced?.defaults ?? {}),
      ...Object.keys(draftOverrides),
    ]),
  ).sort((left, right) => left.localeCompare(right));

  for (const path of fallbackPaths) {
    if (typeof path !== "string" || !path.trim() || seen.has(path)) {
      continue;
    }
    const referenceChoice = referenceChoicesByPath.get(path);

    const defaultValue =
      baseDocument.advanced?.defaults?.[path] ??
      document.advanced?.defaults?.[path];
    const resolvedValue =
      document.advanced?.effectiveValues?.[path] ??
      baseDocument.advanced?.effectiveValues?.[path] ??
      draftOverrides[path] ??
      defaultValue;

    seen.add(path);
    items.push({
      item: {
        setting: buildFallbackSettingLabel(path),
        category: inferFallbackCategory(path),
        path,
        editable: true,
        valueType: referenceChoice ? "string" : inferValueTypeFromJsonValue(resolvedValue ?? defaultValue),
        allowCustomValue: referenceChoice?.allowCustomReference === true,
        value: resolvedValue ?? defaultValue ?? "",
        defaultValue,
        whatItDoes: describeReferenceChoice(referenceChoice) ?? `Exported runtime value at ${path}.`,
        verifiedChoices: buildReferenceVerifiedChoices(referenceChoice),
        referenceChoice,
      },
      value: resolvedValue,
    });
  }

  return items;
}

function buildKnownEffectReferenceOptions({
  allValueEntries,
  document,
  libraryTemplates,
  quickEditEntries,
}: {
  allValueEntries: Array<{ item: QuickEditEntry; value: JsonValue | undefined }>;
  document: RuntimeDocument;
  libraryTemplates: LibraryTemplateEntry[];
  quickEditEntries: QuickEditEntry[];
}): EffectReferenceOption[] {
  const byValue = new Map<string, EffectReferenceOption>();
  const addReference = (rawValue: JsonValue | string | undefined | null, source: string, label?: string | null, description?: string | null) => {
    const value = normalizeEffectOptionValue(rawValue);
    if (!value || byValue.has(value)) {
      return;
    }

    byValue.set(value, {
      value,
      label: resolveFriendlyName(label ?? undefined, humanizeReferenceChoiceLabel(value), value),
      kind: /^statuseffectso:/i.test(value) ? "StatusEffectSO" : /^passiveso:/i.test(value) ? "PassiveSO" : "Effect",
      source,
      description: description ?? undefined,
    });
  };
  const addEntryReferences = (item: QuickEditEntry, value?: JsonValue) => {
    addReference(value ?? item.value, item.category || "Current file", item.setting, item.whatItDoes);
    addReference(item.defaultValue, "Standard value", item.setting, item.whatItDoes);
    for (const choice of item.verifiedChoices ?? []) {
      addReference(choice.value, "Exported choices", choice.label, choice.description);
    }
    addReference(item.referenceChoice?.currentReference, "Reference choice", item.referenceChoice?.label);
    for (const reference of item.referenceChoice?.availableReferences ?? []) {
      addReference(reference, "Exported references", undefined, item.referenceChoice?.label);
    }
    for (const reference of item.referenceChoice?.suggestions ?? []) {
      addReference(reference, "Suggested references", undefined, item.referenceChoice?.label);
    }
  };

  for (const item of quickEditEntries) {
    addEntryReferences(item);
  }
  for (const { item, value } of allValueEntries) {
    addEntryReferences(item, value);
  }
  for (const referenceChoice of document.referenceChoices ?? []) {
    addReference(referenceChoice.currentReference, "Reference choice", referenceChoice.label);
    for (const reference of referenceChoice.availableReferences ?? []) {
      addReference(reference, "Exported references", undefined, referenceChoice.label);
    }
    for (const reference of referenceChoice.suggestions ?? []) {
      addReference(reference, "Suggested references", undefined, referenceChoice.label);
    }
  }
  for (const template of libraryTemplates ?? []) {
    const templateSource = "Passive templates";
    const templateLabel = template.title ?? template.label ?? template.displayName ?? template.targetKey ?? template.templatePassiveKey;
    if (String(template.targetType ?? "").toLowerCase() === "passive") {
      addReference(normalizePassiveTemplateReference(template.targetKey), templateSource, templateLabel, template.description);
    }
    addReference(normalizePassiveTemplateReference(template.templatePassiveKey), templateSource, templateLabel, template.description);
  }

  return Array.from(byValue.values()).sort((left, right) =>
    `${left.kind}:${left.label}:${left.value}`.localeCompare(`${right.kind}:${right.label}:${right.value}`, undefined, { sensitivity: "base" }),
  );
}

function normalizePassiveTemplateReference(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^passiveso:/i.test(trimmed) || /^statuseffectso:/i.test(trimmed)) {
    return trimmed.replace(/#.*$/, "");
  }
  if (/^p[_-]/i.test(trimmed) || /^p[A-Z0-9_#-]+$/i.test(trimmed)) {
    return `PassiveSO:${trimmed.replace(/#.*$/, "")}`;
  }
  return undefined;
}

function normalizeEffectOptionValue(value: JsonValue | string | undefined | null): string | undefined {
  const raw = stringifyInlineValue(value as JsonValue | undefined).trim();
  if (!raw) {
    return undefined;
  }
  if (/^passiveso:/i.test(raw) || /^statuseffectso:/i.test(raw)) {
    return raw.replace(/#.*$/, "");
  }
  return undefined;
}

function groupAllValueEntries(entries: Array<{ item: QuickEditEntry; value: JsonValue | undefined }>) {
  const groups = new Map<string, Array<{ item: QuickEditEntry; value: JsonValue | undefined }>>();

  for (const entry of entries) {
    const rawCategory = typeof entry.item.category === "string" ? entry.item.category.trim() : "";
    const category = rawCategory || "General";
    const existing = groups.get(category) ?? [];
    existing.push(entry);
    groups.set(category, existing);
  }

  const preferredOrder = ["Quick edits", "General", "Presentation", "Behavior", "Stats", "Timing", "Linked effects", "Advanced"];
  return Array.from(groups.entries())
    .sort(([left], [right]) => {
      const leftIndex = preferredOrder.findIndex((value) => value.toLowerCase() === left.toLowerCase());
      const rightIndex = preferredOrder.findIndex((value) => value.toLowerCase() === right.toLowerCase());
      if (leftIndex !== -1 || rightIndex !== -1) {
        if (leftIndex === -1) {
          return 1;
        }
        if (rightIndex === -1) {
          return -1;
        }
        return leftIndex - rightIndex;
      }
      return left.localeCompare(right);
    })
    .map(([category, items]) => ({ category, items }));
}

function compactEditorValue(value: JsonValue | undefined) {
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
    return trimmed.length > 22 ? `${trimmed.slice(0, 22)}…` : trimmed;
  }
  if (Array.isArray(value)) {
    return `${value.length} items`;
  }
  return "Object";
}

function formatEditorExactValue(value: JsonValue | undefined) {
  const exact = stringifyInlineSafe(value).trim();
  return exact || compactEditorValue(value);
}

function summarizeEditorRowState(currentValue: JsonValue | undefined, standardValue: JsonValue | undefined) {
  const currentLabel = compactEditorValue(currentValue);
  const standardLabel = compactEditorValue(standardValue);
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

function isEffectReferenceEntry(item: QuickEditEntry) {
  const referenceType = `${item.referenceChoice?.referenceType ?? ""}`.toLowerCase();
  const current = stringifyInlineValue(item.value).toLowerCase();
  const standard = stringifyInlineValue(item.defaultValue).toLowerCase();
  return (
    referenceType.includes("passiveso") ||
    referenceType.includes("statuseffectso") ||
    current.startsWith("passiveso:") ||
    current.startsWith("statuseffectso:") ||
    standard.startsWith("passiveso:") ||
    standard.startsWith("statuseffectso:")
  );
}

function isRelatedEffectField(referencePath: string, candidatePath: string) {
  const reference = referencePath.trim();
  const candidate = candidatePath.trim();
  if (!reference || !candidate || reference === candidate) {
    return false;
  }

  if (candidate.startsWith(`${reference}.`) || candidate.startsWith(`${reference}[`)) {
    return true;
  }

  const referenceTail = reference.split(".").filter(Boolean).at(-1)?.toLowerCase();
  return Boolean(referenceTail && candidate.toLowerCase().includes(`${referenceTail}.`));
}

function resolveEditorSelectionTitle(entry: CatalogEntry | null, document: RuntimeDocument | undefined) {
  const fallbackAbilityTitle = buildEditorAbilityFallbackTitle(entry, document);
  const candidates = [
    document?.displayName,
    document?.resolvedName,
    document?.cardPreview?.title,
    entry?.displayName ?? undefined,
    entry?.title ?? undefined,
  ]
    .map((value) => sanitizeEditorSelectionTitle(value))
    .filter((value): value is string => Boolean(value));

  return resolveFriendlyName(...candidates, fallbackAbilityTitle);
}

function sanitizeEditorSelectionTitle(value?: string | null) {
  if (!value) {
    return undefined;
  }
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return undefined;
  }
  if (
    /^ability\[\d+\]/i.test(cleaned)
    || /^ability\s*\d+\s*ability\s*\d+/i.test(cleaned)
    || /^ability\s*\d+\s*\(ability\)$/i.test(cleaned)
    || /^character ability$/i.test(cleaned)
    || /^ability swap$/i.test(cleaned)
    || /abilityswap\.json|\.json$/i.test(cleaned)
  ) {
    return undefined;
  }
  return cleaned;
}

function buildEditorAbilityFallbackTitle(entry: CatalogEntry | null, document: RuntimeDocument | undefined) {
  const targetType = `${entry?.targetType ?? document?.targetType ?? ""}`.trim().toLowerCase();
  const targetKey =
    `${entry?.targetKey ?? (typeof document?.targetKey === "string" ? document.targetKey : "")}`.trim()
    || undefined;
  const relativePath = entry?.relativePath ?? undefined;

  if (targetType !== "characterability" && !/ability\[\d+\]/i.test(targetKey ?? "") && !/abilities[\\/]/i.test(relativePath ?? "")) {
    return undefined;
  }

  const characterKey = readEditorCharacterKeyFromTarget(targetKey) ?? readEditorCharacterKeyFromPath(relativePath);
  const slotIndex = readEditorSlotIndexFromTarget(targetKey) ?? readEditorSlotIndexFromPath(relativePath);
  const characterLabel = characterKey ? resolveFriendlyName(characterKey.replace(/^\d+[_-]?/, "").replace(/[_-]+/g, " ")) : "Character";

  if (slotIndex === null || slotIndex === undefined) {
    return `${characterLabel} / Ability`;
  }
  return `${characterLabel} / Ability Slot ${slotIndex + 1}`;
}

function readEditorCharacterKeyFromTarget(targetKey?: string) {
  if (!targetKey) {
    return null;
  }
  const match = /^([^/]+)\//.exec(targetKey);
  return match?.[1] ?? null;
}

function readEditorSlotIndexFromTarget(targetKey?: string) {
  if (!targetKey) {
    return null;
  }
  const match = /Ability\[(\d+)\]/i.exec(targetKey);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function readEditorCharacterKeyFromPath(path?: string) {
  if (!path) {
    return null;
  }
  const match = /Characters[\\/]+([^\\/]+)[\\/]+Abilities/i.exec(path);
  if (!match) {
    return null;
  }
  return match[1] ?? null;
}

function readEditorSlotIndexFromPath(path?: string) {
  if (!path) {
    return null;
  }
  const match = /Abilities[\\/]+(\d+)_/i.exec(path);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildFallbackSettingLabel(path: string): string {
  const segments = path
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const tail = segments.slice(-2);
  if (!tail.length) {
    return humanizeEditorPath(path);
  }
  return tail.map((segment) => humanizeEditorPath(segment)).join(" / ");
}

function inferFallbackCategory(path: string): string {
  const segments = path
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!segments.length) {
    return "Advanced";
  }

  const head = humanizeEditorPath(segments[0]!);
  const branch = segments[1] ? humanizeEditorPath(segments[1]!) : "";
  if (!branch || head === branch) {
    return head || "Advanced";
  }
  return `${head} / ${branch}`;
}

function inferValueTypeFromJsonValue(value: JsonValue | undefined): string | undefined {
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    return "json";
  }
  if (typeof value === "string") {
    return "string";
  }
  return undefined;
}

function mergeVerifiedChoices(
  existingChoices: QuickEditEntry["verifiedChoices"],
  referenceChoice: ReferenceChoice | undefined,
) {
  const mergedByValue = new Map<string, NonNullable<QuickEditEntry["verifiedChoices"]>[number]>();

  for (const choice of existingChoices ?? []) {
    const key = stringifyInlineValue(choice.value).trim();
    if (!key || mergedByValue.has(key)) {
      continue;
    }
    mergedByValue.set(key, choice);
  }

  for (const choice of buildReferenceVerifiedChoices(referenceChoice) ?? []) {
    const key = stringifyInlineValue(choice.value).trim();
    if (!key) {
      continue;
    }
    const existing = mergedByValue.get(key);
    mergedByValue.set(
      key,
      existing
        ? {
            ...choice,
            ...existing,
            description: existing.description ?? choice.description,
          }
        : choice,
    );
  }

  return mergedByValue.size ? Array.from(mergedByValue.values()) : existingChoices;
}

function buildReferenceVerifiedChoices(
  referenceChoice: ReferenceChoice | undefined,
) {
  if (!referenceChoice) {
    return undefined;
  }

  const values = Array.isArray(referenceChoice.availableReferences) && referenceChoice.availableReferences.length
    ? referenceChoice.availableReferences
    : Array.isArray(referenceChoice.suggestions) && referenceChoice.suggestions.length
      ? referenceChoice.suggestions
      : [];

  const choices = values
    .map((value) => {
      const normalized = typeof value === "string" ? value.trim() : "";
      if (!normalized) {
        return null;
      }
      return {
        value: normalized,
        label: humanizeReferenceChoiceLabel(normalized),
        description: referenceChoice.referenceType ? `${referenceChoice.referenceType} reference` : "Reference value",
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  return choices.length ? choices : undefined;
}

function describeReferenceChoice(
  referenceChoice: ReferenceChoice | undefined,
) {
  if (!referenceChoice) {
    return undefined;
  }

  const referenceType = typeof referenceChoice.referenceType === "string" && referenceChoice.referenceType.trim()
    ? referenceChoice.referenceType.trim()
    : "reference";
  const referenceLabel = formatReferenceTypeLabel(referenceType);
  const availableCount = Array.isArray(referenceChoice.availableReferences) ? referenceChoice.availableReferences.length : 0;
  if (availableCount > 0) {
    return `Choose one ${referenceLabel} from ${availableCount} exported options, or paste a custom value if needed.`;
  }
  return `Choose or replace the exported ${referenceLabel} reference for this field.`;
}

function humanizeReferenceChoiceLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Unnamed";
  }

  const stripped = trimmed
    .replace(/^[A-Za-z]+SO:/, "")
    .replace(/^P_/i, "")
    .replace(/^Sprite:/i, "")
    .replace(/#\d+$/i, "")
    .replace(/[_-]+/g, " ");

  return resolveFriendlyName(stripped, trimmed);
}

function formatReferenceTypeLabel(referenceType: string) {
  const normalized = referenceType.trim();
  if (!normalized) {
    return "reference";
  }
  if (/passiveso/i.test(normalized)) {
    return "PassiveSO";
  }
  if (/statuseffectso/i.test(normalized)) {
    return "StatusEffectSO";
  }
  return normalized
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function humanizeEditorPath(rawPath: string): string {
  return rawPath
    .replace(/\[(\d+)\]/g, " $1 ")
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function simplifyGroupName(group: EditorGroupKey): string {
  switch (group) {
    case "augments":
      return "Augments";
    case "items":
      return "Items";
    case "characters":
      return "Characters";
    case "managers":
      return "Game Lists";
    case "gamemode":
      return "Game Mode";
    case "nativeui":
      return "Dev Settings";
    default:
      return group;
  }
}

function shouldRequireCatalogIcon(entry: CatalogEntry): boolean {
  const group = (entry.group ?? "").toLowerCase();
  const targetType = (entry.targetType ?? "").toLowerCase();
  return group === "augments" || group === "items" || group === "custom" || targetType === "passive" || targetType === "item";
}

function stringifyInlineValue(value: JsonValue | undefined): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function resolvePrimaryIconField(document: RuntimeDocument): QuickEditEntry | undefined {
  const quickEdit = document.quickEdit ?? [];
  const existing = (
    quickEdit.find((item) => item.path === "configuration.icon") ??
    quickEdit.find((item) => item.setting === "Icon") ??
    quickEdit.find((item) => typeof item.path === "string" && item.path.endsWith(".icon")) ??
    quickEdit.find((item) => typeof item.path === "string" && item.path.toLowerCase().includes("icon"))
  );
  if (existing) {
    return existing;
  }

  const fallbackIconValue = stringifyInlineValue(document.cardPreview?.iconReference as JsonValue | undefined);
  if (!fallbackIconValue && !(document.iconChoices?.length)) {
    return undefined;
  }

  return {
    setting: "Icon",
    category: "Presentation",
    path: "configuration.icon",
    editable: true,
    valueType: "string",
    value: fallbackIconValue,
    defaultValue: fallbackIconValue,
    whatItDoes: "Sprite or Unity asset reference used as the visible card icon for this entry.",
    riskLevel: "safe",
  };
}

function matchesIconChoice(choice: IconChoice, currentValue: string): boolean {
  const candidates = [choice.reference, choice.key, choice.value, choice.passiveKey, choice.sourcePassiveKey].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  return candidates.includes(currentValue);
}

function buildEditorIconChoiceCatalog(documentIconChoices: IconChoice[], libraryIcons: IconChoice[]): IconChoice[] {
  const merged = [...documentIconChoices, ...libraryIcons];
  const seen = new Set<string>();
  const result: IconChoice[] = [];
  for (const choice of merged) {
    const key = readIconChoiceWriteValue(choice).trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(choice);
  }
  return result;
}

function resolveMatchingIconChoice(choices: IconChoice[], currentValue: string): IconChoice | undefined {
  return choices.find((choice) => matchesIconChoice(choice, currentValue));
}

function readIconChoiceWriteValue(choice: IconChoice): string {
  return choice.reference ?? choice.key ?? choice.value ?? choice.passiveKey ?? choice.sourcePassiveKey ?? "";
}

function normalizeInputType(valueType?: string): "text" | "number" {
  const type = (valueType ?? "string").toLowerCase();
  return type === "integer" || type === "number" ? "number" : "text";
}

export function buildApplyTimingPresentation(applyTiming?: string) {
  switch ((applyTiming ?? "").toLowerCase()) {
    case "now":
      return {
        title: "Applies now",
        body: "This source can react while the related UI or lobby is open, but a fresh test pass is still the safest way to confirm it.",
      };
    case "next_match":
      return {
        title: "Next match",
        body: "Save the file, then start a fresh match or reopen the related flow before you judge the result.",
      };
    case "restart_recommended":
    default:
      return {
        title: "Restart required",
        body: "Save the file, restart BAPBAP, then verify the result from a clean state so the running game cannot hide stale data.",
      };
  }
}
