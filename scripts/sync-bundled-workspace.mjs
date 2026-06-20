import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";

const appDir = path.resolve(import.meta.dirname, "..");
const destinationRoot = path.join(appDir, "src", "main", "rebalance-vendor", "default-workspace");
const overrideRoot = path.join(appDir, "src", "main", "rebalance-vendor", "default-workspace-overrides");
const manifestFileName = "_launcher-bundled-workspace.json";

const sourceCandidates = [
  process.env.REBALANCE_DEFAULT_WORKSPACE_ROOT,
  "C:\\Users\\Administrator\\Downloads\\BapBapRebalnce\\Gamefiles\\Latest\\UserData\\BalanceMod",
].filter(Boolean);

const includedRootFiles = [
  "_index.json",
  "README.md",
  "augments.cfg",
  "characters.cfg",
  "general.cfg",
];

const includedDirectories = [
  "ArenaPresets",
  "Custom",
  "Library",
  "NativeUI",
  "Runtime",
];

const criticalFiles = [
  "_index.json",
  "ArenaPresets/ArenaPresets.index.json",
  "Custom/Icons.index.json",
  "Custom/Augments/00_Example_Firewave.json",
  "Custom/Augments/01_Starter_PoisonWave.json",
  "Custom/Augments/02_Starter_HeavyBurst.json",
  "Library/AllOptions.index.json",
  "Library/Blocks.index.json",
  "Library/Collections.shared.json",
  "Library/Effects.index.json",
  "Library/Icons.index.json",
  "Library/Standards.index.json",
  "Library/Templates.index.json",
  "NativeUI/ArenaCategories.index.json",
  "NativeUI/Custom/Augments.index.json",
  "NativeUI/HiddenDev/Augments.index.json",
  "NativeUI/HiddenDev/Items.index.json",
  "Runtime/ArenaSettings/GameModes.index.json",
  "Runtime/Managers/AugmentManager.json",
];

async function main() {
  const sourceRoot = await resolveSourceRoot();
  if (!sourceRoot) {
    throw new Error("No BalanceMod source root was found for sync-bundled-workspace.");
  }

  await removeWorkspaceContentsPreservingBundles(destinationRoot);
  await mkdir(destinationRoot, { recursive: true });

  const copiedEntries = [];
  for (const fileName of includedRootFiles) {
    const sourcePath = path.join(sourceRoot, fileName);
    if (!(await pathExists(sourcePath))) {
      continue;
    }
    const destinationPath = path.join(destinationRoot, fileName);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await cp(sourcePath, destinationPath, { force: true });
    copiedEntries.push(await describeEntry(sourceRoot, sourcePath));
  }

  for (const directoryName of includedDirectories) {
    const sourcePath = path.join(sourceRoot, directoryName);
    if (!(await pathExists(sourcePath))) {
      continue;
    }
    await copyWorkspaceTree(sourceRoot, sourcePath, path.join(destinationRoot, directoryName), copiedEntries);
  }

  if (await pathExists(overrideRoot)) {
    await copyWorkspaceTree(overrideRoot, overrideRoot, destinationRoot, copiedEntries);
  }

  const generatedStandardsPath = await generateStandardsIndex(destinationRoot);
  if (generatedStandardsPath) {
    copiedEntries.push(await describeEntry(destinationRoot, generatedStandardsPath));
  }

  copiedEntries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const seedVersion = crypto
    .createHash("sha256")
    .update(JSON.stringify(copiedEntries))
    .digest("hex")
    .slice(0, 16);

  const manifest = {
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    sourceRoot,
    seedVersion,
    copiedFileCount: copiedEntries.length,
    copiedEntries,
    criticalFiles,
  };

  await writeJson(path.join(destinationRoot, manifestFileName), manifest);
  console.log(`sync-bundled-workspace: OK (${copiedEntries.length} files, seed ${seedVersion})`);
}

async function resolveSourceRoot() {
  for (const candidate of sourceCandidates) {
    if (!candidate) {
      continue;
    }
    const resolved = path.resolve(candidate);
    if (await pathExists(path.join(resolved, "Library", "AllOptions.index.json"))) {
      return resolved;
    }
  }
  return null;
}

async function copyWorkspaceTree(sourceRoot, sourcePath, destinationPath, copiedEntries) {
  const sourceStats = await stat(sourcePath);
  if (sourceStats.isDirectory()) {
    await mkdir(destinationPath, { recursive: true });
    const entries = await readdir(sourcePath, { withFileTypes: true });
    for (const entry of entries) {
      if (shouldSkipWorkspaceEntry(sourceRoot, sourcePath, entry.name)) {
        continue;
      }
      await copyWorkspaceTree(
        sourceRoot,
        path.join(sourcePath, entry.name),
        path.join(destinationPath, entry.name),
        copiedEntries,
      );
    }
    return;
  }

  await mkdir(path.dirname(destinationPath), { recursive: true });
  await cp(sourcePath, destinationPath, { force: true });
  copiedEntries.push(await describeEntry(sourceRoot, sourcePath));
}

function shouldSkipWorkspaceEntry(sourceRoot, parentPath, entryName) {
  if (entryName === manifestFileName) {
    return true;
  }

  const relativeParent = path.relative(sourceRoot, parentPath).replace(/\\/g, "/");
  if (
    relativeParent === "Runtime/Characters" &&
    /^([A-Z0-9]+)_\1$/i.test(entryName)
  ) {
    return true;
  }

  return false;
}

async function describeEntry(sourceRoot, absolutePath) {
  const fileStats = await stat(absolutePath);
  return {
    relativePath: path.relative(sourceRoot, absolutePath).replace(/\\/g, "/"),
    size: fileStats.size,
    mtimeMs: Math.floor(fileStats.mtimeMs),
  };
}

async function generateStandardsIndex(workspaceRoot) {
  const allOptionsPath = path.join(workspaceRoot, "Library", "AllOptions.index.json");
  if (!(await pathExists(allOptionsPath))) {
    return null;
  }

  const raw = JSON.parse(stripBom(await readFile(allOptionsPath, "utf8")));
  const entries = Array.isArray(raw?.entries) ? raw.entries : [];
  const standardsEntries = entries.map((entry) => ({
    optionId: entry.optionId,
    category: entry.category,
    source: entry.source,
    targetType: entry.targetType,
    targetKey: entry.targetKey,
    displayName: entry.displayName,
    resolvedName: entry.resolvedName,
    sourceGroup: entry.sourceGroup,
    file: entry.file,
    path: entry.path,
    label: entry.label,
    description: entry.description,
    valueType: entry.valueType,
    editable: entry.editable,
    defaultValue: entry.defaultValue,
    riskLevel: entry.riskLevel,
    beyondVanilla: entry.beyondVanilla,
    searchHints: entry.searchHints,
  }));

  const standardsPayload = {
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    instructions: [
      "This file stores the launcher baseline for every discovered editable value.",
      "Each entry reflects the standard default captured from the bundled runtime export before launcher edits are applied.",
      "Use this file for focused browser-style UI instead of reopening the full runtime dumps when you only need the default value and metadata.",
    ],
    totalEntries: standardsEntries.length,
    editableCount: standardsEntries.filter((entry) => entry.editable !== false).length,
    totalTargets: new Set(
      standardsEntries
        .map((entry) => `${entry.targetType ?? ""}|${entry.targetKey ?? entry.file ?? ""}`)
        .filter((value) => value !== "|"),
    ).size,
    categories: buildStandardsSummary(standardsEntries, "category"),
    targetTypes: buildStandardsSummary(standardsEntries, "targetType"),
    sources: buildStandardsSummary(standardsEntries, "source"),
    valueTypes: buildStandardsSummary(standardsEntries, "valueType"),
    riskLevels: buildStandardsSummary(standardsEntries, "riskLevel"),
    entries: standardsEntries,
  };

  const standardsPath = path.join(workspaceRoot, "Library", "Standards.index.json");
  await writeJson(standardsPath, standardsPayload);
  return standardsPath;
}

function buildStandardsSummary(entries, key) {
  const counts = new Map();
  for (const entry of entries) {
    const rawValue = entry?.[key];
    if (typeof rawValue !== "string" || !rawValue.trim()) {
      continue;
    }
    const value = rawValue.trim();
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => left[0].localeCompare(right[0], undefined, { sensitivity: "base" }))
    .map(([value, count]) => ({ value, count }));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function stripBom(value) {
  return typeof value === "string" ? value.replace(/^\uFEFF/, "") : value;
}

await main();

async function removeWorkspaceContentsPreservingBundles(targetPath) {
  // The bundles/ subdir holds source-controlled Bundle Instance fallback
  // payloads (see sync-bundled-bundles.mjs + docs/bundle-instance/...).
  // It is NOT regenerated from the BalanceMod source root, so the cleanup
  // phase of sync-bundled-workspace must not nuke it. Selectively remove
  // every other top-level entry instead of `rm -rf` on the whole workspace.
  if (!(await pathExists(targetPath))) {
    return;
  }
  const entries = await readdir(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "bundles") {
      continue;
    }
    await removePathWithRetries(path.join(targetPath, entry.name));
  }
}

async function removePathWithRetries(targetPath, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rm(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!isRetryableRemoveError(error) || attempt === attempts - 1) {
        throw error;
      }
      await delay(200 * (attempt + 1));
    }
  }
}

function isRetryableRemoveError(error) {
  return Boolean(
    error
    && (error.code === "EBUSY" || error.code === "EPERM" || error.code === "EACCES"),
  );
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
