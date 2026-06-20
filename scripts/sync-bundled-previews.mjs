import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const appDir = path.resolve(import.meta.dirname, "..");
const generatedDir = path.join(
  appDir,
  "src",
  "renderer",
  "rebalance-vendor",
  "editor",
  "generated",
);
const bundledPreviewPublicDir = path.join(appDir, "src", "renderer", "public", "rebalance-previews");
const coreBundledPreviewSourceDirs = [
  path.join(appDir, "src", "renderer", "rebalance-vendor", "assets", "gamecard", "textures"),
  path.join(appDir, "src", "renderer", "rebalance-vendor", "assets", "gamecard", "fonts"),
];
const bundledCorePreviewAssets = [
  {
    sourcePath: path.join(appDir, "src", "renderer", "rebalance-vendor", "assets", "gamecard", "textures", "content-border.png"),
    aliases: ["content-border.png", "gamecard/content-border"],
  },
  {
    sourcePath: path.join(appDir, "src", "renderer", "rebalance-vendor", "assets", "gamecard", "textures", "daily-rare-bg.png"),
    aliases: ["daily-rare-bg.png", "gamecard/daily-rare-bg"],
  },
  {
    sourcePath: path.join(appDir, "src", "renderer", "rebalance-vendor", "assets", "gamecard", "textures", "fractals_option_card.png"),
    aliases: ["fractals_option_card.png", "gamecard/fractals-option-card"],
  },
  {
    sourcePath: path.join(appDir, "src", "renderer", "rebalance-vendor", "assets", "gamecard", "textures", "inspect-card-template.png"),
    aliases: ["inspect-card-template.png", "gamecard/inspect-card-template"],
  },
  {
    sourcePath: path.join(appDir, "src", "renderer", "rebalance-vendor", "assets", "gamecard", "textures", "RewardObtained_BG.png"),
    aliases: ["rewardobtained_bg.png", "rewardobtained_bg", "gamecard/reward-obtained-bg"],
  },
  {
    sourcePath: path.join(appDir, "src", "renderer", "rebalance-vendor", "assets", "gamecard", "fonts", "Archivo-Black.ttf"),
    aliases: ["archivo-black.ttf", "gamecard/font-title"],
  },
  {
    sourcePath: path.join(appDir, "src", "renderer", "rebalance-vendor", "assets", "gamecard", "fonts", "Archivo-Medium.ttf"),
    aliases: ["archivo-medium.ttf", "gamecard/font-body"],
  },
];

const knownFallbackRoots = [
  "C:\\Users\\Administrator\\Downloads\\BapBapRebalnce\\Gamefiles\\Latest\\UserData\\BalanceMod",
  "C:\\Users\\Administrator\\Downloads\\ToolTab Bap\\ToolTab_AI_Handoff\\bundle\\runtime-samples\\BalanceMod",
];

const iconThemes = ["ember", "violet", "sapphire", "gold", "azure", "coral"];
const previewFieldKeys = new Set([
  "previewPath",
  "previewIconPath",
  "previewAbsolutePath",
  "iconPreviewPath",
  "backgroundPreviewPath",
  "framePreviewPath",
  "overlayPreviewPath",
  "titleFontPath",
  "bodyFontPath",
]);
const generatedOutputPaths = [
  path.join(generatedDir, "bundledPreviewManifest.json"),
  path.join(generatedDir, "bundledIconPreviewLookup.json"),
  path.join(generatedDir, "bundledLocalizationLookup.json"),
  path.join(generatedDir, "bundledPreviewFileLookup.json"),
  path.join(generatedDir, "bundledCustomIconAssets.json"),
];

async function main() {
  if (process.env.V2_FORCE_PREVIEW_SYNC !== "1" && await canReuseExistingBundledPreviews()) {
    console.log("sync-bundled-previews: reuse existing bundled preview artifacts");
    return;
  }

  const candidateRoots = await discoverCandidateRoots();
  const sourceRoots = [];
  const iconEntries = new Map();
  const localizationEntries = new Map();
  const previewFileEntries = new Map();
  const copiedPreviewFilesBySource = new Map();
  const copiedPreviewFilesByName = new Map();
  const customIconEntries = new Map();

  await ensureEmptyDirectory(bundledPreviewPublicDir);
  await mkdir(bundledPreviewPublicDir, { recursive: true });
  await ingestCoreBundledPreviewAssets(previewFileEntries, copiedPreviewFilesBySource, copiedPreviewFilesByName);

  for (const root of candidateRoots) {
    if (!(await pathExists(root))) {
      continue;
    }

    sourceRoots.push(root);
    await ingestBalanceRoot(
      root,
      iconEntries,
      localizationEntries,
      previewFileEntries,
      copiedPreviewFilesBySource,
      copiedPreviewFilesByName,
      customIconEntries,
    );
    await ingestBundledPreviewFiles(root, previewFileEntries, copiedPreviewFilesBySource, copiedPreviewFilesByName);
  }

  await seedBundledCorePreviewAssets(previewFileEntries, copiedPreviewFilesBySource, copiedPreviewFilesByName);

  if (!sourceRoots.length) {
    console.warn("sync-bundled-previews: no source roots found; using bundled core preview assets only.");
  }

  const bundledPreviewManifest = {
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    sourceRoots: ["bundled-default-workspace"],
    defaultCard: {
      backgroundAssetId: "gamecard/daily-rare-bg",
      frameAssetId: "gamecard/content-border",
      overlayAssetId: "gamecard/content-border",
      templateAssetId: "gamecard/inspect-card-template",
      titleFontAssetId: "gamecard/font-title",
      bodyFontAssetId: "gamecard/font-body",
    },
    kindDefaults: {
      augment: {
        backgroundAssetId: "gamecard/daily-rare-bg",
        frameAssetId: "gamecard/content-border",
        overlayAssetId: "gamecard/content-border",
      },
      item: {
        backgroundAssetId: "gamecard/reward-obtained-bg",
        frameAssetId: "gamecard/content-border",
        overlayAssetId: "gamecard/content-border",
      },
    },
  };

  const bundledIconPreviewLookup = {
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    sourceRoots: ["bundled-default-workspace"],
    entries: Array.from(new Set(iconEntries.values())).sort((left, right) => left.label.localeCompare(right.label)),
  };

  const bundledLocalizationLookup = {
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    sourceRoots: ["bundled-default-workspace"],
    entries: Object.fromEntries(
      Array.from(localizationEntries.entries()).sort((left, right) => left[0].localeCompare(right[0])),
    ),
  };
  const bundledPreviewFileLookup = {
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    sourceRoots: ["bundled-default-workspace"],
    entries: Object.fromEntries(
      Array.from(previewFileEntries.entries()).sort((left, right) => left[0].localeCompare(right[0])),
    ),
  };
  const bundledCustomIconAssets = {
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    sourceRoots: ["bundled-default-workspace"],
    entries: Array.from(customIconEntries.values())
      .map(entry => sanitizeBundledCustomIconEntry(entry, previewFileEntries))
      .filter(Boolean)
      .sort((left, right) => {
        const leftKey = `${left.passiveKey ?? ""}|${left.spriteName ?? ""}|${left.previewPath ?? ""}`;
        const rightKey = `${right.passiveKey ?? ""}|${right.spriteName ?? ""}|${right.previewPath ?? ""}`;
        return leftKey.localeCompare(rightKey);
      }),
  };

  await mkdir(generatedDir, { recursive: true });
  await writeJson(
    path.join(generatedDir, "bundledPreviewManifest.json"),
    bundledPreviewManifest,
  );
  await writeJson(
    path.join(generatedDir, "bundledIconPreviewLookup.json"),
    bundledIconPreviewLookup,
  );
  await writeJson(
    path.join(generatedDir, "bundledLocalizationLookup.json"),
    bundledLocalizationLookup,
  );
  await writeJson(
    path.join(generatedDir, "bundledPreviewFileLookup.json"),
    bundledPreviewFileLookup,
  );
  await writeJson(
    path.join(generatedDir, "bundledCustomIconAssets.json"),
    bundledCustomIconAssets,
  );

  console.log(
    `sync-bundled-previews: OK (${bundledIconPreviewLookup.entries.length} icon entries, ${Object.keys(
      bundledLocalizationLookup.entries,
    ).length} localization entries, ${Object.keys(bundledPreviewFileLookup.entries).length} preview file keys, ${bundledCustomIconAssets.entries.length} bundled custom icon assets)`,
  );
}

async function ingestCoreBundledPreviewAssets(previewFileEntries, copiedBySource, copiedByName) {
  for (const sourceDir of coreBundledPreviewSourceDirs) {
    if (!(await pathExists(sourceDir))) {
      continue;
    }

    const entries = await readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      await registerBundledPreviewFile(path.join(sourceDir, entry.name), previewFileEntries, copiedBySource, copiedByName);
    }
  }
}

async function ingestBalanceRoot(
  root,
  iconEntries,
  localizationEntries,
  previewFileEntries,
  copiedBySource,
  copiedByName,
  customIconEntries,
) {
  for (const filePath of await collectFilesByName(root, "Icons.index.json")) {
    await ingestIconsIndex(filePath, iconEntries, previewFileEntries, copiedBySource, copiedByName, customIconEntries);
  }

  for (const segment of ["Library", "Runtime", "Custom"]) {
    const segmentRoot = path.join(root, segment);
    if (await pathExists(segmentRoot)) {
      await ingestRuntimeDirectory(segmentRoot, iconEntries, localizationEntries);
    }
  }

  const customRoot = path.join(root, "Custom");
  if (await pathExists(customRoot)) {
    await ingestCustomIconDirectory(customRoot, iconEntries);
  }
}

async function ingestIconsIndex(
  filePath,
  iconEntries,
  previewFileEntries,
  copiedBySource,
  copiedByName,
  customIconEntries,
) {
  if (!(await pathExists(filePath))) {
    return;
  }

  const json = await readJson(filePath);
  for (const entry of json?.entries ?? []) {
    registerCustomIconEntry(customIconEntries, entry);

    if (typeof entry?.previewPath === "string" && entry.previewPath.trim()) {
      await registerBundledPreviewFile(entry.previewPath, previewFileEntries, copiedBySource, copiedByName);
    }

    const label = sanitizePreviewText(
      entry?.label ?? entry?.resolvedName ?? entry?.passiveKey ?? entry?.reference ?? entry?.spriteName,
    );
    if (!label) {
      continue;
    }

    registerIconEntry(iconEntries, {
      label,
      keys: [
        entry?.passiveKey,
        entry?.reference,
        entry?.spriteName,
        entry?.resolvedName,
        entry?.value,
        entry?.key,
      ],
    });
  }
}

async function ingestRuntimeDirectory(root, iconEntries, localizationEntries) {
  if (!(await pathExists(root))) {
    return;
  }

  for (const filePath of await collectJsonFiles(root)) {
    const json = await readJson(filePath);
    if (!json || typeof json !== "object") {
      continue;
    }

    const displayName = sanitizePreviewText(json.displayName ?? json.resolvedName ?? json.key ?? json.targetKey);
    if (displayName) {
      addLocalization(localizationEntries, json.targetKey, displayName);
      addLocalization(localizationEntries, json.key, displayName);
      addLocalization(localizationEntries, json.templatePassiveKey, displayName);
    }

    const previewTitle = sanitizePreviewText(json.cardPreview?.title);
    const previewShort = sanitizePreviewText(json.cardPreview?.shortDescription);
    const previewDescription = sanitizePreviewText(json.cardPreview?.description);

    const advancedValues = json.advanced?.effectiveValues;
    const hasPreviewBackedLocalizationContext = Boolean(
      json.cardPreview && (previewTitle || previewShort || previewDescription || displayName),
    );
    if (hasPreviewBackedLocalizationContext && advancedValues && typeof advancedValues === "object") {
      for (const [pathKey, rawValue] of Object.entries(advancedValues)) {
        if (typeof rawValue !== "string" || !rawValue.trim()) {
          continue;
        }
        if (pathKey.toLowerCase().includes("shortdescriptiontrkey")) {
          addLocalization(localizationEntries, rawValue, previewShort ?? previewDescription ?? previewTitle);
        } else if (pathKey.toLowerCase().includes("descriptiontrkey")) {
          addLocalization(localizationEntries, rawValue, previewDescription ?? previewShort ?? previewTitle);
        } else if (pathKey.toLowerCase().includes("displaynametrkey") || pathKey.toLowerCase().includes("nametrkey")) {
          addLocalization(localizationEntries, rawValue, previewTitle);
        }
      }
    }

    registerIconEntry(iconEntries, {
      label: displayName ?? previewTitle ?? "Unnamed",
      keys: [
        json.targetKey,
        json.key,
        json.templatePassiveKey,
        json.cardPreview?.iconReference,
        json.icon?.sourcePassiveKey,
      ],
    });

    for (const choice of json.iconChoices ?? []) {
      const label = sanitizePreviewText(
        choice?.label ?? choice?.description ?? choice?.passiveKey ?? choice?.reference ?? choice?.spriteName,
      );
      if (!label) {
        continue;
      }
      registerIconEntry(iconEntries, {
        label,
        keys: [
          choice?.value,
          choice?.label,
          choice?.key,
          choice?.reference,
          choice?.passiveKey,
          choice?.sourcePassiveKey,
          choice?.spriteName,
        ],
      });
    }
  }
}

async function ingestCustomIconDirectory(root, iconEntries) {
  if (!(await pathExists(root))) {
    return;
  }

  for (const filePath of await collectImageFiles(root)) {
    const extension = path.extname(filePath);
    const basename = path.basename(filePath, extension);
    const label = basename
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, match => match.toUpperCase());

    if (!label) {
      continue;
    }

    registerIconEntry(iconEntries, {
      label,
      keys: [
        basename,
        path.relative(root, filePath),
        `customicon:${basename}`,
        `customicon:${path.relative(root, filePath).replace(/\\/g, "/")}`,
      ],
    });
  }
}

async function ingestBundledPreviewFiles(root, previewFileEntries, copiedBySource, copiedByName) {
  const jsonFiles = await collectJsonFiles(root);

  if (!jsonFiles.length) {
    const customRoot = path.join(root, "Custom");
    if (await pathExists(customRoot)) {
      for (const filePath of await collectImageFiles(customRoot)) {
        await registerBundledPreviewFile(filePath, previewFileEntries, copiedBySource, copiedByName);
      }
    }
    return;
  }

  for (const filePath of jsonFiles) {
    const json = await readJson(filePath);
    await collectPreviewPaths(json, previewFileEntries, copiedBySource, copiedByName);
  }

  const customRoot = path.join(root, "Custom");
  if (await pathExists(customRoot)) {
    for (const filePath of await collectImageFiles(customRoot)) {
      await registerBundledPreviewFile(filePath, previewFileEntries, copiedBySource, copiedByName);
    }
  }
}

async function collectPreviewPaths(value, previewFileEntries, copiedBySource, copiedByName) {
  if (Array.isArray(value)) {
    for (const item of value) {
      await collectPreviewPaths(item, previewFileEntries, copiedBySource, copiedByName);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, entryValue] of Object.entries(value)) {
    if (previewFieldKeys.has(key) && typeof entryValue === "string") {
      await registerBundledPreviewFile(entryValue, previewFileEntries, copiedBySource, copiedByName);
      continue;
    }
    await collectPreviewPaths(entryValue, previewFileEntries, copiedBySource, copiedByName);
  }
}

async function registerBundledPreviewFile(rawPath, previewFileEntries, copiedBySource, copiedByName) {
  const normalizedLookupKey = normalizePreviewFileKey(rawPath);
  if (!normalizedLookupKey) {
    return;
  }

  const sourcePath = resolveFilesystemPreviewPath(rawPath);
  if (!sourcePath || !/\.(png|jpe?g|webp|gif|svg|ttf|otf|woff2?)$/i.test(sourcePath) || !(await pathExists(sourcePath))) {
    return;
  }

  const sourceKey = normalizePreviewFileKey(sourcePath);
  if (sourceKey && copiedBySource.has(sourceKey)) {
    const copiedPath = copiedBySource.get(sourceKey);
    for (const alias of buildPreviewLookupAliases(sourcePath, normalizedLookupKey, sourceKey)) {
      previewFileEntries.set(alias, copiedPath);
    }
    return;
  }

  const extension = path.extname(sourcePath).toLowerCase();
  const basename = path.basename(sourcePath, extension);
  const baseFilename = `${basename}${extension}`;
  const collisionKey = baseFilename.toLowerCase();
  const existingSource = copiedByName.get(collisionKey);
  const copiedFilename = existingSource && existingSource !== sourcePath
    ? `${basename}-${Math.abs(hashText(sourcePath)).toString(36)}${extension}`
    : baseFilename;
  const targetPath = path.join(bundledPreviewPublicDir, copiedFilename);
  const publicPath = `./rebalance-previews/${encodeURIComponent(copiedFilename)}`;

  await copyFile(sourcePath, targetPath);
  copiedByName.set(collisionKey, sourcePath);
  copiedBySource.set(sourceKey ?? normalizedLookupKey, publicPath);
  const normalizedPublicPath = normalizePreviewFileKey(publicPath);
  if (normalizedPublicPath) {
    previewFileEntries.set(normalizedPublicPath, publicPath);
  }
  for (const alias of buildPreviewLookupAliases(sourcePath, normalizedLookupKey, sourceKey)) {
    previewFileEntries.set(alias, publicPath);
  }
}

async function seedBundledCorePreviewAssets(previewFileEntries, copiedBySource, copiedByName) {
  for (const asset of bundledCorePreviewAssets) {
    if (!(await pathExists(asset.sourcePath))) {
      continue;
    }

    const sourceKey = normalizePreviewFileKey(asset.sourcePath);
    const basenameKey = path.basename(asset.sourcePath).toLowerCase();
    if ((!sourceKey || !copiedBySource.has(sourceKey)) && !previewFileEntries.has(basenameKey)) {
      await registerBundledPreviewFile(asset.sourcePath, previewFileEntries, copiedBySource, copiedByName);
    }

    const publicPath = (sourceKey ? copiedBySource.get(sourceKey) : undefined) ?? previewFileEntries.get(basenameKey);
    if (!publicPath) {
      continue;
    }

    for (const alias of asset.aliases) {
      const normalizedAlias = normalizePreviewFileKey(alias);
      if (normalizedAlias) {
        previewFileEntries.set(normalizedAlias, publicPath);
      }
    }
  }
}

function registerIconEntry(iconEntries, { label, keys }) {
  const normalizedKeys = Array.from(
    new Set(
      (keys ?? [])
        .map(value => normalizeLookupKey(value))
        .filter(Boolean),
    ),
  );

  if (!label || !normalizedKeys.length) {
    return;
  }

  const primaryKey = normalizedKeys[0];
  const existingKey = normalizedKeys.find(key => iconEntries.has(key));
  const entry = existingKey
    ? iconEntries.get(existingKey)
    : {
        label,
        theme: iconThemes[Math.abs(hashText(primaryKey)) % iconThemes.length],
        keys: [],
      };

  entry.label = entry.label || label;
  entry.keys = Array.from(new Set([...(entry.keys ?? []), ...normalizedKeys])).sort();

  for (const key of entry.keys) {
    iconEntries.set(key, entry);
  }
}

function addLocalization(localizationEntries, rawKey, rawText) {
  const key = normalizeLookupKey(rawKey);
  const text = sanitizePreviewText(rawText);
  if (!key || !text || !looksLikeLookupKey(key)) {
    return;
  }
  const nextScore = scoreLocalizationCandidate(key, text);
  if (nextScore <= 0) {
    return;
  }
  const existing = localizationEntries.get(key);
  if (!existing || nextScore > scoreLocalizationCandidate(key, existing)) {
    localizationEntries.set(key, text);
  }
}

function scoreLocalizationCandidate(key, text) {
  if (!key || !text) {
    return 0;
  }

  let score = looksLikeLookupKey(text.toLowerCase()) ? 0 : 1;
  if (/_desc$/i.test(key) || key.includes("descriptiontrkey")) {
    if (text.length >= 12) {
      score += 2;
    }
  }

  if (/_name$/i.test(key) || key.includes("nametrkey")) {
    const normalizedKey = normalizeLocalizationNameSeed(key);
    const normalizedText = normalizeLocalizationNameSeed(text);
    if (!normalizedKey || !normalizedText) {
      return 0;
    }

    if (normalizedText === normalizedKey) {
      score += 10;
    } else if (normalizedText.includes(normalizedKey) || normalizedKey.includes(normalizedText)) {
      score += 7;
    } else {
      return 0;
    }
  }

  return score;
}

function normalizeLocalizationNameSeed(value) {
  return sanitizePreviewText(value)
    ?.toLowerCase()
    .replace(/^p_/, "")
    .replace(/(?:trkey|_name|_desc|_short|_label)+$/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function sanitizePreviewText(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/^#+\s*/, "");
}

function normalizeLookupKey(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.toLowerCase();
}

function looksLikeLookupKey(value) {
  return /(^p_[a-z0-9_#]+$)|(^[a-z0-9_]+(?:_desc|_name|_short|_label)$)|(^sprite:[a-z0-9 _-]+$)|(^passiveso:[a-z0-9_]+$)|(^statuseffectso:[a-z0-9_]+$)/i.test(
    value,
  );
}

function hashText(value) {
  let hash = 0;
  for (const char of value) {
    hash = ((hash << 5) - hash) + char.charCodeAt(0);
    hash |= 0;
  }
  return hash;
}

function resolveFilesystemPreviewPath(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const withoutFileScheme = trimmed.replace(/^file:\/+/, "");
  try {
    return decodeURIComponent(withoutFileScheme).replace(/\//g, path.sep);
  } catch {
    return withoutFileScheme.replace(/\//g, path.sep);
  }
}

function normalizePreviewFileKey(value) {
  if (typeof value !== "string") {
    return null;
  }
  const resolved = resolveFilesystemPreviewPath(value);
  if (!resolved) {
    return null;
  }
  return resolved.replace(/\\/g, "/").toLowerCase();
}

function buildPreviewLookupAliases(sourcePath, normalizedLookupKey, sourceKey) {
  const aliases = new Set();
  appendPortablePreviewAliases(aliases, normalizedLookupKey);
  appendPortablePreviewAliases(aliases, sourceKey ?? normalizePreviewFileKey(sourcePath));
  appendPortablePreviewAliases(aliases, path.basename(sourcePath).toLowerCase());
  return aliases;
}

function appendPortablePreviewAliases(aliases, value) {
  if (typeof value !== "string" || !value.trim()) {
    return;
  }

  const normalized = value.replace(/\\/g, "/").trim().toLowerCase();
  const segments = normalized.split("/").filter(Boolean);
  const basename = segments.at(-1);
  if (basename) {
    aliases.add(basename);
  }

  const absolutePath = /^(?:[a-z]:\/|\/)/i.test(normalized);
  if (!absolutePath) {
    aliases.add(normalized);
    addPreviewSegmentAliases(aliases, segments);
  }

  for (const anchor of ["assets", "texture2d", "sprite", "font", "custom", "icons", "rebalance-previews"]) {
    const index = segments.findIndex(segment => segment === anchor);
    if (index >= 0) {
      const anchoredSegments = segments.slice(index);
      aliases.add(anchoredSegments.join("/"));
      addPreviewSegmentAliases(aliases, anchoredSegments);
    }
  }
}

function addPreviewSegmentAliases(aliases, segments) {
  for (let count = 2; count <= Math.min(6, segments.length); count += 1) {
    aliases.add(segments.slice(-count).join("/"));
  }
}

function registerCustomIconEntry(customIconEntries, entry) {
  if (!entry || typeof entry !== "object") {
    return;
  }

  const lookupKey = [
    normalizeLookupKey(entry.passiveKey),
    normalizeLookupKey(entry.spriteName),
    normalizeLookupKey(entry.spriteAsset),
    normalizeLookupKey(entry.previewPath),
  ].filter(Boolean).join("|");

  if (!lookupKey || customIconEntries.has(lookupKey)) {
    return;
  }

  customIconEntries.set(lookupKey, entry);
}

function sanitizeBundledCustomIconEntry(entry, previewFileEntries) {
  const previewPath = resolveBundledPublicPreviewPath(previewFileEntries, entry.previewPath);
  const sanitized = {
    passiveKey: sanitizePreviewText(entry.passiveKey) ?? undefined,
    passiveId: Number.isFinite(entry.passiveId) ? entry.passiveId : undefined,
    spriteAsset: sanitizePreviewText(entry.spriteAsset) ?? undefined,
    spriteName: sanitizePreviewText(entry.spriteName) ?? undefined,
    previewPath,
    cropX: Number.isFinite(entry.cropX) ? entry.cropX : undefined,
    cropY: Number.isFinite(entry.cropY) ? entry.cropY : undefined,
    cropWidth: Number.isFinite(entry.cropWidth) ? entry.cropWidth : undefined,
    cropHeight: Number.isFinite(entry.cropHeight) ? entry.cropHeight : undefined,
    sourceWidth: Number.isFinite(entry.sourceWidth) ? entry.sourceWidth : undefined,
    sourceHeight: Number.isFinite(entry.sourceHeight) ? entry.sourceHeight : undefined,
  };

  return Object.values(sanitized).some(value => value !== undefined) ? sanitized : undefined;
}

function resolveBundledPublicPreviewPath(previewFileEntries, value) {
  for (const alias of buildPortablePreviewSearchAliases(value)) {
    const match = previewFileEntries.get(alias);
    if (match) {
      return match;
    }
  }
  return undefined;
}

function buildPortablePreviewSearchAliases(value) {
  const aliases = new Set();
  const normalized = normalizePreviewFileKey(value);
  appendPortablePreviewAliases(aliases, normalized ?? value);
  return Array.from(aliases);
}

async function discoverCandidateRoots() {
  const roots = new Set();
  const bundledWorkspaceRoot = path.join(appDir, "src", "main", "rebalance-vendor", "default-workspace");

  if (await pathExists(bundledWorkspaceRoot)) {
    roots.add(bundledWorkspaceRoot);
  }

  if (process.env.V2_INCLUDE_INSTANCE_PREVIEW_ROOTS === "1") {
    const instancesRoot = process.env.APPDATA
      ? path.join(process.env.APPDATA, "bapbap-launcher-v2", "instances")
      : null;

    if (instancesRoot && await pathExists(instancesRoot)) {
      const instanceEntries = await readdir(instancesRoot, { withFileTypes: true });
      for (const entry of instanceEntries) {
        if (!entry.isDirectory()) {
          continue;
        }
        const balanceRoot = path.join(instancesRoot, entry.name, "UserData", "BalanceMod");
        if (await pathExists(balanceRoot)) {
          roots.add(balanceRoot);
        }
      }
    }
  }

  if (process.env.V2_INCLUDE_EXTERNAL_PREVIEW_ROOTS === "1") {
    for (const root of knownFallbackRoots) {
      if (await pathExists(root)) {
        roots.add(root);
      }
    }
  }

  return Array.from(roots);
}

async function collectFilesByName(root, fileName) {
  const results = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectFilesByName(absolutePath, fileName)));
    } else if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
      results.push(absolutePath);
    }
  }
  return results;
}

async function collectJsonFiles(root) {
  const results = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectJsonFiles(absolutePath)));
    } else if (
      entry.isFile()
      && entry.name.toLowerCase().endsWith(".json")
      && !entry.name.toLowerCase().endsWith(".index.json")
    ) {
      results.push(absolutePath);
    }
  }
  return results;
}

async function collectImageFiles(root) {
  const results = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectImageFiles(absolutePath)));
    } else if (entry.isFile() && /\.(png|jpe?g|webp|gif|svg)$/i.test(entry.name)) {
      results.push(absolutePath);
    }
  }
  return results;
}

async function readJson(filePath) {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(stripBom(text));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureEmptyDirectory(targetPath) {
  await rm(targetPath, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });

  if (!(await pathExists(targetPath))) {
    return;
  }

  const entries = await readdir(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      await rm(absolutePath, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    } else {
      await rm(absolutePath, {
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  }
}

async function canReuseExistingBundledPreviews() {
  for (const outputPath of generatedOutputPaths) {
    if (!(await pathExists(outputPath))) {
      return false;
    }
  }

  if (!(await pathExists(bundledPreviewPublicDir))) {
    return false;
  }

  const previewEntries = await readdir(bundledPreviewPublicDir, { withFileTypes: true });
  return previewEntries.some(entry => entry.isFile());
}

await main();
