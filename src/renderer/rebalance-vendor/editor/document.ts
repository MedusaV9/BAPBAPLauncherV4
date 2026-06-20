import type {
  AdvancedField,
  CardPreview,
  CardPreviewVariant,
  CardRichTextRun,
  GameModeSummary,
  IconChoice,
  JsonObject,
  JsonValue,
  QuickEditEntry,
  RuntimeDocument,
  SimpleGroupEntry,
  TargetOperationEntry,
  TextToken,
} from "./types";
import { resolveFallbackText } from "./bundledFallbacks";

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseJsonObject(text: string): JsonObject {
  const parsed = JSON.parse(text) as unknown;
  if (!isJsonObject(parsed)) {
    throw new Error("The value must be a JSON object.");
  }
  return parsed;
}

export function parseValueInput(raw: string, valueType?: string): JsonValue {
  const kind = (valueType ?? "string").toLowerCase();
  if (kind === "boolean") {
    return raw === "true";
  }
  if (kind === "integer") {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      throw new Error("Please enter a valid integer.");
    }
    return parsed;
  }
  if (kind === "number") {
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      throw new Error("Please enter a valid number.");
    }
    return parsed;
  }
  if (kind === "json") {
    return JSON.parse(raw) as JsonValue;
  }
  return raw;
}

function hasOwnKey(object: Record<string, JsonValue>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function jsonEquals(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function resolveOverrideValue(
  document: RuntimeDocument,
  path: string,
  fallback: JsonValue | undefined,
  defaultValue?: JsonValue,
  draftOverrides?: Record<string, JsonValue>,
): JsonValue | undefined {
  const originalOverrides = document.overrides ?? {};
  const activeOverrides = draftOverrides ?? originalOverrides;

  if (hasOwnKey(activeOverrides, path)) {
    return activeOverrides[path];
  }

  if (draftOverrides && !hasOwnKey(draftOverrides, path) && hasOwnKey(originalOverrides, path)) {
    return defaultValue ?? fallback;
  }

  return fallback;
}

export function resolveQuickValue(
  document: RuntimeDocument,
  item: QuickEditEntry,
  draftOverrides: Record<string, JsonValue>,
): JsonValue | undefined {
  return resolveOverrideValue(document, item.path, item.value, item.defaultValue, draftOverrides);
}

export function resolveSimpleValue(
  document: RuntimeDocument,
  item: SimpleGroupEntry,
  draftOverrides: Record<string, JsonValue>,
): JsonValue | undefined {
  return resolveOverrideValue(document, item.path, item.currentValue, item.defaultValue, draftOverrides);
}

export function resolveFieldValue(
  document: RuntimeDocument,
  item: AdvancedField,
  draftOverrides: Record<string, JsonValue>,
): JsonValue | undefined {
  return resolveOverrideValue(
    document,
    item.path,
    item.effectiveValue,
    item.defaultValue ?? document.advanced?.defaults?.[item.path],
    draftOverrides,
  );
}

function defaultValueForPath(document: RuntimeDocument, path: string): JsonValue | undefined {
  const quick = document.quickEdit?.find((item) => item.path === path);
  if (quick?.defaultValue !== undefined) {
    return quick.defaultValue;
  }
  const simple = document.simpleSettings?.groups
    ?.flatMap((group) => group.entries)
    .find((item) => item.path === path);
  if (simple?.defaultValue !== undefined) {
    return simple.defaultValue;
  }
  return document.advanced?.defaults?.[path];
}

function cleanOverrides(
  document: RuntimeDocument,
  draftOverrides: Record<string, JsonValue>,
): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(draftOverrides).filter(([path, value]) => {
      const defaultValue = defaultValueForPath(document, path);
      return !jsonEquals(defaultValue, value);
    }),
  );
}

function tokenizeOverridePath(path: string): Array<string | number> {
  const tokens: Array<string | number> = [];
  const pattern = /([^[.\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(path)) !== null) {
    if (match[1]) {
      tokens.push(match[1]);
    } else if (match[2]) {
      tokens.push(Number(match[2]));
    }
  }
  return tokens;
}

function applyOverridePath(
  root: Record<string, unknown>,
  path: string,
  value: JsonValue,
) {
  const tokens = tokenizeOverridePath(path);
  if (!tokens.length) {
    return;
  }

  let cursor: unknown = root;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index]!;
    const nextToken = tokens[index + 1]!;

    if (typeof token === "number") {
      if (!Array.isArray(cursor)) {
        return;
      }
      const current = cursor[token];
      if (current === undefined || current === null || typeof current !== "object") {
        cursor[token] = typeof nextToken === "number" ? [] : {};
      }
      cursor = cursor[token];
      continue;
    }

    if (!cursor || typeof cursor !== "object") {
      return;
    }

    const record = cursor as Record<string, unknown>;
    const current = record[token];
    if (current === undefined || current === null || typeof current !== "object") {
      record[token] = typeof nextToken === "number" ? [] : {};
    }
    cursor = record[token];
  }

  const lastToken = tokens[tokens.length - 1]!;
  if (typeof lastToken === "number") {
    if (!Array.isArray(cursor)) {
      return;
    }
    cursor[lastToken] = cloneJson(value);
    return;
  }

  if (!cursor || typeof cursor !== "object") {
    return;
  }

  (cursor as Record<string, unknown>)[lastToken] = cloneJson(value);
}

export function materializeRuntimeDocument(
  document: RuntimeDocument,
  draftOverrides: Record<string, JsonValue>,
  draftOperations?: TargetOperationEntry[],
): RuntimeDocument {
  const next = cloneJson(document);
  const cleanedOverrides = cleanOverrides(document, draftOverrides);
  next.overrides = cleanedOverrides;
  if (next.operations) {
    next.operations.entries = cloneJson(draftOperations ?? next.operations.entries ?? []);
  } else if (draftOperations) {
    next.operations = { entries: cloneJson(draftOperations) };
  }

  for (const [path, value] of Object.entries(cleanedOverrides)) {
    applyOverridePath(next as Record<string, unknown>, path, value);
  }

  if (next.quickEdit) {
    next.quickEdit = next.quickEdit.map((item) => ({
      ...item,
      value: resolveQuickValue(document, item, cleanedOverrides) ?? item.value,
    }));
  }

  if (next.simpleSettings?.groups) {
    next.simpleSettings.groups = next.simpleSettings.groups.map((group) => ({
      ...group,
      entries: group.entries.map((entry) => ({
        ...entry,
        currentValue: resolveSimpleValue(document, entry, cleanedOverrides) ?? entry.currentValue,
      })),
    }));
  }

  if (next.referenceChoices) {
    next.referenceChoices = next.referenceChoices.map((choice) => ({
      ...choice,
      currentReference: stringifyJsonValue(resolveOverrideValue(document, choice.path, choice.currentReference, choice.currentReference, cleanedOverrides)),
    }));
  }

  if (next.gameModeSummary) {
    next.gameModeSummary = materializeGameModeSummary(next.gameModeSummary, cleanedOverrides);
  }

  if (next.textTokens) {
    next.textTokens = materializeTextTokens(document, next.textTokens, cleanedOverrides);
  }

  if (next.cardPreview) {
    next.cardPreview = materializeCardPreview(
      document,
      next.cardPreview,
      cleanedOverrides,
      next.textTokens ?? document.textTokens ?? [],
    );
  }

  if (next.advanced) {
    next.advanced.effectiveValues = {
      ...(next.advanced.effectiveValues ?? {}),
    };

    const fieldPaths = new Set<string>([
      ...Object.keys(next.advanced.defaults ?? {}),
      ...Object.keys(next.advanced.effectiveValues ?? {}),
      ...Object.keys(cleanedOverrides),
    ]);

    fieldPaths.forEach((path) => {
      const fallback =
        next.advanced?.effectiveValues?.[path] ??
        next.advanced?.defaults?.[path] ??
        cleanedOverrides[path];
      const defaultValue = next.advanced?.defaults?.[path];
      const resolved = resolveOverrideValue(document, path, fallback, defaultValue, cleanedOverrides);
      if (resolved !== undefined && next.advanced?.effectiveValues) {
        next.advanced.effectiveValues[path] = resolved;
      }
    });

    if (next.advanced.fields) {
      next.advanced.fields = next.advanced.fields.map((field) => ({
        ...field,
        effectiveValue: resolveFieldValue(document, field, cleanedOverrides),
      }));
    }
  }

  return next;
}

function materializeGameModeSummary(
  summary: GameModeSummary,
  cleanedOverrides: Record<string, JsonValue>,
): GameModeSummary {
  const nextSummary = cloneJson(summary);
  const nextVaulted = cleanedOverrides.vaultedAugments;
  if (!Array.isArray(nextVaulted) || !nextSummary.vaultedAugments) {
    return nextSummary;
  }

  const vaultedIds = new Set<number>();
  for (const value of nextVaulted) {
    if (typeof value === "number" && Number.isFinite(value)) {
      vaultedIds.add(value);
      continue;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        vaultedIds.add(parsed);
      }
    }
  }

  const seenIds = new Set<number>();
  nextSummary.vaultedAugments = nextSummary.vaultedAugments.map((entry) => {
    seenIds.add(entry.augmentId);
    return {
      ...entry,
      vaulted: vaultedIds.has(entry.augmentId),
    };
  });

  for (const augmentId of vaultedIds) {
    if (seenIds.has(augmentId)) {
      continue;
    }
    nextSummary.vaultedAugments.push({
      augmentId,
      displayName: `Augment ${augmentId}`,
      subtitle: `ID ${augmentId}`,
      vaulted: true,
    });
  }

  return nextSummary;
}

function materializeTextTokens(
  document: RuntimeDocument,
  tokens: TextToken[],
  cleanedOverrides: Record<string, JsonValue>,
): TextToken[] {
  return tokens.map((token) => {
    if (!token.sourcePath) {
      return token;
    }

    const resolvedPreview = resolveOverrideValue(
      document,
      token.sourcePath,
      token.previewValue,
      defaultValueForPath(document, token.sourcePath),
      cleanedOverrides,
    );

    return {
      ...token,
      previewValue: resolvedPreview ?? token.previewValue,
      previewText: stringifyJsonValue(resolvedPreview ?? token.previewValue) ?? token.previewText,
    };
  });
}

function materializeCardPreview(
  document: RuntimeDocument,
  preview: CardPreview,
  cleanedOverrides: Record<string, JsonValue>,
  tokens: TextToken[],
): CardPreview {
  const originalTokens = document.textTokens ?? [];
  const titleOverride = resolvePreviewTextOverride(document, cleanedOverrides, [
    "displayName",
    "name",
    "title",
    "label",
  ]);
  const shortOverride = resolvePreviewTextOverride(document, cleanedOverrides, [
    "shortDescription",
    "subtitle",
    "shortText",
  ]);
  const descriptionOverride = resolvePreviewTextOverride(document, cleanedOverrides, [
    "description",
    "body",
    "text",
  ]);
  const tokenValueMap = buildTokenPreviewValueMap(tokens);
  const originalTokenValueMap = buildTokenPreviewValueMap(originalTokens);
  const iconOverride = resolvePreviewIconOverride(document, cleanedOverrides);

  return {
    ...preview,
    title: titleOverride ?? preview.title,
    shortDescription: shortOverride ?? preview.shortDescription,
    description: descriptionOverride ?? preview.description,
    iconReference: iconOverride?.iconReference ?? preview.iconReference,
    iconPreviewPath: iconOverride?.iconPreviewPath ?? preview.iconPreviewPath,
    iconCropX: iconOverride?.iconCropX ?? preview.iconCropX,
    iconCropY: iconOverride?.iconCropY ?? preview.iconCropY,
    iconCropWidth: iconOverride?.iconCropWidth ?? preview.iconCropWidth,
    iconCropHeight: iconOverride?.iconCropHeight ?? preview.iconCropHeight,
    iconSourceWidth: iconOverride?.iconSourceWidth ?? preview.iconSourceWidth,
    iconSourceHeight: iconOverride?.iconSourceHeight ?? preview.iconSourceHeight,
    iconStatus: iconOverride ? "resolved" : preview.iconStatus,
    largeCard: materializeCardPreviewVariant(
      preview.largeCard,
      titleOverride ?? preview.title,
      shortOverride ?? preview.shortDescription,
      descriptionOverride ?? preview.description,
      preview.statLines,
      tokenValueMap,
      originalTokenValueMap,
      iconOverride,
    ),
    compactCard: materializeCardPreviewVariant(
      preview.compactCard,
      titleOverride ?? preview.title,
      shortOverride ?? preview.shortDescription,
      descriptionOverride ?? preview.description,
      preview.statLines,
      tokenValueMap,
      originalTokenValueMap,
      iconOverride,
    ),
    richTextRuns: materializeCardRichTextRuns(preview.richTextRuns, tokenValueMap),
    statLines: preview.statLines?.map((line) => {
      const comparableLabel = normalizeLabelKey(line.label);
      const nextValue = tokenValueMap.get(comparableLabel);
      const originalValue = originalTokenValueMap.get(comparableLabel);
      if (nextValue !== undefined && originalValue !== undefined && line.value === originalValue) {
        return {
          ...line,
          value: nextValue,
        };
      }
      return line;
    }),
  };
}

function materializeCardPreviewVariant(
  variant: CardPreviewVariant | null | undefined,
  fallbackTitle: string | undefined,
  fallbackShortDescription: string | undefined,
  fallbackDescription: string | undefined,
  fallbackStatLines: CardPreview["statLines"],
  tokenValueMap: Map<string, string>,
  originalTokenValueMap: Map<string, string>,
  iconOverride?: ResolvedPreviewIconOverride,
): CardPreviewVariant | null | undefined {
  if (!variant) {
    return variant;
  }

  return {
    ...variant,
    title: fallbackTitle ?? variant.title,
    shortDescription: fallbackShortDescription ?? variant.shortDescription,
    description: fallbackDescription ?? variant.description,
    iconReference: iconOverride?.iconReference ?? variant.iconReference,
    iconPreviewPath: iconOverride?.iconPreviewPath ?? variant.iconPreviewPath,
    iconCropX: iconOverride?.iconCropX ?? variant.iconCropX,
    iconCropY: iconOverride?.iconCropY ?? variant.iconCropY,
    iconCropWidth: iconOverride?.iconCropWidth ?? variant.iconCropWidth,
    iconCropHeight: iconOverride?.iconCropHeight ?? variant.iconCropHeight,
    iconSourceWidth: iconOverride?.iconSourceWidth ?? variant.iconSourceWidth,
    iconSourceHeight: iconOverride?.iconSourceHeight ?? variant.iconSourceHeight,
    richTextRuns: materializeCardRichTextRuns(variant.richTextRuns, tokenValueMap),
    statLines: (variant.statLines ?? fallbackStatLines)?.map((line) => {
      const comparableLabel = normalizeLabelKey(line.label);
      const nextValue = tokenValueMap.get(comparableLabel);
      const originalValue = originalTokenValueMap.get(comparableLabel);
      if (nextValue !== undefined && originalValue !== undefined && line.value === originalValue) {
        return {
          ...line,
          value: nextValue,
        };
      }
      return line;
    }),
  };
}

function materializeCardRichTextRuns(
  runs: CardRichTextRun[] | undefined,
  tokenValueMap: Map<string, string>,
): CardRichTextRun[] | undefined {
  if (!runs?.length) {
    return runs;
  }

  const tokenEntries = Array.from(tokenValueMap.entries()).filter(([, value]) => Boolean(value));
  return runs.map((run) => {
    let nextText = run.text ?? "";
    for (const [labelKey, previewValue] of tokenEntries) {
      if (!previewValue) {
        continue;
      }
      const candidates = buildLabelCandidates(labelKey);
      for (const candidate of candidates) {
        if (candidate && nextText.includes(candidate)) {
          nextText = nextText.split(candidate).join(previewValue);
        }
      }
    }

    return {
      ...run,
      text: nextText,
    };
  });
}

function resolvePreviewTextOverride(
  document: RuntimeDocument,
  cleanedOverrides: Record<string, JsonValue>,
  candidatePaths: string[],
): string | undefined {
  for (const path of candidatePaths) {
    const resolved = resolveOverrideValue(
      document,
      path,
      cleanedOverrides[path],
      defaultValueForPath(document, path),
      cleanedOverrides,
    );
    const text = coercePreviewTextValue(resolved);
    if (text !== undefined) {
      return text;
    }
  }

  return undefined;
}

interface ResolvedPreviewIconOverride {
  iconReference?: string;
  iconPreviewPath?: string;
  iconCropX?: number;
  iconCropY?: number;
  iconCropWidth?: number;
  iconCropHeight?: number;
  iconSourceWidth?: number;
  iconSourceHeight?: number;
}

function resolvePreviewIconOverride(
  document: RuntimeDocument,
  cleanedOverrides: Record<string, JsonValue>,
): ResolvedPreviewIconOverride | undefined {
  const iconReference = resolvePreviewIconReference(document, cleanedOverrides);
  if (!iconReference) {
    return undefined;
  }

  const matchingChoice = document.iconChoices?.find((choice) => matchesIconChoiceReference(choice, iconReference));
  if (!matchingChoice) {
    return {
      iconReference,
    };
  }

  return {
    iconReference,
    iconPreviewPath: matchingChoice.previewPath ?? undefined,
    iconCropX: matchingChoice.cropX ?? undefined,
    iconCropY: matchingChoice.cropY ?? undefined,
    iconCropWidth: matchingChoice.cropWidth ?? undefined,
    iconCropHeight: matchingChoice.cropHeight ?? undefined,
    iconSourceWidth: matchingChoice.sourceWidth ?? undefined,
    iconSourceHeight: matchingChoice.sourceHeight ?? undefined,
  };
}

function resolvePreviewIconReference(
  document: RuntimeDocument,
  cleanedOverrides: Record<string, JsonValue>,
): string | undefined {
  const candidatePaths = document.quickEdit
    ?.filter((item) => item.editable !== false)
    .map((item) => item.path)
    .filter((path) => isPreviewIconPath(path));

  if (candidatePaths?.length) {
    for (const path of candidatePaths) {
      const resolved = resolveOverrideValue(
        document,
        path,
        cleanedOverrides[path],
        defaultValueForPath(document, path),
        cleanedOverrides,
      );
      const reference = stringifyJsonValue(resolved)?.trim();
      if (reference) {
        return reference;
      }
    }
  }

  const directIcon = stringifyJsonValue(cleanedOverrides["configuration.icon"])?.trim();
  if (directIcon) {
    return directIcon;
  }

  return undefined;
}

function isPreviewIconPath(path: string | undefined): boolean {
  const normalized = (path ?? "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    normalized === "configuration.icon" ||
    normalized.endsWith(".icon") ||
    normalized.includes("iconreference") ||
    normalized.includes("sprite") ||
    normalized.includes("icon")
  );
}

function matchesIconChoiceReference(choice: IconChoice, currentValue: string): boolean {
  const normalized = currentValue.trim().toLowerCase();
  const candidates = [
    choice.reference,
    choice.key,
    choice.value,
    choice.passiveKey,
    choice.sourcePassiveKey,
    choice.spriteName,
  ];

  return candidates.some((candidate) => candidate?.trim().toLowerCase() === normalized);
}

function coercePreviewTextValue(value: JsonValue | undefined): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? resolveFallbackText(trimmed) ?? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function buildTokenPreviewValueMap(tokens: TextToken[]): Map<string, string> {
  const tokenMap = new Map<string, string>();
  for (const token of tokens) {
    const comparableLabel = normalizeLabelKey(token.label);
    const previewValue = stringifyJsonValue(token.previewValue) ?? token.previewText;
    if (!comparableLabel || previewValue === undefined) {
      continue;
    }
    tokenMap.set(comparableLabel, previewValue);
  }
  return tokenMap;
}

function buildLabelCandidates(labelKey: string): string[] {
  switch (labelKey) {
    case "health":
      return ["%health%"];
    case "damage":
      return ["%damage%"];
    case "cooldown":
    case "cooldownreduction":
      return ["%cooldown%"];
    case "poison":
      return ["%poison%"];
    case "burn":
      return ["%burn%"];
    default:
      return [];
  }
}

function normalizeLabelKey(value: string | undefined): string {
  return (value ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function stringifyJsonValue(value: JsonValue | string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

export function toEditableOverrideMap(document: RuntimeDocument): Record<string, JsonValue> {
  return cloneJson(document.overrides ?? {});
}

export function setObjectPath(root: JsonObject, path: string, value: JsonValue): JsonObject {
  const clone = cloneJson(root);
  const segments = path.split(".");
  let current: JsonObject = clone;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const nextValue = current[segment];
    if (!isJsonObject(nextValue)) {
      current[segment] = {};
    }
    current = current[segment] as JsonObject;
  }

  current[segments[segments.length - 1]] = value;
  return clone;
}



/* ==========================================================================
   Phase 3 Task 5 — Universal Field Renderer Support
   --------------------------------------------------------------------------
   `buildEditableFieldList(doc)` returns a single deduplicated list of every
   editable field on a runtime document, drawn from quickEdit + simpleSettings
   + advanced.fields. Each entry carries a `provenance` tag so the UI can
   render small badges (Quick / Simple / Advanced).

   Addresses agent-15-full-edit-surface-audit findings:
   - Only first 4-6 quick edits shown inline
   - simpleSettings.groups[].entries mostly hidden
   - advanced.fields never rendered in Change at all
   ========================================================================== */

export type EditableFieldProvenance = "quick" | "simple" | "advanced";

export interface EditableField {
  /** Dotted/bracketed path identifying the field on the document. */
  path: string;
  /** Display label as defined by the source entry. */
  label: string;
  /** Optional helper text. */
  helpText?: string;
  /** Where this field originated. */
  provenance: EditableFieldProvenance;
  /** Resolved current value (overrides → effective → standard). */
  currentValue: JsonValue | undefined;
  /** The default the field would revert to when reset. */
  defaultValue: JsonValue | undefined;
  /** The standard pre-override value (for display in tooltips). */
  standardValue: JsonValue | undefined;
  /** Type hint for the value, e.g. "number", "boolean", "json". */
  valueType?: string;
  /** Whether the user has overridden this field. */
  hasOverride: boolean;
  /** Optional reference choices, simple settings entries, or advanced field metadata. */
  source: QuickEditEntry | SimpleGroupEntry | AdvancedField;
}

interface BuildOptions {
  /** Optional draft overrides; defaults to the document's saved overrides. */
  draftOverrides?: Record<string, JsonValue>;
  /** When set, fields whose `path` matches this string are excluded — EditorPage routes the icon to the Card Art chooser. */
  excludeIconPath?: string;
}

/**
 * Returns a single, deduplicated list of every editable field on the document.
 * Quick wins, then simple settings, then advanced fields, with later sources
 * skipped if the same `path` already appears.
 *
 * Used by EditorPage in embedded mode to render the *complete* edit surface
 * instead of slicing to 4/6 quick edits.
 */
export function buildEditableFieldList(
  document: RuntimeDocument,
  options: BuildOptions = {},
): EditableField[] {
  const { draftOverrides, excludeIconPath } = options;
  const overrides = draftOverrides ?? document.overrides ?? {};
  const seen = new Set<string>();
  const result: EditableField[] = [];

  // 1) Quick edits
  if (document.quickEdit) {
    for (const entry of document.quickEdit) {
      if (!entry.path) continue;
      if (seen.has(entry.path)) continue;
      if (excludeIconPath && entry.path === excludeIconPath) continue;
      seen.add(entry.path);
      const current = resolveOverrideValue(document, entry.path, entry.value, entry.defaultValue, overrides);
      result.push({
        path: entry.path,
        label: entry.setting ?? entry.path,
        helpText: entry.whatItDoes,
        provenance: "quick",
        currentValue: current,
        defaultValue: entry.defaultValue,
        standardValue: entry.value,
        valueType: entry.valueType,
        hasOverride: hasOwnKey(overrides, entry.path),
        source: entry,
      });
    }
  }

  // 2) Simple settings
  if (document.simpleSettings?.groups) {
    for (const group of document.simpleSettings.groups) {
      for (const entry of group.entries) {
        if (!entry.path) continue;
        if (seen.has(entry.path)) continue;
        if (excludeIconPath && entry.path === excludeIconPath) continue;
        seen.add(entry.path);
        const current = resolveOverrideValue(document, entry.path, entry.currentValue, entry.defaultValue, overrides);
        result.push({
          path: entry.path,
          label: entry.name ?? entry.path,
          helpText: entry.description,
          provenance: "simple",
          currentValue: current,
          defaultValue: entry.defaultValue,
          standardValue: entry.currentValue,
          valueType: entry.valueType,
          hasOverride: hasOwnKey(overrides, entry.path),
          source: entry,
        });
      }
    }
  }

  // 3) Advanced fields
  if (document.advanced?.fields) {
    for (const field of document.advanced.fields) {
      if (!field.path) continue;
      if (seen.has(field.path)) continue;
      if (excludeIconPath && field.path === excludeIconPath) continue;
      seen.add(field.path);
      const current = resolveOverrideValue(
        document,
        field.path,
        field.effectiveValue,
        field.defaultValue ?? document.advanced.defaults?.[field.path],
        overrides,
      );
      result.push({
        path: field.path,
        label: field.label ?? field.path,
        helpText: field.description,
        provenance: "advanced",
        currentValue: current,
        defaultValue: field.defaultValue ?? document.advanced.defaults?.[field.path],
        standardValue: field.effectiveValue,
        valueType: field.valueType,
        hasOverride: hasOwnKey(overrides, field.path),
        source: field,
      });
    }
  }

  return result;
}

/**
 * Returns a count summary of the editable surface — useful for header chips
 * like "12 fields (4 quick, 6 simple, 2 advanced)".
 */
export function summarizeEditableFields(document: RuntimeDocument): {
  total: number;
  quick: number;
  simple: number;
  advanced: number;
  withOverrides: number;
} {
  const list = buildEditableFieldList(document);
  return {
    total: list.length,
    quick: list.filter((f) => f.provenance === "quick").length,
    simple: list.filter((f) => f.provenance === "simple").length,
    advanced: list.filter((f) => f.provenance === "advanced").length,
    withOverrides: list.filter((f) => f.hasOverride).length,
  };
}
