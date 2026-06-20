import { FolderOpen, Save } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState, type PropsWithChildren } from "react";

import { launcherApi } from "./api";
import { Button, Card, CardBody, CardHeader, Input, Select, Switch, Textarea } from "./ui";
import { hydrateLooseIconChoice } from "./bundledFallbacks";
import { CardPreviewPanel, IconPreview, MissingIconBadge, SectionCard, resolveFriendlyName, type ExperienceMode } from "./common";
import { HintPopover } from "./components/HintPopover";
import type { HintId } from "./helpers/hints";
import { SortableFieldList, type SortableItem } from "./components/SortableFieldList";
import { VirtualizedList } from "./components/VirtualizedList";
import { formatJson, parseJsonObject } from "./document";
import { usePageEntranceMotion } from "./motion";
import type {
  CardInlineIconRun,
  CardPreview,
  CatalogEntry,
  IconChoice,
  JsonObject,
  JsonValue,
  LibraryAllOptionEntry,
  LibraryBlockEntry,
  LibraryFieldDefinition,
  LibraryMetadataResponse,
  LibrarySlot,
  LibraryTemplateEntry,
  TextToken,
} from "./types";

interface LoadedEntryState {
  document?: Record<string, unknown>;
  customDraft?: JsonObject;
  customDraftTextError?: string;
  error?: string;
  loading: boolean;
}

const starterRecipes = [
  {
    id: "balanced-firewave",
    title: "Balanced Firewave",
    body: "A safe starting point that already feels like a familiar attack.",
    templatePassiveKey: "P_Firewave#158",
    iconSourcePassiveKey: "P_Firewave#158",
    suggestedName: "My Firewave",
  },
  {
    id: "poison-wave",
    title: "Poison Wave",
    body: "A simple status-focused starting point for testing a poison effect.",
    templatePassiveKey: "P_Firewave#158",
    iconSourcePassiveKey: "P_Stat_Damage#379",
    suggestedName: "Poison Wave",
  },
  {
    id: "heavy-burst",
    title: "Heavy Burst",
    body: "A slower, stronger template when you want one big hit instead of constant casts.",
    templatePassiveKey: "P_Firewave#158",
    iconSourcePassiveKey: "P_Firewave#158",
    suggestedName: "Heavy Burst",
  },
] as const;

const bundledStatusEffectChoices = [
  "StatusEffectSO:SE_Amplify",
  "StatusEffectSO:SE_BloodHunt",
  "StatusEffectSO:SE_Burn",
  "StatusEffectSO:SE_Delay",
  "StatusEffectSO:SE_FadingSnare",
  "StatusEffectSO:SE_Fear",
  "StatusEffectSO:SE_Frozen",
  "StatusEffectSO:SE_Knocked",
  "StatusEffectSO:SE_Poisoned",
  "StatusEffectSO:SE_Pulled",
  "StatusEffectSO:SE_PulledHitbox",
  "StatusEffectSO:SE_Pushed",
  "StatusEffectSO:SE_Sleep",
  "StatusEffectSO:SE_Slowed",
  "StatusEffectSO:SE_SlowZone",
  "StatusEffectSO:SE_Sprint",
  "StatusEffectSO:SE_Stunned",
  "StatusEffectSO:SE_WallStun",
  "StatusEffectSO:SE_Weakened",
] as const;

const CUSTOM_BLOCK_SLOT_INDICES = [0, 1, 2, 3] as const;
const CUSTOM_BLOCK_SLOT_META = [
  { index: 0, label: "Primary block", body: "The main effect players feel first." },
  { index: 1, label: "Second block", body: "Use only when the card clearly needs a second effect." },
  { index: 2, label: "Extra block 1", body: "Keep this empty unless the design really needs more complexity." },
  { index: 3, label: "Extra block 2", body: "Reserve this for the rare edge-case card." },
] as const;

const fallbackLibraryBlocks: LibraryBlockEntry[] = [
  {
    blockId: "presentation.title",
    label: "Title",
    description: "Set the visible name for the custom augment.",
    category: "Basics",
    family: "Presentation",
    supportedTargetTypes: ["Passive", "CustomPassive"],
    riskLevel: "safe",
    fields: [{ key: "text", label: "Title text", valueType: "string", defaultValue: "" }],
  },
  {
    blockId: "presentation.description",
    label: "Description",
    description: "Set the long card description.",
    category: "Basics",
    family: "Presentation",
    supportedTargetTypes: ["Passive", "CustomPassive"],
    riskLevel: "safe",
    fields: [{ key: "text", label: "Description text", valueType: "textarea", defaultValue: "" }],
  },
  {
    blockId: "basic.health",
    label: "Health",
    description: "Adds a health-style block to this custom augment.",
    category: "Basics",
    family: "Stats",
    supportedTargetTypes: ["Passive", "CustomPassive"],
    riskLevel: "safe",
    fields: [{ key: "value", label: "Health amount", valueType: "integer", defaultValue: 250 }],
  },
  {
    blockId: "basic.damage",
    label: "Damage",
    description: "Adds a direct damage-style block.",
    category: "Basics",
    family: "Stats",
    supportedTargetTypes: ["Passive", "CustomPassive"],
    riskLevel: "safe",
    fields: [{ key: "value", label: "Damage amount", valueType: "integer", defaultValue: 320 }],
  },
  {
    blockId: "basic.cooldown",
    label: "Cooldown",
    description: "Adds a cooldown-style block.",
    category: "Basics",
    family: "Timing",
    supportedTargetTypes: ["Passive", "CustomPassive"],
    riskLevel: "safe",
    fields: [{ key: "value", label: "Cooldown in seconds", valueType: "number", defaultValue: 3.5 }],
  },
  {
    blockId: "effect.status-burn",
    label: "Burn",
    description: "Adds a burn status effect block.",
    category: "Effects",
    family: "Status Effects",
    supportedTargetTypes: ["Passive", "CustomPassive"],
    riskLevel: "medium",
    fields: [
      { key: "duration", label: "Burn duration", valueType: "number", defaultValue: 3 },
      { key: "multiplier", label: "Burn multiplier", valueType: "number", defaultValue: 1 },
    ],
  },
  {
    blockId: "effect.status-poison",
    label: "Poison",
    description: "Adds a poison status effect block.",
    category: "Effects",
    family: "Status Effects",
    supportedTargetTypes: ["Passive", "CustomPassive"],
    riskLevel: "medium",
    fields: [
      { key: "duration", label: "Poison duration", valueType: "number", defaultValue: 3.5 },
      { key: "multiplier", label: "Poison multiplier", valueType: "number", defaultValue: 1 },
    ],
  },
  {
    blockId: "effect.status-slow",
    label: "Slow",
    description: "Adds a slow status effect block.",
    category: "Effects",
    family: "Status Effects",
    supportedTargetTypes: ["Passive", "CustomPassive"],
    riskLevel: "medium",
    fields: [
      { key: "duration", label: "Slow duration", valueType: "number", defaultValue: 2 },
      { key: "multiplier", label: "Slow multiplier", valueType: "number", defaultValue: 1 },
    ],
  },
  {
    blockId: "effect.status-stun",
    label: "Stun",
    description: "Adds a stun status effect block.",
    category: "Effects",
    family: "Status Effects",
    supportedTargetTypes: ["Passive", "CustomPassive"],
    riskLevel: "medium",
    fields: [
      { key: "duration", label: "Stun duration", valueType: "number", defaultValue: 1 },
      { key: "multiplier", label: "Stun multiplier", valueType: "number", defaultValue: 1 },
    ],
  },
];

type DescriptionMode = "auto" | "custom";
type BuilderFieldControl = "number" | "text" | "select" | "textarea";
type CreateStepKey = "basics" | "blocks" | "text" | "values" | "placement";

interface BuilderBlockField {
  key: string;
  label: string;
  description?: string;
  valueType: string;
  defaultValue?: JsonValue;
  options?: string[];
  control: BuilderFieldControl;
  numeric: boolean;
}

interface BuilderBlockDefinition {
  id: string;
  label: string;
  description?: string;
  category?: string;
  family?: string;
  riskLevel?: string;
  targetSlot?: string;
  targetPath?: string;
  compatibilityScore: number;
  fields: BuilderBlockField[];
}

interface TemplateCatalogEntry {
  value: string;
  label: string;
  description?: string;
  previewPath?: string | null;
  cropX?: number | null;
  cropY?: number | null;
  cropWidth?: number | null;
  cropHeight?: number | null;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  iconReference?: string;
  file?: string;
  runtimeType?: string;
}

export function CustomBuilderPage({
  workspaceRoot,
  entries,
  search,
  onSearchChange,
  selectedEntry,
  selectedState,
  libraryMetadata,
  mode,
  onSelectEntry,
  onToggleEnabled,
  onChangeString,
  onChangeNumber,
  onChangeBoolean,
  onChangeValue = () => undefined,
  onRemoveValue = () => undefined,
  onReplaceDraft = () => undefined,
  onSave,
  onCreateDraft,
  onOpenFile,
  creatingDraft = false,
}: {
  workspaceRoot?: string;
  entries: CatalogEntry[];
  search: string;
  onSearchChange: (value: string) => void;
  selectedEntry: CatalogEntry | null;
  selectedState?: LoadedEntryState;
  libraryMetadata?: LibraryMetadataResponse | null;
  mode: ExperienceMode;
  onSelectEntry: (entryId: string) => void;
  onToggleEnabled: (value: boolean) => void;
  onChangeString: (path: string, value: string) => void;
  onChangeNumber: (path: string, value: string) => void;
  onChangeBoolean: (path: string, value: boolean) => void;
  onChangeValue?: (path: string, value: JsonValue) => void;
  onRemoveValue?: (path: string) => void;
  onReplaceDraft?: (draft: JsonObject) => void;
  onSave: () => void;
  onCreateDraft: () => void;
  onOpenFile: () => void;
  creatingDraft?: boolean;
}) {
  const pageMotionRef = usePageEntranceMotion();
  const [sidebarExpanded, setSidebarExpanded] = useState(() => !selectedEntry?.id);
  const [showMoreIcons, setShowMoreIcons] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconPickerTarget, setIconPickerTarget] = useState<"icon.sourcePassiveKey" | "templatePassiveKey">("icon.sourcePassiveKey");
  const [iconSearch, setIconSearch] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [valuePickerOpen, setValuePickerOpen] = useState(false);
  const [activeGuidedStep, setActiveGuidedStep] = useState<CreateStepKey>("basics");
  const [basicsSurface, setBasicsSurface] = useState<"visual" | "keys">("visual");
  const [activeBlockSlot, setActiveBlockSlot] = useState<number>(0);
  const [activeCustomOverridePath, setActiveCustomOverridePath] = useState("");
  const [activeAdvancedOptionId, setActiveAdvancedOptionId] = useState("");
  const [advancedValueSearch, setAdvancedValueSearch] = useState("");
  const [advancedValueCategory, setAdvancedValueCategory] = useState("all");
  const [advancedValueTargetType, setAdvancedValueTargetType] = useState("all");
  const [advancedValueValueType, setAdvancedValueValueType] = useState("all");
  const [advancedValueEditableMode, setAdvancedValueEditableMode] = useState<"all" | "editable" | "readonly">("editable");
  const [advancedValueFilter, setAdvancedValueFilter] = useState<"all" | "number" | "toggle" | "reference" | "json">("all");
  const [advancedValueResults, setAdvancedValueResults] = useState<LibraryAllOptionEntry[]>([]);
  const [advancedValueLoading, setAdvancedValueLoading] = useState(false);
  const [advancedValueError, setAdvancedValueError] = useState<string | null>(null);
  const [knownAdvancedEntries, setKnownAdvancedEntries] = useState<Record<string, LibraryAllOptionEntry>>({});
  const [overrideJsonDrafts, setOverrideJsonDrafts] = useState<Record<string, string>>({});
  const [overrideJsonErrors, setOverrideJsonErrors] = useState<Record<string, string>>({});
  const [rawDraftText, setRawDraftText] = useState("{}");
  const [rawDraftError, setRawDraftError] = useState<string | null>(null);
  const [studioToolsOpen, setStudioToolsOpen] = useState(false);
  const [reorderModeEnabled, setReorderModeEnabled] = useState(false);
  const draft = selectedState?.customDraft;
  const iconChoices = Array.isArray(selectedState?.document?.["iconChoices"])
    ? (selectedState?.document?.["iconChoices"] as Array<Record<string, unknown>>)
    : [];
  const mergedIconCatalog = useMemo(
    () => buildMergedIconCatalog(iconChoices, libraryMetadata?.icons ?? []),
    [iconChoices, libraryMetadata?.icons],
  );
  const templateCatalog = useMemo(
    () => buildTemplateCatalog(libraryMetadata?.templates ?? [], mergedIconCatalog),
    [libraryMetadata?.templates, mergedIconCatalog],
  );
  const documentLibrarySlots = useMemo(() => {
    const slots = (selectedState?.document as { librarySlots?: LibrarySlot[] | null } | undefined)?.librarySlots;
    return Array.isArray(slots) ? slots : [];
  }, [selectedState?.document]);
  const availableStatusEffectChoices = useMemo(
    () => buildStatusEffectChoices(),
    [],
  );
  const availableCustomBlocks = useMemo(
    () => buildCustomBuilderBlocks(libraryMetadata?.blocks, documentLibrarySlots, availableStatusEffectChoices),
    [availableStatusEffectChoices, documentLibrarySlots, libraryMetadata?.blocks],
  );
  const customBlockMap = useMemo(() => new Map(availableCustomBlocks.map((block) => [block.id, block])), [availableCustomBlocks]);
  const usingLibraryBlockMetadata = Boolean(libraryMetadata?.blocks?.length);
  const passiveCompatibleBlockCount = availableCustomBlocks.filter((block) => block.compatibilityScore >= 2).length;
  const guidedIconLimit = mode === "guided" ? 6 : 16;
  const expandedIconLimit = mode === "guided" ? 18 : 40;
  const filteredIconChoices = useMemo(() => {
    const normalizedSearch = iconSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return mergedIconCatalog;
    }
    return mergedIconCatalog.filter((choice) => {
      const value = readIconChoiceValue(choice);
      const label = readIconChoiceLabel(choice, value);
      const haystack = [
        label,
        value,
        typeof choice.spriteName === "string" ? choice.spriteName : undefined,
      ]
        .filter((entry): entry is string => Boolean(entry))
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [iconSearch, mergedIconCatalog]);
  const visibleIconChoices = showMoreIcons
    ? filteredIconChoices.slice(0, expandedIconLimit)
    : filteredIconChoices.slice(0, guidedIconLimit);
  const filteredTemplateChoices = useMemo(() => {
    const normalizedSearch = templateSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return templateCatalog;
    }
    return templateCatalog.filter((choice) => {
      const haystack = [
        choice.label,
        choice.description,
        choice.value,
        choice.file,
        choice.runtimeType,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [templateCatalog, templateSearch]);
  const visibleTemplateChoices = showMoreIcons
    ? filteredTemplateChoices.slice(0, expandedIconLimit)
    : filteredTemplateChoices.slice(0, guidedIconLimit);
  const selectedIcon = stringValue(readPath(draft, "icon.sourcePassiveKey"));
  const selectedIconChoice = mergedIconCatalog.find((choice) => readIconChoiceValue(choice) === selectedIcon);
  const selectedIconLabel = selectedIconChoice
    ? resolveFriendlyName(
      typeof selectedIconChoice.label === "string" ? selectedIconChoice.label : undefined,
      typeof selectedIconChoice.spriteName === "string" ? selectedIconChoice.spriteName : undefined,
      selectedIcon,
    )
    : "";
  const selectedTemplateKey = stringValue(draft?.templatePassiveKey);
  const selectedTemplateChoice = templateCatalog.find((choice) => choice.value === selectedTemplateKey);
  const selectedTemplateLabel = selectedTemplateChoice
    ? selectedTemplateChoice.label
    : "";
  const customOverrideEntries = useMemo(
    () => (draft ? buildCustomOverrideEntries(draft, knownAdvancedEntries) : []),
    [draft, knownAdvancedEntries],
  );
  const reorderBlockItems = useMemo<SortableItem[]>(() => {
    if (!draft) {
      return [];
    }
    const blocksArray = Array.isArray(draft.blocks) ? draft.blocks : [];
    const items: SortableItem[] = [];
    for (let slotIndex = 0; slotIndex < blocksArray.length; slotIndex += 1) {
      const blockEntry = blocksArray[slotIndex];
      if (!blockEntry || typeof blockEntry !== "object" || Array.isArray(blockEntry)) {
        continue;
      }
      const blockRecord = blockEntry as JsonObject;
      const blockId = stringValue(blockRecord.blockId);
      if (!blockId) {
        continue;
      }
      const definition = customBlockMap.get(blockId);
      const label = stringValue(blockRecord.label) || definition?.label || "Block";
      const summary = definition ? buildSelectedBlockSummary(definition) : "";
      items.push({
        id: `${blockId}__slot${slotIndex}`,
        label,
        body: summary ? <span className="task-muted">{summary}</span> : null,
      });
    }
    return items;
  }, [customBlockMap, draft]);
  const customCardPreview = draft ? buildCustomCardPreview(draft, customBlockMap, selectedIconChoice, mergedIconCatalog) : null;
  const customTextTokens = draft ? buildCustomTextTokens(draft, customBlockMap) : [];
  const descriptionMode = draft ? resolveDescriptionMode(draft) : "auto";
  const autoTextTemplates = draft ? buildAutoDescriptionTemplates(draft, customBlockMap) : { description: "", shortDescription: "" };
  const currentDisplayName = draft ? stringValue(draft.displayName) : "";
  const lastStarterSuggestedName = draft ? stringValue(readPath(draft, "launcher.lastStarterSuggestedName")) : "";
  const selectedBlockCount = draft
    ? CUSTOM_BLOCK_SLOT_INDICES.filter((slotIndex) => Boolean(stringValue(readPath(draft, `blocks.${slotIndex}.blockId`)))).length
    : 0;
  const autoDescriptionResolved = draft && autoTextTemplates.description
    ? resolveCustomTextTemplate(autoTextTemplates.description, draft, customBlockMap)
    : "";
  const autoShortDescriptionResolved = draft && autoTextTemplates.shortDescription
    ? resolveCustomTextTemplate(autoTextTemplates.shortDescription, draft, customBlockMap)
    : "";
  const selectedDraftIcon = {
    previewPath: customCardPreview?.iconPreviewPath ?? selectedEntry?.iconPreviewPath ?? null,
    cropX: customCardPreview?.iconCropX ?? selectedEntry?.iconCropX,
    cropY: customCardPreview?.iconCropY ?? selectedEntry?.iconCropY,
    cropWidth: customCardPreview?.iconCropWidth ?? selectedEntry?.iconCropWidth,
    cropHeight: customCardPreview?.iconCropHeight ?? selectedEntry?.iconCropHeight,
    sourceWidth: customCardPreview?.iconSourceWidth ?? selectedEntry?.iconSourceWidth,
    sourceHeight: customCardPreview?.iconSourceHeight ?? selectedEntry?.iconSourceHeight,
  };
  const availableEntries = entries.length ? entries : selectedEntry ? [selectedEntry] : [];
  const hasSelectableDrafts = availableEntries.length > 0;
  const hasDraftSelection = Boolean(selectedEntry?.id);
  const showDraftChooser = hasSelectableDrafts ? (sidebarExpanded || !hasDraftSelection) : false;
  const useSinglePanelEmptyState = !draft && !selectedState?.loading && !showDraftChooser;
  const selectedDraftTitle = resolveDraftEntryTitle(selectedEntry, currentDisplayName);
  const selectedDraftSubtitle = resolveDraftEntrySubtitle(selectedEntry);
  const deferredAdvancedValueSearch = useDeferredValue(advancedValueSearch);
  const standardCategoryOptions = useMemo(
    () => ["all", ...uniqueSortedStrings(libraryMetadata?.standardCategories ?? libraryMetadata?.allOptionCategories ?? [])],
    [libraryMetadata?.allOptionCategories, libraryMetadata?.standardCategories],
  );
  const standardTargetTypeOptions = useMemo(
    () => ["all", ...uniqueSortedStrings(libraryMetadata?.standardTargetTypes ?? [])],
    [libraryMetadata?.standardTargetTypes],
  );
  const standardValueTypeOptions = useMemo(
    () => ["all", ...uniqueSortedStrings(libraryMetadata?.standardValueTypes ?? [])],
    [libraryMetadata?.standardValueTypes],
  );
  const filteredAdvancedValueResults = useMemo(() => {
    if (advancedValueFilter === "all") {
      return advancedValueResults;
    }
    return advancedValueResults.filter((entry) => classifyAdvancedValueKind(entry) === advancedValueFilter);
  }, [advancedValueFilter, advancedValueResults]);
  const activeAdvancedValueEntry = useMemo(
    () => filteredAdvancedValueResults.find((entry) => entry.optionId === activeAdvancedOptionId) ?? filteredAdvancedValueResults[0] ?? null,
    [activeAdvancedOptionId, filteredAdvancedValueResults],
  );
  const activeCustomOverrideEntry = useMemo(
    () => customOverrideEntries.find((entry) => entry.fullPath === activeCustomOverridePath) ?? customOverrideEntries[0] ?? null,
    [activeCustomOverridePath, customOverrideEntries],
  );

  useEffect(() => {
    if (selectedEntry?.id) {
      setSidebarExpanded(false);
      setShowMoreIcons(false);
      setIconPickerOpen(false);
      setIconPickerTarget("icon.sourcePassiveKey");
      setActiveGuidedStep("basics");
      setActiveBlockSlot(0);
      setIconSearch("");
      setTemplateSearch("");
      setValuePickerOpen(false);
      setAdvancedValueSearch("");
      setAdvancedValueCategory("all");
      setAdvancedValueTargetType("all");
      setAdvancedValueValueType("all");
      setAdvancedValueEditableMode("editable");
      setAdvancedValueFilter("all");
      setActiveCustomOverridePath("");
      setActiveAdvancedOptionId("");
    }
  }, [selectedEntry?.id]);

  useEffect(() => {
    if (!selectedEntry && availableEntries.length > 0) {
      onSelectEntry(availableEntries[0]!.id);
    }
  }, [availableEntries, onSelectEntry, selectedEntry]);

  useEffect(() => {
    if (!draft || descriptionMode !== "auto") {
      return;
    }

    if (stringValue(draft.description) !== autoTextTemplates.description) {
      onChangeString("description", autoTextTemplates.description);
    }

    if (stringValue(readPath(draft, "shortDescription")) !== autoTextTemplates.shortDescription) {
      onChangeString("shortDescription", autoTextTemplates.shortDescription);
    }
  }, [
    autoTextTemplates.description,
    autoTextTemplates.shortDescription,
    descriptionMode,
    draft,
    onChangeString,
  ]);

  useEffect(() => {
    if (!draft) {
      setRawDraftText("{}");
      setRawDraftError(null);
      return;
    }
    setRawDraftText(formatJson(draft));
    setRawDraftError(null);
  }, [draft]);

  useEffect(() => {
    if (rawDraftError) {
      setStudioToolsOpen(true);
    }
  }, [rawDraftError]);

  useEffect(() => {
    const searchValue = deferredAdvancedValueSearch.trim();
    const hasFilter =
      advancedValueCategory !== "all"
      || advancedValueTargetType !== "all"
      || advancedValueValueType !== "all"
      || advancedValueEditableMode !== "editable";
    const shouldLoad = Boolean(workspaceRoot) && (valuePickerOpen || activeGuidedStep === "values" || searchValue.length >= 2 || hasFilter);
    if (!shouldLoad) {
      setAdvancedValueResults([]);
      setAdvancedValueError(null);
      setAdvancedValueLoading(false);
      return;
    }

    let cancelled = false;
    const activeWorkspaceRoot = workspaceRoot;
    const timerId = window.setTimeout(async () => {
      if (!activeWorkspaceRoot) {
        return;
      }
      setAdvancedValueLoading(true);
      setAdvancedValueError(null);
      try {
        const response = await launcherApi.listLibraryEntries({
          workspaceRoot: activeWorkspaceRoot,
          search: searchValue || undefined,
          category: advancedValueCategory !== "all" ? advancedValueCategory : undefined,
          targetType: advancedValueTargetType !== "all" ? advancedValueTargetType : undefined,
          valueType: advancedValueValueType !== "all" ? advancedValueValueType : undefined,
          editable: advancedValueEditableMode,
          limit: 80,
        });
        if (cancelled) {
          return;
        }
        const filteredEntries = response.entries.filter((entry) => isRelevantCustomValueEntry(entry));
        setAdvancedValueResults(filteredEntries);
        setKnownAdvancedEntries((current) => mergeAdvancedEntryMaps(current, filteredEntries));
      } catch (error) {
        if (cancelled) {
          return;
        }
        setAdvancedValueResults([]);
        setAdvancedValueError(error instanceof Error ? error.message : "Could not search the bundled game values.");
      } finally {
        if (!cancelled) {
          setAdvancedValueLoading(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [
    activeGuidedStep,
    advancedValueCategory,
    advancedValueEditableMode,
    advancedValueTargetType,
    advancedValueValueType,
    deferredAdvancedValueSearch,
    valuePickerOpen,
    workspaceRoot,
  ]);

  useEffect(() => {
    if (!customOverrideEntries.length) {
      if (activeCustomOverridePath) {
        setActiveCustomOverridePath("");
      }
      return;
    }
    if (!customOverrideEntries.some((entry) => entry.fullPath === activeCustomOverridePath)) {
      setActiveCustomOverridePath(customOverrideEntries[0]?.fullPath ?? "");
    }
  }, [activeCustomOverridePath, customOverrideEntries]);

  useEffect(() => {
    if (!filteredAdvancedValueResults.length) {
      if (activeAdvancedOptionId) {
        setActiveAdvancedOptionId("");
      }
      return;
    }
    if (!filteredAdvancedValueResults.some((entry) => entry.optionId === activeAdvancedOptionId)) {
      setActiveAdvancedOptionId(filteredAdvancedValueResults[0]?.optionId ?? "");
    }
  }, [activeAdvancedOptionId, filteredAdvancedValueResults]);

  function applyDescriptionMode(nextMode: DescriptionMode) {
    if (!draft || nextMode === descriptionMode) {
      return;
    }

    if (nextMode === "auto") {
      onChangeString("launcher.savedDescription", stringValue(draft.description));
      onChangeString("launcher.savedShortDescription", stringValue(readPath(draft, "shortDescription")));
      onChangeString("launcher.descriptionMode", "auto");
      onChangeString("description", autoTextTemplates.description);
      onChangeString("shortDescription", autoTextTemplates.shortDescription);
      return;
    }

    onChangeString("launcher.descriptionMode", "custom");
    const savedDescription = stringValue(readPath(draft, "launcher.savedDescription"));
    const savedShortDescription = stringValue(readPath(draft, "launcher.savedShortDescription"));
    if (savedDescription || savedShortDescription) {
      onChangeString("description", savedDescription);
      onChangeString("shortDescription", savedShortDescription);
    }
  }

  function openIconPicker(target: "icon.sourcePassiveKey" | "templatePassiveKey") {
    const isSameTarget = iconPickerTarget === target;
    setIconPickerTarget(target);
    setShowMoreIcons(true);
    setValuePickerOpen(false);
    if (target === "templatePassiveKey" && !isSameTarget) {
      setTemplateSearch("");
    }
    if (target === "icon.sourcePassiveKey" && !isSameTarget) {
      setIconSearch("");
    }
    setIconPickerOpen(isSameTarget ? !iconPickerOpen : true);
  }

  function openAdvancedValuePicker() {
    setIconPickerOpen(false);
    setValuePickerOpen((current) => !current);
  }

  const iconPickerMeta =
    iconPickerTarget === "templatePassiveKey"
      ? {
          cardLabel: "Template source",
          browseLabel: iconPickerOpen ? "Hide template gallery" : "Choose template source",
          pickerSummary: "Choose a template passive key",
          pickerDescription: "Pick the real game passive this custom augment should copy from before your own overrides are applied.",
        }
      : {
          cardLabel: "Card art",
          browseLabel: iconPickerOpen ? "Hide icon gallery" : "All game icons",
          pickerSummary: selectedIcon ? "Browse other game icons" : "Choose a game icon",
          pickerDescription: "Pick one of the real game icons. Choosing one writes the exact icon key into the field and updates the card immediately.",
        };

  function handleCustomDescriptionChange(value: string) {
    onChangeString("description", value);
    onChangeString("launcher.savedDescription", value);
  }

  function handleCustomShortDescriptionChange(value: string) {
    onChangeString("shortDescription", value);
    onChangeString("launcher.savedShortDescription", value);
  }

  function handleAddAdvancedValue(option: LibraryAllOptionEntry) {
    const nextValue = cloneEditableLibraryValue(option.currentValue ?? option.defaultValue, option.valueType);
    const fullPath = `overrides.${option.path}`;
    onChangeValue(fullPath, nextValue);
    setKnownAdvancedEntries((current) => mergeAdvancedEntryMaps(current, [option]));
    setActiveCustomOverridePath(fullPath);
  }

  function handlePrimitiveAdvancedValueChange(path: string, valueType: string, nextValue: string | boolean) {
    if (typeof nextValue === "boolean") {
      onChangeValue(path, nextValue);
      return;
    }

    const normalizedType = normalizeAdvancedValueType(valueType, undefined);
    if (normalizedType === "boolean") {
      onChangeValue(path, nextValue === "true");
      return;
    }
    if (normalizedType === "integer") {
      const parsed = Number.parseInt(nextValue, 10);
      onChangeValue(path, Number.isFinite(parsed) ? parsed : 0);
      return;
    }
    if (normalizedType === "number") {
      const parsed = Number(nextValue);
      onChangeValue(path, Number.isFinite(parsed) ? parsed : 0);
      return;
    }
    onChangeValue(path, nextValue);
  }

  function handleOverrideJsonDraftChange(path: string, value: string) {
    setOverrideJsonDrafts((current) => ({ ...current, [path]: value }));
    setOverrideJsonErrors((current) => {
      const next = { ...current };
      delete next[path];
      return next;
    });
  }

  function applyOverrideJsonDraft(path: string) {
    const rawValue = overrideJsonDrafts[path];
    if (typeof rawValue !== "string") {
      return;
    }
    try {
      onChangeValue(path, JSON.parse(rawValue) as JsonValue);
      setOverrideJsonErrors((current) => {
        const next = { ...current };
        delete next[path];
        return next;
      });
    } catch (error) {
      setOverrideJsonErrors((current) => ({
        ...current,
        [path]: error instanceof Error ? error.message : "Enter valid JSON before applying it.",
      }));
    }
  }

  function applyRawDraftText() {
    try {
      onReplaceDraft(parseJsonObject(rawDraftText));
      setRawDraftError(null);
    } catch (error) {
      setRawDraftError(error instanceof Error ? error.message : "The draft JSON must be a valid object.");
    }
  }

  function writeBlockFieldValue(slotIndex: number, field: BuilderBlockField, value: string) {
    const path = `blocks.${slotIndex}.values.${field.key}`;
    if (field.numeric) {
      onChangeNumber(path, value);
      return;
    }
    onChangeString(path, value);
  }

  function handleBlockSelectionChange(slotIndex: number, nextBlockId: string) {
    const previousBlockId = stringValue(readPath(draft, `blocks.${slotIndex}.blockId`));
    const previousBlock = customBlockMap.get(previousBlockId) ?? null;
    const nextBlock = customBlockMap.get(nextBlockId) ?? null;
    const nextFieldKeys = new Set(nextBlock?.fields.map((field) => field.key) ?? []);

    onChangeString(`blocks.${slotIndex}.blockId`, nextBlockId);
    onChangeString(`blocks.${slotIndex}.label`, nextBlock?.label ?? "");
    onChangeString(`blocks.${slotIndex}.targetSlot`, nextBlock?.targetSlot ?? "");
    onChangeString(`blocks.${slotIndex}.targetPath`, nextBlock?.targetPath ?? "");

    for (const field of previousBlock?.fields ?? []) {
      if (!nextFieldKeys.has(field.key)) {
        writeBlockFieldValue(slotIndex, field, field.numeric ? "0" : "");
      }
    }

    if (!nextBlock) {
      return;
    }

    for (const field of nextBlock.fields) {
      writeBlockFieldValue(slotIndex, field, resolveBlockFieldDefaultValue(field));
    }
  }

  function renderBlockRow(slotIndex: number) {
    if (!draft) {
      return null;
    }
    const selectedBlockId = stringValue(readPath(draft, `blocks.${slotIndex}.blockId`));
    const selectedBlock = customBlockMap.get(selectedBlockId) ?? null;
    const blockOptions = [
      { label: "Choose a block", value: "" },
      ...availableCustomBlocks.map((block) => ({
        label: block.label,
        value: block.id,
        description: buildBlockOptionDescription(block),
      })),
    ];
    const selectedFieldCount = selectedBlock?.fields.length ?? 0;
    return (
      <div key={slotIndex} className="task-block-row">
        <div className="task-block-head">
          <p>Block {slotIndex + 1}</p>
          <Button variant="flat" onPress={() => handleBlockSelectionChange(slotIndex, "")}>
            Clear
          </Button>
        </div>
        <Select
          label="Block type"
          value={selectedBlockId}
          options={blockOptions}
          onValueChange={(value) => handleBlockSelectionChange(slotIndex, value)}
        />
        {selectedBlock ? (
          <div className="task-simple-card task-simple-card--stacked task-block-editor-card">
            <div>
              <p>Editing now</p>
              <strong>{selectedBlock.label}</strong>
            </div>
            <p className="task-muted">
              {buildSelectedBlockSummary(selectedBlock)}
              {selectedFieldCount ? ` This block exposes ${selectedFieldCount} editable value${selectedFieldCount === 1 ? "" : "s"}.` : ""}
            </p>
            <div className="space-y-3">
              {selectedBlock.fields.map((field) => {
                const currentValue = resolveDraftBlockFieldInputValue(draft, slotIndex, field);
                if (field.control === "select") {
                  return (
                    <Select
                      key={`${selectedBlock.id}:${field.key}`}
                      label={field.label}
                      value={currentValue}
                      options={buildFieldOptions(field)}
                      onValueChange={(value) => writeBlockFieldValue(slotIndex, field, value)}
                      description={field.description}
                    />
                  );
                }
                if (field.control === "textarea") {
                  return (
                    <Textarea
                      key={`${selectedBlock.id}:${field.key}`}
                      label={field.label}
                      value={currentValue}
                      onValueChange={(value) => writeBlockFieldValue(slotIndex, field, value)}
                      description={field.description}
                      minRows={3}
                    />
                  );
                }
                return (
                  <Input
                    key={`${selectedBlock.id}:${field.key}`}
                    label={field.label}
                    type={field.control === "number" ? "number" : "text"}
                    value={currentValue}
                    onValueChange={(value) => writeBlockFieldValue(slotIndex, field, value)}
                    description={field.description}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <p className="task-muted">Choose a block first. The matching fields open underneath once you pick one.</p>
        )}
      </div>
    );
  }

  function renderAdvancedOverrideEditor(entry: {
    fullPath: string;
    relativePath: string;
    label: string;
    description?: string;
    category?: string;
    value: JsonValue;
    metadata?: LibraryAllOptionEntry;
  }) {
    const normalizedType = normalizeAdvancedValueType(entry.metadata?.valueType, entry.value);
    const jsonDraftValue = overrideJsonDrafts[entry.fullPath] ?? formatJson(entry.value);
    return (
      <div className="task-simple-card task-simple-card--stacked">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p>{entry.label}</p>
            <strong>{entry.relativePath}</strong>
            <p>{entry.description ?? `${entry.category ?? "Game value"} · ${entry.metadata?.targetType ?? "Passive"}`}</p>
          </div>
          <Button variant="flat" onPress={() => onRemoveValue(entry.fullPath)}>
            Remove
          </Button>
        </div>
        {normalizedType === "boolean" ? (
          <Switch
            isSelected={Boolean(entry.value)}
            onValueChange={(value) => handlePrimitiveAdvancedValueChange(entry.fullPath, normalizedType, value)}
          />
        ) : normalizedType === "json" ? (
          <div className="space-y-3">
            <Textarea
              label="JSON value"
              value={jsonDraftValue}
              onValueChange={(value) => handleOverrideJsonDraftChange(entry.fullPath, value)}
              minRows={5}
              description="Use this for arrays or object-shaped values."
            />
            {overrideJsonErrors[entry.fullPath] ? <div className="task-error">{overrideJsonErrors[entry.fullPath]}</div> : null}
            <div className="task-button-row">
              <Button variant="flat" onPress={() => applyOverrideJsonDraft(entry.fullPath)}>
                Apply JSON
              </Button>
            </div>
          </div>
        ) : (
          <Input
            label={normalizedType === "integer" || normalizedType === "number" ? "Number value" : "Value"}
            type={normalizedType === "integer" || normalizedType === "number" ? "number" : "text"}
            value={stringifyEditableValue(entry.value)}
            onValueChange={(value) => handlePrimitiveAdvancedValueChange(entry.fullPath, normalizedType, value)}
            description={entry.metadata?.valueRange?.unit ?? undefined}
          />
        )}
      </div>
    );
  }

  const basicsReady = Boolean(currentDisplayName.trim() && selectedDraftIcon.previewPath);
  const blockStepReady = selectedBlockCount > 0;
  const textStepReady = descriptionMode === "auto"
    ? Boolean(autoDescriptionResolved.trim() || autoShortDescriptionResolved.trim())
    : Boolean(stringValue(draft?.description).trim() || stringValue(readPath(draft, "shortDescription")).trim());
  const starterCanRename = Boolean(
    !currentDisplayName.trim() ||
    currentDisplayName === selectedEntry?.title ||
    currentDisplayName === lastStarterSuggestedName,
  );
  const basicsStatusLabel = basicsReady ? "Ready" : "Name and art first";
  const blocksStatusLabel = selectedBlockCount ? `${selectedBlockCount} block${selectedBlockCount === 1 ? "" : "s"}` : "No blocks yet";
  const textStatusLabel = textStepReady ? "Text ready" : descriptionMode === "auto" ? "Auto text pending" : "Write the card text";
  const valuesStatusLabel = customOverrideEntries.length
    ? `${customOverrideEntries.length} extra value${customOverrideEntries.length === 1 ? "" : "s"}`
    : "No extra values";
  const standardValueCount = libraryMetadata?.standardCount ?? libraryMetadata?.allOptionsCount ?? 0;
  const standardEditableCount = libraryMetadata?.standardEditableCount ?? 0;
  const standardCategoryCount = Math.max(0, standardCategoryOptions.length - 1);
  const standardTargetTypeCount = Math.max(0, standardTargetTypeOptions.length - 1);
  const standardValueTypeCount = Math.max(0, standardValueTypeOptions.length - 1);
  const standardsStatusLabel = standardValueCount
    ? `${standardValueCount.toLocaleString()} stored defaults`
    : "Bundled defaults unavailable";
  const standardsCoverageLabel = [
    standardCategoryCount ? `${standardCategoryCount} categories` : null,
    standardTargetTypeCount ? `${standardTargetTypeCount} target types` : null,
    standardValueTypeCount ? `${standardValueTypeCount} value kinds` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
  const placementFlagsEnabled = [
    Boolean(draft?.enabled),
    Boolean(readPath(draft, "pools.addToAllAugments")),
    Boolean(readPath(draft, "pools.addToGenericPool")),
    Boolean(readPath(draft, "pools.addToStartingTree")),
  ].filter(Boolean).length;
  const placementStatusLabel = placementFlagsEnabled ? `${placementFlagsEnabled} option${placementFlagsEnabled === 1 ? "" : "s"} on` : "Defaults only";

  return (
    <div ref={pageMotionRef} className={`task-layout task-layout--create task-layout--create-vnext ${!showDraftChooser ? "is-sidebar-collapsed" : ""} ${useSinglePanelEmptyState ? "task-layout--single-panel" : ""}`}>
      {showDraftChooser ? (
        <aside className={`task-sidebar v2-card thin-scrollbar ${!sidebarExpanded ? "is-collapsed" : ""}`} data-motion-item>
          <div className="task-sidebar-head">
            <div className="task-sidebar-headline">
              <p className="atelier-kicker">Create Custom</p>
              {sidebarExpanded && selectedEntry ? (
                <Button size="sm" variant="flat" onPress={() => setSidebarExpanded(false)}>
                  Close
                </Button>
              ) : null}
            </div>
            <h2 className="task-title">{sidebarExpanded ? "Choose one starter draft" : "Current draft"}</h2>
            {!sidebarExpanded ? (
              <>
                <Button variant="flat" onPress={() => setSidebarExpanded(true)}>
                  Change draft
                </Button>
              </>
            ) : (
              <>
                <p className="task-copy">Start with a starter draft, then tweak it and save it.</p>
                <Input value={search} onValueChange={onSearchChange} placeholder="Search drafts" />
              </>
            )}
          </div>
          <div className="task-sidebar-body">
            {!sidebarExpanded && selectedEntry ? (
              <div className="task-sidebar-selection-pill">
                <div className="task-sidebar-selection-row">
                  {selectedDraftIcon.previewPath ? (
                    <IconPreview
                      previewPath={selectedDraftIcon.previewPath}
                      cropX={selectedDraftIcon.cropX}
                      cropY={selectedDraftIcon.cropY}
                      cropWidth={selectedDraftIcon.cropWidth}
                      cropHeight={selectedDraftIcon.cropHeight}
                      sourceWidth={selectedDraftIcon.sourceWidth}
                      sourceHeight={selectedDraftIcon.sourceHeight}
                      className="task-record-icon"
                      fallback={<MissingIconBadge className="task-record-icon" label="Missing" subtitle="Icon" />}
                      size={44}
                    />
                  ) : (
                    <MissingIconBadge className="task-record-icon" label="Missing" subtitle="Icon" />
                  )}
                  <div className="task-sidebar-selection-copy">
                    <strong>{selectedDraftTitle}</strong>
                    <span>Editing now</span>
                  </div>
                </div>
              </div>
            ) : availableEntries.map((entry) => (
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
                  {entry.id === selectedEntry?.id && selectedDraftIcon.previewPath ? (
                    <IconPreview
                      previewPath={selectedDraftIcon.previewPath}
                      cropX={selectedDraftIcon.cropX}
                      cropY={selectedDraftIcon.cropY}
                      cropWidth={selectedDraftIcon.cropWidth}
                      cropHeight={selectedDraftIcon.cropHeight}
                      sourceWidth={selectedDraftIcon.sourceWidth}
                      sourceHeight={selectedDraftIcon.sourceHeight}
                      size={48}
                      className="task-record-icon"
                    />
                  ) : entry.iconPreviewPath ? (
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
                  ) : (
                    <MissingIconBadge className="task-record-icon" label="Missing icon" subtitle="Draft" />
                  )}
                  <div className="min-w-0">
                    <p title={entry.id === selectedEntry?.id ? selectedDraftTitle : resolveDraftEntryTitle(entry)}>{entry.id === selectedEntry?.id ? selectedDraftTitle : resolveDraftEntryTitle(entry)}</p>
                    <p title={resolveDraftEntrySubtitle(entry)}>{resolveDraftEntrySubtitle(entry)}</p>
                  </div>
                </div>
              </button>
            ))}
            {sidebarExpanded && !hasSelectableDrafts ? (
              <div className="task-empty-card">
                <p>No starter draft is ready yet.</p>
                <Button color="primary" onPress={onCreateDraft} isDisabled={creatingDraft}>
                  {creatingDraft ? "Creating draft..." : "Create starter draft now"}
                </Button>
              </div>
            ) : null}
          </div>
        </aside>
      ) : null}

      <section className="task-main">
        <Card className="v2-card border-none shadow-none" data-motion-item>
          <CardHeader className="task-header task-header--create-studio">
            <div className="task-header-copy-block">
              <div className="task-header-meta">
                <span className="task-header-chip">Create</span>
                <span className="task-header-chip">
                  {selectedBlockCount ? `${selectedBlockCount} block${selectedBlockCount === 1 ? "" : "s"}` : "No blocks"}
                  {customOverrideEntries.length ? ` · ${customOverrideEntries.length} extra` : ""}
                </span>
              </div>
              <h3 className="task-title">{selectedDraftTitle || "Choose a custom draft"}</h3>
              <p className="task-copy">
                {draft
                  ? `${selectedTemplateLabel || "Choose a template"} · ${selectedIconLabel || "Pick card art"}`
                  : hasSelectableDrafts
                    ? "Pick one starter draft from the left, or create a fresh bundled copy right here."
                    : "Create one bundled starter draft first. The builder opens as soon as that draft is ready."}
              </p>
            </div>
            <div className="task-header-actions">
              {selectedEntry ? (
                <Button variant="flat" onPress={() => setSidebarExpanded(true)}>
                  Drafts
                </Button>
              ) : null}
              {draft ? (
                <Button variant="flat" onPress={() => setStudioToolsOpen(true)}>
                  Tools
                </Button>
              ) : null}
              <Button
                color={draft ? "secondary" : "primary"}
                variant={draft ? "flat" : undefined}
                onPress={onCreateDraft}
                isDisabled={creatingDraft}
              >
                {creatingDraft ? "Creating draft..." : draft ? "Fresh draft" : "Create starter draft"}
              </Button>
              {draft ? (
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  <Button color="primary" startContent={<Save className="h-4 w-4" />} onPress={onSave}>
                    Save augment
                  </Button>
                  <HintPopover hintId="save-action" />
                </span>
              ) : null}
            </div>
          </CardHeader>
          <CardBody className="task-body">
            {selectedState?.loading ? (
              <div className="task-empty">
                <p>Loading the selected custom draft...</p>
              </div>
            ) : null}
            {selectedState?.error ? <div className="task-error">{selectedState.error}</div> : null}

            {draft ? (
              <>
                <div className="task-workspace-shell task-create-studio">
                  <aside className="task-create-step-rail">
                    <div className="task-create-step-rail-head">
                      <p className="atelier-kicker">Build flow</p>
                      <h4>Keep one step open</h4>
                      <p>{selectedDraftTitle || "Unnamed custom"}</p>
                    </div>
                    <div className="task-step-strip task-create-guided-strip" aria-label="Create steps">
                      <button type="button" aria-label="Name and art" title="Name and art" className={`task-step-pill ${activeGuidedStep === "basics" ? "is-active" : basicsReady ? "is-complete" : ""}`} onClick={() => setActiveGuidedStep("basics")}>
                        <span>1</span>
                        <strong>Basics</strong>
                      </button>
                      <button type="button" aria-label="Add blocks" title="Add blocks" className={`task-step-pill ${activeGuidedStep === "blocks" ? "is-active" : blockStepReady ? "is-complete" : ""}`} onClick={() => setActiveGuidedStep("blocks")}>
                        <span>2</span>
                        <strong>Blocks</strong>
                      </button>
                      <button type="button" aria-label="Card text" title="Card text" className={`task-step-pill ${activeGuidedStep === "text" ? "is-active" : textStepReady ? "is-complete" : ""}`} onClick={() => setActiveGuidedStep("text")}>
                        <span>3</span>
                        <strong>Text</strong>
                      </button>
                      <button type="button" aria-label="Extra values" title="Extra values" className={`task-step-pill ${activeGuidedStep === "values" ? "is-active" : customOverrideEntries.length ? "is-complete" : ""}`} onClick={() => setActiveGuidedStep("values")}>
                        <span>4</span>
                        <strong>Values</strong>
                      </button>
                      <button type="button" aria-label="Placement" title="Placement" className={`task-step-pill ${activeGuidedStep === "placement" ? "is-active" : placementFlagsEnabled ? "is-complete" : ""}`} onClick={() => setActiveGuidedStep("placement")}>
                        <span>5</span>
                        <strong>Place</strong>
                      </button>
                    </div>
                    <div className="task-create-step-rail-note">
                      <span>{selectedIconLabel || "Pick art"}</span>
                      <span>{selectedBlockCount ? `${selectedBlockCount} block${selectedBlockCount === 1 ? "" : "s"}` : "No blocks yet"}</span>
                      <span>{customOverrideEntries.length ? `${customOverrideEntries.length} extra value${customOverrideEntries.length === 1 ? "" : "s"}` : "Base values only"}</span>
                    </div>
                  </aside>
                  <div className="task-workspace-main task-create-editor-pane">
                    <CreateStepSection
                      title="Card basics"
                      subtitle="Set the name, icon, and template first. The live card on the right is the truth."
                      mode={mode}
                      stepKey="basics"
                      activeStep={activeGuidedStep}
                      onOpen={setActiveGuidedStep}
                      summaryLabel="Current basics"
                      summaryValue={selectedDraftTitle || "Unnamed custom"}
                      summaryBody={`${selectedDraftIcon.previewPath ? "Icon ready" : "Icon missing"} · ${selectedTemplateLabel || "No template picked yet"}`}
                    >
                      <div className="space-y-5">
                        <div className="task-section-picker task-section-picker--inline">
                          <p className="task-section-picker-label">Basics view</p>
                          <div className="task-segmented" role="tablist" aria-label="Create basics view">
                            <button type="button" className={basicsSurface === "visual" ? "is-active" : ""} onClick={() => setBasicsSurface("visual")}>
                              Visual setup
                            </button>
                            <button type="button" className={basicsSurface === "keys" ? "is-active" : ""} onClick={() => setBasicsSurface("keys")}>
                              Advanced keys
                            </button>
                          </div>
                        </div>

                        {basicsSurface === "visual" ? (
                          <>
                            <div className="task-grid task-grid--basics">
                              <Input
                                label="What should players call it?"
                                value={currentDisplayName}
                                onValueChange={(value) => {
                                  onChangeString("displayName", value);
                                  onChangeString("key", buildCustomKey(value));
                                }}
                                description="Example: Poison Wave or Heavy Burst."
                              />
                              <IconSelectionCard
                                title="Card art"
                                subtitle="Pick the real game icon players should see on the card. We write the exact key for you."
                                resolvedLabel={selectedIconLabel || "Choose one real game icon"}
                                previewPath={selectedDraftIcon.previewPath}
                                cropX={selectedDraftIcon.cropX}
                                cropY={selectedDraftIcon.cropY}
                                cropWidth={selectedDraftIcon.cropWidth}
                                cropHeight={selectedDraftIcon.cropHeight}
                                sourceWidth={selectedDraftIcon.sourceWidth}
                                sourceHeight={selectedDraftIcon.sourceHeight}
                                actionLabel={iconPickerTarget === "icon.sourcePassiveKey" && iconPickerOpen ? "Hide full icon gallery" : "Open full icon gallery"}
                                active={iconPickerTarget === "icon.sourcePassiveKey" && iconPickerOpen}
                                onAction={() => openIconPicker("icon.sourcePassiveKey")}
                                hintId="card-art"
                              />
                            </div>

                            <div className="task-grid task-grid--basics">
                              <IconSelectionCard
                                title="Template source"
                                subtitle="Choose the real game passive this custom starts from before your own overrides are applied."
                                resolvedLabel={selectedTemplateLabel || "Choose one real game passive"}
                                previewPath={typeof selectedTemplateChoice?.previewPath === "string" ? selectedTemplateChoice.previewPath : null}
                                cropX={readNumber(selectedTemplateChoice?.cropX)}
                                cropY={readNumber(selectedTemplateChoice?.cropY)}
                                cropWidth={readNumber(selectedTemplateChoice?.cropWidth)}
                                cropHeight={readNumber(selectedTemplateChoice?.cropHeight)}
                                sourceWidth={readNumber(selectedTemplateChoice?.sourceWidth)}
                                sourceHeight={readNumber(selectedTemplateChoice?.sourceHeight)}
                                actionLabel={iconPickerTarget === "templatePassiveKey" && iconPickerOpen ? "Hide template gallery" : "Open template gallery"}
                                active={iconPickerTarget === "templatePassiveKey" && iconPickerOpen}
                                onAction={() => openIconPicker("templatePassiveKey")}
                              />
                            </div>
                          </>
                        ) : (
                          <div className="space-y-4">
                            <div className="task-simple-card task-simple-card--stacked">
                              <div>
                                <p>Advanced keys</p>
                                <strong>Use these only when you need to paste or inspect the exact runtime references.</strong>
                              </div>
                              <p>Normal editing should stay in the visual view. These inputs map directly to the mod-facing passive and icon keys.</p>
                            </div>
                            <div className="task-grid task-grid--basics-tools">
                              <IconIdPickerField
                                label="Icon key"
                                value={selectedIcon}
                                description="Use the full game icon gallery or paste the passive key directly."
                                resolvedLabel={selectedIconLabel}
                                browseLabel={iconPickerTarget === "icon.sourcePassiveKey" ? iconPickerMeta.browseLabel : "All game icons"}
                                canBrowse={Boolean(mergedIconCatalog.length)}
                                onBrowse={() => openIconPicker("icon.sourcePassiveKey")}
                                onValueChange={(value) => onChangeString("icon.sourcePassiveKey", value)}
                              />

                              <IconIdPickerField
                                label="Template passive key"
                                value={selectedTemplateKey}
                                description="This controls which real game passive the custom starts from before your own overrides are applied."
                                resolvedLabel={selectedTemplateLabel}
                                browseLabel={iconPickerTarget === "templatePassiveKey" ? iconPickerMeta.browseLabel : "Choose template source"}
                                canBrowse={Boolean(templateCatalog.length)}
                                onBrowse={() => openIconPicker("templatePassiveKey")}
                                onValueChange={(value) => onChangeString("templatePassiveKey", value)}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </CreateStepSection>

                    <CreateStepSection
                      title="Add simple blocks"
                      subtitle={
                        usingLibraryBlockMetadata
                          ? passiveCompatibleBlockCount > 0
                            ? "Blocks come from the current library metadata. Passive-ready blocks are listed first."
                            : "Blocks come from the current library metadata for this workspace."
                          : "Add one or two blocks first. You do not need to fill every slot."
                      }
                      mode={mode}
                      stepKey="blocks"
                      activeStep={activeGuidedStep}
                      onOpen={setActiveGuidedStep}
                      summaryLabel="Current block setup"
                      summaryValue={blocksStatusLabel}
                      summaryBody={selectedBlockCount ? "Keep the builder focused on the 1-2 effects that actually define the augment." : "Start with one clear effect before touching deeper values."}
                      hintId="effect-add"
                    >
                      <div className="space-y-4">
                        <div className="task-step-strip task-create-block-strip" aria-label="Custom block slots">
                          {CUSTOM_BLOCK_SLOT_META.map((slot) => {
                            const selectedBlockId = stringValue(readPath(draft, `blocks.${slot.index}.blockId`));
                            const selectedBlock = customBlockMap.get(selectedBlockId) ?? null;
                            return (
                              <button
                                key={slot.index}
                                type="button"
                                className={`task-step-pill ${activeBlockSlot === slot.index ? "is-active" : selectedBlock ? "is-complete" : ""}`}
                                onClick={() => setActiveBlockSlot(slot.index)}
                              >
                                <span>{slot.index + 1}</span>
                                <strong>{slot.label}</strong>
                              </button>
                            );
                          })}
                        </div>
                        <div className="task-simple-card task-simple-card--stacked task-create-block-focus">
                          <div>
                            <p>{CUSTOM_BLOCK_SLOT_META[activeBlockSlot]?.label ?? "Block slot"}</p>
                            <strong>{stringValue(readPath(draft, `blocks.${activeBlockSlot}.blockId`)) ? "Editing selected block" : "Choose a block for this slot"}</strong>
                          </div>
                          <p>{CUSTOM_BLOCK_SLOT_META[activeBlockSlot]?.body ?? "Pick one block for this slot."}</p>
                        </div>
                        {renderBlockRow(activeBlockSlot)}
                        <details
                          data-testid="custom-builder-sortable-blocks"
                          className="task-create-block-reorder"
                          style={{ marginTop: 8 }}
                        >
                          <summary
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              cursor: "pointer",
                              fontSize: 13,
                              color: "var(--text-muted, #94a3b8)",
                            }}
                          >
                            <span>Reorder blocks (preview)</span>
                            <HintPopover hintId="advanced-section" />
                          </summary>
                          <div style={{ marginTop: 8 }}>
                            <SortableFieldList
                              items={
                                reorderBlockItems.length > 0
                                  ? reorderBlockItems
                                  : [
                                      { id: "block-1", label: "First block" },
                                      { id: "block-2", label: "Second block" },
                                      { id: "block-3", label: "Third block" },
                                    ]
                              }
                              onReorder={(_from, _to) => {
                                // Preview-only: persisting block reorders requires an
                                // array-aware setter that the current onChange* surface
                                // does not expose. Tracked as Phase 4 polish (Task 22).
                                void _from;
                                void _to;
                              }}
                              isDisabled={!reorderModeEnabled}
                              listId="custom-builder-blocks"
                            />
                            <div className="task-button-row" style={{ marginTop: 8 }}>
                              <Button
                                variant="flat"
                                onPress={() => setReorderModeEnabled((value) => !value)}
                              >
                                {reorderModeEnabled ? "Lock reorder preview" : "Unlock reorder preview"}
                              </Button>
                            </div>
                          </div>
                        </details>
                      </div>
                    </CreateStepSection>

                    <CreateStepSection
                      title="Card text"
                      subtitle="Choose auto text or write the copy yourself with live tokens."
                      mode={mode}
                      stepKey="text"
                      activeStep={activeGuidedStep}
                      onOpen={setActiveGuidedStep}
                      summaryLabel="Current text mode"
                      summaryValue={descriptionMode === "auto" ? "Auto description" : "Custom description"}
                      summaryBody={textStatusLabel}
                    >
                      <div className="space-y-4">
                        <div className="task-section-picker">
                          <p className="task-section-picker-label">Pick the easier text mode for this card.</p>
                          <div className="task-segmented" role="tablist" aria-label="Card text mode">
                            <button className={descriptionMode === "auto" ? "is-active" : ""} onClick={() => applyDescriptionMode("auto")} type="button">
                              Auto description
                            </button>
                            <button className={descriptionMode === "custom" ? "is-active" : ""} onClick={() => applyDescriptionMode("custom")} type="button">
                              Write my own
                            </button>
                          </div>
                        </div>

                        {descriptionMode === "auto" ? (
                          <div className="task-simple-card task-simple-card--stacked">
                            <div>
                              <p>Main card text</p>
                              <p>Updated from the blocks you picked and already resolved with the live values.</p>
                              <strong>{autoDescriptionResolved || "Add one or two blocks first."}</strong>
                            </div>
                            <div>
                              <p>Short description</p>
                              <p>Used by the smaller card summary when supported.</p>
                              <strong>{autoShortDescriptionResolved || "Auto summary appears once a block is selected."}</strong>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="task-simple-card task-simple-card--stacked">
                              <div>
                                <p>Live token help</p>
                                <strong>Keep the copy tight and pull values from the selected blocks.</strong>
                              </div>
                              <p className="task-muted">
                                Your custom text stays saved if you switch back to auto later. The token list below is generated from the real block fields you picked, so single-field blocks usually get a short token and multi-field blocks give you one token per field.
                              </p>
                            </div>
                            <div className="task-grid">
                            <div className="space-y-3">
                              <Textarea
                                label="Main description"
                                value={stringValue(draft.description)}
                                onValueChange={handleCustomDescriptionChange}
                                description="Shown on the main card body. The launcher preview resolves tokens the same way the mod does."
                                minRows={3}
                              />
                              <TextTokenInsertRow
                                tokens={customTextTokens}
                                onInsert={(token) => handleCustomDescriptionChange(appendToken(stringValue(draft.description), token))}
                              />
                            </div>
                            <div className="space-y-3">
                              <Textarea
                                label="Short description"
                                value={stringValue(readPath(draft, "shortDescription"))}
                                onValueChange={handleCustomShortDescriptionChange}
                                description="Shown in smaller card-summary text when the target supports it."
                                minRows={3}
                              />
                              <TextTokenInsertRow
                                tokens={customTextTokens}
                                onInsert={(token) =>
                                  handleCustomShortDescriptionChange(
                                    appendToken(stringValue(readPath(draft, "shortDescription")), token),
                                  )
                                }
                              />
                            </div>
                          </div>
                          </div>
                        )}
                        {false ? (
                          <div className="task-value-browser task-value-browser--split">
                            <div className="task-value-browser-nav">
                              <div className="task-value-browser-nav-copy">
                                <p className="task-section-eyebrow">Stored defaults</p>
                                <h4 className="task-title task-title--compact">{filteredAdvancedValueResults.length === 1 ? "1 result" : `${filteredAdvancedValueResults.length} results`}</h4>
                                <p className="task-muted">Inspect one stored baseline at a time, then add only the overrides you actually want in this preset.</p>
                              </div>
                              <div className="task-value-browser-nav-list" aria-label="Bundled value results">
                                {filteredAdvancedValueResults.map((entry) => (
                                  <button
                                    key={entry.optionId}
                                    type="button"
                                    className={`task-value-browser-pill ${activeAdvancedValueEntry?.optionId === entry.optionId ? "is-active" : ""}`}
                                    onClick={() => setActiveAdvancedOptionId(entry.optionId)}
                                  >
                                    <span>{entry.label}</span>
                                    <strong>{compactAdvancedPickerValue(entry.currentValue ?? entry.defaultValue)}</strong>
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="task-value-browser-main">
                              <div className="task-value-browser-summary">
                                <div>
                                  <p className="task-section-eyebrow">{activeAdvancedValueEntry?.category ?? "Game value"}</p>
                                  <h4 className="task-title task-title--compact">{activeAdvancedValueEntry?.label ?? "Choose one value"}</h4>
                                </div>
                                <p className="task-muted">Stored baseline: {compactAdvancedPickerValue(activeAdvancedValueEntry?.defaultValue)}</p>
                              </div>
                              <div className="task-value-browser-detail-shell">
                                <div className="task-value-browser-detail">
                                  {activeAdvancedValueEntry ? (
                                    <div className="task-simple-card task-simple-card--stacked">
                                      <div className="space-y-1">
                                        <p>{activeAdvancedValueEntry.path}</p>
                                        <strong>{activeAdvancedValueEntry.description ?? `${activeAdvancedValueEntry.targetType ?? "Game value"} · ${activeAdvancedValueEntry.source}`}</strong>
                                        <p className="task-muted">
                                          {activeAdvancedValueEntry.valueType ?? "value"} · {activeAdvancedValueEntry.editable === false ? "Read-only in export" : "Editable in export"}
                                        </p>
                                      </div>
                                      <div className="task-grid">
                                        <div className="task-simple-card">
                                          <div>
                                            <p>Stored default</p>
                                            <div className="task-simple-card-value">{compactAdvancedPickerValue(activeAdvancedValueEntry.defaultValue)}</div>
                                          </div>
                                        </div>
                                        <div className="task-simple-card">
                                          <div>
                                            <p>Current live value</p>
                                            <div className="task-simple-card-value">{compactAdvancedPickerValue(activeAdvancedValueEntry.currentValue ?? activeAdvancedValueEntry.defaultValue)}</div>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="task-button-row">
                                        <Button variant="flat" onPress={() => handleAddAdvancedValue(activeAdvancedValueEntry)}>
                                          Add this value
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="task-empty-card">
                                      <p>Choose one bundled value from the left to inspect its standard baseline before adding it.</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="task-empty-card">
                            <p>No bundled game values matched that combination of category, filters, and search yet.</p>
                          </div>
                        )}
                      </div>
                    </CreateStepSection>

                    <CreateStepSection
                      title="Extra game values"
                      subtitle={`Search the stored default values and add only the exact overrides you need.${standardValueCount ? ` The current bundle stores ${standardValueCount.toLocaleString()} baseline values.` : ""}`}
                      mode={mode}
                      stepKey="values"
                      activeStep={activeGuidedStep}
                      onOpen={setActiveGuidedStep}
                      summaryLabel="Bundled value overrides"
                      summaryValue={valuesStatusLabel}
                      summaryBody="Use this only when the block builder does not expose the field you need."
                      hintId="advanced-section"
                    >
                      <div className="space-y-4">
                        <div className="task-grid">
                          <div className="task-simple-card task-simple-card--stacked">
                            <div>
                              <p>Stored standards</p>
                              <strong>{standardsStatusLabel}</strong>
                            </div>
                            <p>{standardsCoverageLabel || "Browse the bundled baseline set instead of scanning one giant inline list."}</p>
                          </div>
                          <div className="task-simple-card task-simple-card--stacked">
                            <div>
                              <p>Editable coverage</p>
                              <strong>{standardEditableCount ? `${standardEditableCount.toLocaleString()} editable values` : "Launcher editability unknown"}</strong>
                            </div>
                            <p>Start with fields the launcher can edit safely before falling back to raw JSON shapes.</p>
                          </div>
                          <div className="task-simple-card task-simple-card--stacked">
                            <div>
                              <p>Current selection</p>
                              <strong>{valuesStatusLabel}</strong>
                            </div>
                            <p>Only the exact values you add stay visible below. Untouched defaults stay in the stored baseline.</p>
                          </div>
                        </div>

                        {advancedValueLoading ? <p className="task-muted">Searching bundled values...</p> : null}
                        {advancedValueError ? <div className="task-error">{advancedValueError}</div> : null}
                        {false ? (
                          advancedValueResults.length ? (
                            <div className="task-grid">
                              {advancedValueResults.slice(0, 12).map((entry) => (
                                <div key={entry.optionId} className="task-choice task-choice--stacked">
                                  <div className="space-y-1">
                                    <p>{entry.label}</p>
                                    <p>{entry.path}</p>
                                    <p>{entry.description ?? `${entry.category} · ${entry.targetType ?? "Game value"}`}</p>
                                  </div>
                                  <div className="task-button-row">
                                    <Button variant="flat" onPress={() => handleAddAdvancedValue(entry)}>
                                      Add value
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="task-muted">No bundled game values matched that search yet.</p>
                          )
                        ) : null}

                        <div className="task-inline-banner task-inline-banner--compact task-create-picker-banner">
                          <div>
                            <strong>Need deeper values? Open the standard browser.</strong>
                            <p className="task-inline-banner-copy">
                              Search the stored defaults, inspect the baseline, then add only the overrides you actually want to write into this draft.
                            </p>
                          </div>
                          <div className="task-button-row">
                            <Button variant="flat" onPress={openAdvancedValuePicker}>
                              {valuePickerOpen ? "Close standard browser" : "Open standard browser"}
                            </Button>
                          </div>
                        </div>

                        {customOverrideEntries.length ? (
                          <div className="task-value-browser task-value-browser--split">
                            <div className="task-value-browser-nav">
                              <div className="task-value-browser-nav-copy">
                                <p className="task-section-eyebrow">Added values</p>
                                <h4 className="task-title task-title--compact">{customOverrideEntries.length === 1 ? "1 override" : `${customOverrideEntries.length} overrides`}</h4>
                                <p className="task-muted">Keep one extra value in focus instead of opening every override card at once.</p>
                              </div>
                              <div className="task-value-browser-nav-list" aria-label="Added override values">
                                {customOverrideEntries.map((entry) => (
                                  <button
                                    key={entry.fullPath}
                                    type="button"
                                    className={`task-value-browser-pill ${activeCustomOverrideEntry?.fullPath === entry.fullPath ? "is-active" : ""}`}
                                    onClick={() => setActiveCustomOverridePath(entry.fullPath)}
                                  >
                                    <span>{entry.label}</span>
                                    <strong>{entry.category ?? "Value"}</strong>
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="task-value-browser-main">
                              <div className="task-value-browser-summary">
                                <div>
                                  <p className="task-section-eyebrow">Focused editor</p>
                                  <h4 className="task-title task-title--compact">{activeCustomOverrideEntry?.label ?? "Choose an override"}</h4>
                                </div>
                                <p className="task-muted">These are the only extra values currently written into the draft.</p>
                              </div>
                              <div className="task-value-browser-detail-shell">
                                <div className="task-value-browser-detail">
                                  {activeCustomOverrideEntry ? renderAdvancedOverrideEditor(activeCustomOverrideEntry) : (
                                    <div className="task-empty-card">
                                      <p>Pick one override to inspect and edit it here.</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="task-empty-card">
                            <p>Add one bundled value when the block builder still does not expose the argument you need.</p>
                          </div>
                        )}

                        {false ? (
                          <details className="task-details" open={Boolean(customOverrideEntries.length)}>
                          <summary>{customOverrideEntries.length ? `${customOverrideEntries.length} extra values added` : "No extra values added yet"}</summary>
                          <div className="task-details-body space-y-4">
                            {customOverrideEntries.length ? (
                              customOverrideEntries.map((entry) => {
                                const normalizedType = normalizeAdvancedValueType(entry.metadata?.valueType, entry.value);
                                const jsonDraftValue = overrideJsonDrafts[entry.fullPath] ?? formatJson(entry.value);
                                return (
                                  <div key={entry.fullPath} className="task-simple-card task-simple-card--stacked">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="space-y-1">
                                        <p>{entry.label}</p>
                                        <p>{entry.relativePath}</p>
                                        <p>{entry.description ?? `${entry.category ?? "Game value"} · ${entry.metadata?.targetType ?? "Passive"}`}</p>
                                      </div>
                                      <Button variant="flat" onPress={() => onRemoveValue(entry.fullPath)}>
                                        Remove
                                      </Button>
                                    </div>

                                    {normalizedType === "boolean" ? (
                                      <Switch
                                        isSelected={Boolean(entry.value)}
                                        onValueChange={(value) => handlePrimitiveAdvancedValueChange(entry.fullPath, normalizedType, value)}
                                      />
                                    ) : normalizedType === "json" ? (
                                      <div className="space-y-3">
                                        <Textarea
                                          label="JSON value"
                                          value={jsonDraftValue}
                                          onValueChange={(value) => handleOverrideJsonDraftChange(entry.fullPath, value)}
                                          minRows={4}
                                          description="Use this for arrays or object-shaped values."
                                        />
                                        {overrideJsonErrors[entry.fullPath] ? <div className="task-error">{overrideJsonErrors[entry.fullPath]}</div> : null}
                                        <div className="task-button-row">
                                          <Button variant="flat" onPress={() => applyOverrideJsonDraft(entry.fullPath)}>
                                            Apply JSON
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <Input
                                        label={normalizedType === "integer" || normalizedType === "number" ? "Number value" : "Value"}
                                        type={normalizedType === "integer" || normalizedType === "number" ? "number" : "text"}
                                        value={stringifyEditableValue(entry.value)}
                                        onValueChange={(value) => handlePrimitiveAdvancedValueChange(entry.fullPath, normalizedType, value)}
                                        description={entry.metadata?.valueRange?.unit ?? undefined}
                                      />
                                    )}
                                  </div>
                                );
                              })
                            ) : (
                              <p className="task-muted">Add one of the bundled game values above when the simple block builder does not expose the argument you need.</p>
                            )}
                          </div>
                          </details>
                        ) : null}
                      </div>
                    </CreateStepSection>

                    <CreateStepSection
                      title="Placement"
                      subtitle="Decide where the custom can appear. Keep the pool conservative until the card feels stable."
                      mode={mode}
                      stepKey="placement"
                      activeStep={activeGuidedStep}
                      onOpen={setActiveGuidedStep}
                      summaryLabel="Placement"
                      summaryValue={placementStatusLabel}
                      summaryBody="Keep placement conservative first, then widen the pool only when the card is stable."
                    >
                      <div className="space-y-4">
                        <div className="task-toggle-list">
                          <ToggleRow
                            title="Enable this custom augment"
                            body="Turn it on when you want the game to load it."
                            checked={Boolean(draft.enabled)}
                            onChange={onToggleEnabled}
                          />
                          <ToggleRow
                            title="Show in all augments"
                            body="Makes the game aware of it in the broader augment list."
                            checked={Boolean(readPath(draft, "pools.addToAllAugments"))}
                            onChange={(value) => onChangeBoolean("pools.addToAllAugments", value)}
                          />
                          <ToggleRow
                            title="Put it in the generic pool"
                            body="Use this for general augments instead of character-only ones."
                            checked={Boolean(readPath(draft, "pools.addToGenericPool"))}
                            onChange={(value) => onChangeBoolean("pools.addToGenericPool", value)}
                          />
                          <ToggleRow
                            title="Show in the starting tree"
                            body="Lets it appear earlier in the usual selection flow."
                            checked={Boolean(readPath(draft, "pools.addToStartingTree"))}
                            onChange={(value) => onChangeBoolean("pools.addToStartingTree", value)}
                          />
                        </div>
                      </div>
                    </CreateStepSection>
                  </div>

                  <div className="task-workspace-preview task-workspace-preview--create task-workspace-preview--create-rail">
                    <CardPreviewPanel
                      preview={customCardPreview}
                      tokens={customTextTokens}
                      displayMode="large"
                      chrome="game-only"
                      showDetails={false}
                    />
                  </div>
                </div>
                {(iconPickerOpen || valuePickerOpen) ? (
                  <TaskPickerSheet
                    title={valuePickerOpen ? "Browse bundled game values" : iconPickerMeta.pickerSummary}
                    subtitle={
                      valuePickerOpen
                        ? "Search the bundled export, filter the result set, then add the exact value you need."
                        : iconPickerMeta.pickerDescription
                    }
                    eyebrow={valuePickerOpen ? "Value browser" : iconPickerMeta.cardLabel}
                    onClose={() => {
                      setIconPickerOpen(false);
                      setValuePickerOpen(false);
                    }}
                  >
                    {valuePickerOpen ? (
                      <div className="space-y-4">
                        <div className="task-grid">
                          <Input
                            label="Search game values"
                            value={advancedValueSearch}
                            onValueChange={setAdvancedValueSearch}
                            description="Search by name, path, ability key, or internal runtime label."
                            placeholder="damage, cooldown, sourceTargetKey, status..."
                          />
                          <Select
                            label="Kind"
                            value={advancedValueFilter}
                            options={[
                              { value: "all", label: "All values" },
                              { value: "number", label: "Numbers" },
                              { value: "toggle", label: "Toggles" },
                              { value: "reference", label: "References" },
                              { value: "json", label: "JSON or lists" },
                            ]}
                            onValueChange={(value) => setAdvancedValueFilter(value as typeof advancedValueFilter)}
                          />
                        </div>
                        <div className="task-grid task-grid--basics-tools">
                          <Select
                            label="Target type"
                            value={advancedValueTargetType}
                            options={standardTargetTypeOptions.map((value) => ({ value, label: value === "all" ? "All target types" : value }))}
                            onValueChange={setAdvancedValueTargetType}
                          />
                          <Select
                            label="Value type"
                            value={advancedValueValueType}
                            options={standardValueTypeOptions.map((value) => ({ value, label: value === "all" ? "All value types" : value }))}
                            onValueChange={setAdvancedValueValueType}
                          />
                        </div>
                        <div className="task-section-picker task-section-picker--inline">
                          <p className="task-section-picker-label">Standard categories</p>
                          <div className="task-token-strip" role="tablist" aria-label="Bundled value categories">
                            {standardCategoryOptions.map((value) => (
                              <button
                                key={value}
                                type="button"
                                className={`task-token-pill ${advancedValueCategory === value ? "is-active" : ""}`}
                                aria-pressed={advancedValueCategory === value}
                                onClick={() => setAdvancedValueCategory(value)}
                              >
                                <strong>{value === "all" ? "All" : value}</strong>
                                <span>{value === "all" ? "Everything" : "Category"}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="task-section-picker task-section-picker--inline">
                          <p className="task-section-picker-label">Editable view</p>
                          <div className="task-segmented" role="tablist" aria-label="Bundled value editability">
                            <button className={advancedValueEditableMode === "editable" ? "is-active" : ""} onClick={() => setAdvancedValueEditableMode("editable")} type="button">
                              Editable first
                            </button>
                            <button className={advancedValueEditableMode === "all" ? "is-active" : ""} onClick={() => setAdvancedValueEditableMode("all")} type="button">
                              Include all
                            </button>
                            <button className={advancedValueEditableMode === "readonly" ? "is-active" : ""} onClick={() => setAdvancedValueEditableMode("readonly")} type="button">
                              Read-only only
                            </button>
                          </div>
                        </div>
                        {advancedValueLoading ? <p className="task-muted">Searching bundled values...</p> : null}
                        {advancedValueError ? <div className="task-error">{advancedValueError}</div> : null}
                        {false ? (
                          filteredAdvancedValueResults.length ? (
                            <div className="task-icon-gallery task-icon-gallery--sheet">
                              {filteredAdvancedValueResults.slice(0, 48).map((entry) => (
                                <button
                                  key={entry.optionId}
                                  className="task-icon-choice task-icon-choice--wide"
                                  onClick={() => handleAddAdvancedValue(entry)}
                                  type="button"
                                >
                                  <div>
                                    <p>{entry.label}</p>
                                    <p className="task-icon-choice-id">{entry.path}</p>
                                    <p className="task-muted">{entry.description ?? `${entry.category} · ${entry.targetType ?? "Game value"}`}</p>
                                  </div>
                                  <span className="task-icon-choice-badge">Add value</span>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="task-empty-card">
                              <p>No bundled game values matched that search and filter yet.</p>
                            </div>
                          )
                        ) : filteredAdvancedValueResults.length ? (
                          <div className="task-value-browser task-value-browser--split">
                            <div className="task-value-browser-nav">
                              <div className="task-value-browser-nav-copy">
                                <p className="task-section-eyebrow">Stored defaults</p>
                                <h4 className="task-title task-title--compact">{filteredAdvancedValueResults.length === 1 ? "1 result" : `${filteredAdvancedValueResults.length} results`}</h4>
                                <p className="task-muted">Inspect one stored baseline at a time, then add only the overrides you actually want in this preset.</p>
                              </div>
                              <div className="task-value-browser-nav-list" aria-label="Bundled value results">
                                {filteredAdvancedValueResults.length > 30 ? (
                                  <VirtualizedList
                                    items={filteredAdvancedValueResults}
                                    itemHeight={48}
                                    containerHeight="100%"
                                    renderItem={(entry) => (
                                      <button
                                        key={entry.optionId}
                                        type="button"
                                        className={`task-value-browser-pill ${activeAdvancedValueEntry?.optionId === entry.optionId ? "is-active" : ""}`}
                                        onClick={() => setActiveAdvancedOptionId(entry.optionId)}
                                      >
                                        <span>{entry.label}</span>
                                        <strong>{compactAdvancedPickerValue(entry.currentValue ?? entry.defaultValue)}</strong>
                                      </button>
                                    )}
                                    emptyState={null}
                                  />
                                ) : (
                                  filteredAdvancedValueResults.map((entry) => (
                                    <button
                                      key={entry.optionId}
                                      type="button"
                                      className={`task-value-browser-pill ${activeAdvancedValueEntry?.optionId === entry.optionId ? "is-active" : ""}`}
                                      onClick={() => setActiveAdvancedOptionId(entry.optionId)}
                                    >
                                      <span>{entry.label}</span>
                                      <strong>{compactAdvancedPickerValue(entry.currentValue ?? entry.defaultValue)}</strong>
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                            <div className="task-value-browser-main">
                              <div className="task-value-browser-summary">
                                <div>
                                  <p className="task-section-eyebrow">{activeAdvancedValueEntry?.category ?? "Game value"}</p>
                                  <h4 className="task-title task-title--compact">{activeAdvancedValueEntry?.label ?? "Choose one value"}</h4>
                                </div>
                                <p className="task-muted">Stored baseline: {compactAdvancedPickerValue(activeAdvancedValueEntry?.defaultValue)}</p>
                              </div>
                              <div className="task-value-browser-detail-shell">
                                <div className="task-value-browser-detail">
                                  {activeAdvancedValueEntry ? (
                                    <div className="task-simple-card task-simple-card--stacked">
                                      <div className="space-y-1">
                                        <p>{activeAdvancedValueEntry.path}</p>
                                        <strong>{activeAdvancedValueEntry.description ?? `${activeAdvancedValueEntry.targetType ?? "Game value"} · ${activeAdvancedValueEntry.source}`}</strong>
                                        <p className="task-muted">
                                          {activeAdvancedValueEntry.valueType ?? "value"} · {activeAdvancedValueEntry.editable === false ? "Read-only in export" : "Editable in export"}
                                        </p>
                                      </div>
                                      <div className="task-grid">
                                        <div className="task-simple-card">
                                          <div>
                                            <p>Stored default</p>
                                            <div className="task-simple-card-value">{compactAdvancedPickerValue(activeAdvancedValueEntry.defaultValue)}</div>
                                          </div>
                                        </div>
                                        <div className="task-simple-card">
                                          <div>
                                            <p>Current live value</p>
                                            <div className="task-simple-card-value">{compactAdvancedPickerValue(activeAdvancedValueEntry.currentValue ?? activeAdvancedValueEntry.defaultValue)}</div>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="task-button-row">
                                        <Button variant="flat" onPress={() => handleAddAdvancedValue(activeAdvancedValueEntry)}>
                                          Add this value
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="task-empty-card">
                                      <p>Choose one bundled value from the left to inspect its standard baseline before adding it.</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="task-empty-card">
                            <p>No bundled game values matched that combination of category, filters, and search yet.</p>
                          </div>
                        )}
                      </div>
                    ) : iconPickerTarget === "templatePassiveKey" ? (
                      <div className="space-y-4">
                        <Input
                          value={templateSearch}
                          onValueChange={setTemplateSearch}
                          placeholder="Search template passives by name or key..."
                        />
                        <div className="task-icon-gallery task-icon-gallery--sheet">
                          {visibleTemplateChoices.map((choice) => {
                            const isActive = selectedTemplateKey === choice.value;
                            return (
                              <button
                                key={choice.value}
                                className={`task-icon-choice ${isActive ? "is-active" : ""}`}
                                onClick={() => {
                                  onChangeString("templatePassiveKey", choice.value);
                                  setIconPickerOpen(false);
                                }}
                                type="button"
                              >
                                <div className="task-icon-choice-head">
                                  {isActive ? <span className="task-icon-choice-badge">Selected</span> : <span className="task-icon-choice-badge task-icon-choice-badge--muted">{iconPickerMeta.cardLabel}</span>}
                                </div>
                                {choice.previewPath ? (
                                  <IconPreview
                                    previewPath={choice.previewPath}
                                    cropX={readNumber(choice.cropX)}
                                    cropY={readNumber(choice.cropY)}
                                    cropWidth={readNumber(choice.cropWidth)}
                                    cropHeight={readNumber(choice.cropHeight)}
                                    sourceWidth={readNumber(choice.sourceWidth)}
                                    sourceHeight={readNumber(choice.sourceHeight)}
                                    className="task-icon-preview"
                                    fallback={<MissingIconBadge label="Missing" subtitle="Template" />}
                                    size={64}
                                  />
                                ) : <MissingIconBadge label="Missing" subtitle="Template" />}
                                <div>
                                  <p>{choice.label}</p>
                                  <p className="task-icon-choice-id">{choice.value}</p>
                                  {choice.description ? <p className="task-muted">{choice.description}</p> : null}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        {!visibleTemplateChoices.length ? (
                          <div className="task-empty-card">
                            <p>No bundled passive templates match that search yet.</p>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <Input
                          value={iconSearch}
                          onValueChange={setIconSearch}
                          placeholder="Search icons by name or key..."
                        />
                        <div className="task-icon-gallery task-icon-gallery--sheet">
                          {visibleIconChoices.map((choice, index) => {
                            const value = readIconChoiceValue(choice);
                            const previewPath = typeof choice.previewPath === "string" ? choice.previewPath : null;
                            const label = readIconChoiceLabel(choice, value);
                            const isActive = selectedIcon === value;
                            return (
                              <button
                                key={`${value}-${index}`}
                                className={`task-icon-choice ${isActive ? "is-active" : ""}`}
                                onClick={() => {
                                  onChangeString("icon.sourcePassiveKey", value);
                                  setIconPickerOpen(false);
                                }}
                                type="button"
                              >
                                <div className="task-icon-choice-head">
                                  {isActive ? <span className="task-icon-choice-badge">Selected</span> : <span className="task-icon-choice-badge task-icon-choice-badge--muted">{iconPickerMeta.cardLabel}</span>}
                                </div>
                                {previewPath ? (
                                  <IconPreview
                                    previewPath={previewPath}
                                    cropX={readNumber(choice.cropX)}
                                    cropY={readNumber(choice.cropY)}
                                    cropWidth={readNumber(choice.cropWidth)}
                                    cropHeight={readNumber(choice.cropHeight)}
                                    sourceWidth={readNumber(choice.sourceWidth)}
                                    sourceHeight={readNumber(choice.sourceHeight)}
                                    className="task-icon-preview"
                                    fallback={<MissingIconBadge label="Missing" subtitle="Icon" />}
                                    size={64}
                                  />
                                ) : <MissingIconBadge label="Missing" subtitle="Icon" />}
                                <div>
                                  <p>{label}</p>
                                  <p className="task-icon-choice-id">{value}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        {!visibleIconChoices.length ? (
                          <div className="task-empty-card">
                            <p>No bundled icons match that search yet.</p>
                          </div>
                        ) : null}
                      </div>
                    )}
                    {!valuePickerOpen && (iconPickerTarget === "templatePassiveKey" ? filteredTemplateChoices.length : filteredIconChoices.length) > guidedIconLimit ? (
                      <div className="task-button-row">
                        <Button variant="flat" onPress={() => setShowMoreIcons((value) => !value)}>
                          {showMoreIcons
                            ? "Show fewer entries"
                            : iconPickerTarget === "templatePassiveKey"
                              ? "Show more passive templates"
                              : "Show more game icons"}
                        </Button>
                      </div>
                    ) : null}
                  </TaskPickerSheet>
                ) : null}
                {studioToolsOpen ? (
                  <TaskPickerSheet
                    title="Builder tools"
                    subtitle="Use starter recipes for a fast baseline, or raw JSON only when the structured steps still do not expose the field you need."
                    eyebrow="Studio tools"
                    onClose={() => setStudioToolsOpen(false)}
                  >
                    <div className="space-y-5">
                      <div className="space-y-3">
                        <div>
                          <p className="atelier-kicker">Starter recipes</p>
                          <h4 className="task-section-title">Apply one fast baseline</h4>
                          <p className="task-copy">Each recipe applies the template, suggested name, and icon together.</p>
                        </div>
                        <div className="task-choice-grid">
                          {starterRecipes.map((recipe) => (
                            <button
                              key={recipe.id}
                              className={`task-choice ${stringValue(draft.templatePassiveKey) === recipe.templatePassiveKey ? "is-active" : ""}`}
                              onClick={() => {
                                onChangeString("templatePassiveKey", recipe.templatePassiveKey);
                                onChangeString("launcher.lastStarterSuggestedName", recipe.suggestedName);
                                if (starterCanRename) {
                                  onChangeString("displayName", recipe.suggestedName);
                                  onChangeString("key", buildCustomKey(recipe.suggestedName));
                                }
                                onChangeString("icon.sourcePassiveKey", recipe.iconSourcePassiveKey);
                                setStudioToolsOpen(false);
                              }}
                              type="button"
                            >
                              <p>{recipe.title}</p>
                              <p>{recipe.body}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <p className="atelier-kicker">Raw fallback</p>
                          <h4 className="task-section-title">Open the JSON only when needed</h4>
                          <p className="task-copy">Keep the structured builder as the default path. Use raw editing for the fields the guided steps still do not expose.</p>
                        </div>
                        <div className="task-button-row">
                        <Button variant="flat" startContent={<FolderOpen className="h-4 w-4" />} onPress={onOpenFile}>
                          Open raw file
                        </Button>
                        <Button variant="flat" onPress={applyRawDraftText}>
                          Apply raw JSON
                        </Button>
                        <Button variant="flat" onPress={() => setStudioToolsOpen(false)}>
                          Close raw fallback
                        </Button>
                      </div>
                      <Textarea
                        label="Raw draft JSON"
                        value={rawDraftText}
                        onValueChange={setRawDraftText}
                        description="Full fallback editor for anything the guided controls still do not expose."
                        minRows={10}
                      />
                      {rawDraftError ? <div className="task-error">{rawDraftError}</div> : null}
                      <div className="task-grid">
                        <Input
                          label="Custom ID"
                          type="number"
                          value={stringValue(draft.id)}
                          onValueChange={(value) => onChangeNumber("id", value)}
                          description="Leave this alone if you want the mod to assign the ID."
                        />
                        <Input
                          label="Internal key"
                          value={stringValue(draft.key)}
                          onValueChange={(value) => onChangeString("key", value)}
                          description="Only change this when you really need a specific internal key."
                        />
                      </div>
                      </div>
                    </div>
                  </TaskPickerSheet>
                ) : null}
              </>
            ) : !selectedState?.loading ? (
              <div className="space-y-5">
                <SectionCard
                  title={
                    hasSelectableDrafts
                      ? "Open or create one starter draft"
                      : useSinglePanelEmptyState
                        ? "No starter draft is ready in this instance yet"
                        : "No custom draft is ready in this instance yet"
                  }
                  subtitle={hasSelectableDrafts
                    ? "Pick a seeded draft from the left list, or create a fresh copy right here when the current one does not open cleanly."
                    : useSinglePanelEmptyState
                      ? "Keep the workspace compact until a bundled starter draft exists. Seed one fresh copy, then the full studio opens."
                      : "This instance does not have a readable custom draft yet. Create one from the bundled starter set or inspect the custom augment folder."}
                >
                  <div className={`space-y-4 ${useSinglePanelEmptyState ? "task-empty-workspace" : ""}`}>
                    {selectedState?.error ? <div className="task-error">{selectedState.error}</div> : null}
                    {selectedState?.customDraftTextError ? (
                      <div className="task-error">{selectedState.customDraftTextError}</div>
                    ) : null}
                    {selectedEntry ? (
                      <div className="task-simple-card task-simple-card--stacked">
                        <div>
                          <p>Selected draft</p>
                          <strong>{selectedDraftTitle}</strong>
                        </div>
                        <p>
                          {selectedDraftSubtitle}. If the full builder still does not open, reopen this file or create a fresh starter copy here.
                        </p>
                        <div className="task-button-row">
                          <Button variant="flat" startContent={<FolderOpen className="h-4 w-4" />} onPress={onOpenFile}>
                            Open selected draft
                          </Button>
                          <Button color="secondary" variant="flat" onPress={onCreateDraft} isDisabled={creatingDraft}>
                            {creatingDraft ? "Creating draft..." : "Create fresh starter draft"}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    {hasSelectableDrafts ? (
                      <div className="task-grid">
                        {availableEntries.slice(0, 4).map((entry) => (
                          <button
                            key={entry.id}
                            className="task-choice"
                            onClick={() => {
                              onSelectEntry(entry.id);
                              setSidebarExpanded(false);
                            }}
                            type="button"
                          >
                            <p>{resolveDraftEntryTitle(entry)}</p>
                            <p>{resolveDraftEntrySubtitle(entry, "Open this draft and keep building.")}</p>
                          </button>
                        ))}
                        </div>
                    ) : (
                        <div className="task-simple-card task-simple-card--stacked">
                          <div>
                            <p>Expected folder</p>
                            <strong>UserData/BalanceMod/Custom/Augments</strong>
                          </div>
                          <div>
                            <p>What should happen</p>
                            <p>The launcher should seed bundled starter drafts and repair missing default workspace files when the instance is opened.</p>
                          </div>
                          <p>Use the main Create starter draft action above to seed a fresh bundled draft for this profile.</p>
                        </div>
                    )}
                    {useSinglePanelEmptyState ? (
                      <div className="task-grid task-grid--compact-recipes">
                        {starterRecipes.map((recipe) => (
                          <div key={recipe.id} className="task-simple-card task-simple-card--stacked">
                            <div>
                              <p>{recipe.title}</p>
                              <strong>{recipe.suggestedName}</strong>
                            </div>
                            <p>{recipe.body}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {!hasSelectableDrafts && !useSinglePanelEmptyState ? (
                      <div className="task-button-row">
                        <Button color="primary" onPress={onCreateDraft} isDisabled={creatingDraft}>
                          {creatingDraft ? "Creating draft..." : "Create bundled starter draft"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </SectionCard>

                {!useSinglePanelEmptyState ? (
                  <SectionCard
                    title="Starter drafts you should see"
                    subtitle="These are the bundled starting points that should be available for every launcher instance."
                  >
                    <div className="task-grid">
                      {starterRecipes.map((recipe) => (
                        <div key={recipe.id} className="task-simple-card task-simple-card--stacked">
                          <div>
                            <p>{recipe.title}</p>
                            <strong>{recipe.suggestedName}</strong>
                          </div>
                          <p>{recipe.body}</p>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                ) : null}
              </div>
            ) : null}
          </CardBody>
        </Card>
      </section>
    </div>
  );
}

function resolveDraftEntryTitle(entry?: CatalogEntry | null, liveDisplayName?: string | null) {
  const live = sanitizeDraftCopy(liveDisplayName);
  if (live) {
    return live;
  }
  if (!entry) {
    return "";
  }
  const title = sanitizeDraftCopy(entry.title);
  if (title) {
    return title;
  }
  const displayName = sanitizeDraftCopy(entry.displayName);
  if (displayName) {
    return displayName;
  }
  const fromRelativePath = prettifyDraftFallbackLabel(entry.relativePath?.split(/[\\/]/).pop()?.replace(/\.json$/i, ""));
  const fromAbsolutePath = prettifyDraftFallbackLabel(entry.absolutePath?.split(/[\\/]/).pop()?.replace(/\.json$/i, ""));
  return resolveFriendlyName(fromRelativePath, fromAbsolutePath, "Starter draft");
}

function resolveDraftEntrySubtitle(entry?: CatalogEntry | null, fallback = "Starter draft") {
  if (!entry) {
    return fallback;
  }
  const subtitle = sanitizeDraftCopy(entry.subtitle);
  if (subtitle) {
    return subtitle;
  }
  const targetType = sanitizeDraftCopy(entry.targetType);
  if (targetType) {
    return `${prettifyDraftFallbackLabel(resolveFriendlyName(targetType))} draft`;
  }
  return fallback;
}

function CreateStepSection({
  title,
  subtitle,
  mode: _mode,
  stepKey,
  activeStep,
  onOpen,
  summaryLabel,
  summaryValue,
  summaryBody,
  hintId,
  children,
}: PropsWithChildren<{
  title: string;
  subtitle?: string;
  mode: ExperienceMode;
  stepKey: CreateStepKey;
  activeStep: CreateStepKey;
  onOpen: (step: CreateStepKey) => void;
  summaryLabel: string;
  summaryValue: string;
  summaryBody: string;
  hintId?: HintId;
}>) {
  const guidedOpen = activeStep === stepKey;

  if (!guidedOpen) {
    return null;
  }

  return (
    <section data-motion-item className="task-create-stage-card v2-card">
      <div className="task-create-stage-head">
        <div className="task-create-stage-copy">
          <p className="atelier-kicker">{
            stepKey === "basics"
              ? "Step 1"
              : stepKey === "blocks"
                ? "Step 2"
                : stepKey === "text"
                  ? "Step 3"
                  : stepKey === "values"
                    ? "Step 4"
                    : "Step 5"
          }</p>
          <h4 style={{ display: "inline-flex", alignItems: "center", gap: 6, margin: 0 }}>
            <span>{title}</span>
            {hintId ? <HintPopover hintId={hintId} /> : null}
          </h4>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <button className="task-create-stage-summary" type="button" onClick={() => onOpen(stepKey)}>
          <span>{summaryLabel}</span>
          <strong>{summaryValue}</strong>
          <em>{summaryBody}</em>
        </button>
      </div>
      <div className="task-create-stage-body">{children}</div>
    </section>
  );
}

function sanitizeDraftCopy(value?: string | null) {
  if (!value) {
    return null;
  }
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return null;
  }
  if (/^[a-z]:[\\/]/i.test(cleaned) || /userData|balancemod|custom[\\/]+augments|\.json$/i.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function prettifyDraftFallbackLabel(value?: string | null) {
  if (!value) {
    return value ?? null;
  }
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function ToggleRow({
  title,
  body,
  checked,
  onChange,
}: {
  title: string;
  body: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="task-inline-card">
      <div>
        <p>{title}</p>
        <p>{body}</p>
      </div>
      <Switch isSelected={checked} onValueChange={onChange} />
    </div>
  );
}

function IconIdPickerField({
  label,
  value,
  description,
  resolvedLabel,
  browseLabel,
  canBrowse,
  onBrowse,
  onValueChange,
}: {
  label: string;
  value: string;
  description: string;
  resolvedLabel?: string;
  browseLabel: string;
  canBrowse: boolean;
  onBrowse: () => void;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="task-id-picker-card">
      <div className="task-id-picker-row">
        <Input
          label={label}
          value={value}
          onValueChange={onValueChange}
          description={description}
        />
        {canBrowse ? (
          <Button className="task-id-picker-button" variant="flat" onPress={onBrowse}>
            {browseLabel}
          </Button>
        ) : null}
      </div>
      {resolvedLabel ? (
        <p className="task-id-picker-meta">
          Current match: <strong>{resolvedLabel}</strong>
        </p>
      ) : null}
    </div>
  );
}

function IconSelectionCard({
  title,
  subtitle,
  resolvedLabel,
  previewPath,
  cropX,
  cropY,
  cropWidth,
  cropHeight,
  sourceWidth,
  sourceHeight,
  actionLabel,
  active = false,
  onAction,
  hintId,
}: {
  title: string;
  subtitle: string;
  resolvedLabel: string;
  previewPath?: string | null;
  cropX?: number | null;
  cropY?: number | null;
  cropWidth?: number | null;
  cropHeight?: number | null;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  actionLabel: string;
  active?: boolean;
  onAction: () => void;
  hintId?: HintId;
}) {
  return (
    <div className={`task-selected-icon-card task-selected-icon-card--chooser ${active ? "is-active" : ""}`}>
      <div className="task-selected-icon-visual">
        {previewPath ? (
          <IconPreview
            previewPath={previewPath}
            cropX={cropX}
            cropY={cropY}
            cropWidth={cropWidth}
            cropHeight={cropHeight}
            sourceWidth={sourceWidth}
            sourceHeight={sourceHeight}
            className="task-selected-icon-preview"
            fallback={<MissingIconBadge className="task-selected-icon-preview" label="Missing" subtitle="Icon" />}
            size={72}
          />
        ) : (
          <MissingIconBadge className="task-selected-icon-preview" label="Missing" subtitle="Icon" />
        )}
      </div>
      <div className="task-selected-icon-copy">
        <p style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span>{title}</span>
          {hintId ? <HintPopover hintId={hintId} /> : null}
        </p>
        <strong>{resolvedLabel}</strong>
        <span>{subtitle}</span>
        <div className="task-selected-icon-actions">
          <Button className="task-selected-icon-button" color={active ? "primary" : "secondary"} variant="flat" onPress={onAction}>
            {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TaskPickerSheet({
  eyebrow,
  title,
  subtitle,
  onClose,
  children,
}: PropsWithChildren<{
  eyebrow: string;
  title: string;
  subtitle: string;
  onClose: () => void;
}>) {
  return (
    <div className="task-picker-sheet-shell" data-testid="rebalance-create-picker-sheet">
      <button aria-label="Close picker" className="task-picker-sheet-backdrop" onClick={onClose} type="button" />
      <div className="task-picker-sheet">
        <div className="task-picker-sheet-head">
          <div>
            <p className="atelier-kicker">{eyebrow}</p>
            <h4>{title}</h4>
            <p>{subtitle}</p>
          </div>
          <Button variant="flat" onPress={onClose}>
            Close
          </Button>
        </div>
        <div className="task-picker-sheet-body">{children}</div>
      </div>
    </div>
  );
}

function TextTokenInsertRow({
  tokens,
  onInsert,
}: {
  tokens: TextToken[];
  onInsert: (token: string) => void;
}) {
  if (!tokens.length) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="task-token-strip">
        {tokens.slice(0, 6).map((token) => (
          <button key={token.token} className="task-token-pill" onClick={() => onInsert(token.token)} type="button">
            <strong>{token.token}</strong>
            <span>{token.previewValue !== undefined ? stringValue(token.previewValue) : token.label}</span>
          </button>
        ))}
      </div>
      {tokens.some((token) => token.aliases?.length) ? (
        <div className="task-token-strip task-token-strip--subtle">
          {tokens.flatMap((token) => (token.aliases ?? []).map((alias) => ({
            alias,
            previewValue: token.previewValue,
          }))).slice(0, 6).map((token) => (
            <button key={token.alias} className="task-token-pill task-token-pill--alias" onClick={() => onInsert(token.alias)} type="button">
              <strong>{token.alias}</strong>
              <span>{token.previewValue !== undefined ? stringValue(token.previewValue) : "Alias"}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function buildCustomKey(raw: string): string {
  const slug = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug ? `P_CUSTOM_${slug}` : "P_CUSTOM_NEW_AUGMENT";
}

function readPath(object: JsonObject | undefined, path: string): JsonValue | undefined {
  if (!object) {
    return undefined;
  }
  const parts = path.split(".");
  let current: unknown = object;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = Number(part);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }
    if (typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current as JsonValue | undefined;
}

function stringValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return "";
}

function readIconChoiceValue(choice: Record<string, unknown> | IconChoice): string {
  return String(choice.sourcePassiveKey ?? choice.passiveKey ?? choice.value ?? choice.reference ?? "");
}

function readIconChoiceLabel(choice: Record<string, unknown> | IconChoice, fallbackValue: string): string {
  return resolveFriendlyName(
    typeof choice.label === "string" ? choice.label : undefined,
    typeof choice.spriteName === "string" ? choice.spriteName : undefined,
    fallbackValue,
  );
}

function buildMergedIconCatalog(
  iconChoices: Array<Record<string, unknown>>,
  libraryIcons: Array<IconChoice>,
): IconChoice[] {
  const merged = [...iconChoices, ...libraryIcons].map((choice) => hydrateLooseIconChoice(choice));
  const seen = new Set<string>();
  const deduped: IconChoice[] = [];

  for (const choice of merged) {
    const key = readIconChoiceValue(choice).trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(choice);
  }

  return deduped;
}

function buildTemplateCatalog(
  templates: Array<LibraryTemplateEntry>,
  libraryIcons: Array<IconChoice>,
): TemplateCatalogEntry[] {
  const iconLookupByKey = new Map<string, IconChoice>();
  const iconLookupByReference = new Map<string, IconChoice>();
  for (const choice of libraryIcons) {
    const value = readIconChoiceValue(choice).trim();
    if (value && !iconLookupByKey.has(value)) {
      iconLookupByKey.set(value, choice);
    }
    const reference = typeof choice.reference === "string" ? choice.reference.trim() : "";
    if (reference && !iconLookupByReference.has(reference)) {
      iconLookupByReference.set(reference, choice);
    }
  }

  const seen = new Set<string>();
  const catalog: TemplateCatalogEntry[] = [];
  for (const template of templates) {
    if ((template.targetType ?? "").toLowerCase() !== "passive") {
      continue;
    }

    const value = (template.templatePassiveKey ?? template.targetKey ?? "").trim();
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    const previewFallback = iconLookupByKey.get(value)
      ?? (template.iconReference ? iconLookupByReference.get(template.iconReference) : undefined);
    catalog.push({
      value,
      label: resolveFriendlyName(template.label, template.title, template.displayName, template.targetKey),
      description: template.description,
      previewPath: template.previewPath ?? previewFallback?.previewPath ?? null,
      cropX: readNumber(template.cropX) ?? readNumber(previewFallback?.cropX),
      cropY: readNumber(template.cropY) ?? readNumber(previewFallback?.cropY),
      cropWidth: readNumber(template.cropWidth) ?? readNumber(previewFallback?.cropWidth),
      cropHeight: readNumber(template.cropHeight) ?? readNumber(previewFallback?.cropHeight),
      sourceWidth: readNumber(template.sourceWidth) ?? readNumber(previewFallback?.sourceWidth),
      sourceHeight: readNumber(template.sourceHeight) ?? readNumber(previewFallback?.sourceHeight),
      iconReference: template.iconReference,
      file: template.file,
      runtimeType: template.runtimeType,
    });
  }

  return catalog.sort((left, right) => left.label.localeCompare(right.label));
}

function buildCustomBuilderBlocks(
  libraryBlocks?: LibraryBlockEntry[] | null,
  librarySlots?: LibrarySlot[] | null,
  statusEffectChoices: readonly string[] = bundledStatusEffectChoices,
): BuilderBlockDefinition[] {
  const sourceBlocks = Array.isArray(libraryBlocks) && libraryBlocks.length ? [...libraryBlocks] : [...fallbackLibraryBlocks];
  if (!sourceBlocks.some((block) => normalizeBuilderBlockId(block.blockId) === "effect.status-custom") && statusEffectChoices.length) {
    sourceBlocks.push({
      blockId: "effect.status-custom",
      label: "Custom status effect",
      description: "Attach any bundled status effect and tune its duration and multiplier.",
      category: "Effects",
      family: "Status Effects",
      riskLevel: "medium",
      supportedTargetTypes: ["Passive", "CharacterAbility", "Item", "ItemBehaviour", "ItemConsumableBehaviour"],
      fields: [
        { key: "statusEffect", label: "Status effect", valueType: "select", options: [...statusEffectChoices] },
        { key: "duration", label: "Duration", valueType: "number", defaultValue: 3 },
        { key: "multiplier", label: "Multiplier", valueType: "number", defaultValue: 1 },
      ],
    });
  }
  const targetMetaByBlockId = buildBuilderBlockTargetMetaMap(librarySlots);
  return sourceBlocks
    .map((block) => normalizeBuilderBlock(block, targetMetaByBlockId.get(normalizeBuilderBlockId(block.blockId))))
    .filter((block): block is BuilderBlockDefinition => block !== null)
    .filter((block) => block.compatibilityScore > 0)
    .sort((left, right) => {
      if (right.compatibilityScore !== left.compatibilityScore) {
        return right.compatibilityScore - left.compatibilityScore;
      }
      const leftRisk = resolveRiskSortValue(left.riskLevel);
      const rightRisk = resolveRiskSortValue(right.riskLevel);
      if (leftRisk !== rightRisk) {
        return leftRisk - rightRisk;
      }
      return left.label.localeCompare(right.label);
    });
}

function buildBuilderBlockTargetMetaMap(librarySlots?: LibrarySlot[] | null) {
  const result = new Map<string, { targetSlot?: string; targetPath?: string }>();
  for (const slot of librarySlots ?? []) {
    const targetPath = slot.targetPath?.trim() || undefined;
    const targetSlot = slot.slotId?.trim() || undefined;
    for (const rawBlockId of slot.supportedBlockIds ?? []) {
      const blockId = normalizeBuilderBlockId(rawBlockId);
      if (!blockId || result.has(blockId)) {
        continue;
      }
      result.set(blockId, { targetPath, targetSlot });
    }
  }
  return result;
}

function normalizeBuilderBlock(
  block: LibraryBlockEntry,
  targetMeta?: { targetSlot?: string; targetPath?: string },
): BuilderBlockDefinition | null {
  const id = normalizeBuilderBlockId(block.blockId);
  if (!id) {
    return null;
  }
  const fields = normalizeBuilderFields({
    ...block,
    blockId: id,
  });
  return {
    id,
    label: block.label?.trim() || prettifyDraftFallbackLabel(id.split(".").pop() ?? id) || "Library block",
    description: block.description?.trim() || undefined,
    category: block.category?.trim() || undefined,
    family: block.family?.trim() || undefined,
    riskLevel: block.riskLevel?.trim() || undefined,
    targetSlot: targetMeta?.targetSlot,
    targetPath: targetMeta?.targetPath,
    compatibilityScore: resolveBlockCompatibilityScore(block.supportedTargetTypes),
    fields,
  };
}

function normalizeBuilderBlockId(blockId?: string | null) {
  if (!blockId?.trim()) {
    return "";
  }

  switch (blockId.trim()) {
    case "basic.hp":
      return "basic.health";
    case "basic.lifetime":
      return "basic.duration";
    case "effect.burn":
      return "effect.status-burn";
    case "effect.poison":
      return "effect.status-poison";
    case "presentation.shortdescription":
      return "presentation.short-description";
    default:
      return blockId.trim();
  }
}

function normalizeBuilderFields(block: LibraryBlockEntry): BuilderBlockField[] {
  const normalized = (block.fields ?? [])
    .map((field, index) => normalizeBuilderField(block, field, index))
    .filter((field): field is BuilderBlockField => field !== null);
  if (normalized.length) {
    return normalized;
  }

  const inferred = (block.editableValueKeys ?? [])
    .map((key, index) => buildFieldFromEditableKey(block, key, index))
    .filter((field): field is BuilderBlockField => field !== null);
  if (inferred.length) {
    return inferred;
  }

  return [buildDefaultValueField(block)];
}

function normalizeBuilderField(block: LibraryBlockEntry, field: LibraryFieldDefinition, index: number): BuilderBlockField | null {
  if (!field || typeof field !== "object") {
    return null;
  }
  const key = field.key?.trim() || `value${index + 1}`;
  const label = field.label?.trim() || prettifyDraftFallbackLabel(key) || `Value ${index + 1}`;
  const valueType = normalizeBuilderValueType(field.valueType);
  const options = Array.isArray(field.options) ? field.options.map((item) => String(item)) : undefined;
  const numeric = isNumericBuilderValueType(valueType);
  const defaultValue = field.defaultValue ?? inferDefaultValueForBlockField(block, key, valueType);
  return {
    key,
    label,
    description: field.description?.trim() || undefined,
    valueType,
    defaultValue,
    options,
    control: resolveBuilderFieldControl(valueType, options),
    numeric,
  };
}

function buildFieldFromEditableKey(block: LibraryBlockEntry, key: string, index: number): BuilderBlockField | null {
  const normalizedKey = key.trim();
  if (!normalizedKey) {
    return null;
  }

  const blockId = normalizeBuilderBlockId(block.blockId);
  const fieldBase = {
    key: normalizedKey,
    description: inferBuilderFieldDescription(blockId, normalizedKey, block.description),
  };

  switch (normalizedKey) {
    case "text":
      if (blockId === "presentation.title") {
        return {
          ...fieldBase,
          label: "Title text",
          valueType: "string",
          defaultValue: "",
          control: "text",
          numeric: false,
        };
      }
      return {
        ...fieldBase,
        label: blockId === "presentation.short-description" ? "Short description" : "Description text",
        valueType: "textarea",
        defaultValue: "",
        control: "textarea",
        numeric: false,
      };
    case "reference":
      return {
        ...fieldBase,
        label: "Linked passive reference",
        valueType: "reference",
        defaultValue: "",
        control: "text",
        numeric: false,
      };
    case "sourcePassiveKey":
      return {
        ...fieldBase,
        label: "Source passive key",
        valueType: "string",
        defaultValue: "",
        control: "text",
        numeric: false,
      };
    case "sourceTargetKey":
      return {
        ...fieldBase,
        label: "Ability source key",
        valueType: "string",
        defaultValue: "",
        control: "text",
        numeric: false,
      };
    case "entryId":
      return {
        ...fieldBase,
        label: "Pool entry id",
        valueType: "integer",
        defaultValue: 0,
        control: "number",
        numeric: true,
      };
    case "duration":
      return {
        ...fieldBase,
        label: "Duration",
        valueType: "number",
        defaultValue: inferDefaultValueForBlockField(block, normalizedKey, "number"),
        control: "number",
        numeric: true,
      };
    case "multiplier":
      return {
        ...fieldBase,
        label: "Multiplier",
        valueType: "number",
        defaultValue: inferDefaultValueForBlockField(block, normalizedKey, "number"),
        control: "number",
        numeric: true,
      };
    case "value":
    default: {
      const valueType = inferValueTypeForBlock(blockId);
      return {
        ...fieldBase,
        label: inferValueLabelForBlock(blockId, index),
        valueType,
        defaultValue: inferDefaultValueForBlockField(block, normalizedKey, valueType),
        control: resolveBuilderFieldControl(valueType),
        numeric: isNumericBuilderValueType(valueType),
      };
    }
  }
}

function buildDefaultValueField(block: LibraryBlockEntry): BuilderBlockField {
  const valueType = inferValueTypeForBlock(normalizeBuilderBlockId(block.blockId));
  return {
    key: "value",
    label: inferValueLabelForBlock(normalizeBuilderBlockId(block.blockId), 0),
    description: block.description?.trim() || undefined,
    valueType,
    defaultValue: inferDefaultValueForBlockField(block, "value", valueType),
    control: resolveBuilderFieldControl(valueType),
    numeric: isNumericBuilderValueType(valueType),
  };
}

function inferValueTypeForBlock(blockId: string) {
  switch (blockId) {
    case "presentation.title":
      return "string";
    case "presentation.description":
    case "presentation.short-description":
      return "textarea";
    case "ability.target":
    case "effect.linked-passive":
      return "string";
    case "basic.health":
    case "basic.damage":
    case "basic.price":
      return "integer";
    default:
      return "number";
  }
}

function inferValueLabelForBlock(blockId: string, index: number) {
  switch (blockId) {
    case "basic.health":
      return "Health amount";
    case "basic.damage":
      return "Damage amount";
    case "basic.cooldown":
      return "Cooldown";
    case "basic.duration":
      return "Duration";
    case "basic.speed":
      return "Speed";
    case "basic.size":
      return "Size";
    case "basic.range":
      return "Range";
    case "basic.price":
      return "Price";
    case "ability.target":
      return "Ability target";
    case "presentation.title":
      return "Title text";
    case "presentation.description":
      return "Description text";
    case "presentation.short-description":
      return "Short description";
    default:
      return `Value ${index + 1}`;
  }
}

function inferBuilderFieldDescription(blockId: string, key: string, fallbackDescription?: string) {
  switch (`${blockId}:${key}`) {
    case "ability.target:value":
      return "Set which ability slot or target label this custom augment should affect.";
    case "effect.linked-passive:reference":
      return "Point this custom augment at another passive or linked effect reference.";
    case "effect.status-burn:duration":
    case "effect.status-poison:duration":
    case "effect.status-slow:duration":
    case "effect.status-stun:duration":
      return "How long the status effect should stay active in seconds.";
    case "effect.status-burn:multiplier":
    case "effect.status-poison:multiplier":
    case "effect.status-slow:multiplier":
    case "effect.status-stun:multiplier":
      return "Extra strength multiplier for the status effect.";
    case "presentation.icon:sourcePassiveKey":
      return "Reuse the icon from another passive key.";
    default:
      return fallbackDescription?.trim() || undefined;
  }
}

function inferDefaultValueForBlockField(block: LibraryBlockEntry, key: string, valueType: string): JsonValue {
  const blockId = normalizeBuilderBlockId(block.blockId);
  switch (`${blockId}:${key}`) {
    case "basic.health:value":
      return 250;
    case "basic.damage:value":
      return 180;
    case "basic.cooldown:value":
      return 3.5;
    case "basic.duration:value":
      return 2.5;
    case "basic.speed:value":
      return 1.25;
    case "basic.size:value":
      return 1.1;
    case "basic.range:value":
      return 5;
    case "basic.price:value":
      return 150;
    case "effect.status-burn:duration":
      return 3;
    case "effect.status-poison:duration":
      return 3.5;
    case "effect.status-slow:duration":
      return 2;
    case "effect.status-stun:duration":
      return 1;
    case "effect.status-burn:multiplier":
    case "effect.status-poison:multiplier":
    case "effect.status-slow:multiplier":
    case "effect.status-stun:multiplier":
      return 1;
    default:
      return isNumericBuilderValueType(valueType) ? 0 : "";
  }
}

function normalizeBuilderValueType(valueType?: string) {
  return valueType?.trim().toLowerCase() || "string";
}

function isNumericBuilderValueType(valueType: string) {
  return ["integer", "int", "number", "float", "double", "decimal"].includes(valueType);
}

function resolveBuilderFieldControl(valueType: string, options?: string[]): BuilderFieldControl {
  if (options?.length) {
    return "select";
  }
  if (valueType === "textarea" || valueType === "multiline" || valueType === "longtext") {
    return "textarea";
  }
  return isNumericBuilderValueType(valueType) ? "number" : "text";
}

function resolveBlockCompatibilityScore(supportedTargetTypes?: string[]) {
  if (!supportedTargetTypes?.length) {
    return 1;
  }
  const normalized = supportedTargetTypes.map((value) => value.trim().toLowerCase());
  if (normalized.some((value) => value.includes("passive") || value.includes("augment"))) {
    return 2;
  }
  return 0;
}

function resolveRiskSortValue(riskLevel?: string) {
  switch ((riskLevel ?? "").trim().toLowerCase()) {
    case "safe":
      return 0;
    case "medium":
      return 1;
    case "advanced":
      return 2;
    case "experimental":
      return 3;
    default:
      return 4;
  }
}

function buildBlockOptionDescription(block: BuilderBlockDefinition) {
  const parts = [block.category, block.family, block.riskLevel ? `${prettifyDraftFallbackLabel(block.riskLevel) ?? block.riskLevel} risk` : undefined];
  return parts.filter((value): value is string => Boolean(value)).join(" · ") || block.description || undefined;
}

function buildSelectedBlockSummary(block: BuilderBlockDefinition) {
  const parts = [block.description, buildBlockOptionDescription(block)];
  return parts.filter((value, index, collection): value is string => Boolean(value) && collection.indexOf(value) === index).join(" ");
}

function buildFieldOptions(field: BuilderBlockField) {
  const options = field.options?.length ? field.options : [resolveBlockFieldDefaultValue(field)];
  return options.map((option) => ({
    label: field.key === "statusEffect" ? formatStatusEffectLabel(option) : option,
    value: option,
  }));
}

function resolveBlockFieldDefaultValue(field: BuilderBlockField) {
  if (field.defaultValue !== undefined) {
    return stringifyEditableValue(field.defaultValue);
  }
  if (field.options?.length) {
    return field.options[0] ?? "";
  }
  return field.numeric ? "0" : "";
}

function buildStatusEffectChoices(): readonly string[] {
  return bundledStatusEffectChoices;
}

function formatStatusEffectLabel(value: string): string {
  const cleaned = value
    .replace(/^StatusEffectSO:/i, "")
    .replace(/^SE_/i, "")
    .replace(/_/g, " ");
  return prettifyDraftFallbackLabel(cleaned) ?? value;
}

function resolveDraftBlockFieldValue(
  draft: JsonObject,
  slotIndex: number,
  field: Pick<BuilderBlockField, "key" | "defaultValue">,
) {
  const value = readPath(draft, `blocks.${slotIndex}.values.${field.key}`);
  if (value === undefined || value === null || value === "") {
    if (field.key === "duration") {
      const legacyValue = readPath(draft, `blocks.${slotIndex}.values.value`);
      if (legacyValue !== undefined && legacyValue !== null && legacyValue !== "") {
        return legacyValue;
      }
    }
    return field.defaultValue;
  }
  return value;
}

function resolveDraftBlockFieldInputValue(
  draft: JsonObject,
  slotIndex: number,
  field: Pick<BuilderBlockField, "key" | "defaultValue" | "numeric" | "options">,
) {
  const value = resolveDraftBlockFieldValue(draft, slotIndex, field);
  if (value === undefined || value === null || value === "") {
    return resolveBlockFieldDefaultValue({
      ...field,
      label: "",
      valueType: field.numeric ? "number" : "string",
      control: field.options?.length ? "select" : field.numeric ? "number" : "text",
    });
  }
  return stringifyEditableValue(value);
}

function buildSelectedCustomBlocks(
  draft: JsonObject,
  blockCatalog: Map<string, BuilderBlockDefinition>,
) {
  return CUSTOM_BLOCK_SLOT_INDICES
    .map((slotIndex) => {
      const blockId = stringValue(readPath(draft, `blocks.${slotIndex}.blockId`));
      const block = blockCatalog.get(blockId);
      if (!block) {
        return null;
      }
      return {
        slotIndex,
        block,
        fields: block.fields.map((field) => ({
          ...field,
          value: resolveDraftBlockFieldValue(draft, slotIndex, field),
          previewValue: resolveDraftBlockFieldInputValue(draft, slotIndex, field),
        })),
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
}

function buildSelectedBlockStatLines(
  draft: JsonObject,
  blockCatalog: Map<string, BuilderBlockDefinition>,
) {
  return buildSelectedCustomBlocks(draft, blockCatalog).flatMap(({ block, fields }) =>
    fields
      .filter((field) => shouldIncludeFieldInStatLines(block, field))
      .map((field) => ({
        label: block.fields.length === 1 ? block.label : `${block.label} · ${field.label}`,
        value: field.previewValue,
        category: block.category ?? "Custom",
      }))
      .filter((line) => line.value.trim()),
  );
}

function shouldIncludeFieldInStatLines(
  block: BuilderBlockDefinition,
  field: Pick<BuilderBlockField, "control" | "key">,
) {
  if ((block.family ?? "").toLowerCase() === "presentation") {
    return false;
  }
  if (field.control === "textarea") {
    return false;
  }
  const normalizedKey = normalizeTokenSegment(field.key);
  return !["text", "reference", "sourcepassivekey", "sourcetargetkey", "entryid"].includes(normalizedKey);
}

function stringifyEditableValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null || value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function compactAdvancedPickerValue(value: unknown): string {
  const raw = stringifyEditableValue(value);
  if (!raw) {
    return "—";
  }
  return raw.length > 32 ? `${raw.slice(0, 29)}...` : raw;
}

function uniqueSortedStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => `${value}`.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function mergeAdvancedEntryMaps(
  current: Record<string, LibraryAllOptionEntry>,
  entries: LibraryAllOptionEntry[],
): Record<string, LibraryAllOptionEntry> {
  if (!entries.length) {
    return current;
  }
  const next = { ...current };
  for (const entry of entries) {
    if (typeof entry.path === "string" && entry.path.trim()) {
      next[entry.path.trim()] = entry;
    }
  }
  return next;
}

function isRelevantCustomValueEntry(entry: LibraryAllOptionEntry): boolean {
  if (!entry || entry.editable === false || typeof entry.path !== "string" || !entry.path.trim()) {
    return false;
  }
  const targetType = `${entry.targetType ?? ""}`.trim().toLowerCase();
  if (!targetType) {
    return true;
  }
  return targetType.includes("passive") || targetType.includes("augment");
}

function buildCustomOverrideEntries(
  draft: JsonObject,
  knownEntries: Record<string, LibraryAllOptionEntry>,
): Array<{
  fullPath: string;
  relativePath: string;
  label: string;
  description?: string;
  category?: string;
  value: JsonValue;
  metadata?: LibraryAllOptionEntry;
}> {
  const overrides = readPath(draft, "overrides");
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return [];
  }

  const results: Array<{
    fullPath: string;
    relativePath: string;
    label: string;
    description?: string;
    category?: string;
    value: JsonValue;
    metadata?: LibraryAllOptionEntry;
  }> = [];

  flattenCustomOverrideValue(overrides as JsonValue, "", knownEntries, results);
  return results.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function flattenCustomOverrideValue(
  value: JsonValue,
  relativePath: string,
  knownEntries: Record<string, LibraryAllOptionEntry>,
  results: Array<{
    fullPath: string;
    relativePath: string;
    label: string;
    description?: string;
    category?: string;
    value: JsonValue;
    metadata?: LibraryAllOptionEntry;
  }>,
) {
  const metadata = relativePath ? knownEntries[relativePath] : undefined;
  const normalizedType = normalizeAdvancedValueType(metadata?.valueType, value);

  if (
    relativePath
    && (
      value === null
      || typeof value !== "object"
      || Array.isArray(value)
      || normalizedType === "json"
    )
  ) {
    results.push({
      fullPath: `overrides.${relativePath}`,
      relativePath,
      label: metadata?.label ?? prettifyDraftFallbackLabel(relativePath.split(".").pop() ?? relativePath) ?? relativePath,
      description: metadata?.description,
      category: metadata?.category,
      value,
      metadata,
    });
    return;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }

  for (const [key, childValue] of Object.entries(value)) {
    const nextPath = relativePath ? `${relativePath}.${key}` : key;
    flattenCustomOverrideValue(childValue as JsonValue, nextPath, knownEntries, results);
  }
}

function normalizeAdvancedValueType(valueType: string | undefined, value: JsonValue | undefined): string {
  const normalized = `${valueType ?? ""}`.trim().toLowerCase();
  if (["bool", "boolean"].includes(normalized)) {
    return "boolean";
  }
  if (["int", "integer"].includes(normalized)) {
    return "integer";
  }
  if (["number", "float", "double", "decimal"].includes(normalized)) {
    return "number";
  }
  if (["json", "object", "array"].includes(normalized)) {
    return "json";
  }

  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    return "json";
  }
  return "string";
}

function classifyAdvancedValueKind(entry: LibraryAllOptionEntry): "all" | "number" | "toggle" | "reference" | "json" {
  const normalizedType = normalizeAdvancedValueType(entry.valueType, entry.currentValue ?? entry.defaultValue);
  if (normalizedType === "boolean") {
    return "toggle";
  }
  if (normalizedType === "integer" || normalizedType === "number") {
    return "number";
  }
  if (normalizedType === "json") {
    return "json";
  }
  return /reference|so:|sprite:|passiveso:|ability|character/i.test(`${entry.path} ${entry.label}`) ? "reference" : "all";
}

function cloneEditableLibraryValue(value: JsonValue | undefined, valueType?: string): JsonValue {
  if (value !== undefined) {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  }

  switch (normalizeAdvancedValueType(valueType, undefined)) {
    case "boolean":
      return false;
    case "integer":
    case "number":
      return 0;
    case "json":
      return {};
    default:
      return "";
  }
}

function normalizeTokenSegment(value?: string | null) {
  return (value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function isPrimaryBuilderFieldKey(fieldKey: string) {
  return ["value", "duration", "amount", "reference"].includes(normalizeTokenSegment(fieldKey));
}

function buildFieldTokenCandidates(
  block: BuilderBlockDefinition,
  field: BuilderBlockField,
) {
  const blockToken = normalizeTokenSegment(block.label) || normalizeTokenSegment(block.id.split(".").pop() ?? block.id) || "block";
  const fullBlockToken = normalizeTokenSegment(block.id) || blockToken;
  const fieldToken = normalizeTokenSegment(field.key || field.label) || "value";
  const candidates = [
    ...(block.fields.length === 1 && isPrimaryBuilderFieldKey(field.key) ? [`%${blockToken}%`] : []),
    `%${blockToken}_${fieldToken}%`,
    `%${fullBlockToken}_${fieldToken}%`,
    ...(block.fields.length === 1 ? [`%${fullBlockToken}%`] : []),
  ];
  return [...new Set(candidates)];
}

function buildLegacyStatusTokenAliases(
  block: BuilderBlockDefinition,
  field: BuilderBlockField,
) {
  if (normalizeTokenSegment(field.key) !== "duration") {
    return [];
  }

  switch (normalizeBuilderBlockId(block.id)) {
    case "effect.status-burn":
      return ["%burn%"];
    case "effect.status-poison":
      return ["%poison%"];
    case "effect.status-slow":
      return ["%slow%"];
    case "effect.status-stun":
      return ["%stun%"];
    default:
      return [];
  }
}

function claimUniqueToken(candidates: string[], usedTokens: Set<string>) {
  for (const candidate of candidates) {
    const normalized = normalizeTextTokenName(candidate.replace(/%/g, ""));
    if (!usedTokens.has(normalized)) {
      usedTokens.add(normalized);
      return candidate;
    }
  }

  const base = candidates[candidates.length - 1]?.replace(/^%|%$/g, "") || "value";
  let index = 2;
  while (true) {
    const candidate = `%${base}_${index}%`;
    const normalized = normalizeTextTokenName(candidate.replace(/%/g, ""));
    if (!usedTokens.has(normalized)) {
      usedTokens.add(normalized);
      return candidate;
    }
    index += 1;
  }
}

function reserveTokenAliases(candidates: string[], usedTokens: Set<string>) {
  const aliases: string[] = [];
  for (const candidate of candidates) {
    const normalized = normalizeTextTokenName(candidate.replace(/%/g, ""));
    if (usedTokens.has(normalized)) {
      continue;
    }
    usedTokens.add(normalized);
    aliases.push(candidate);
  }
  return aliases;
}

function resolveCustomStatIconKey(label: string): string | undefined {
  const normalized = label.toLowerCase();
  if (normalized.includes("damage")) return "damage";
  if (normalized.includes("cooldown")) return "cooldown";
  if (normalized.includes("burn")) return "burn";
  if (normalized.includes("poison")) return "poison";
  if (normalized.includes("health") || normalized.includes("hp")) return "health";
  if (normalized.includes("attack speed")) return "attack-speed";
  if (normalized.includes("duration") || normalized.includes("lifetime") || normalized.includes("time")) return "duration";
  return undefined;
}

function buildCustomInlineIconRuns(
  statLines: Array<{ label: string; value: string }>,
  iconCatalog: IconChoice[],
): CardInlineIconRun[] {
  const aliases: Array<{ key: string; terms: string[] }> = [
    { key: "damage", terms: ["p_stat_dmg", "stat_damage", "damage buff", "damage"] },
    { key: "cooldown", terms: ["p_stat_cd", "cooldown reduction", "cooldown", "cdr", "time_icon"] },
    { key: "burn", terms: ["stat_burn", "burn"] },
    { key: "poison", terms: ["stat_poison", "poison"] },
    { key: "health", terms: ["p_stat_hp", "health", "hp"] },
    { key: "attack-speed", terms: ["p_stat_atkspeed", "attack speed"] },
    { key: "duration", terms: ["time_icon", "duration", "lifetime", "time"] },
  ];
  const requiredKeys = new Set(
    statLines.map((line) => resolveCustomStatIconKey(line.label)).filter((value): value is string => Boolean(value)),
  );
  const results: CardInlineIconRun[] = [];

  for (const alias of aliases) {
    if (!requiredKeys.has(alias.key)) continue;
    const choice = iconCatalog.find((entry) => {
      const label = String(entry.label ?? "").toLowerCase();
      const spriteName = String(entry.spriteName ?? "").toLowerCase();
      const reference = String(entry.reference ?? "").toLowerCase();
      const value = String(entry.value ?? "").toLowerCase();
      const sourcePassiveKey = String(entry.sourcePassiveKey ?? "").toLowerCase();
      return alias.terms.some(
        (term) =>
          label.includes(term) ||
          spriteName.includes(term) ||
          reference.includes(term) ||
          value.includes(term) ||
          sourcePassiveKey.includes(term),
      );
    });
    const previewPath = typeof choice?.previewPath === "string" ? choice.previewPath : undefined;
    if (!previewPath) continue;
    results.push({
      key: alias.key,
      previewPath,
      cropX: readNumber(choice?.cropX),
      cropY: readNumber(choice?.cropY),
      cropWidth: readNumber(choice?.cropWidth),
      cropHeight: readNumber(choice?.cropHeight),
      sourceWidth: readNumber(choice?.sourceWidth),
      sourceHeight: readNumber(choice?.sourceHeight),
    });
  }

  return results;
}

function buildCustomCardPreview(
  draft: JsonObject,
  blockCatalog: Map<string, BuilderBlockDefinition>,
  selectedIconChoice?: IconChoice,
  iconCatalog: IconChoice[] = [],
): CardPreview {
  const previewPath =
    typeof selectedIconChoice?.previewPath === "string"
      ? selectedIconChoice.previewPath
      : undefined;

  const statLines = buildSelectedBlockStatLines(draft, blockCatalog);

  const title = stringValue(draft.displayName) || "Untitled custom augment";
  const shortDescriptionTemplate = stringValue(readPath(draft, "shortDescription")) || undefined;
  const descriptionTemplate = stringValue(draft.description) || undefined;
  const shortDescription = shortDescriptionTemplate ? resolveCustomTextTemplate(shortDescriptionTemplate, draft, blockCatalog) : undefined;
  const description = descriptionTemplate ? resolveCustomTextTemplate(descriptionTemplate, draft, blockCatalog) : undefined;
  const inlineIconRuns = buildCustomInlineIconRuns(statLines, iconCatalog);
  const richTextRuns = [
    ...(shortDescription ? [{ text: shortDescription, tone: "muted" as const }] : []),
    ...(description ? [{ text: description, tone: "body" as const }] : []),
  ];
  const statRichTextRuns = statLines.map((line) => ({
    text: `${line.value} ${line.label}`,
    tone: String(line.value).startsWith("-") ? ("negative" as const) : ("positive" as const),
    strong: true,
    inlineIconKey: resolveCustomStatIconKey(line.label),
  }));

  return {
    title,
    shortDescription,
    description,
    iconPreviewPath: previewPath,
    iconCropX: readNumber(selectedIconChoice?.cropX),
    iconCropY: readNumber(selectedIconChoice?.cropY),
    iconCropWidth: readNumber(selectedIconChoice?.cropWidth),
    iconCropHeight: readNumber(selectedIconChoice?.cropHeight),
    iconSourceWidth: readNumber(selectedIconChoice?.sourceWidth),
    iconSourceHeight: readNumber(selectedIconChoice?.sourceHeight),
    cardKind: "augment",
    rarityStyle: "custom",
    sourceHint: "Custom Argument",
    iconStatus: previewPath ? "resolved" : "missing",
    largeCard: {
      variant: "large",
      title,
      shortDescription,
      description,
      iconPreviewPath: previewPath,
      iconCropX: readNumber(selectedIconChoice?.cropX),
      iconCropY: readNumber(selectedIconChoice?.cropY),
      iconCropWidth: readNumber(selectedIconChoice?.cropWidth),
      iconCropHeight: readNumber(selectedIconChoice?.cropHeight),
      iconSourceWidth: readNumber(selectedIconChoice?.sourceWidth),
      iconSourceHeight: readNumber(selectedIconChoice?.sourceHeight),
      statLines,
      richTextRuns,
      inlineIconRuns,
      sourceHint: "Custom Argument",
      rarityStyle: "custom",
    },
    compactCard: {
      variant: "compact",
      title,
      shortDescription,
      description,
      iconPreviewPath: previewPath,
      iconCropX: readNumber(selectedIconChoice?.cropX),
      iconCropY: readNumber(selectedIconChoice?.cropY),
      iconCropWidth: readNumber(selectedIconChoice?.cropWidth),
      iconCropHeight: readNumber(selectedIconChoice?.cropHeight),
      iconSourceWidth: readNumber(selectedIconChoice?.sourceWidth),
      iconSourceHeight: readNumber(selectedIconChoice?.sourceHeight),
      statLines,
      richTextRuns,
      inlineIconRuns,
      sourceHint: "Custom Argument",
      rarityStyle: "custom",
    },
    richTextRuns: [...richTextRuns, ...statRichTextRuns],
    inlineIconRuns,
    statLines,
  };
}

function buildCustomTextTokens(
  draft: JsonObject,
  blockCatalog: Map<string, BuilderBlockDefinition>,
): TextToken[] {
  const usedTokens = new Set<string>(["id", "key"]);
  const previewKey = stringValue(readPath(draft, "key")) || "P_CUSTOM_NEW_AUGMENT";
  const previewId = stringValue(readPath(draft, "id")) || "Assigned when saved";
  const tokens: TextToken[] = [
    { token: "%id%", label: "Assigned ID", description: "Resolves to the final custom augment id when the mod assigns it.", previewValue: previewId },
    { token: "%key%", label: "Internal key", description: "Resolves to the internal passive key.", previewValue: previewKey },
  ];

  for (const { block, fields } of buildSelectedCustomBlocks(draft, blockCatalog)) {
    for (const field of fields) {
      const candidates = buildFieldTokenCandidates(block, field);
      const token = claimUniqueToken(candidates, usedTokens);
      const aliases = reserveTokenAliases(
        [
          ...candidates.filter((candidate) => candidate !== token),
          ...buildTokenAliases(token),
          ...buildLegacyStatusTokenAliases(block, field),
        ],
        usedTokens,
      );
      tokens.push({
        token,
        label: block.fields.length === 1 ? block.label : `${block.label} / ${field.label}`,
        description: field.description ?? block.description,
        previewValue: field.value,
        valueType: field.valueType,
        aliases,
      });
    }
  }

  return tokens;
}

function resolveDescriptionMode(draft: JsonObject): DescriptionMode {
  const explicitMode = stringValue(readPath(draft, "launcher.descriptionMode")).trim().toLowerCase();
  if (explicitMode === "auto" || explicitMode === "custom") {
    return explicitMode;
  }

  if (stringValue(draft.description).trim() || stringValue(readPath(draft, "shortDescription")).trim()) {
    return "custom";
  }

  return "auto";
}

function buildAutoDescriptionTemplates(
  draft: JsonObject,
  blockCatalog: Map<string, BuilderBlockDefinition>,
) {
  const selectedBlocks = buildSelectedCustomBlocks(draft, blockCatalog);

  if (!selectedBlocks.length) {
    return {
      description: "",
      shortDescription: "",
    };
  }

  const description = selectedBlocks
    .map(({ block, fields }) => {
      const valueSummary = fields
        .map((field) =>
          block.fields.length === 1 && isPrimaryBuilderFieldKey(field.key)
            ? field.previewValue
            : `${field.label}: ${field.previewValue}`,
        )
        .filter((value) => value.trim());
      if (!valueSummary.length) {
        return `Adds ${block.label}.`;
      }
      return `${block.label}: ${valueSummary.join(", ")}.`;
    })
    .join(" ");

  return {
    description: description || "This custom augment uses the values from the blocks below.",
    shortDescription: selectedBlocks.map(({ block }) => block.label).slice(0, 3).join(" + "),
  };
}

function resolveCustomTextTemplate(
  text: string,
  draft: JsonObject,
  blockCatalog: Map<string, BuilderBlockDefinition>,
): string {
  if (!text.trim()) {
    return text;
  }

  const tokenMap = buildCustomTokenValueMap(draft, blockCatalog);
  return text.replace(/%([^%]+)%/g, (fullMatch, tokenName: string) => {
    const normalized = normalizeTextTokenName(tokenName);
    return tokenMap.get(normalized) ?? fullMatch;
  });
}

function buildCustomTokenValueMap(
  draft: JsonObject,
  blockCatalog: Map<string, BuilderBlockDefinition>,
): Map<string, string> {
  const tokenMap = new Map<string, string>();
  for (const token of buildCustomTextTokens(draft, blockCatalog)) {
    const normalized = normalizeTextTokenName(token.token.replace(/%/g, ""));
    tokenMap.set(normalized, token.previewValue !== undefined ? stringifyEditableValue(token.previewValue) : token.label);
    for (const alias of token.aliases ?? []) {
      tokenMap.set(normalizeTextTokenName(alias.replace(/%/g, "")), token.previewValue !== undefined ? stringifyEditableValue(token.previewValue) : token.label);
    }
  }

  const displayName = stringValue(draft.displayName);
  if (displayName) {
    tokenMap.set("title", displayName);
  }
  const draftKey = stringValue(readPath(draft, "key"));
  if (draftKey) {
    tokenMap.set("key", draftKey);
  }

  return tokenMap;
}

function normalizeTextTokenName(tokenName: string): string {
  const normalized = tokenName.trim().replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  switch (normalized) {
    case "dmg":
      return "damage";
    case "cd":
      return "cooldown";
    case "hp":
      return "health";
    case "atkspd":
    case "attackspeed":
      return "speed";
    case "dur":
      return "duration";
    case "shortdesc":
      return "shortdescription";
    default:
      return normalized;
  }
}

function buildTokenAliases(token: string): string[] {
  switch (token) {
    case "%damage%":
      return ["%dmg%"];
    case "%cooldown%":
      return ["%cd%"];
    case "%health%":
      return ["%hp%"];
    case "%duration%":
      return ["%dur%"];
    case "%shortDescription%":
      return ["%shortdesc%"];
    default:
      return [];
  }
}

function appendToken(current: string, token: string) {
  const trimmed = current.trim();
  if (!trimmed) {
    return token;
  }
  if (trimmed.includes(token)) {
    return trimmed;
  }
  return `${trimmed} ${token}`.trim();
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
