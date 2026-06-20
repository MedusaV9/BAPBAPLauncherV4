const fs = require("node:fs");
const path = require("node:path");

const {
  pathExists,
  readJson,
  fileMtimeMs,
  relativeToWorkspace,
  collectFiles,
  normalizePath,
} = require("./shared.cjs");

const indexItemsCache = new Map();
const bundledWorkspaceRoot = path.resolve(__dirname, "..", "default-workspace");

async function buildCatalog(workspace) {
  const groups = await Promise.all([
    scanGroup(workspace, "augments", "Augments", path.join(workspace.runtimeRoot, "Passives"), false),
    scanGroup(workspace, "items", "Items", path.join(workspace.runtimeRoot, "Items"), false),
    scanGroup(workspace, "managers", "Managers", path.join(workspace.runtimeRoot, "Managers"), false),
    scanGroup(workspace, "characters", "Characters", path.join(workspace.runtimeRoot, "Characters"), true),
    scanGroup(workspace, "gamemode", "Game Mode", path.join(workspace.runtimeRoot, "ArenaSettings"), true),
    scanGroup(workspace, "custom", "Custom Augments", path.join(workspace.customRoot, "Augments"), false),
    scanGroup(workspace, "nativeui", "Dev Settings", workspace.nativeUiRoot, true),
  ]);
  return groups;
}

function buildSummary(catalog) {
  const summary = {
    augmentCount: 0,
    itemCount: 0,
    managerCount: 0,
    characterCount: 0,
    customCount: 0,
    nativeUiCount: 0,
    totalCount: 0,
  };

  for (const group of catalog) {
    if (group.key === "augments") summary.augmentCount = group.count;
    if (group.key === "items") summary.itemCount = group.count;
    if (group.key === "managers") summary.managerCount = group.count;
    if (group.key === "characters") summary.characterCount = group.count;
    if (group.key === "custom") summary.customCount = group.count;
    if (group.key === "nativeui") summary.nativeUiCount = group.count;
    summary.totalCount += group.count;
  }

  return summary;
}

async function readLibraryMetadata(workspace) {
  const warnings = [];
  const allOptionsSummary = await readMergedLibraryIndexSummary(
    workspace.libraryAllOptionsIndexPath,
    bundledLibraryPath("Library/AllOptions.index.json"),
    warnings,
  );
  const standardsSummary = await readMergedLibraryIndexSummary(
    workspace.libraryStandardsIndexPath,
    bundledLibraryPath("Library/Standards.index.json"),
    warnings,
  );
  const blocks = await readMergedIndexItems(
    workspace.libraryBlocksIndexPath,
    bundledLibraryPath("Library/Blocks.index.json"),
    warnings,
    (item) => readLibraryItemKey(item, ["blockId", "label"]),
  );
  const effects = await readMergedIndexItems(
    workspace.libraryEffectsIndexPath,
    bundledLibraryPath("Library/Effects.index.json"),
    warnings,
    (item) => readLibraryItemKey(item, ["effectId", "label"]),
  );
  const icons = await readMergedIndexItems(
    workspace.libraryIconsIndexPath,
    bundledLibraryPath("Library/Icons.index.json"),
    warnings,
    readIconCatalogKey,
  );
  const templates = await readMergedIndexItems(
    workspace.libraryTemplatesIndexPath,
    bundledLibraryPath("Library/Templates.index.json"),
    warnings,
    (item) => readLibraryItemKey(item, ["templatePassiveKey", "targetKey", "file", "label"]),
  );
  const sharedCollections = await readMergedIndexItems(
    workspace.libraryCollectionsSharedPath,
    bundledLibraryPath("Library/Collections.shared.json"),
    warnings,
    (item) => readLibraryItemKey(item, ["id", "label"]),
  );

  return {
    workspaceRoot: workspace.workspaceRoot,
    libraryRoot: workspace.libraryRoot,
    blocksIndexPath: pathIfExists(workspace.libraryBlocksIndexPath),
    effectsIndexPath: pathIfExists(workspace.libraryEffectsIndexPath),
    iconsIndexPath: pathIfExists(workspace.libraryIconsIndexPath),
    templatesIndexPath: pathIfExists(workspace.libraryTemplatesIndexPath),
    allOptionsIndexPath: pathIfExists(workspace.libraryAllOptionsIndexPath),
    standardsIndexPath: pathIfExists(workspace.libraryStandardsIndexPath),
    collectionsSharedPath: pathIfExists(workspace.libraryCollectionsSharedPath),
    allOptionsCount: allOptionsSummary.count,
    allOptionCategories: allOptionsSummary.categories,
    allOptionSources: allOptionsSummary.sources,
    allOptionSafetyLevels: allOptionsSummary.safetyLevels,
    standardCount: standardsSummary.count,
    standardEditableCount: standardsSummary.editableCount,
    standardTargetTypes: standardsSummary.targetTypes,
    standardValueTypes: standardsSummary.valueTypes,
    standardCategories: standardsSummary.categories,
    standardSources: standardsSummary.sources,
    standardSafetyLevels: standardsSummary.safetyLevels,
    blocks,
    effects,
    icons,
    templates,
    allOptions: [],
    sharedCollections,
    warnings,
  };
}

async function listLibraryEntries(workspace, request) {
  const items = await readMergedLibraryEntries(workspace);
  const search = normalizeSearch(request.search);
  const category = normalizeFilter(request.category);
  const source = normalizeFilter(request.source);
  const safety = normalizeFilter(request.safety);
  const targetType = normalizeFilter(request.targetType);
  const valueType = normalizeFilter(request.valueType);
  const editable = normalizeEditableFilter(request.editable);
  const optionIdSet = Array.isArray(request.optionIds) && request.optionIds.length
    ? new Set(request.optionIds)
    : null;
  const limit = Math.max(1, Number(request.limit ?? 200));

  const filtered = items.filter((item) =>
    matchLibraryEntry(item, { search, category, source, safety, targetType, valueType, editable, optionIdSet }),
  );
  filtered.sort((left, right) => libraryEntrySortKey(left).localeCompare(libraryEntrySortKey(right)));

  return {
    entries: filtered.slice(0, limit),
    totalCount: filtered.length,
    moreAvailable: filtered.length > limit,
  };
}

async function readMergedLibraryEntries(workspace) {
  return readMergedIndexItems(
    workspace.libraryAllOptionsIndexPath,
    bundledLibraryPath("Library/AllOptions.index.json"),
    [],
    (item) => readLibraryItemKey(item, ["optionId", "targetKey", "path", "label"]),
  );
}

async function readOperationCapabilities(workspace, absolutePath) {
  const raw = await readJson(absolutePath);
  const { capabilities, warnings } = analyzeOperationCapabilities(raw);

  return {
    absolutePath: normalizePath(absolutePath),
    relativePath: relativeToWorkspace(workspace, absolutePath),
    targetType: typeof raw.targetType === "string" ? raw.targetType : null,
    targetKey: typeof raw.targetKey === "string" ? raw.targetKey : null,
    displayName: typeof raw.displayName === "string" ? raw.displayName : null,
    editableCount: capabilities.filter((entry) => entry.kind === "edit").length,
    addableCount: capabilities.filter((entry) => entry.kind === "add").length,
    removableCount: capabilities.filter((entry) => entry.kind === "remove").length,
    swappableCount: capabilities.filter((entry) => entry.kind === "swap").length,
    warnings,
    capabilities,
    librarySuggestions: asArray(raw.librarySuggestions),
    librarySlots: asArray(raw.librarySlots),
    iconChoices: asArray(raw.iconChoices),
    nativeUiPlacement: raw.nativeUiPlacement ?? null,
  };
}

async function scanGroup(workspace, key, label, root, recursive) {
  const entries = (await pathExists(root))
    ? await collectJsonEntries(workspace, key, root, recursive)
    : [];
  entries.sort(
    (left, right) =>
      left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
      || left.relativePath.localeCompare(right.relativePath, undefined, { sensitivity: "base" }),
  );
  return { key, label, count: entries.length, entries };
}

async function collectJsonEntries(workspace, group, root, recursive) {
  const files = await collectFiles(root, recursive);
  const jsonFiles = files.filter(f => f.toLowerCase().endsWith(".json") && !path.basename(f).startsWith("_") && !path.basename(f).endsWith(".index.json"));

  // Process in parallel batches of 12
  const BATCH_SIZE = 12;
  const results = [];
  for (let i = 0; i < jsonFiles.length; i += BATCH_SIZE) {
    const batch = jsonFiles.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(async (filePath) => {
      try {
        const raw = await readJson(filePath);
        return await buildCatalogEntry(workspace, group, filePath, raw);
      } catch {
        return null;
      }
    }));
    results.push(...batchResults.filter(Boolean));
  }

  // Dedupe by targetKey — when the mod re-exports an ability/character target it
  // sometimes leaves behind both the old codename variant (e.g.
  // "00_Ability.json" with displayName "Ability[0] Ability1 (Ability)") AND
  // the new friendly variant ("00_Ability_1.json" with displayName "Anna /
  // Basic"). The friendly variant is the canonical one; the codename variant
  // is stale residue. We keep the better-scored entry per targetKey so the
  // SwapAbilityPage source list does not show every character twice.
  return dedupeCatalogEntriesByTargetKey(results);
}

function scoreCatalogEntryForDedupe(entry) {
  let score = 0;
  const title = (entry.title ?? "").trim();
  const displayName = (entry.displayName ?? "").trim();
  const relativePath = entry.relativePath ?? "";

  // Friendly displayNames like "Anna / Basic" win over codename-style ones.
  if (displayName && !/^Ability(?:\s|\[|$)/i.test(displayName)) score += 6;
  if (title && !/^Ability(?:\s|\[|$)/i.test(title)) score += 4;

  // The codename-style "Ability[0] Ability1 (Ability)" is the stale variant.
  if (/Ability\[\d+\]\s+Ability\d+/i.test(displayName)) score -= 8;
  if (/Ability\[\d+\]\s+Ability\d+/i.test(title)) score -= 8;

  // The "_1", "_2" … suffix is the newer file produced by re-export.
  if (/[\\/]\d+_Ability_\d+\.json$/i.test(relativePath)) score += 3;

  // Newer file wins ties.
  score += Math.min(5, Math.floor((entry.updatedAtMs ?? 0) / 1_000_000_000));

  return score;
}

function dedupeCatalogEntriesByTargetKey(entries) {
  const byKey = new Map();
  for (const entry of entries) {
    const key = (entry.targetKey ?? "").trim();
    if (!key) {
      // No targetKey → cannot safely collapse. Keep as-is.
      byKey.set(`__nokey__${entry.id}`, entry);
      continue;
    }
    const existing = byKey.get(key);
    if (!existing || scoreCatalogEntryForDedupe(entry) > scoreCatalogEntryForDedupe(existing)) {
      byKey.set(key, entry);
    }
  }
  return Array.from(byKey.values());
}

async function buildCatalogEntry(workspace, group, filePath, raw) {
  const relativePath = relativeToWorkspace(workspace, filePath);
  const cardPreview = raw?.cardPreview ?? {};
  const largeCard = cardPreview?.largeCard ?? {};
  const title = resolveCatalogTitle(raw, filePath);

  return {
    id: normalizePath(filePath),
    group,
    title,
    subtitle: buildCatalogSubtitle(group, raw?.targetType, relativePath),
    relativePath,
    absolutePath: normalizePath(filePath),
    targetType: typeof raw?.targetType === "string" ? raw.targetType : null,
    targetKey: typeof raw?.targetKey === "string" ? raw.targetKey : null,
    displayName: typeof raw?.displayName === "string" ? raw.displayName : null,
    iconPreviewPath: firstString([cardPreview.iconPreviewPath, largeCard.iconPreviewPath]) ?? null,
    iconCropX: firstNumber([cardPreview.iconCropX, largeCard.iconCropX]),
    iconCropY: firstNumber([cardPreview.iconCropY, largeCard.iconCropY]),
    iconCropWidth: firstNumber([cardPreview.iconCropWidth, largeCard.iconCropWidth]),
    iconCropHeight: firstNumber([cardPreview.iconCropHeight, largeCard.iconCropHeight]),
    iconSourceWidth: firstNumber([cardPreview.iconSourceWidth, largeCard.iconSourceWidth]),
    iconSourceHeight: firstNumber([cardPreview.iconSourceHeight, largeCard.iconSourceHeight]),
    tags: [group].filter(Boolean),
    quickEditCount: Array.isArray(raw?.quickEdit) ? raw.quickEdit.length : 0,
    hasQuickEdit: Array.isArray(raw?.quickEdit) && raw.quickEdit.length > 0,
    updatedAtMs: await fileMtimeMs(filePath),
  };
}

async function readIndexItems(indexPath, warnings) {
  try {
    return await readCachedIndexItems(indexPath);
  } catch (error) {
    warnings.push(error.message);
    return [];
  }
}

async function readLibraryIndexSummary(indexPath, warnings) {
  try {
    const items = await readCachedIndexItems(indexPath);
    return {
      count: items.length,
      categories: uniqueSorted(items.map((item) => item.category).filter(Boolean)),
      sources: uniqueSorted(items.map((item) => item.source).filter(Boolean)),
      safetyLevels: uniqueSorted(items.map((item) => item.riskLevel).filter(Boolean)),
      targetTypes: uniqueSorted(items.map((item) => item.targetType).filter(Boolean)),
      valueTypes: uniqueSorted(items.map((item) => item.valueType).filter(Boolean)),
      editableCount: items.filter((item) => item?.editable === true).length,
    };
  } catch (error) {
    warnings.push(error.message);
    return {
      count: 0,
      categories: [],
      sources: [],
      safetyLevels: [],
      targetTypes: [],
      valueTypes: [],
      editableCount: 0,
    };
  }
}

async function readMergedLibraryIndexSummary(primaryIndexPath, fallbackIndexPath, warnings) {
  const primarySummary = await readLibraryIndexSummary(primaryIndexPath, warnings);
  const fallbackSummary = await readLibraryIndexSummary(fallbackIndexPath, warnings);
  return {
    count: Math.max(primarySummary.count, fallbackSummary.count),
    categories: uniqueSorted([...primarySummary.categories, ...fallbackSummary.categories]),
    sources: uniqueSorted([...primarySummary.sources, ...fallbackSummary.sources]),
    safetyLevels: uniqueSorted([...primarySummary.safetyLevels, ...fallbackSummary.safetyLevels]),
    targetTypes: uniqueSorted([...primarySummary.targetTypes, ...fallbackSummary.targetTypes]),
    valueTypes: uniqueSorted([...primarySummary.valueTypes, ...fallbackSummary.valueTypes]),
    editableCount: Math.max(primarySummary.editableCount, fallbackSummary.editableCount),
  };
}

async function readMergedIndexItems(primaryIndexPath, fallbackIndexPath, warnings, keyResolver) {
  const primaryItems = await readIndexItems(primaryIndexPath, warnings);
  const fallbackItems = await readIndexItems(fallbackIndexPath, warnings);
  return mergeIndexedItems(primaryItems, fallbackItems, keyResolver);
}

function extractIndexItems(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    for (const key of ["items", "entries", "results", "allOptions", "icons", "templates", "blocks", "effects"]) {
      if (Array.isArray(value[key])) return value[key];
    }
  }
  return [];
}

async function readCachedIndexItems(indexPath) {
  if (!indexPath || !(await pathExists(indexPath))) {
    return [];
  }

  const cacheKey = normalizePath(indexPath);
  const mtimeMs = await fileMtimeMs(indexPath);
  const cached = indexItemsCache.get(cacheKey);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.items;
  }

  const items = extractIndexItems(await readJson(indexPath));
  indexItemsCache.set(cacheKey, { mtimeMs, items });
  return items;
}

function bundledLibraryPath(relativePath) {
  return path.join(bundledWorkspaceRoot, relativePath);
}

function mergeIndexedItems(primaryItems, fallbackItems, keyResolver) {
  const mergedByKey = new Map();

  for (const item of fallbackItems) {
    const key = keyResolver(item);
    if (!key) {
      continue;
    }
    mergedByKey.set(key, cloneJsonValue(item));
  }

  for (const item of primaryItems) {
    const key = keyResolver(item);
    if (!key) {
      continue;
    }
    const existing = mergedByKey.get(key);
    mergedByKey.set(key, existing ? mergeDefinedFields(existing, item) : cloneJsonValue(item));
  }

  return Array.from(mergedByKey.values());
}

function readLibraryItemKey(item, fields) {
  if (!item || typeof item !== "object") {
    return null;
  }
  for (const field of fields) {
    const candidate = item[field];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().toLowerCase();
    }
  }
  return null;
}

function readIconCatalogKey(item) {
  return readLibraryItemKey(item, [
    "reference",
    "key",
    "value",
    "passiveKey",
    "sourcePassiveKey",
    "spriteName",
    "label",
  ]);
}

function cloneJsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeDefinedFields(baseValue, overrideValue) {
  if (Array.isArray(baseValue) || Array.isArray(overrideValue)) {
    return cloneJsonValue(overrideValue);
  }
  if (!isPlainObject(baseValue) || !isPlainObject(overrideValue)) {
    return cloneJsonValue(overrideValue);
  }

  const result = { ...cloneJsonValue(baseValue) };
  for (const [key, value] of Object.entries(overrideValue)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeDefinedFields(result[key], value);
      continue;
    }
    result[key] = cloneJsonValue(value);
  }
  return result;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchLibraryEntry(item, { search, category, source, safety, targetType, valueType, editable, optionIdSet }) {
  if (category && item.category !== category) return false;
  if (source && item.source !== source) return false;
  if (safety && (item.riskLevel ?? "safe") !== safety) return false;
  if (targetType && (item.targetType ?? "") !== targetType) return false;
  if (valueType && (item.valueType ?? "") !== valueType) return false;
  if (editable === "editable" && item.editable !== true) return false;
  if (editable === "readonly" && item.editable !== false) return false;
  if (optionIdSet && !optionIdSet.has(item.optionId)) return false;
  if (!search) return true;

  const haystack = [
    item.label,
    item.description,
    item.displayName,
    item.resolvedName,
    item.path,
    item.category,
    item.sourceGroup,
    ...(Array.isArray(item.searchHints) ? item.searchHints : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(search);
}

function libraryEntrySortKey(item) {
  return [item.category ?? "", item.label ?? "", item.displayName ?? "", item.path ?? ""]
    .map((value) => String(value).toLowerCase())
    .join("|");
}

function analyzeOperationCapabilities(raw) {
  const capabilities = [];
  const warnings = [];
  const seen = new Set();

  for (const entry of asArray(raw.quickEdit)) {
    if (typeof entry?.path !== "string") continue;
    push(capabilities, seen, {
      kind: "edit",
      path: entry.path,
      label: entry.setting ?? entry.path,
      description: entry.whatItDoes,
      category: entry.category,
      valueType: entry.valueType,
      safe: true,
      riskLevel: "safe",
      currentValue: entry.value,
      defaultValue: entry.defaultValue,
    });
  }

  for (const group of asArray(raw?.simpleSettings?.groups)) {
    for (const entry of asArray(group?.entries)) {
      if (typeof entry?.path !== "string") continue;
      push(capabilities, seen, {
        kind: "edit",
        path: entry.path,
        label: entry.name ?? entry.path,
        description: entry.description,
        category: group.category,
        valueType: entry.valueType,
        safe: entry.editable !== false,
        riskLevel: entry.editable === false ? "advanced" : "safe",
        currentValue: entry.currentValue,
        defaultValue: entry.defaultValue,
      });
    }
  }

  for (const field of asArray(raw?.advanced?.fields)) {
    if (typeof field?.path !== "string") continue;
    push(capabilities, seen, {
      kind: "edit",
      path: field.path,
      label: field.label ?? field.path,
      description: field.description,
      category: field.category,
      valueType: field.valueType,
      safe: field.editable !== false,
      riskLevel: field.editable === false ? "advanced" : (field.riskLevel ?? "safe"),
      currentValue: field.effectiveValue,
      defaultValue: field.defaultValue,
    });
  }

  for (const suggestion of asArray(raw.librarySuggestions)) {
    const targetPath = suggestion?.targetPath ?? suggestion?.path;
    if (typeof targetPath !== "string") continue;
    const firstField = asArray(suggestion?.fields)[0] ?? {};
    push(capabilities, seen, {
      kind: suggestion.operationType ?? suggestion.kind ?? "add",
      path: targetPath,
      label: suggestion.label ?? targetPath,
      description: suggestion.description,
      category: suggestion.category,
      family: suggestion.family,
      valueType: firstField.valueType,
      safe: (suggestion.riskLevel ?? "safe") !== "advanced",
      riskLevel: suggestion.riskLevel ?? "safe",
      targetPath,
      defaultValue: firstField.defaultValue,
      options: Array.isArray(firstField.options) ? firstField.options : undefined,
      previewPath: suggestion.iconPreviewPath,
      libraryBlockId: suggestion.blockId ?? suggestion.id,
    });
  }

  for (const reference of asArray(raw.referenceChoices)) {
    if (typeof reference?.path !== "string") continue;
    push(capabilities, seen, {
      kind: "swap",
      path: reference.path,
      label: reference.label ?? reference.path,
      description: "Swap this reference to another compatible asset.",
      category: "reference",
      valueType: "reference",
      safe: true,
      riskLevel: "safe",
      currentValue: reference.currentReference,
      options: Array.isArray(reference.availableReferences)
        ? reference.availableReferences
        : Array.isArray(reference.suggestions)
          ? reference.suggestions
          : undefined,
      referenceType: reference.referenceType,
      previewLabel: reference.previewLabel,
      previewPath: reference.previewPath,
    });
  }

  walkValues(raw, "", 0, capabilities, warnings, seen);
  return { capabilities, warnings };
}

function walkValues(value, currentPath, depth, capabilities, warnings, seen) {
  if (depth > 7) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkValues(item, `${currentPath}[${index}]`, depth + 1, capabilities, warnings, seen));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if (isMetadataKey(key)) continue;
    const childPath = currentPath ? `${currentPath}.${key}` : key;

    if (Array.isArray(child)) {
      const label = humanizePathLabel(childPath);
      push(capabilities, seen, { kind: "add", path: childPath, label: `Add to ${label}`, category: "collection", valueType: "array", safe: true, riskLevel: "safe" });
      push(capabilities, seen, { kind: "remove", path: childPath, label: `Remove from ${label}`, category: "collection", valueType: "array", safe: true, riskLevel: "safe" });
      if (child.length) push(capabilities, seen, { kind: "duplicate", path: childPath, label: `Duplicate ${label}`, category: "collection", valueType: "array", safe: false, riskLevel: "medium" });
      child.forEach((item, index) => walkValues(item, `${childPath}[${index}]`, depth + 1, capabilities, warnings, seen));
      continue;
    }

    if (child && typeof child === "object") {
      walkValues(child, childPath, depth + 1, capabilities, warnings, seen);
      continue;
    }

    if (typeof child === "string" && looksLikeReference(key, child)) {
      push(capabilities, seen, { kind: "swap", path: childPath, label: humanizePathLabel(childPath), category: "reference", valueType: "reference", safe: true, riskLevel: "safe", currentValue: child, referenceType: "reference" });
    }

    push(capabilities, seen, {
      kind: "edit",
      path: childPath,
      label: humanizePathLabel(childPath),
      valueType: valueKind(child),
      safe: true,
      riskLevel: "safe",
      currentValue: child,
    });
  }

  if (warnings.length > 256) warnings.length = 256;
}

function push(capabilities, seen, capability) {
  const key = `${capability.kind}::${capability.path}`;
  if (seen.has(key)) return;
  seen.add(key);
  capabilities.push(capability);
}

function looksLikeReference(targetPath, value) {
  const lowered = String(targetPath).toLowerCase();
  return typeof value === "string" && value.includes(":") && (
    lowered.includes("passive")
    || lowered.includes("ability")
    || lowered.includes("prefab")
    || lowered.includes("behavior")
    || lowered.includes("behaviour")
    || lowered.includes("icon")
    || lowered.includes("effect")
  );
}

function isMetadataKey(key) {
  return [
    "schemaVersion", "targetType", "targetKey", "displayName", "resolvedName", "generatedAtUtc",
    "sourceRole", "applyTiming", "safetyLevel", "instructions", "uiCapabilities", "guidedActions",
    "nativeUiPlacement", "operations", "operationStatus", "overrides", "overrideStatus", "cardPreview",
    "textTokens", "sectionSummaries", "namedCollections", "removalCandidates",
  ].includes(key);
}

function buildCatalogSubtitle(group, targetType, relativePath) {
  if (group === "augments") return "Argument";
  if (group === "items") return "Item";
  if (group === "managers") return "Manager";
  if (group === "characters") {
    return relativePath
      .split("/")
      .slice(-2)
      .map((segment) => humanizeCatalogValue(path.basename(segment, path.extname(segment))))
      .filter(Boolean)
      .join(" / ");
  }
  if (group === "gamemode") return "Game mode config";
  if (group === "custom") return "Custom augment";
  if (group === "nativeui") return humanizeCatalogValue(targetType || "Dev settings");
  return humanizeCatalogValue(targetType || relativePath);
}

function humanizeFileName(value) {
  return humanizeCatalogValue(value);
}

function resolveCatalogTitle(raw, filePath) {
  const characterAbilityTitle = resolveCharacterAbilityCatalogTitle(raw);
  if (characterAbilityTitle) {
    return characterAbilityTitle;
  }

  for (const candidate of [raw?.resolvedName, raw?.displayName, raw?.targetKey]) {
    const humanized = humanizeCatalogValue(candidate);
    if (humanized) {
      return humanized;
    }
  }
  return humanizeCatalogValue(path.basename(filePath, path.extname(filePath)));
}

function resolveCharacterAbilityCatalogTitle(raw) {
  const targetType = typeof raw?.targetType === "string" ? raw.targetType.trim().toLowerCase() : "";
  const displayName = typeof raw?.displayName === "string" ? raw.displayName : "";
  const resolvedName = typeof raw?.resolvedName === "string" ? raw.resolvedName : "";
  if (targetType !== "characterability") {
    return null;
  }

  const preferredLabel = [displayName, resolvedName]
    .filter(Boolean)
    .map((value) => humanizeCatalogValue(value))
    .find((value) => value && !/^Ability\s+\d+$/i.test(value) && !/^Ability Slot\s+\d+$/i.test(value));
  if (preferredLabel) {
    return preferredLabel;
  }

  const targetKey = typeof raw?.targetKey === "string" ? raw.targetKey.trim() : "";
  const slotMatch = targetKey.match(/Ability\[(\d+)\]/i);
  if (!slotMatch) {
    return null;
  }

  const rawCharacterKey = targetKey.match(/^([^/]+)\//)?.[1] ?? "";
  const characterLabel = rawCharacterKey
    ? humanizeCatalogValue(rawCharacterKey.split("#")[0] ?? rawCharacterKey)
    : "Character";
  const slotIndex = Number(slotMatch[1]);
  if (!Number.isFinite(slotIndex)) {
    return characterLabel;
  }
  return `${characterLabel} / Ability Slot ${slotIndex + 1}`;
}

function humanizeCatalogValue(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  const cleaned = value.trim();
  const normalized = cleaned
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
    return cleaned;
  }

  return normalized
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function humanizePathLabel(rawPath) {
  return String(rawPath).replace(/\[(\d+)\]/g, " $1 ").replace(/[._]/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (char) => char.toUpperCase());
}

function valueKind(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstString(values) {
  return values.find((value) => typeof value === "string" && value.trim()) ?? null;
}

function firstNumber(values) {
  return values.find((value) => typeof value === "number" && Number.isFinite(value)) ?? null;
}

function normalizeSearch(value) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function normalizeFilter(value) {
  return typeof value === "string" && value.trim() && value.toLowerCase() !== "all" ? value : null;
}

function normalizeEditableFilter(value) {
  if (typeof value !== "string") {
    return "all";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "editable" || normalized === "readonly") {
    return normalized;
  }
  return "all";
}

function uniqueSorted(values) {
  return Array.from(new Set(values.map((value) => String(value)))).sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

function pathIfExists(targetPath) {
  return fs.existsSync(targetPath) ? normalizePath(targetPath) : null;
}

module.exports = {
  buildCatalog,
  buildSummary,
  readLibraryMetadata,
  listLibraryEntries,
  readOperationCapabilities,
};
