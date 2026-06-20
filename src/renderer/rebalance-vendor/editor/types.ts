export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface QuickEditEntry {
  setting: string;
  category: string;
  path: string;
  editable: boolean;
  valueType?: string;
  allowCustomValue?: boolean;
  value: JsonValue;
  defaultValue?: JsonValue;
  whatItDoes?: string;
  valueRange?: NumericRange | null;
  vanillaRange?: NumericRange | null;
  extendedRange?: NumericRange | null;
  riskLevel?: "safe" | "medium" | "advanced" | "experimental" | string;
  verifiedChoices?: VerifiedChoice[] | null;
  referenceChoice?: ReferenceChoice | null;
}

export interface NumericRange {
  minimum?: number | null;
  maximum?: number | null;
  step?: number | null;
  unit?: string | null;
  unclamped?: boolean;
}

export interface SimpleGroupEntry {
  name: string;
  path: string;
  editable: boolean;
  valueType?: string;
  description?: string;
  defaultValue?: JsonValue;
  currentValue?: JsonValue;
  valueRange?: NumericRange | null;
  vanillaRange?: NumericRange | null;
  extendedRange?: NumericRange | null;
  riskLevel?: "safe" | "medium" | "advanced" | "experimental" | string;
  verifiedChoices?: VerifiedChoice[] | null;
}

export interface VerifiedChoice {
  value: JsonValue;
  label: string;
  description?: string;
  safetyLevel?: "safe" | "medium" | "advanced" | "experimental" | string;
}

export interface SimpleSettingsGroup {
  category: string;
  entries: SimpleGroupEntry[];
}

export interface SimpleSettings {
  whatThisConfigDoes?: string;
  whatYouCanChange?: string[];
  howToEdit?: string;
  copyAndSwapTips?: string[];
  groups?: SimpleSettingsGroup[];
}

export interface UiCapabilitiesSection {
  mode?: "guided" | "studio" | string;
  supportedActions?: string[];
  supportsQuickEdit?: boolean;
  supportsRawOverrides?: boolean;
  supportsCollectionEditing?: boolean;
  supportsReplace?: boolean;
  supportsClear?: boolean;
  supportsDuplicate?: boolean;
  supportsReferenceSwap?: boolean;
  supportsAbilitySwap?: boolean;
  supportsPackExport?: boolean;
  riskLevel?: "low" | "medium" | "high" | string;
}

export interface GuidedAction {
  key?: string;
  label: string;
  description?: string;
  recommendedSurface?: "guided" | "studio" | string;
}

export interface LibraryFieldDefinition {
  key: string;
  label: string;
  description?: string;
  valueType?: string;
  defaultValue?: JsonValue;
  options?: string[];
}

export interface LibrarySuggestion {
  blockId: string;
  label: string;
  description?: string;
  category?: "Basics" | "Effects" | string;
  family?: string;
  targetPath: string;
  operationType: string;
  riskLevel?: "safe" | "medium" | "advanced" | string;
  fields?: LibraryFieldDefinition[];
  iconPreviewPath?: string;
}

export interface LibrarySlot {
  slotId: string;
  label: string;
  description?: string;
  category?: "Basics" | "Effects" | string;
  targetPath: string;
  supportedBlockIds?: string[];
  supportedFamilies?: string[];
  allowMultiple?: boolean;
  supportsReplace?: boolean;
  supportsRemove?: boolean;
  riskLevel?: "safe" | "medium" | "advanced" | string;
}

export interface IconChoice {
  value?: string;
  label: string;
  description?: string;
  group?: string;
  spriteName?: string;
  spriteAsset?: string;
  spriteGuid?: string;
  sourcePassiveKey?: string;
  passiveKey?: string;
  passiveId?: number;
  reference?: string;
  key?: string;
  previewPath?: string;
  previewAbsolutePath?: string;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  sourceWidth?: number;
  sourceHeight?: number;
}

export interface NativeUiPlacement {
  source?: "arena" | "hiddendev" | "custom" | string;
  categoryKey?: string;
  categoryLabel?: string;
  sectionKey?: string;
  sectionLabel?: string;
  groupKey?: string;
  groupLabel?: string;
  entryLabel?: string;
  entryDescription?: string;
  order?: number;
  appearsInArenaSettings?: boolean;
}

export interface CollectionEditor {
  path: string;
  label: string;
  description?: string;
  itemLabel?: string;
  canAdd?: boolean;
  canRemove?: boolean;
  canReplace?: boolean;
  canClear?: boolean;
  canDuplicate?: boolean;
  supportsSoftRemove?: boolean;
  supportsHardRemove?: boolean;
  removeBehavior?: string;
}

export interface ReferenceChoice {
  path: string;
  label: string;
  currentReference?: string;
  referenceType?: string;
  suggestions?: string[];
  availableReferences?: string[];
  allowCustomReference?: boolean;
  previewPath?: string;
  previewLabel?: string;
  iconChoices?: IconChoice[];
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  sourceWidth?: number;
  sourceHeight?: number;
}

export interface TargetOperationEntry {
  type: "add" | "remove" | "replace" | "swap" | "duplicate" | "clear" | string;
  path: string;
  mode?: string;
  label?: string;
  applyTiming?: string;
  safetyLevel?: "safe" | "medium" | "advanced" | "experimental" | string;
  sourcePath?: string;
  sourceCollectionId?: string;
  sourceTargetKey?: string;
  previewName?: string;
  previewSubtitle?: string;
  previewIconPath?: string;
  previewIconCropX?: number;
  previewIconCropY?: number;
  previewIconCropWidth?: number;
  previewIconCropHeight?: number;
  previewIconSourceWidth?: number;
  previewIconSourceHeight?: number;
  beforeValue?: JsonValue;
  afterValue?: JsonValue;
  value?: JsonValue;
}

export interface TargetOperationsSection {
  entries?: TargetOperationEntry[];
}

export interface OperationStatusEntry {
  type?: string;
  path?: string;
  label?: string;
  mode?: string;
  applied?: boolean;
  requestedValue?: JsonValue;
  beforeValue?: JsonValue;
  afterValue?: JsonValue;
  safetyLevel?: "safe" | "medium" | "advanced" | "experimental" | string;
  message?: string;
}

export interface OperationStatusSection {
  appliedCount?: number;
  failedCount?: number;
  entries?: OperationStatusEntry[];
}

export interface OverrideStatusSection {
  appliedCount?: number;
  failedCount?: number;
  entries?: Array<{
    path?: string;
    applied?: boolean;
    message?: string;
  }>;
}

export interface AdvancedField {
  path: string;
  label?: string;
  category?: string;
  description?: string;
  editable?: boolean;
  valueType?: string;
  defaultValue?: JsonValue;
  effectiveValue?: JsonValue;
  currentValue?: JsonValue;
  valueRange?: NumericRange | null;
  vanillaRange?: NumericRange | null;
  extendedRange?: NumericRange | null;
  riskLevel?: "safe" | "medium" | "advanced" | "experimental" | string;
  verifiedChoices?: VerifiedChoice[] | null;
}

export interface AdvancedSection {
  fields?: AdvancedField[];
  defaults?: Record<string, JsonValue>;
  effectiveValues?: Record<string, JsonValue>;
}

export interface CustomBlockEntry {
  blockId: string;
  targetSlot?: string;
  targetPath?: string;
  label?: string;
  values?: Record<string, JsonValue>;
  enabled?: boolean;
}

export interface CustomIconSelection {
  sourcePassiveKey?: string;
  spriteReference?: string;
  previewPath?: string;
  customIconPath?: string;
}

export interface VaultedAugmentSummaryEntry {
  augmentId: number;
  augmentKey?: string;
  displayName?: string;
  subtitle?: string;
  iconReference?: string;
  iconPreviewPath?: string;
  iconCropX?: number;
  iconCropY?: number;
  iconCropWidth?: number;
  iconCropHeight?: number;
  iconSourceWidth?: number;
  iconSourceHeight?: number;
  vaulted?: boolean;
}

export interface GameModeSummary {
  vaultedAugments?: VaultedAugmentSummaryEntry[];
}

export interface RuntimeSectionSummary {
  sectionId: string;
  label: string;
  description?: string;
  entryCount: number;
  editableCount: number;
  applyTiming?: string;
  safetyLevel?: string;
  sourcePaths?: string[];
}

export interface NamedCollectionItem {
  index: number;
  sourcePath?: string;
  key?: string;
  displayName?: string;
  subtitle?: string;
  iconReference?: string;
  iconPreviewPath?: string;
  iconCropX?: number;
  iconCropY?: number;
  iconCropWidth?: number;
  iconCropHeight?: number;
  iconSourceWidth?: number;
  iconSourceHeight?: number;
  state?: string;
  value?: JsonValue;
}

export interface NamedCollectionSummary {
  collectionId: string;
  label: string;
  description?: string;
  itemKind?: string;
  totalCount: number;
  applyTiming?: string;
  safetyLevel?: string;
  sourcePaths?: string[];
  items?: NamedCollectionItem[];
}

export interface RemovalCandidate {
  id: string;
  operationType: "remove" | "clear" | string;
  path: string;
  mode?: "soft" | "hard" | "advanced" | string;
  label: string;
  description?: string;
  safetyLevel?: "safe" | "medium" | "advanced" | "experimental" | string;
  applyTiming?: string;
  previewName?: string;
  previewSubtitle?: string;
  previewIconPath?: string;
  previewIconCropX?: number;
  previewIconCropY?: number;
  previewIconCropWidth?: number;
  previewIconCropHeight?: number;
  previewIconSourceWidth?: number;
  previewIconSourceHeight?: number;
  beforeValue?: JsonValue;
  afterValue?: JsonValue;
  sourceCollectionId?: string;
}

export interface TextToken {
  token: string;
  label: string;
  description?: string;
  sourcePath?: string;
  valueType?: string;
  previewValue?: JsonValue;
  previewText?: string;
  aliases?: string[];
}

export interface CardPreviewStatLine {
  label: string;
  value: string;
  category?: string;
}

export interface CardInlineIconRun {
  key: string;
  label?: string;
  previewPath?: string;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  sourceWidth?: number;
  sourceHeight?: number;
}

export interface CardRichTextRun {
  text: string;
  tone?: string;
  strong?: boolean;
  inlineIconKey?: string;
}

export interface CardPreviewVariant {
  variant?: "large" | "compact" | string;
  kicker?: string;
  kindLabel?: string;
  title?: string;
  shortDescription?: string;
  description?: string;
  iconReference?: string;
  iconPreviewPath?: string;
  iconCropX?: number;
  iconCropY?: number;
  iconCropWidth?: number;
  iconCropHeight?: number;
  iconSourceWidth?: number;
  iconSourceHeight?: number;
  backgroundPreviewPath?: string;
  framePreviewPath?: string;
  overlayPreviewPath?: string;
  titleFontPath?: string;
  bodyFontPath?: string;
  rarityStyle?: string;
  sourceHint?: string;
  statLines?: CardPreviewStatLine[];
  richTextRuns?: CardRichTextRun[];
  inlineIconRuns?: CardInlineIconRun[];
}

export interface CardPreview {
  title?: string;
  shortDescription?: string;
  description?: string;
  iconReference?: string;
  iconPreviewPath?: string;
  iconCropX?: number;
  iconCropY?: number;
  iconCropWidth?: number;
  iconCropHeight?: number;
  iconSourceWidth?: number;
  iconSourceHeight?: number;
  cardKind?: "augment" | "item" | string;
  backgroundPreviewPath?: string;
  framePreviewPath?: string;
  overlayPreviewPath?: string;
  titleFontPath?: string;
  bodyFontPath?: string;
  rarityStyle?: string;
  sourceHint?: string;
  iconStatus?: "resolved" | "missing" | "ambiguous" | string;
  largeCard?: CardPreviewVariant | null;
  compactCard?: CardPreviewVariant | null;
  richTextRuns?: CardRichTextRun[];
  inlineIconRuns?: CardInlineIconRun[];
  statLines?: CardPreviewStatLine[];
}

export interface RuntimeDocument {
  [key: string]: unknown;
  schemaVersion?: number;
  targetType?: string;
  targetKey?: string;
  displayName?: string;
  resolvedName?: string;
  generatedAtUtc?: string;
  sourceRole?: string;
  applyTiming?: string;
  safetyLevel?: string;
  quickEdit?: QuickEditEntry[];
  simpleSettings?: SimpleSettings;
  sectionSummaries?: RuntimeSectionSummary[];
  uiCapabilities?: UiCapabilitiesSection;
  guidedActions?: GuidedAction[];
  librarySlots?: LibrarySlot[];
  librarySuggestions?: LibrarySuggestion[];
  collectionEditors?: CollectionEditor[];
  referenceChoices?: ReferenceChoice[];
  iconChoices?: IconChoice[];
  nativeUiPlacement?: NativeUiPlacement;
  gameModeSummary?: GameModeSummary;
  namedCollections?: NamedCollectionSummary[];
  removalCandidates?: RemovalCandidate[];
  textTokens?: TextToken[];
  cardPreview?: CardPreview | null;
  operations?: TargetOperationsSection;
  operationStatus?: OperationStatusSection;
  overrides?: Record<string, JsonValue>;
  overrideStatus?: OverrideStatusSection;
  instructions?: string[];
  advanced?: AdvancedSection;
  enabled?: boolean;
  id?: number;
  key?: string;
  templatePassiveKey?: string;
  icon?: CustomIconSelection | JsonObject;
  blocks?: CustomBlockEntry[];
}

export interface WorkspaceRoots {
  workspaceRoot: string;
  runtimeRoot: string;
  customRoot: string;
  nativeUiRoot: string;
  arenaPresetsRoot?: string;
  libraryRoot?: string;
  backupRoot: string;
  packDropRoot?: string;
  packDropProcessedRoot?: string;
  packDropFailedRoot?: string;
  installedPacksRoot?: string;
  importReceiptRoot?: string;
  libraryBlocksIndexPath?: string;
  libraryEffectsIndexPath?: string;
  libraryIconsIndexPath?: string;
  libraryTemplatesIndexPath?: string;
  libraryAllOptionsIndexPath?: string;
  libraryStandardsIndexPath?: string;
  libraryCollectionsSharedPath?: string;
  gameExe: string;
  modProjectRoot?: string | null;
}

export interface LauncherSettings {
  workspaceRoot?: string | null;
}

export interface CatalogEntry {
  id: string;
  group: string;
  title: string;
  subtitle: string;
  relativePath: string;
  absolutePath: string;
  targetType?: string | null;
  targetKey?: string | null;
  displayName?: string | null;
  iconPreviewPath?: string | null;
  iconCropX?: number | null;
  iconCropY?: number | null;
  iconCropWidth?: number | null;
  iconCropHeight?: number | null;
  iconSourceWidth?: number | null;
  iconSourceHeight?: number | null;
  tags: string[];
  quickEditCount: number;
  hasQuickEdit: boolean;
  updatedAtMs: number;
}

export interface CatalogGroup {
  key: string;
  label: string;
  count: number;
  entries: CatalogEntry[];
}

export interface WorkspaceSummary {
  augmentCount: number;
  itemCount: number;
  managerCount: number;
  characterCount: number;
  customCount: number;
  nativeUiCount: number;
  totalCount: number;
}

export interface BootstrapPayload {
  workspace: WorkspaceRoots | null;
  catalog: CatalogGroup[];
  summary: WorkspaceSummary;
  settings: LauncherSettings;
}

export interface DocumentPayload {
  absolutePath: string;
  relativePath: string;
  mtimeMs: number;
  raw: RuntimeDocument;
}

export interface SaveDocumentRequest {
  workspaceRoot: string;
  absolutePath: string;
  expectedMtimeMs: number;
  raw: JsonObject;
  createBackup: boolean;
}

export interface SaveDocumentResponse {
  absolutePath: string;
  mtimeMs: number;
  backupPath?: string | null;
  savedAtUtc: string;
}

export interface CreateCustomDraftRequest {
  workspaceRoot: string;
  sourceAbsolutePath?: string | null;
  suggestedName?: string | null;
}

export interface SnapshotBackupResponse {
  backupPath: string;
  createdAtUtc: string;
}

export interface WorkspaceRepairResponse {
  backupPath?: string | null;
  repairedSupportFiles: string[];
  repairedAtUtc: string;
}

export interface OperationCapability {
  kind: "edit" | "add" | "remove" | "replace" | "swap" | "duplicate" | "clear";
  path: string;
  label: string;
  description?: string;
  category?: string;
  family?: string;
  valueType?: string;
  safe?: boolean;
  riskLevel?: "safe" | "medium" | "advanced" | string;
  targetPath?: string;
  currentValue?: JsonValue;
  defaultValue?: JsonValue;
  options?: string[];
  referenceType?: string;
  previewLabel?: string;
  previewPath?: string;
  sourceTargetKey?: string;
  libraryBlockId?: string;
}

export interface OperationCapabilitiesResponse {
  absolutePath: string;
  relativePath: string;
  targetType?: string | null;
  targetKey?: string | null;
  displayName?: string | null;
  editableCount: number;
  addableCount: number;
  removableCount: number;
  swappableCount: number;
  warnings: string[];
  capabilities: OperationCapability[];
  librarySuggestions?: LibrarySuggestion[];
  librarySlots?: LibrarySlot[];
  iconChoices?: IconChoice[];
  nativeUiPlacement?: NativeUiPlacement | null;
}

export interface ImportReceiptSummary {
  receiptPath: string;
  packId: string;
  packVersion: string;
  importedAtUtc: string;
  importedBy: string;
  backupPath?: string | null;
  importedFileCount: number;
}

export interface LibraryMetadataResponse {
  workspaceRoot: string;
  libraryRoot: string;
  blocksIndexPath?: string | null;
  effectsIndexPath?: string | null;
  iconsIndexPath?: string | null;
  templatesIndexPath?: string | null;
  allOptionsIndexPath?: string | null;
  standardsIndexPath?: string | null;
  collectionsSharedPath?: string | null;
  allOptionsCount?: number;
  allOptionCategories?: string[];
  allOptionSources?: string[];
  allOptionSafetyLevels?: string[];
  standardCount?: number;
  standardEditableCount?: number;
  standardTargetTypes?: string[];
  standardValueTypes?: string[];
  standardCategories?: string[];
  standardSources?: string[];
  standardSafetyLevels?: string[];
  blocks: LibraryBlockEntry[];
  effects: LibraryEffectEntry[];
  icons: IconChoice[];
  templates: LibraryTemplateEntry[];
  allOptions: LibraryAllOptionEntry[];
  sharedCollections: SharedCollectionEntry[];
  warnings: string[];
}

export interface LibraryEntryQuery {
  workspaceRoot: string;
  search?: string;
  category?: string;
  source?: string;
  safety?: string;
  targetType?: string;
  valueType?: string;
  editable?: "all" | "editable" | "readonly";
  optionIds?: string[];
  limit?: number;
}

export interface LibraryEntryListResponse {
  entries: LibraryAllOptionEntry[];
  totalCount: number;
  moreAvailable: boolean;
}

export interface GameModeIndexResponse {
  absolutePath: string;
  raw: JsonValue;
}

export interface LibraryBlockEntry {
  blockId: string;
  category?: string;
  family?: string;
  label: string;
  description?: string;
  riskLevel?: "safe" | "medium" | "advanced" | "experimental" | string;
  supportedTargetTypes?: string[];
  pathHints?: string[];
  editableValueKeys?: string[];
  fields?: LibraryFieldDefinition[];
}

export interface LibraryEffectEntry {
  effectId?: string;
  family?: string;
  label: string;
  description?: string;
  commonFields?: string[];
  blockIds?: string[];
  editableFields?: string[];
}

export interface LibraryTemplateEntry {
  targetType?: string;
  targetKey?: string;
  displayName?: string;
  id?: number;
  file?: string;
  runtimeType?: string;
  title?: string;
  description?: string;
  iconReference?: string;
  templatePassiveKey?: string;
  label?: string;
  iconSourcePassiveKey?: string;
  previewPath?: string;
  cropX?: number | null;
  cropY?: number | null;
  cropWidth?: number | null;
  cropHeight?: number | null;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
}

export interface LibraryAllOptionEntry {
  optionId: string;
  category: string;
  source: "normal" | "arena" | "dev-only" | "custom" | string;
  targetType?: string;
  targetKey?: string;
  displayName?: string;
  resolvedName?: string;
  iconPreviewPath?: string;
  iconCropX?: number;
  iconCropY?: number;
  iconCropWidth?: number;
  iconCropHeight?: number;
  iconSourceWidth?: number;
  iconSourceHeight?: number;
  file?: string;
  path: string;
  label: string;
  description?: string;
  valueType?: string;
  editable?: boolean;
  defaultValue?: JsonValue;
  currentValue?: JsonValue;
  valueRange?: NumericRange | null;
  vanillaRange?: NumericRange | null;
  extendedRange?: NumericRange | null;
  riskLevel?: "safe" | "medium" | "advanced" | "experimental" | string;
  beyondVanilla?: boolean;
  nativeUiKind?: string;
  nativeUiLabel?: string;
  sourceGroup?: string;
  searchHints?: string[];
}

export interface SharedCollectionEntry {
  id: string;
  label: string;
  description?: string;
  optionIds?: string[];
}
