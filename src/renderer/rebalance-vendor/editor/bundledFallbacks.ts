import type {
  BootstrapPayload,
  CardInlineIconRun,
  CardPreview,
  CardPreviewVariant,
  CatalogEntry,
  DocumentPayload,
  IconChoice,
  LibraryAllOptionEntry,
  LibraryEntryListResponse,
  LibraryMetadataResponse,
  LibraryTemplateEntry,
  OperationCapabilitiesResponse,
  OperationCapability,
  ReferenceChoice,
  RuntimeDocument,
  TextToken,
} from "./types";
import bundledCustomIconAssets from "./generated/bundledCustomIconAssets.json";
import bundledIconPreviewLookup from "./generated/bundledIconPreviewLookup.json";
import bundledLocalizationLookup from "./generated/bundledLocalizationLookup.json";
import bundledPreviewFileLookup from "./generated/bundledPreviewFileLookup.json";
import bundledPreviewManifest from "./generated/bundledPreviewManifest.json";
import contentBorderTexture from "../assets/gamecard/textures/content-border.png";
import dailyRareTexture from "../assets/gamecard/textures/daily-rare-bg.png";
import inspectCardTemplate from "../assets/gamecard/textures/inspect-card-template.png";
import rewardObtainedTexture from "../assets/gamecard/textures/RewardObtained_BG.png";
import titleFont from "../assets/gamecard/fonts/Archivo-Black.ttf";
import bodyFont from "../assets/gamecard/fonts/Archivo-Medium.ttf";

const assetUrlById: Record<string, string> = {
  "gamecard/content-border": contentBorderTexture,
  "gamecard/daily-rare-bg": dailyRareTexture,
  "gamecard/inspect-card-template": inspectCardTemplate,
  "gamecard/reward-obtained-bg": rewardObtainedTexture,
  "gamecard/font-title": titleFont,
  "gamecard/font-body": bodyFont,
};

const iconLookupEntries = Array.isArray(bundledIconPreviewLookup.entries)
  ? bundledIconPreviewLookup.entries
  : [];

const iconLookupMap = new Map<string, { label: string; theme: string; keys: string[] }>();
for (const entry of iconLookupEntries) {
  if (!entry || typeof entry !== "object") {
    continue;
  }
  const keys = Array.isArray(entry.keys)
    ? entry.keys.map(value => normalizeLookupKey(value)).filter(Boolean) as string[]
    : [];
  if (!keys.length) {
    continue;
  }
  const normalizedEntry = {
    label: sanitizePreviewText((entry as { label?: string }).label) ?? "Unnamed",
    theme: typeof (entry as { theme?: string }).theme === "string"
      ? (entry as { theme: string }).theme
      : "azure",
    keys,
  };
  for (const key of keys) {
    iconLookupMap.set(key, normalizedEntry);
  }
}

const localizationLookup = new Map<string, string>();
if (bundledLocalizationLookup.entries && typeof bundledLocalizationLookup.entries === "object") {
  for (const [rawKey, rawValue] of Object.entries(bundledLocalizationLookup.entries)) {
    const key = normalizeLookupKey(rawKey);
    const value = sanitizePreviewText(rawValue);
    if (key && value) {
      localizationLookup.set(key, value);
    }
  }
}

const bundledPreviewFiles = new Map<string, string>();
if (bundledPreviewFileLookup.entries && typeof bundledPreviewFileLookup.entries === "object") {
  for (const [rawKey, rawValue] of Object.entries(bundledPreviewFileLookup.entries)) {
    const key = normalizePreviewFileLookupKey(rawKey);
    if (!key || typeof rawValue !== "string" || !rawValue.trim()) {
      continue;
    }
    bundledPreviewFiles.set(key, rawValue.trim());
  }
}

type BundledCustomIconEntry = {
  passiveKey?: string | null;
  passiveId?: number | null;
  spriteAsset?: string | null;
  spriteName?: string | null;
  previewPath?: string | null;
  cropX?: number | null;
  cropY?: number | null;
  cropWidth?: number | null;
  cropHeight?: number | null;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
};

type BundledResolvedIconAsset = {
  previewPath?: string;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  sourceWidth?: number;
  sourceHeight?: number;
};

const bundledCustomIconEntries = Array.isArray((bundledCustomIconAssets as { entries?: unknown[] }).entries)
  ? ((bundledCustomIconAssets as { entries?: unknown[] }).entries as BundledCustomIconEntry[])
  : [];

const bundledCustomIconLookup = new Map<string, BundledCustomIconEntry>();
for (const entry of bundledCustomIconEntries) {
  for (const key of buildBundledCustomIconLookupKeys(entry)) {
    if (!bundledCustomIconLookup.has(key)) {
      bundledCustomIconLookup.set(key, entry);
    }
  }
}

type PreviewDefaults = {
  backgroundPreviewPath?: string;
  framePreviewPath?: string;
  overlayPreviewPath?: string;
  titleFontPath?: string;
  bodyFontPath?: string;
};

const defaultCardAssets = {
  backgroundPreviewPath: resolveAssetId(bundledPreviewManifest.defaultCard?.backgroundAssetId),
  framePreviewPath: resolveAssetId(bundledPreviewManifest.defaultCard?.frameAssetId),
  overlayPreviewPath: resolveAssetId((bundledPreviewManifest.defaultCard as { overlayAssetId?: string } | undefined)?.overlayAssetId),
  titleFontPath: resolveAssetId(bundledPreviewManifest.defaultCard?.titleFontAssetId),
  bodyFontPath: resolveAssetId(bundledPreviewManifest.defaultCard?.bodyFontAssetId),
};

const kindDefaults = new Map<string, PreviewDefaults>(
  Object.entries(bundledPreviewManifest.kindDefaults ?? {}).map(([key, value]) => [
    key,
    {
      backgroundPreviewPath: resolveAssetId(value?.backgroundAssetId),
      framePreviewPath: resolveAssetId(value?.frameAssetId),
      overlayPreviewPath: resolveAssetId((value as { overlayAssetId?: string } | undefined)?.overlayAssetId),
      titleFontPath: resolveAssetId(bundledPreviewManifest.defaultCard?.titleFontAssetId),
      bodyFontPath: resolveAssetId(bundledPreviewManifest.defaultCard?.bodyFontAssetId),
    },
  ]),
);

export function hydrateBootstrapPayload(payload: BootstrapPayload): BootstrapPayload {
  return {
    ...payload,
    catalog: payload.catalog.map(group => ({
      ...group,
      entries: group.entries.map(hydrateCatalogEntry),
    })),
  };
}

export function hydrateDocumentPayload(payload: DocumentPayload): DocumentPayload {
  return {
    ...payload,
    raw: hydrateRuntimeDocument(payload.raw),
  };
}

export function hydrateLibraryMetadataResponse(payload: LibraryMetadataResponse): LibraryMetadataResponse {
  return {
    ...payload,
    icons: payload.icons.map(hydrateIconChoice),
    templates: payload.templates.map(hydrateLibraryTemplateEntry),
    allOptions: payload.allOptions.map(hydrateLibraryAllOptionEntry),
  };
}

export function hydrateLibraryEntryListResponse(payload: LibraryEntryListResponse): LibraryEntryListResponse {
  return {
    ...payload,
    entries: payload.entries.map(hydrateLibraryAllOptionEntry),
  };
}

export function hydrateLooseIconChoice(choice: IconChoice | Record<string, unknown>): IconChoice {
  const labelCandidate = readLooseIconChoiceString(choice, "label")
    ?? readLooseIconChoiceString(choice, "reference")
    ?? readLooseIconChoiceString(choice, "passiveKey")
    ?? readLooseIconChoiceString(choice, "sourcePassiveKey")
    ?? readLooseIconChoiceString(choice, "value")
    ?? readLooseIconChoiceString(choice, "key")
    ?? "Icon";
  return hydrateIconChoice({
    value: readLooseIconChoiceString(choice, "value"),
    label: resolveFallbackText(labelCandidate) ?? labelCandidate,
    description: readLooseIconChoiceString(choice, "description"),
    group: readLooseIconChoiceString(choice, "group"),
    spriteName: readLooseIconChoiceString(choice, "spriteName"),
    spriteAsset: readLooseIconChoiceString(choice, "spriteAsset"),
    spriteGuid: readLooseIconChoiceString(choice, "spriteGuid"),
    sourcePassiveKey: readLooseIconChoiceString(choice, "sourcePassiveKey"),
    passiveKey: readLooseIconChoiceString(choice, "passiveKey"),
    passiveId: readLooseIconChoiceNumber(choice, "passiveId"),
    reference: readLooseIconChoiceString(choice, "reference"),
    key: readLooseIconChoiceString(choice, "key"),
    previewPath: readLooseIconChoiceString(choice, "previewPath"),
    previewAbsolutePath: readLooseIconChoiceString(choice, "previewAbsolutePath"),
    cropX: readLooseIconChoiceNumber(choice, "cropX"),
    cropY: readLooseIconChoiceNumber(choice, "cropY"),
    cropWidth: readLooseIconChoiceNumber(choice, "cropWidth"),
    cropHeight: readLooseIconChoiceNumber(choice, "cropHeight"),
    sourceWidth: readLooseIconChoiceNumber(choice, "sourceWidth"),
    sourceHeight: readLooseIconChoiceNumber(choice, "sourceHeight"),
  });
}

export function hydrateOperationCapabilitiesResponse(
  payload: OperationCapabilitiesResponse,
): OperationCapabilitiesResponse {
  return {
    ...payload,
    displayName: resolveFallbackText(payload.displayName ?? payload.targetKey) ?? payload.displayName,
    iconChoices: payload.iconChoices?.map(hydrateIconChoice),
    librarySuggestions: payload.librarySuggestions?.map(suggestion => ({
      ...suggestion,
      label: resolveFallbackText(suggestion.label) ?? suggestion.label,
      iconPreviewPath: resolveIconPreviewPath(
        suggestion.iconPreviewPath,
        [suggestion.blockId, suggestion.label, suggestion.targetPath],
        suggestion.label,
      ),
    })),
    capabilities: payload.capabilities.map(hydrateOperationCapability),
  };
}

export function resolveBundledInlineIconRun(
  key: string,
  label?: string,
): CardInlineIconRun {
  return {
    key,
    label: resolveFallbackText(label ?? key) ?? label ?? key,
    previewPath: resolveIconPreviewDataUri([key, label], label ?? key),
  };
}

function hydrateRuntimeDocument(document: RuntimeDocument): RuntimeDocument {
  const characterAbilityTitle = resolveCharacterAbilityDocumentTitle(document);
  const hydratedDisplayName =
    characterAbilityTitle
    ?? resolveFallbackText(document.displayName ?? document.resolvedName ?? document.targetKey)
    ?? document.displayName;
  const hydratedResolvedName =
    characterAbilityTitle
    ?? resolveFallbackText(document.resolvedName ?? document.displayName ?? document.targetKey)
    ?? document.resolvedName;
  const hydrated: RuntimeDocument = {
    ...document,
    displayName: hydratedDisplayName,
    resolvedName: hydratedResolvedName,
  };

  hydrated.simpleSettings = document.simpleSettings
    ? {
        ...document.simpleSettings,
        whatThisConfigDoes: resolveRuntimeOverviewText(
          document.simpleSettings.whatThisConfigDoes,
          hydratedDisplayName,
          [document.displayName, document.resolvedName],
        ) ?? document.simpleSettings.whatThisConfigDoes,
        whatYouCanChange: document.simpleSettings.whatYouCanChange?.map((value) => resolveFallbackText(value) ?? value),
        howToEdit: resolveFallbackText(document.simpleSettings.howToEdit) ?? document.simpleSettings.howToEdit,
        copyAndSwapTips: document.simpleSettings.copyAndSwapTips?.map((value) => resolveFallbackText(value) ?? value),
        groups: document.simpleSettings.groups?.map((group) => ({
          ...group,
          category: resolveFallbackText(group.category) ?? group.category,
          entries: group.entries?.map((entry) => ({
            ...entry,
            name: resolveFallbackText(entry.name) ?? entry.name,
            description: resolveFallbackText(entry.description) ?? entry.description,
            verifiedChoices: entry.verifiedChoices?.map((choice) => ({
              ...choice,
              label: resolveFallbackText(choice.label) ?? choice.label,
              description: resolveFallbackText(choice.description) ?? choice.description,
            })),
          })),
        })),
      }
    : document.simpleSettings;
  hydrated.advanced = document.advanced
    ? {
        ...document.advanced,
        fields: document.advanced.fields?.map((field) => ({
          ...field,
          label: resolveFallbackText(field.label ?? field.path) ?? field.label,
          category: resolveFallbackText(field.category) ?? field.category,
          description: resolveFallbackText(field.description) ?? field.description,
          verifiedChoices: field.verifiedChoices?.map((choice) => ({
            ...choice,
            label: resolveFallbackText(choice.label) ?? choice.label,
            description: resolveFallbackText(choice.description) ?? choice.description,
          })),
        })),
      }
    : document.advanced;
  hydrated.textTokens = document.textTokens?.map(hydrateTextToken);
  hydrated.iconChoices = document.iconChoices?.map(hydrateIconChoice);
  hydrated.referenceChoices = document.referenceChoices?.map(hydrateReferenceChoice);
  hydrated.cardPreview = hydrateCardPreview(document.cardPreview, document, hydrated.textTokens);
  hydrated.namedCollections = document.namedCollections?.map(collection => ({
    ...collection,
    label: resolveFallbackText(collection.label) ?? collection.label,
    description: resolveFallbackText(collection.description) ?? collection.description,
    items: collection.items?.map(item => ({
      ...item,
      displayName: resolveFallbackText(item.displayName ?? item.key ?? item.sourcePath) ?? item.displayName,
      subtitle: resolveFallbackText(item.subtitle) ?? item.subtitle,
      iconPreviewPath: resolveIconPreviewPath(
        item.iconPreviewPath,
        [item.iconReference, item.key, item.displayName, item.sourcePath],
        item.displayName ?? item.key,
      ),
    })),
  }));
  hydrated.librarySuggestions = document.librarySuggestions?.map(suggestion => ({
    ...suggestion,
    label: resolveFallbackText(suggestion.label) ?? suggestion.label,
    description: resolveFallbackText(suggestion.description) ?? suggestion.description,
    iconPreviewPath: resolveIconPreviewPath(
      suggestion.iconPreviewPath,
      [suggestion.blockId, suggestion.label, suggestion.targetPath],
      suggestion.label,
    ),
  }));
  hydrated.removalCandidates = document.removalCandidates?.map(candidate => ({
    ...candidate,
    label: resolveFallbackText(candidate.label) ?? candidate.label,
    description: resolveFallbackText(candidate.description) ?? candidate.description,
    previewName: resolveFallbackText(candidate.previewName ?? candidate.label) ?? candidate.previewName,
    previewSubtitle: resolveFallbackText(candidate.previewSubtitle) ?? candidate.previewSubtitle,
    previewIconPath: resolveIconPreviewPath(
      candidate.previewIconPath,
      [candidate.previewName, candidate.path, candidate.id],
      candidate.previewName ?? candidate.label,
    ),
  }));
  hydrated.operations = document.operations
    ? {
        ...document.operations,
        entries: document.operations.entries?.map(entry => ({
          ...entry,
          previewName: resolveFallbackText(entry.previewName ?? entry.sourceTargetKey) ?? entry.previewName,
          previewSubtitle: resolveFallbackText(entry.previewSubtitle) ?? entry.previewSubtitle,
          previewIconPath: resolveIconPreviewPath(
            entry.previewIconPath,
            [entry.sourceTargetKey, entry.previewName, entry.path],
            entry.previewName ?? entry.label,
          ),
        })),
      }
    : document.operations;

  return hydrated;
}

function hydrateCatalogEntry(entry: CatalogEntry): CatalogEntry {
  const characterAbilityTitle = resolveCharacterAbilityCatalogTitle(entry);
  const bundledIconAsset = resolveBundledIconAsset(entry.iconPreviewPath, [
    entry.targetKey,
    entry.displayName,
    entry.title,
    entry.relativePath,
  ]);
  return {
    ...entry,
    title: characterAbilityTitle
      ?? resolveFallbackText(entry.title ?? entry.displayName ?? entry.targetKey)
      ?? entry.title,
    subtitle: resolveFallbackText(entry.subtitle) ?? entry.subtitle,
    displayName: characterAbilityTitle
      ?? resolveFallbackText(entry.displayName ?? entry.title ?? entry.targetKey)
      ?? entry.displayName,
    iconPreviewPath: bundledIconAsset?.previewPath
      ?? resolveIconPreviewPath(
        entry.iconPreviewPath,
        [entry.targetKey, entry.displayName, entry.title, entry.relativePath],
        entry.displayName ?? entry.title,
      ),
    iconCropX: entry.iconCropX ?? bundledIconAsset?.cropX ?? null,
    iconCropY: entry.iconCropY ?? bundledIconAsset?.cropY ?? null,
    iconCropWidth: entry.iconCropWidth ?? bundledIconAsset?.cropWidth ?? null,
    iconCropHeight: entry.iconCropHeight ?? bundledIconAsset?.cropHeight ?? null,
    iconSourceWidth: entry.iconSourceWidth ?? bundledIconAsset?.sourceWidth ?? null,
    iconSourceHeight: entry.iconSourceHeight ?? bundledIconAsset?.sourceHeight ?? null,
  };
}

function hydrateLibraryTemplateEntry(entry: LibraryTemplateEntry): LibraryTemplateEntry {
  const resolvedTitle = resolveFallbackText(entry.title ?? entry.displayName ?? entry.targetKey);
  const resolvedLabel = resolveFallbackText(entry.label ?? entry.displayName ?? entry.targetKey);
  const bundledIconAsset = resolveBundledIconAsset(entry.previewPath, [
    entry.templatePassiveKey,
    entry.targetKey,
    entry.displayName,
    entry.title,
    entry.iconReference,
  ]);
  return {
    ...entry,
    title: resolvedTitle ?? entry.title,
    label: resolvedLabel ?? entry.label,
    displayName: resolveFallbackText(entry.displayName ?? entry.targetKey) ?? entry.displayName,
    description: resolveFallbackText(entry.description) ?? entry.description,
    iconReference: entry.iconReference,
    iconSourcePassiveKey: entry.iconSourcePassiveKey ?? entry.templatePassiveKey ?? entry.targetKey,
    previewPath: bundledIconAsset?.previewPath
      ?? resolveIconPreviewPath(
        entry.previewPath,
        [entry.templatePassiveKey, entry.targetKey, entry.displayName, entry.title, entry.iconReference],
        entry.displayName ?? entry.title ?? entry.targetKey,
      ),
    cropX: entry.cropX ?? bundledIconAsset?.cropX ?? null,
    cropY: entry.cropY ?? bundledIconAsset?.cropY ?? null,
    cropWidth: entry.cropWidth ?? bundledIconAsset?.cropWidth ?? null,
    cropHeight: entry.cropHeight ?? bundledIconAsset?.cropHeight ?? null,
    sourceWidth: entry.sourceWidth ?? bundledIconAsset?.sourceWidth ?? null,
    sourceHeight: entry.sourceHeight ?? bundledIconAsset?.sourceHeight ?? null,
  };
}

function hydrateLibraryAllOptionEntry(entry: LibraryAllOptionEntry): LibraryAllOptionEntry {
  const label = resolveFallbackText(entry.label ?? entry.displayName ?? entry.targetKey) ?? entry.label;
  const description = resolveFallbackText(entry.description) ?? entry.description;
  const bundledIconAsset = resolveBundledIconAsset(entry.iconPreviewPath, [
    entry.targetKey,
    entry.displayName,
    entry.label,
    entry.path,
  ]);
  return {
    ...entry,
    label,
    description,
    displayName: resolveFallbackText(entry.displayName ?? entry.targetKey) ?? entry.displayName,
    resolvedName: resolveFallbackText(entry.resolvedName ?? entry.displayName ?? entry.targetKey) ?? entry.resolvedName,
    iconPreviewPath: bundledIconAsset?.previewPath
      ?? resolveIconPreviewPath(
        entry.iconPreviewPath,
        [entry.targetKey, entry.displayName, entry.label, entry.path],
        entry.displayName ?? label,
      ),
    iconCropX: entry.iconCropX ?? bundledIconAsset?.cropX,
    iconCropY: entry.iconCropY ?? bundledIconAsset?.cropY,
    iconCropWidth: entry.iconCropWidth ?? bundledIconAsset?.cropWidth,
    iconCropHeight: entry.iconCropHeight ?? bundledIconAsset?.cropHeight,
    iconSourceWidth: entry.iconSourceWidth ?? bundledIconAsset?.sourceWidth,
    iconSourceHeight: entry.iconSourceHeight ?? bundledIconAsset?.sourceHeight,
  };
}

function hydrateOperationCapability(capability: OperationCapability): OperationCapability {
  return {
    ...capability,
    label: resolveFallbackText(capability.label ?? capability.sourceTargetKey) ?? capability.label,
    description: resolveFallbackText(capability.description) ?? capability.description,
    previewLabel: resolveFallbackText(capability.previewLabel ?? capability.label) ?? capability.previewLabel,
    previewPath: resolveIconPreviewPath(
      capability.previewPath,
      [capability.sourceTargetKey, capability.previewLabel, capability.label, capability.path],
      capability.previewLabel ?? capability.label,
    ),
  };
}

function hydrateReferenceChoice(choice: ReferenceChoice): ReferenceChoice {
  return {
    ...choice,
    label: resolveFallbackText(choice.label) ?? choice.label,
    previewLabel: resolveFallbackText(choice.previewLabel ?? choice.currentReference ?? choice.label) ?? choice.previewLabel,
    previewPath: resolveIconPreviewPath(
      choice.previewPath,
      [choice.currentReference, choice.label, choice.path],
      choice.previewLabel ?? choice.label,
    ),
    iconChoices: choice.iconChoices?.map(hydrateIconChoice),
  };
}

function hydrateTextToken(token: TextToken): TextToken {
  const previewText = resolveFallbackText(token.previewText ?? stringifyJsonValue(token.previewValue));
  const nextPreviewValue = typeof token.previewValue === "string"
    ? resolveFallbackText(token.previewValue) ?? token.previewValue
    : token.previewValue;
  return {
    ...token,
    label: resolveFallbackText(token.label) ?? token.label,
    description: resolveFallbackText(token.description) ?? token.description,
    previewText: previewText ?? token.previewText,
    previewValue: nextPreviewValue,
  };
}

function hydrateIconChoice(choice: IconChoice): IconChoice {
  const bundledIconAsset = resolveBundledIconAsset(choice.previewPath, [
    choice.value,
    choice.reference,
    choice.key,
    choice.passiveKey,
    typeof choice.passiveId === "number" ? String(choice.passiveId) : undefined,
    choice.sourcePassiveKey,
    choice.spriteName,
    choice.spriteAsset,
    choice.label,
  ]);
  const previewPath = bundledIconAsset?.previewPath ?? resolveIconPreviewPath(
    choice.previewPath,
    [
      choice.value,
      choice.reference,
      choice.key,
      choice.passiveKey,
      typeof choice.passiveId === "number" ? String(choice.passiveId) : undefined,
      choice.sourcePassiveKey,
      choice.spriteName,
      choice.spriteAsset,
      choice.label,
    ],
    choice.label,
  );
  const label = resolveFallbackText(choice.label ?? choice.reference ?? choice.passiveKey) ?? choice.label;
  return {
    ...choice,
    label: label ?? choice.label,
    description: resolveFallbackText(choice.description) ?? choice.description,
    previewPath,
    cropX: choice.cropX ?? bundledIconAsset?.cropX,
    cropY: choice.cropY ?? bundledIconAsset?.cropY,
    cropWidth: choice.cropWidth ?? bundledIconAsset?.cropWidth,
    cropHeight: choice.cropHeight ?? bundledIconAsset?.cropHeight,
    sourceWidth: choice.sourceWidth ?? bundledIconAsset?.sourceWidth,
    sourceHeight: choice.sourceHeight ?? bundledIconAsset?.sourceHeight,
  };
}

function readLooseIconChoiceString(choice: IconChoice | Record<string, unknown>, key: keyof IconChoice | string): string | undefined {
  const value = choice[key as keyof typeof choice];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readLooseIconChoiceNumber(choice: IconChoice | Record<string, unknown>, key: keyof IconChoice | string): number | undefined {
  const value = choice[key as keyof typeof choice];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function hydrateCardPreview(
  preview: CardPreview | null | undefined,
  document: RuntimeDocument,
  textTokens: TextToken[] | undefined,
): CardPreview | null | undefined {
  if (!preview) {
    return preview;
  }

  const defaults = resolvePreviewDefaults(preview.cardKind ?? document.cardPreview?.cardKind ?? "augment");
  const title = resolveFallbackText(preview.title ?? document.displayName ?? document.targetKey) ?? preview.title;
  const shortDescription = resolveFallbackText(preview.shortDescription) ?? preview.shortDescription;
  const description = resolveFallbackText(preview.description) ?? preview.description;
  const iconAsset = resolveBundledIconAsset(preview.iconPreviewPath, [
    preview.iconReference,
    document.targetKey,
    document.displayName,
    typeof document.icon === "object" && document.icon && !Array.isArray(document.icon)
      ? stringifyJsonValue((document.icon as Record<string, unknown>).sourcePassiveKey)
      : undefined,
    typeof document.icon === "object" && document.icon && !Array.isArray(document.icon)
      ? stringifyJsonValue((document.icon as Record<string, unknown>).sourcePassiveId)
      : undefined,
    document.templatePassiveKey,
    title,
  ]);
  const iconPreviewPath = iconAsset?.previewPath ?? resolveIconPreviewPath(
    preview.iconPreviewPath,
    [
      preview.iconReference,
      document.targetKey,
      document.displayName,
      typeof document.icon === "object" && document.icon && !Array.isArray(document.icon)
        ? stringifyJsonValue((document.icon as Record<string, unknown>).sourcePassiveKey)
        : undefined,
      typeof document.icon === "object" && document.icon && !Array.isArray(document.icon)
        ? stringifyJsonValue((document.icon as Record<string, unknown>).sourcePassiveId)
        : undefined,
      document.templatePassiveKey,
      title,
    ],
    title ?? document.displayName,
  );

  return {
    ...preview,
    title,
    shortDescription,
    description,
    iconPreviewPath,
    iconCropX: preview.iconCropX ?? iconAsset?.cropX,
    iconCropY: preview.iconCropY ?? iconAsset?.cropY,
    iconCropWidth: preview.iconCropWidth ?? iconAsset?.cropWidth,
    iconCropHeight: preview.iconCropHeight ?? iconAsset?.cropHeight,
    iconSourceWidth: preview.iconSourceWidth ?? iconAsset?.sourceWidth,
    iconSourceHeight: preview.iconSourceHeight ?? iconAsset?.sourceHeight,
    iconStatus: iconPreviewPath ? "resolved" : preview.iconStatus ?? "missing",
    backgroundPreviewPath: resolveCardSurfacePreviewPath(preview.backgroundPreviewPath, defaults.backgroundPreviewPath),
    framePreviewPath: resolveCardSurfacePreviewPath(preview.framePreviewPath, defaults.framePreviewPath),
    overlayPreviewPath: resolveCardSurfacePreviewPath(preview.overlayPreviewPath, defaults.overlayPreviewPath),
    titleFontPath: resolveCardSurfacePreviewPath(preview.titleFontPath, defaults.titleFontPath),
    bodyFontPath: resolveCardSurfacePreviewPath(preview.bodyFontPath, defaults.bodyFontPath),
    largeCard: hydrateCardPreviewVariant(preview.largeCard, defaults, title, shortDescription, description, iconAsset),
    compactCard: hydrateCardPreviewVariant(preview.compactCard, defaults, title, shortDescription, description, iconAsset),
    richTextRuns: preview.richTextRuns?.map(run => ({
      ...run,
      text: resolveFallbackText(run.text) ?? run.text,
    })),
    inlineIconRuns: preview.inlineIconRuns?.map(run => hydrateCardInlineIconRun(run, textTokens)),
    statLines: preview.statLines?.map(line => ({
      ...line,
      label: resolveFallbackText(line.label) ?? line.label,
      value: resolveFallbackText(line.value) ?? line.value,
    })),
  };
}

function hydrateCardPreviewVariant(
  variant: CardPreviewVariant | null | undefined,
  defaults: PreviewDefaults,
  fallbackTitle: string | undefined,
  fallbackShortDescription: string | undefined,
  fallbackDescription: string | undefined,
  fallbackIconAsset: BundledResolvedIconAsset | undefined,
): CardPreviewVariant | null | undefined {
  if (!variant) {
    return variant;
  }

  const iconAsset = resolveBundledIconAsset(variant.iconPreviewPath, [variant.iconReference, variant.title, fallbackTitle])
    ?? fallbackIconAsset;

  return {
    ...variant,
    title: resolveFallbackText(variant.title ?? fallbackTitle) ?? variant.title ?? fallbackTitle,
    shortDescription: resolveFallbackText(variant.shortDescription ?? fallbackShortDescription)
      ?? variant.shortDescription
      ?? fallbackShortDescription,
    description: resolveFallbackText(variant.description ?? fallbackDescription)
      ?? variant.description
      ?? fallbackDescription,
    iconPreviewPath: iconAsset?.previewPath
      ?? resolveCardSurfacePreviewPath(variant.iconPreviewPath, fallbackIconAsset?.previewPath),
    iconCropX: variant.iconCropX ?? iconAsset?.cropX,
    iconCropY: variant.iconCropY ?? iconAsset?.cropY,
    iconCropWidth: variant.iconCropWidth ?? iconAsset?.cropWidth,
    iconCropHeight: variant.iconCropHeight ?? iconAsset?.cropHeight,
    iconSourceWidth: variant.iconSourceWidth ?? iconAsset?.sourceWidth,
    iconSourceHeight: variant.iconSourceHeight ?? iconAsset?.sourceHeight,
    backgroundPreviewPath: resolveCardSurfacePreviewPath(variant.backgroundPreviewPath, defaults.backgroundPreviewPath),
    framePreviewPath: resolveCardSurfacePreviewPath(variant.framePreviewPath, defaults.framePreviewPath),
    overlayPreviewPath: resolveCardSurfacePreviewPath(variant.overlayPreviewPath, defaults.overlayPreviewPath),
    titleFontPath: resolveCardSurfacePreviewPath(variant.titleFontPath, defaults.titleFontPath),
    bodyFontPath: resolveCardSurfacePreviewPath(variant.bodyFontPath, defaults.bodyFontPath),
    richTextRuns: variant.richTextRuns?.map(run => ({
      ...run,
      text: resolveFallbackText(run.text) ?? run.text,
    })),
    inlineIconRuns: variant.inlineIconRuns?.map(run => hydrateCardInlineIconRun(run)),
    statLines: variant.statLines?.map(line => ({
      ...line,
      label: resolveFallbackText(line.label) ?? line.label,
      value: resolveFallbackText(line.value) ?? line.value,
    })),
  };
}

function hydrateCardInlineIconRun(run: CardInlineIconRun, textTokens?: TextToken[]) {
  const tokenMatch = textTokens?.find(token => normalizeLookupKey(token.label) === normalizeLookupKey(run.label));
  return {
    ...run,
    label: resolveFallbackText(run.label ?? tokenMatch?.label) ?? run.label,
    previewPath: resolveIconPreviewPath(
      run.previewPath,
      [run.key, run.label, tokenMatch?.label],
      run.label ?? tokenMatch?.label,
    ),
  };
}

function resolvePreviewDefaults(cardKind: string | undefined): PreviewDefaults {
  const kindKey = (cardKind ?? "augment").trim().toLowerCase();
  return {
    ...defaultCardAssets,
    ...(kindDefaults.get(kindKey) ?? {}),
  };
}

function resolveIconPreviewDataUri(
  keys: Array<string | null | undefined>,
  fallbackLabel?: string | null,
): string | undefined {
  const normalizedKeys = keys
    .map(value => normalizeLookupKey(value))
    .filter(Boolean) as string[];
  const match = normalizedKeys
    .map(key => iconLookupMap.get(key))
    .find(Boolean);
  const label = sanitizePreviewText(match?.label) ?? sanitizePreviewText(fallbackLabel);
  if (!label) {
    return undefined;
  }
  return buildIconDataUri(label, match?.theme ?? pickTheme(label));
}

function resolveIconPreviewPath(
  previewPath: string | null | undefined,
  keys: Array<string | null | undefined>,
  fallbackLabel?: string | null,
): string | undefined {
  const bundledIconAsset = resolveBundledIconAsset(previewPath, keys);
  if (bundledIconAsset?.previewPath) {
    return bundledIconAsset.previewPath;
  }

  const fallbackPath = resolveIconPreviewDataUri(keys, fallbackLabel);
  const preferredPath = sanitizePreviewText(previewPath);
  if (!preferredPath) {
    return fallbackPath;
  }
  if (shouldPreferBundledFallback(preferredPath)) {
    return fallbackPath ?? preferredPath;
  }
  return preferredPath;
}

function resolveBundledIconAsset(
  previewPath: string | null | undefined,
  keys: Array<string | null | undefined>,
): BundledResolvedIconAsset | undefined {
  const customIconEntry = resolveBundledCustomIconEntry(previewPath, keys);
  const resolvedPreviewPath =
    resolveBundledPreviewFilePath(previewPath)
    ?? resolveBundledPreviewFilePath(customIconEntry?.previewPath)
    ?? resolveBundledPreviewFromKeys(keys);
  if (!resolvedPreviewPath) {
    return undefined;
  }

  return {
    previewPath: resolvedPreviewPath,
    cropX: readFiniteNumber(customIconEntry?.cropX),
    cropY: readFiniteNumber(customIconEntry?.cropY),
    cropWidth: readFiniteNumber(customIconEntry?.cropWidth),
    cropHeight: readFiniteNumber(customIconEntry?.cropHeight),
    sourceWidth: readFiniteNumber(customIconEntry?.sourceWidth),
    sourceHeight: readFiniteNumber(customIconEntry?.sourceHeight),
  };
}

function resolveCardSurfacePreviewPath(
  previewPath: string | null | undefined,
  fallbackPath?: string | null,
): string | undefined {
  const bundledPreviewPath = resolveBundledPreviewFilePath(previewPath);
  if (bundledPreviewPath) {
    return bundledPreviewPath;
  }

  const preferredPath = sanitizePreviewText(previewPath);
  if (!preferredPath) {
    return fallbackPath ?? undefined;
  }
  if (shouldPreferBundledFallback(preferredPath)) {
    return fallbackPath ?? undefined;
  }
  return preferredPath;
}

function resolveBundledPreviewFilePath(previewPath: string | null | undefined): string | undefined {
  const normalizedKey = normalizePreviewFileLookupKey(previewPath);
  if (!normalizedKey) {
    return undefined;
  }

  for (const candidate of buildBundledPreviewLookupCandidates(normalizedKey)) {
    const match = bundledPreviewFiles.get(candidate);
    if (match) {
      return match;
    }
  }

  return undefined;
}

function buildBundledPreviewLookupCandidates(normalizedKey: string): string[] {
  const candidates = new Set<string>();
  const queue = [normalizedKey];
  const seen = new Set<string>();

  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) {
      continue;
    }
    seen.add(current);
    candidates.add(current);
    candidates.add(pathBasename(current));

    const segments = current.split("/").filter(Boolean);
    for (let count = 2; count <= 4; count += 1) {
      if (segments.length >= count) {
        candidates.add(segments.slice(-count).join("/"));
      }
    }

    if (/\/sprite\//i.test(current)) {
      queue.push(current.replace(/\/sprite\//gi, "/texture2d/"));
    }
    if (/\.asset$/i.test(current)) {
      queue.push(current.replace(/\.asset$/i, ".png"));
      queue.push(pathBasename(current).replace(/\.asset$/i, ".png"));
    }
    if (/\/sprite\//i.test(current) && /\.asset$/i.test(current)) {
      queue.push(current.replace(/\/sprite\//gi, "/texture2d/").replace(/\.asset$/i, ".png"));
    }
  }

  return Array.from(candidates);
}

function resolveBundledPreviewFromKeys(keys: Array<string | null | undefined>): string | undefined {
  const candidates = new Set<string>();
  const extensions = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

  for (const key of keys) {
    const trimmed = sanitizePreviewText(key);
    if (!trimmed) {
      continue;
    }

    const normalized = trimmed
      .replace(/^sprite:/i, "")
      .replace(/^gameobject:/i, "")
      .replace(/^passiveso:/i, "")
      .replace(/^statuseffectso:/i, "")
      .replace(/^p_/i, "")
      .trim();

    if (!normalized) {
      continue;
    }

    const base = normalized.replace(/\\/g, "/");
    const basename = pathBasename(base);
    const withoutExtension = base.replace(/\.(asset|png|jpe?g|webp|gif)$/i, "");
    const basenameWithoutExtension = basename.replace(/\.(asset|png|jpe?g|webp|gif)$/i, "");
    const baseVariants = [
      base,
      basename,
      withoutExtension,
      basenameWithoutExtension,
    ].filter(Boolean);

    for (const variant of baseVariants) {
      const slug = variant.replace(/[^a-z0-9]+/gi, "_");
      const dashed = variant.replace(/[^a-z0-9]+/gi, "-");

      candidates.add(variant);
      candidates.add(variant.toLowerCase());
      candidates.add(slug);
      candidates.add(slug.toLowerCase());
      candidates.add(dashed);
      candidates.add(dashed.toLowerCase());

      if (/\.(png|jpe?g|webp|gif)$/i.test(variant)) {
        candidates.add(variant.toLowerCase());
        continue;
      }

      for (const ext of extensions) {
        candidates.add(`${variant}${ext}`.toLowerCase());
        candidates.add(`${slug}${ext}`.toLowerCase());
        candidates.add(`${dashed}${ext}`.toLowerCase());
      }
    }
  }

  for (const candidate of candidates) {
    const normalizedCandidate = normalizePreviewFileLookupKey(candidate);
    if (!normalizedCandidate) {
      continue;
    }
    const match = bundledPreviewFiles.get(normalizedCandidate) ?? bundledPreviewFiles.get(pathBasename(normalizedCandidate));
    if (match) {
      return match;
    }
  }

  return undefined;
}

function resolveBundledCustomIconEntry(
  previewPath: string | null | undefined,
  keys: Array<string | null | undefined>,
): BundledCustomIconEntry | undefined {
  for (const candidate of buildBundledCustomIconSearchKeys(previewPath, keys)) {
    const match = bundledCustomIconLookup.get(candidate);
    if (match) {
      return match;
    }
  }

  return undefined;
}

function buildBundledCustomIconSearchKeys(
  previewPath: string | null | undefined,
  keys: Array<string | null | undefined>,
): string[] {
  const candidates = new Set<string>();
  for (const value of [previewPath, ...keys]) {
    for (const candidate of expandBundledCustomIconSearchValue(value)) {
      candidates.add(candidate);
    }
  }
  return Array.from(candidates);
}

function expandBundledCustomIconSearchValue(value: string | null | undefined): string[] {
  const trimmed = sanitizePreviewText(value);
  if (!trimmed) {
    return [];
  }

  const candidates = new Set<string>();
  const normalized = trimmed.replace(/\\/g, "/").trim();
  const withoutHashId = normalized.replace(/#\d+$/i, "");
  const withoutKindPrefix = withoutHashId
    .replace(/^sprite:/i, "")
    .replace(/^gameobject:/i, "")
    .replace(/^passiveso:/i, "")
    .replace(/^statuseffectso:/i, "");
  const withoutPassivePrefix = withoutKindPrefix.replace(/^p_/i, "");
  const basename = pathBasename(withoutKindPrefix);
  const basenameWithoutExtension = basename.replace(/\.(asset|png|jpe?g|webp|gif)$/i, "");

  candidates.add(normalizeLookupKey(normalized));
  candidates.add(normalizeLookupKey(withoutHashId));
  candidates.add(normalizeLookupKey(withoutKindPrefix));
  candidates.add(normalizeLookupKey(withoutPassivePrefix));
  candidates.add(normalizeLookupKey(basename));
  candidates.add(normalizeLookupKey(basenameWithoutExtension));

  if (withoutKindPrefix !== basenameWithoutExtension) {
    candidates.add(normalizeLookupKey(`sprite:${withoutKindPrefix}`));
    candidates.add(normalizeLookupKey(`sprite:${basenameWithoutExtension}`));
  }

  return Array.from(candidates).filter(Boolean);
}

function buildBundledCustomIconLookupKeys(entry: BundledCustomIconEntry): string[] {
  const candidates = new Set<string>();

  for (const value of [
    entry.passiveKey,
    sanitizePreviewText(entry.passiveKey)?.replace(/#\d+$/i, ""),
    sanitizePreviewText(entry.passiveKey)?.replace(/^P_/i, "").replace(/#\d+$/i, ""),
    entry.spriteName,
    entry.spriteName ? `Sprite:${entry.spriteName}` : undefined,
    entry.spriteAsset,
    entry.previewPath,
  ]) {
    for (const candidate of expandBundledCustomIconSearchValue(value)) {
      candidates.add(candidate);
    }
  }

  return Array.from(candidates);
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizePreviewFileLookupKey(value: string | null | undefined): string | undefined {
  const trimmed = sanitizePreviewText(value);
  if (!trimmed) {
    return undefined;
  }
  let normalized = trimmed.replace(/^file:\/+/i, "");
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep the raw string when decoding fails.
  }
  return normalized.replace(/\\/g, "/").toLowerCase();
}

function pathBasename(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
}

function shouldPreferBundledFallback(previewPath: string): boolean {
  const normalizedPath = previewPath
    .trim()
    .toLowerCase()
    .replace(/^file:\/+/, "");

  if (!normalizedPath) {
    return false;
  }

  return (
    /(?:^|[\\/])assetrip(?:[\\/]|$)/i.test(normalizedPath)
    || /(?:^|[\\/])exportedproject(?:[\\/]|$)/i.test(normalizedPath)
    || /(?:^|[\\/])assets(?:[\\/])(texture2d|sprite)(?:[\\/]|$)/i.test(normalizedPath)
  );
}

export function resolveFallbackText(value: string | null | undefined): string | undefined {
  const trimmed = sanitizePreviewText(value);
  if (!trimmed) {
    return undefined;
  }

  const lookupHit = localizationLookup.get(normalizeLookupKey(trimmed));
  if (lookupHit) {
    return lookupHit;
  }

  if (looksLikeLocalizationKey(trimmed)) {
    return humanizeLookupKey(trimmed);
  }

  if (trimmed.startsWith("#")) {
    return trimmed.replace(/^#+\s*/, "");
  }

  if (looksLikeTechnicalLabel(trimmed)) {
    return humanizeFallbackLabel(trimmed);
  }

  return trimmed;
}

function resolveCharacterAbilityDocumentTitle(document: RuntimeDocument): string | undefined {
  const targetType = sanitizePreviewText(document.targetType)?.toLowerCase();
  if (targetType !== "characterability") {
    return undefined;
  }

  for (const candidate of [document.displayName, document.resolvedName]) {
    const humanized = candidate ? humanizeFallbackLabel(candidate) : "";
    if (humanized && !looksGenericCharacterAbilityLabel(humanized)) {
      return humanized;
    }
  }

  const targetKey = sanitizePreviewText(document.targetKey);
  if (!targetKey) {
    return undefined;
  }

  const characterKey = targetKey.match(/^([^/]+)\//)?.[1] ?? "";
  const slotMatch = targetKey.match(/Ability\[(\d+)\]/i);
  const characterLabel = characterKey
    ? humanizeFallbackLabel(characterKey.split("#")[0] ?? characterKey)
    : "Character";
  if (!slotMatch) {
    return characterLabel;
  }

  const slotIndex = Number(slotMatch[1]);
  if (!Number.isFinite(slotIndex)) {
    return characterLabel;
  }
  return `${characterLabel} / ${resolveAbilitySlotFallbackLabel(slotIndex)}`;
}

function resolveCharacterAbilityCatalogTitle(entry: CatalogEntry): string | undefined {
  const targetType = sanitizePreviewText(entry.targetType)?.toLowerCase();
  if (targetType !== "characterability") {
    return undefined;
  }

  for (const candidate of [entry.displayName, entry.title]) {
    const humanized = candidate ? humanizeFallbackLabel(candidate) : "";
    if (humanized && !looksGenericCharacterAbilityLabel(humanized)) {
      return humanized;
    }
  }

  const targetKey = sanitizePreviewText(entry.targetKey);
  if (!targetKey) {
    return undefined;
  }

  const characterKey = targetKey.match(/^([^/]+)\//)?.[1] ?? "";
  const slotMatch = targetKey.match(/Ability\[(\d+)\]/i);
  const characterLabel = characterKey
    ? humanizeFallbackLabel(characterKey.split("#")[0] ?? characterKey)
    : "Character";
  if (!slotMatch) {
    return characterLabel;
  }

  const slotIndex = Number(slotMatch[1]);
  if (!Number.isFinite(slotIndex)) {
    return characterLabel;
  }
  return `${characterLabel} / ${resolveAbilitySlotFallbackLabel(slotIndex)}`;
}

function looksGenericCharacterAbilityLabel(value: string): boolean {
  return (
    /^ability\s+\d+$/i.test(value)
    || /^ability\s+ability\s+\d+$/i.test(value)
    || /^ability\s+\d+\s+ability\s+\d+$/i.test(value)
    || /^ability slot\s+\d+$/i.test(value)
    || /^character ability(?: slot\s+\d+)?$/i.test(value)
    || /^current character export$/i.test(value)
  );
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

function resolveRuntimeOverviewText(
  text: string | undefined,
  friendlyTitle: string | undefined,
  rawTitles: Array<string | undefined>,
): string | undefined {
  const cleaned = sanitizePreviewText(text);
  if (!cleaned) {
    return undefined;
  }

  let resolved = resolveFallbackText(cleaned) ?? cleaned;
  if (!friendlyTitle) {
    return resolved;
  }

  for (const rawTitle of rawTitles) {
    const raw = sanitizePreviewText(rawTitle);
    if (!raw) {
      continue;
    }
    resolved = resolved.split(raw).join(friendlyTitle);
    const humanizedRaw = humanizeFallbackLabel(raw);
    if (humanizedRaw && humanizedRaw !== raw) {
      resolved = resolved.split(humanizedRaw).join(friendlyTitle);
    }
  }

  return resolved;
}

function looksLikeLocalizationKey(value: string): boolean {
  return /(^[A-Z0-9_]+$)|(^P_[A-Z0-9_#]+$)|(^.*(?:trkey|_desc|_name|_short).*$)/i.test(value);
}

function looksLikeTechnicalLabel(value: string): boolean {
  return (
    /[\[\]()\/:#_-]/.test(value)
    || /(^[A-Z0-9_]+$)/.test(value)
    || /(^P_[A-Za-z0-9_#]+$)/.test(value)
    || /(^Sprite:|^GameObject:|^PassiveSO:|^StatusEffectSO:)/i.test(value)
    || /([a-z])([A-Z])/.test(value)
    || /([A-Za-z])([0-9])/.test(value)
    || /([0-9])([A-Za-z])/.test(value)
    || /\b(?:trkey|_desc|_name|_short)\b/i.test(value)
    || /\bAbility\[(\d+)\]/i.test(value)
    || /\bAbility\d+\b/i.test(value)
  );
}

function humanizeFallbackLabel(value: string): string {
  const normalized = value
    .replace(/^PassiveSO:/i, "")
    .replace(/^StatusEffectSO:/i, "")
    .replace(/^GameObject:/i, "")
    .replace(/^Sprite:/i, "")
    .replace(/^P_/i, "")
    .replace(/\bAbility\[(\d+)\]/gi, "Ability $1")
    .replace(/\bAbility\s*\[(\d+)\]/gi, "Ability $1")
    .replace(/\bAbility(\d+)\b/gi, "Ability $1")
    .replace(/^Ability\s+\d+\s+Ability\s+(\d+)$/i, "Ability $1")
    .replace(/\b0+\s+Ability\s+(\d+)\b/gi, "Ability $1")
    .replace(/\(Ability\)/gi, "")
    .replace(/\(Current\)/gi, "")
    .replace(/#\d+$/i, "")
    .replace(/\btrkey\b/gi, "")
    .replace(/\bdisplayname\b/gi, "")
    .replace(/\bshortdesc(?:ription)?\b/gi, "")
    .replace(/\bdesc(?:ription)?\b/gi, "")
    .replace(/\bname\b/gi, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return value;
  }

  return normalized
    .toLowerCase()
    .replace(/\b\w/g, match => match.toUpperCase());
}

function humanizeLookupKey(value: string): string {
  return value
    .replace(/^PassiveSO:/i, "")
    .replace(/^StatusEffectSO:/i, "")
    .replace(/^GameObject:/i, "")
    .replace(/^Sprite:/i, "")
    .replace(/^P_/i, "")
    .replace(/\bAbility\[(\d+)\]/gi, "Ability $1")
    .replace(/\bAbility\s*\[(\d+)\]/gi, "Ability $1")
    .replace(/\bAbility(\d+)\b/gi, "Ability $1")
    .replace(/^Ability\s+\d+\s+Ability\s+(\d+)$/i, "Ability $1")
    .replace(/\b0+\s+Ability\s+(\d+)\b/gi, "Ability $1")
    .replace(/#\d+$/i, "")
    .replace(/\btrkey\b/gi, "")
    .replace(/\bdisplayname\b/gi, "")
    .replace(/\bshortdesc(?:ription)?\b/gi, "")
    .replace(/\bdesc(?:ription)?\b/gi, "")
    .replace(/\bname\b/gi, "")
    .replace(/[_-]+/g, " ")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, match => match.toUpperCase());
}

function buildIconDataUri(label: string, themeKey: string): string {
  const theme = resolveTheme(themeKey);
  const glyph = abbreviateLabel(label);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${theme.start}" />
          <stop offset="100%" stop-color="${theme.end}" />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="148" height="148" rx="34" fill="${theme.base}" stroke="${theme.border}" stroke-width="4" />
      <rect x="18" y="18" width="124" height="124" rx="28" fill="url(#g)" opacity="0.92" />
      <circle cx="124" cy="40" r="12" fill="${theme.spark}" opacity="0.96" />
      <path d="M31 110c18-22 37-31 57-31 18 0 31 4 41 12" fill="none" stroke="${theme.borderSoft}" stroke-width="5" stroke-linecap="round" opacity="0.5" />
      <text x="80" y="92" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" font-weight="800" fill="${theme.text}">${glyph}</text>
      <text x="80" y="121" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="600" fill="${theme.textSoft}">${escapeXml(label.slice(0, 16))}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function abbreviateLabel(label: string): string {
  const words = label
    .split(/[\s/_-]+/)
    .map(part => part.trim())
    .filter(Boolean);
  if (!words.length) {
    return "??";
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

function pickTheme(seed: string): string {
  const themes = ["ember", "violet", "sapphire", "gold", "azure", "coral"];
  let hash = 0;
  for (const char of seed) {
    hash = ((hash << 5) - hash) + char.charCodeAt(0);
    hash |= 0;
  }
  return themes[Math.abs(hash) % themes.length];
}

function resolveTheme(themeKey: string) {
  switch (themeKey) {
    case "ember":
      return { base: "#17131b", start: "#ff7b45", end: "#ffb24f", border: "#ffd0a3", borderSoft: "#ff9f6e", spark: "#ffdda2", text: "#fff6eb", textSoft: "#ffe6ca" };
    case "violet":
      return { base: "#131421", start: "#8b6bff", end: "#d470ff", border: "#d3c6ff", borderSoft: "#9f8cff", spark: "#efe2ff", text: "#f6efff", textSoft: "#e6d8ff" };
    case "mint":
    case "sapphire":
      return { base: "#101624", start: "#4c6dff", end: "#7fb8ff", border: "#d6e2ff", borderSoft: "#8fa8ff", spark: "#e7efff", text: "#f2f6ff", textSoft: "#dce7ff" };
    case "gold":
      return { base: "#1d1810", start: "#e9a63b", end: "#f5dc7a", border: "#fff0b2", borderSoft: "#f0c870", spark: "#fff5cf", text: "#fff8e3", textSoft: "#f7e7b1" };
    case "coral":
      return { base: "#1b1215", start: "#ff6868", end: "#ff9a7d", border: "#ffd0c7", borderSoft: "#ff9c8a", spark: "#ffe2d3", text: "#fff4ef", textSoft: "#ffd8cd" };
    case "azure":
    default:
      return { base: "#111824", start: "#4d7dff", end: "#6fd5ff", border: "#caddff", borderSoft: "#7fa7ff", spark: "#dff1ff", text: "#eef6ff", textSoft: "#d3e4ff" };
  }
}

function resolveAssetId(assetId?: string | null): string | undefined {
  if (!assetId) {
    return undefined;
  }
  return assetUrlById[assetId] ?? undefined;
}

function normalizeLookupKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function sanitizePreviewText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/^#+\s*/, "");
}

function stringifyJsonValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
