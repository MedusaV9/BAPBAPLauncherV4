const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

/**
 * Phase 3 Task 4 — Read-Only Bootstrap.
 *
 * Stable string flag name that callers should use when passing the read-only
 * option to bootstrap helpers (e.g. `prepareBalanceModLayout`,
 * `ensureWorkspaceLayout`). Exposing the literal as a named constant lets the
 * launcher refer to it through a single source of truth instead of repeating
 * the string in multiple places.
 */
const BOOTSTRAP_READ_ONLY_FLAG = "readOnly";

const SETTINGS_FILE_NAME = "launcher-settings.json";
const ACTIVE_PACK_STATE_FILE = "active-pack.json";
const LEGACY_ACTIVE_PACK_STATE_FILE = "active-pack-state.json";
const DEFAULT_WORKSPACE_MANIFEST_FILE = "_launcher-bundled-workspace.json";
const WORKSPACE_SEED_STATE_FILE = ".launcher-seed-state.json";
const BUNDLED_COUNT_REPAIR_PATHS = new Set([
  "Library/Blocks.index.json",
  "Library/Effects.index.json",
  "Library/Icons.index.json",
  "Library/Standards.index.json",
  "Custom/Icons.index.json",
  "NativeUI/HiddenDev/Augments.index.json",
  "NativeUI/HiddenDev/Items.index.json",
]);
const WORKSPACE_SUPPORT_FILE_SPECS = Object.freeze([
  {
    relativePath: "_index.json",
    createEmpty: () => ({
      schemaVersion: 1,
      sections: [],
    }),
    isValid: (value) => isPlainObject(value) && Array.isArray(value.sections),
  },
  {
    relativePath: "Library/AllOptions.index.json",
    createEmpty: () => ({ entries: [] }),
    isValid: hasEntriesArray,
  },
  {
    relativePath: "Library/Blocks.index.json",
    createEmpty: () => ({ entries: [] }),
    isValid: hasEntriesArray,
  },
  {
    relativePath: "Library/Collections.shared.json",
    createEmpty: () => ({
      schemaVersion: 1,
      favorites: [],
      collections: [],
    }),
    isValid: (value) =>
      isPlainObject(value) && Array.isArray(value.favorites) && Array.isArray(value.collections),
  },
  {
    relativePath: "Library/Effects.index.json",
    createEmpty: () => ({ entries: [] }),
    isValid: hasEntriesArray,
  },
  {
    relativePath: "Library/Icons.index.json",
    createEmpty: () => ({ entries: [] }),
    isValid: hasEntriesArray,
  },
  {
    relativePath: "Library/Standards.index.json",
    createEmpty: () => ({
      schemaVersion: 1,
      entries: [],
      categories: [],
      targetTypes: [],
      sources: [],
      valueTypes: [],
      riskLevels: [],
      totalEntries: 0,
      editableCount: 0,
      totalTargets: 0,
    }),
    isValid: hasEntriesArray,
  },
  {
    relativePath: "Library/Templates.index.json",
    createEmpty: () => ({ entries: [] }),
    isValid: hasEntriesArray,
  },
  {
    relativePath: "Runtime/Augments.index.json",
    createEmpty: () => ({
      schemaVersion: 1,
      entries: [],
    }),
    isValid: hasEntriesArray,
  },
  {
    relativePath: "Runtime/Items.index.json",
    createEmpty: () => ({
      schemaVersion: 1,
      entries: [],
    }),
    isValid: hasEntriesArray,
  },
  {
    relativePath: "Runtime/Managers/AugmentManager.json",
    createEmpty: () => ({ schemaVersion: 1 }),
    isValid: isPlainObject,
  },
  {
    relativePath: "Runtime/ArenaSettings/_index.json",
    createEmpty: () => ({
      schemaVersion: 1,
      files: [],
    }),
    isValid: hasFilesArray,
  },
  {
    relativePath: "Runtime/ArenaSettings/GameModes.index.json",
    createEmpty: () => ({
      schemaVersion: 1,
      entries: [],
    }),
    isValid: hasEntriesArray,
  },
  {
    relativePath: "Runtime/ArenaSettings/ArenaGameMode.json",
    createEmpty: () => ({ schemaVersion: 1 }),
    isValid: isPlainObject,
  },
  {
    relativePath: "Runtime/ArenaSettings/CurrentLobby.json",
    createEmpty: () => ({ schemaVersion: 1 }),
    isValid: isPlainObject,
  },
  {
    relativePath: "Runtime/ArenaSettings/CurrentPreset.json",
    createEmpty: () => ({ schemaVersion: 1 }),
    isValid: isPlainObject,
  },
  {
    relativePath: "Runtime/ArenaSettings/LobbyConfig.json",
    createEmpty: () => ({ schemaVersion: 1 }),
    isValid: isPlainObject,
  },
  {
    relativePath: "Custom/Icons.index.json",
    createEmpty: () => ({ entries: [] }),
    isValid: hasEntriesArray,
  },
  {
    relativePath: "Custom/Augments/00_Example_Firewave.json",
    createEmpty: () => createFallbackStarterDraft("Example Firewave", "P_CUSTOM_FIREWAVE_PLUS"),
    isValid: isStarterDraftFile,
  },
  {
    relativePath: "Custom/Augments/01_Starter_PoisonWave.json",
    createEmpty: () => createFallbackStarterDraft("Poison Wave", "P_CUSTOM_POISON_WAVE"),
    isValid: isStarterDraftFile,
  },
  {
    relativePath: "Custom/Augments/02_Starter_HeavyBurst.json",
    createEmpty: () => createFallbackStarterDraft("Heavy Burst", "P_CUSTOM_HEAVY_BURST"),
    isValid: isStarterDraftFile,
  },
  {
    relativePath: "ArenaPresets/ArenaPresets.index.json",
    createEmpty: () => ({ entries: [] }),
    isValid: hasEntriesArray,
  },
  {
    relativePath: "NativeUI/ArenaCategories.index.json",
    createEmpty: () => ({
      schemaVersion: 1,
      augmentCategories: [],
      itemCategories: [],
    }),
    isValid: (value) =>
      isPlainObject(value)
      && Array.isArray(value.augmentCategories)
      && Array.isArray(value.itemCategories),
  },
  {
    relativePath: "NativeUI/Custom/Augments.index.json",
    createEmpty: () => ({ entries: [] }),
    isValid: hasEntriesArray,
  },
  {
    relativePath: "NativeUI/HiddenDev/Augments.index.json",
    createEmpty: () => ({ categories: [] }),
    isValid: hasCategoriesArray,
  },
  {
    relativePath: "NativeUI/HiddenDev/Items.index.json",
    createEmpty: () => ({ categories: [] }),
    isValid: hasCategoriesArray,
  },
]);

function createShared(app) {
  /**
   * Tracks whether bootstrap or any other shared.cjs operation has actually
   * mutated the workspace folder layout in the current process. The flag is
   * exported via the returned API so the host can decide whether the user has
   * "touched disk" yet (e.g. for telemetry or to gate first-save UX).
   *
   * Phase 3 Task 4 (Read-Only Bootstrap):
   *   - bootstrap should call ensureWorkspaceLayout({ readOnly: true }) so
   *     merely opening the Rebalance Studio does not create folders.
   *   - First save / write flows call without readOnly so folders are created
   *     on demand.
   */
  let bootstrapMutated = false;

  function settingsPath() {
    return path.join(app.getPath("userData"), SETTINGS_FILE_NAME);
  }

  function workspaceRootsFromPath(rootPath) {
    const resolvedRoot = normalizeWorkspaceInputPath(rootPath);
    const layout = resolveWorkspaceLayout(resolvedRoot);
    if (!layout) {
      return null;
    }
    const { gameRoot, balanceRoot } = layout;
    const runtimeRoot = path.join(balanceRoot, "Runtime");

    return {
      workspaceRoot: normalizePath(resolvedRoot),
      runtimeRoot: normalizePath(runtimeRoot),
      customRoot: normalizePath(path.join(balanceRoot, "Custom")),
      nativeUiRoot: normalizePath(path.join(balanceRoot, "NativeUI")),
      arenaPresetsRoot: normalizePath(path.join(balanceRoot, "ArenaPresets")),
      libraryRoot: normalizePath(path.join(balanceRoot, "Library")),
      backupRoot: normalizePath(path.join(balanceRoot, "LauncherBackups")),
      packDropRoot: normalizePath(path.join(balanceRoot, "PackDrop")),
      packDropProcessedRoot: normalizePath(
        path.join(balanceRoot, "PackDrop", "Processed"),
      ),
      packDropFailedRoot: normalizePath(
        path.join(balanceRoot, "PackDrop", "Failed"),
      ),
      installedPacksRoot: normalizePath(path.join(balanceRoot, "InstalledPacks")),
      importReceiptRoot: normalizePath(path.join(balanceRoot, "ImportReceipts")),
      libraryBlocksIndexPath: normalizePath(path.join(balanceRoot, "Library", "Blocks.index.json")),
      libraryEffectsIndexPath: normalizePath(path.join(balanceRoot, "Library", "Effects.index.json")),
      libraryIconsIndexPath: normalizePath(path.join(balanceRoot, "Library", "Icons.index.json")),
      libraryStandardsIndexPath: normalizePath(path.join(balanceRoot, "Library", "Standards.index.json")),
      libraryTemplatesIndexPath: normalizePath(path.join(balanceRoot, "Library", "Templates.index.json")),
      libraryAllOptionsIndexPath: normalizePath(path.join(balanceRoot, "Library", "AllOptions.index.json")),
      libraryCollectionsSharedPath: normalizePath(path.join(balanceRoot, "Library", "Collections.shared.json")),
      gameExe: normalizePath(path.join(gameRoot, "bapbap.exe")),
      modProjectRoot: resolveOptionalModProjectRoot(resolvedRoot, balanceRoot),
    };
  }

  async function ensureWorkspaceLayout(workspace, options = {}) {
    // Phase 3 Task 4: Read-Only Bootstrap.
    // When called with { readOnly: true } (i.e. from the bootstrap IPC handler)
    // we MUST NOT create folders or seed bundled defaults. The user has merely
    // opened the Rebalance Studio – there is no signal yet that they want us
    // to provision their BalanceMod workspace on disk. The first save / write
    // flow will call ensureWorkspaceLayout() without options so folders are
    // created on demand.
    //
    // The actual mutation logic lives in the top-level `prepareBalanceModLayout`
    // helper so external callers can use a stable, exported name. We update
    // `bootstrapMutated` here based on whether the helper actually touched
    // disk so the flag stays accurate per shared instance.
    const result = await prepareBalanceModLayout(workspace, options);
    if (result && result.mutated) {
      bootstrapMutated = true;
    }
  }

  async function ensureWorkspaceSupportFiles(workspace, options = {}) {
    const balanceRoot = resolveBalanceRootFromWorkspace(workspace);
    return ensureBundledWorkspaceSupportFiles(
      balanceRoot,
      resolveBundledWorkspaceRoot(),
      options,
    );
  }

  async function ensureWorkspaceSupportFileForAbsolutePath(workspace, absolutePath, options = {}) {
    const balanceRoot = resolveBalanceRootFromWorkspace(workspace);
    return ensureBundledWorkspaceSupportFileForAbsolutePath(
      balanceRoot,
      resolveBundledWorkspaceRoot(),
      absolutePath,
      options,
    );
  }

  async function restoreBundledWorkspaceFileForAbsolutePath(workspace, absolutePath, options = {}) {
    const balanceRoot = resolveBalanceRootFromWorkspace(workspace);
    return restoreBundledWorkspaceFileForAbsolutePathInternal(
      balanceRoot,
      resolveBundledWorkspaceRoot(),
      absolutePath,
      options,
    );
  }

  async function loadSettings() {
    const filePath = settingsPath();
    if (!(await pathExists(filePath))) {
      return { workspaceRoot: null };
    }

    try {
      return await readJson(filePath);
    } catch {
      return { workspaceRoot: null };
    }
  }

  async function persistSettings(settings) {
    const filePath = settingsPath();
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await writeJson(filePath, settings);
  }

  async function detectWorkspace() {
    const candidates = [];
    for (const start of [process.cwd(), app.getAppPath(), path.dirname(process.execPath)]) {
      if (!start) continue;
      candidates.push(...ancestorCandidates(start));
    }

    for (const candidate of candidates) {
      const workspace = workspaceRootsFromPath(candidate);
      if (workspace) {
        return workspace;
      }
    }

    return null;
  }

  function validateWorkspace(workspaceRoot) {
    const workspace = workspaceRootsFromPath(workspaceRoot);
    if (!workspace) {
      throw new Error("Workspace root is no longer valid.");
    }
    return workspace;
  }

  async function readActivePackState(workspace) {
    for (const fileName of [ACTIVE_PACK_STATE_FILE, LEGACY_ACTIVE_PACK_STATE_FILE]) {
      const activeStatePath = path.join(workspace.installedPacksRoot, fileName);
      if (!(await pathExists(activeStatePath))) {
        continue;
      }
      try {
        return await readJson(activeStatePath);
      } catch {
        // try the next known file name
      }
    }
    return null;
  }

  async function writeActivePackState(workspace, state) {
    const activeStatePath = path.join(workspace.installedPacksRoot, ACTIVE_PACK_STATE_FILE);
    await writeJson(activeStatePath, state);
    const legacyStatePath = path.join(workspace.installedPacksRoot, LEGACY_ACTIVE_PACK_STATE_FILE);
    if (await pathExists(legacyStatePath)) {
      await fsp.rm(legacyStatePath, { force: true });
    }
  }

  async function deleteActivePackState(workspace) {
    for (const fileName of [ACTIVE_PACK_STATE_FILE, LEGACY_ACTIVE_PACK_STATE_FILE]) {
      const activeStatePath = path.join(workspace.installedPacksRoot, fileName);
      await fsp.rm(activeStatePath, { force: true });
    }
  }

  return {
    settingsPath,
    workspaceRootsFromPath,
    ensureWorkspaceLayout,
    loadSettings,
    persistSettings,
    detectWorkspace,
    validateWorkspace,
    ensureWorkspaceSupportFiles,
    ensureWorkspaceSupportFileForAbsolutePath,
    restoreBundledWorkspaceFileForAbsolutePath,
    readActivePackState,
    writeActivePackState,
    deleteActivePackState,
    /**
     * Phase 3 Task 4: Returns true once any shared.cjs operation has actually
     * mutated the workspace on disk in this process (e.g. created folders or
     * seeded bundled defaults). Bootstrap calls with { readOnly: true } will
     * leave this false until a save flow opts back in.
     */
    get bootstrapMutated() {
      return bootstrapMutated;
    },
  };
}

/**
 * Phase 3 Task 4 — Read-Only Bootstrap.
 *
 * Provisions the BalanceMod folder layout (Runtime, Custom, NativeUI,
 * ArenaPresets, LauncherBackups, PackDrop, InstalledPacks, ImportReceipts,
 * Library) for the given workspace, then runs the bundled-default repair and
 * seed flows.
 *
 * When called with `{ readOnly: true }` (or `{ [BOOTSTRAP_READ_ONLY_FLAG]:
 * true }`), this is a no-op so callers can probe a workspace without mutating
 * disk. The bootstrap IPC handler uses this so merely opening the Rebalance
 * Studio does NOT touch the user's profile folder until they perform an
 * explicit write (save, repair, pack import/export, etc.).
 *
 * The helper accepts either a resolved workspace structure (with
 * `runtimeRoot`, `customRoot`, etc.) OR a workspace root path string. The
 * string form resolves the layout via `workspaceRootsFromAbsolutePath` and
 * is convenient for callers that only have a path on hand.
 *
 * Returns `{ mutated: boolean }` so the caller can decide whether disk has
 * actually been touched (e.g. for telemetry, or to update a per-process
 * `bootstrapMutated` flag).
 */
async function prepareBalanceModLayout(workspaceOrRoot, options = {}) {
  const safeOptions = options ?? {};
  const readOnly = Boolean(safeOptions[BOOTSTRAP_READ_ONLY_FLAG]);

  if (readOnly) {
    return { mutated: false };
  }

  const workspace = typeof workspaceOrRoot === "string"
    ? workspaceRootsFromAbsolutePath(workspaceOrRoot)
    : workspaceOrRoot;

  if (!workspace || !workspace.runtimeRoot) {
    return { mutated: false };
  }

  const balanceRoot = resolveBalanceRootFromWorkspace(workspace);
  const dirs = [
    balanceRoot,
    workspace.runtimeRoot,
    workspace.customRoot,
    path.join(workspace.customRoot, "Augments"),
    path.join(workspace.customRoot, "Icons"),
    workspace.nativeUiRoot,
    workspace.arenaPresetsRoot,
    workspace.backupRoot,
    workspace.packDropRoot,
    workspace.packDropProcessedRoot,
    workspace.packDropFailedRoot,
    workspace.installedPacksRoot,
    workspace.importReceiptRoot,
    workspace.libraryRoot,
  ];

  for (const dir of dirs) {
    await fsp.mkdir(dir, { recursive: true });
  }

  await repairMalformedWorkspaceLayout(workspace);
  await seedBundledWorkspace(workspace);

  return { mutated: true };
}

/**
 * Resolve a workspace structure from an absolute root path without going
 * through a `createShared` instance. Used by `prepareBalanceModLayout` when
 * its caller passes a string instead of a resolved workspace.
 */
function workspaceRootsFromAbsolutePath(rootPath) {
  const resolvedRoot = normalizeWorkspaceInputPath(rootPath);
  const layout = resolveWorkspaceLayout(resolvedRoot);
  if (!layout) {
    return null;
  }
  const { gameRoot, balanceRoot } = layout;
  const runtimeRoot = path.join(balanceRoot, "Runtime");

  return {
    workspaceRoot: normalizePath(resolvedRoot),
    runtimeRoot: normalizePath(runtimeRoot),
    customRoot: normalizePath(path.join(balanceRoot, "Custom")),
    nativeUiRoot: normalizePath(path.join(balanceRoot, "NativeUI")),
    arenaPresetsRoot: normalizePath(path.join(balanceRoot, "ArenaPresets")),
    libraryRoot: normalizePath(path.join(balanceRoot, "Library")),
    backupRoot: normalizePath(path.join(balanceRoot, "LauncherBackups")),
    packDropRoot: normalizePath(path.join(balanceRoot, "PackDrop")),
    packDropProcessedRoot: normalizePath(path.join(balanceRoot, "PackDrop", "Processed")),
    packDropFailedRoot: normalizePath(path.join(balanceRoot, "PackDrop", "Failed")),
    installedPacksRoot: normalizePath(path.join(balanceRoot, "InstalledPacks")),
    importReceiptRoot: normalizePath(path.join(balanceRoot, "ImportReceipts")),
    gameExe: normalizePath(path.join(gameRoot, "bapbap.exe")),
  };
}

function normalizeWorkspaceInputPath(rootPath) {
  const resolvedPath = path.resolve(rootPath);
  const stats = fs.existsSync(resolvedPath) ? fs.statSync(resolvedPath) : null;
  if (stats?.isFile() && /^bapbap\.exe$/i.test(path.basename(resolvedPath))) {
    return path.dirname(resolvedPath);
  }
  return resolvedPath;
}

function resolveBalanceRootFromWorkspace(workspace) {
  return path.resolve(workspace.runtimeRoot, "..");
}

function resolveBundledWorkspaceRoot() {
  return path.resolve(__dirname, "..", "default-workspace");
}

async function repairMalformedWorkspaceLayout(workspace) {
  const roots = [
    resolveBalanceRootFromWorkspace(workspace),
    workspace.customRoot,
    workspace.nativeUiRoot,
    workspace.arenaPresetsRoot,
    workspace.libraryRoot,
    workspace.runtimeRoot,
  ]
    .filter(Boolean)
    .map((value) => path.resolve(value));

  for (const root of roots) {
    await repairNestedDuplicateDirectory(root);
  }
}

async function repairNestedDuplicateDirectory(parentDir) {
  const duplicateDir = path.join(parentDir, path.basename(parentDir));
  if (!(await pathExists(duplicateDir))) {
    return;
  }

  const stats = await fsp.stat(duplicateDir);
  if (!stats.isDirectory()) {
    return;
  }

  if (path.resolve(duplicateDir) === path.resolve(parentDir)) {
    return;
  }

  await copyMissingTree(duplicateDir, parentDir);
  await fsp.rm(duplicateDir, { recursive: true, force: true });
}

async function seedBundledWorkspace(workspace) {
  const balanceRoot = resolveBalanceRootFromWorkspace(workspace);
  const bundledRoot = resolveBundledWorkspaceRoot();
  const manifestPath = path.join(bundledRoot, DEFAULT_WORKSPACE_MANIFEST_FILE);
  if (!(await pathExists(manifestPath))) {
    return;
  }

  let manifest = null;
  try {
    manifest = await readJson(manifestPath);
  } catch {
    return;
  }

  const statePath = path.join(balanceRoot, WORKSPACE_SEED_STATE_FILE);
  const currentState = await safeReadJson(statePath);
  const seedVersion = typeof manifest?.seedVersion === "string" ? manifest.seedVersion : null;
  const criticalFiles = Array.isArray(manifest?.criticalFiles)
    ? manifest.criticalFiles
        .map((relativePath) => {
          try {
            return path.join(balanceRoot, sanitizeRelativePath(relativePath));
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    : [];

  const hasCriticalFiles = await everyPathExists(criticalFiles);
  const shouldSeed = !hasCriticalFiles || currentState?.seedVersion !== seedVersion;
  if (!shouldSeed) {
    const restoredCriticalFiles = await restoreBundledWorkspaceCriticalFiles(balanceRoot, bundledRoot);
    const repairedSupportFiles = await ensureBundledWorkspaceSupportFiles(balanceRoot, bundledRoot);
    if (restoredCriticalFiles.length > 0 || repairedSupportFiles.length > 0) {
      await writeWorkspaceSeedState(statePath, manifest, currentState, {
        fullSeed: false,
        restoredCriticalFiles,
        repairedSupportFiles,
      });
    }
    return;
  }

  await copyMissingTree(bundledRoot, balanceRoot, { ignoreFileNames: new Set([WORKSPACE_SEED_STATE_FILE]) });
  const repairedSupportFiles = await ensureBundledWorkspaceSupportFiles(balanceRoot, bundledRoot, {
    refreshSupportFiles: true,
  });
  await writeWorkspaceSeedState(statePath, manifest, currentState, {
    fullSeed: true,
    restoredCriticalFiles: criticalFiles.map((targetPath) =>
      normalizePath(path.relative(balanceRoot, targetPath))),
    repairedSupportFiles,
  });
}

async function ensureBundledWorkspaceSupportFiles(balanceRoot, bundledRoot, options = {}) {
  const { refreshSupportFiles = false, relativePaths = null } = options;
  const requestedPaths = relativePaths
    ? new Set(Array.from(relativePaths, (value) => sanitizeRelativePath(value)))
    : null;
  const repairedSupportFiles = [];

  for (const spec of WORKSPACE_SUPPORT_FILE_SPECS) {
    const sanitized = sanitizeRelativePath(spec.relativePath);
    if (requestedPaths && !requestedPaths.has(sanitized)) {
      continue;
    }

    const destinationPath = path.join(balanceRoot, sanitized);
    const needsRepair = refreshSupportFiles
      || (await workspaceSupportFileNeedsRepair(destinationPath, spec, bundledRoot));
    if (!needsRepair) {
      continue;
    }

    await writeWorkspaceSupportFile(balanceRoot, bundledRoot, spec);
    repairedSupportFiles.push(sanitized);
  }

  return repairedSupportFiles;
}

async function ensureBundledWorkspaceSupportFileForAbsolutePath(
  balanceRoot,
  bundledRoot,
  absolutePath,
  options = {},
) {
  const resolvedTargetPath = path.resolve(absolutePath);
  const directSpec = WORKSPACE_SUPPORT_FILE_SPECS.find((entry) =>
    path.resolve(path.join(balanceRoot, sanitizeRelativePath(entry.relativePath))) === resolvedTargetPath);
  const relativePaths = directSpec
    ? new Set([directSpec.relativePath])
    : resolveWorkspaceRepairRelativePathsForAbsolutePath(balanceRoot, resolvedTargetPath);
  if (!relativePaths || relativePaths.size === 0) {
    return false;
  }

  const repaired = await ensureBundledWorkspaceSupportFiles(balanceRoot, bundledRoot, {
    ...options,
    relativePaths,
  });
  const restoredCriticalFiles = await restoreBundledWorkspaceCriticalFiles(balanceRoot, bundledRoot, {
    relativePaths,
  });
  return repaired.length > 0 || restoredCriticalFiles.length > 0;
}

async function restoreBundledWorkspaceFileForAbsolutePathInternal(
  balanceRoot,
  bundledRoot,
  absolutePath,
  options = {},
) {
  const { overwrite = false } = options;
  const resolvedBalanceRoot = path.resolve(balanceRoot);
  const resolvedTargetPath = path.resolve(absolutePath);
  const relativePath = path.relative(resolvedBalanceRoot, resolvedTargetPath);

  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return false;
  }

  let sanitized;
  try {
    sanitized = sanitizeRelativePath(relativePath);
  } catch {
    return false;
  }

  const sourcePath = path.join(bundledRoot, sanitized);
  if (!(await pathExists(sourcePath))) {
    const supportSpec = WORKSPACE_SUPPORT_FILE_SPECS.find((entry) =>
      sanitizeRelativePath(entry.relativePath) === sanitized);
    if (!supportSpec) {
      return false;
    }

    await writeWorkspaceSupportFile(balanceRoot, bundledRoot, supportSpec);
    return true;
  }

  let sourceStats = null;
  try {
    sourceStats = await fsp.stat(sourcePath);
  } catch {
    return false;
  }

  if (!sourceStats.isFile()) {
    return false;
  }

  if (!overwrite && (await pathExists(resolvedTargetPath))) {
    return false;
  }

  await fsp.mkdir(path.dirname(resolvedTargetPath), { recursive: true });
  await fsp.copyFile(sourcePath, resolvedTargetPath);
  return true;
}

async function restoreBundledWorkspaceCriticalFiles(balanceRoot, bundledRoot, options = {}) {
  const { relativePaths = null } = options;
  const requestedPaths = relativePaths
    ? new Set(Array.from(relativePaths, (value) => sanitizeRelativePath(value)))
    : null;
  const criticalRelativePaths = await listBundledWorkspaceCriticalRelativePaths(bundledRoot);
  const restoredCriticalFiles = [];

  for (const relativePath of criticalRelativePaths) {
    if (requestedPaths && !requestedPaths.has(relativePath)) {
      continue;
    }

    const destinationPath = path.join(balanceRoot, relativePath);
    if (await pathExists(destinationPath)) {
      continue;
    }

    const restored = await restoreBundledWorkspaceFileForAbsolutePathInternal(
      balanceRoot,
      bundledRoot,
      destinationPath,
      { overwrite: false },
    );
    if (restored) {
      restoredCriticalFiles.push(relativePath);
    }
  }

  return restoredCriticalFiles;
}

async function listBundledWorkspaceCriticalRelativePaths(bundledRoot) {
  const manifestPath = path.join(bundledRoot, DEFAULT_WORKSPACE_MANIFEST_FILE);
  const manifest = await safeReadJson(manifestPath);
  if (!Array.isArray(manifest?.criticalFiles)) {
    return [];
  }

  return manifest.criticalFiles
    .map((relativePath) => {
      try {
        return sanitizeRelativePath(relativePath);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function resolveWorkspaceRepairRelativePathsForAbsolutePath(balanceRoot, absolutePath) {
  const resolvedBalanceRoot = path.resolve(balanceRoot);
  const resolvedTargetPath = path.resolve(absolutePath);
  const relativePath = path.relative(resolvedBalanceRoot, resolvedTargetPath);

  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  let sanitized;
  try {
    sanitized = sanitizeRelativePath(relativePath);
  } catch {
    return null;
  }

  const requested = new Set(["_index.json"]);
  if (sanitized.startsWith("Library/")) {
    addSupportPathsByPrefix(requested, "Library/");
    return requested;
  }

  if (sanitized.startsWith("Custom/")) {
    addSupportPathsByPrefix(requested, "Custom/");
    addSupportPathsByPrefix(requested, "Library/");
    requested.add("NativeUI/Custom/Augments.index.json");
    return requested;
  }

  if (sanitized.startsWith("NativeUI/")) {
    addSupportPathsByPrefix(requested, "NativeUI/");
    addSupportPathsByPrefix(requested, "Library/");
    return requested;
  }

  if (sanitized.startsWith("ArenaPresets/") || sanitized.startsWith("Runtime/ArenaSettings/")) {
    requested.add("ArenaPresets/ArenaPresets.index.json");
    addSupportPathsByPrefix(requested, "Runtime/ArenaSettings/");
    addSupportPathsByPrefix(requested, "NativeUI/");
    return requested;
  }

  if (sanitized.startsWith("Runtime/Managers/")) {
    requested.add("Runtime/Managers/AugmentManager.json");
    addSupportPathsByPrefix(requested, "Library/");
    return requested;
  }

  if (sanitized.startsWith("Runtime/")) {
    requested.add("Runtime/Augments.index.json");
    requested.add("Runtime/Items.index.json");
    requested.add("Runtime/Managers/AugmentManager.json");
    addSupportPathsByPrefix(requested, "Library/");
    return requested;
  }

  return requested.size > 0 ? requested : null;
}

function addSupportPathsByPrefix(target, prefix) {
  for (const spec of WORKSPACE_SUPPORT_FILE_SPECS) {
    const relativePath = sanitizeRelativePath(spec.relativePath);
    if (relativePath.startsWith(prefix)) {
      target.add(relativePath);
    }
  }
}

async function workspaceSupportFileNeedsRepair(targetPath, spec, bundledRoot = null) {
  if (!(await pathExists(targetPath))) {
    return true;
  }

  if (typeof spec.isValid !== "function") {
    return false;
  }

  try {
    const raw = await readJson(targetPath);
    if (!spec.isValid(raw)) {
      return true;
    }

    if (!bundledRoot) {
      return false;
    }

    const sanitized = sanitizeRelativePath(spec.relativePath);
    const bundledPath = path.join(bundledRoot, sanitized);
    return await workspaceSupportFileNeedsBundledRepair(raw, bundledPath, sanitized);
  } catch {
    return true;
  }
}

async function workspaceSupportFileNeedsBundledRepair(rawValue, bundledPath, relativePath) {
  const rawCount = getWorkspaceSupportCollectionCount(rawValue);
  if (!(await pathExists(bundledPath))) {
    return false;
  }

  try {
    const bundledValue = await readJson(bundledPath);
    const bundledCount = getWorkspaceSupportCollectionCount(bundledValue);
    if (rawCount === 0) {
      return bundledCount > 0;
    }
    if (BUNDLED_COUNT_REPAIR_PATHS.has(relativePath)) {
      return bundledCount > rawCount;
    }
    return false;
  } catch {
    return false;
  }
}

function getWorkspaceSupportCollectionCount(value) {
  if (!isPlainObject(value)) {
    return -1;
  }

  for (const key of ["entries", "categories", "collections", "files", "sections"]) {
    if (Array.isArray(value[key])) {
      return value[key].length;
    }
  }

  return -1;
}

async function writeWorkspaceSupportFile(balanceRoot, bundledRoot, spec) {
  const sanitized = sanitizeRelativePath(spec.relativePath);
  const sourcePath = path.join(bundledRoot, sanitized);
  const destinationPath = path.join(balanceRoot, sanitized);
  try {
    if (await pathExists(sourcePath)) {
      await copyBundledPath(sourcePath, destinationPath, { overwrite: true });
      return;
    }
  } catch {
    // Fall through to generated fallback content when the bundled support file is unavailable.
  }

  if (typeof spec.createEmpty === "function") {
    await writeJson(destinationPath, spec.createEmpty());
  }
}

async function writeWorkspaceSeedState(statePath, manifest, previousState, options = {}) {
  const { fullSeed = false, restoredCriticalFiles = [], repairedSupportFiles = [] } = options;
  const now = new Date().toISOString();
  await writeJson(statePath, {
    schemaVersion: 2,
    seedVersion: typeof manifest?.seedVersion === "string" ? manifest.seedVersion : null,
    seededAtUtc: fullSeed
      ? now
      : (typeof previousState?.seededAtUtc === "string" ? previousState.seededAtUtc : now),
    verifiedAtUtc: now,
    restoredCriticalFiles,
    repairedSupportFiles,
    criticalFiles: Array.isArray(manifest?.criticalFiles) ? manifest.criticalFiles : [],
  });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasEntriesArray(value) {
  return isPlainObject(value) && Array.isArray(value.entries);
}

function hasCategoriesArray(value) {
  return isPlainObject(value) && Array.isArray(value.categories);
}

function hasFilesArray(value) {
  return isPlainObject(value) && Array.isArray(value.files);
}

function isStarterDraftFile(value) {
  return isPlainObject(value)
    && Array.isArray(value.blocks)
    && typeof value.displayName === "string"
    && value.displayName.trim().length > 0
    && typeof value.key === "string"
    && value.key.trim().length > 0;
}

function createFallbackStarterDraft(displayName, key) {
  return {
    schemaVersion: 1,
    displayName,
    key,
    enabled: true,
    description: `Generated fallback starter draft for ${displayName}.`,
    blocks: [],
    overrides: {},
    launcher: {
      generatedFallback: true,
    },
  };
}

function resolveWorkspaceLayout(resolvedRoot) {
  const candidates = [
    {
      gameRoot: path.join(resolvedRoot, "Gamefiles", "Latest"),
      balanceRoot: path.join(resolvedRoot, "Gamefiles", "Latest", "UserData", "BalanceMod"),
      valid: () =>
        fs.existsSync(path.join(resolvedRoot, "Gamefiles", "Latest", "bapbap.exe"))
        || fs.existsSync(path.join(resolvedRoot, "Gamefiles", "Latest", "UserData")),
    },
    {
      gameRoot: resolvedRoot,
      balanceRoot: path.join(resolvedRoot, "UserData", "BalanceMod"),
      valid: () =>
        fs.existsSync(path.join(resolvedRoot, "bapbap.exe"))
        || fs.existsSync(path.join(resolvedRoot, "UserData"))
        || fs.existsSync(path.join(resolvedRoot, "MelonLoader")),
    },
  ];

  for (const candidate of candidates) {
    if (candidate.valid()) {
      return candidate;
    }
  }

  return null;
}

function normalizePath(value) {
  return path.resolve(value).replace(/\\/g, "/");
}

function resolveOptionalModProjectRoot(resolvedRoot, balanceRoot) {
  const candidates = [
    path.join(resolvedRoot, "BapBapBalanceMod"),
    path.join(resolvedRoot, "ModProject"),
    path.join(balanceRoot, "ModProject"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return normalizePath(candidate);
    }
  }

  return null;
}

async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function safeReadJson(filePath) {
  if (!(await pathExists(filePath))) {
    return null;
  }

  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

async function everyPathExists(paths) {
  for (const targetPath of paths) {
    if (!(await pathExists(targetPath))) {
      return false;
    }
  }
  return true;
}

async function readJson(filePath) {
  const text = await fsp.readFile(filePath, "utf8");
  return parseJsonText(text, normalizePath(filePath));
}

function parseJsonText(text, source) {
  try {
    return JSON.parse(stripJsonBom(text));
  } catch (error) {
    throw new Error(`${source}: ${error.message}`);
  }
}

function stripJsonBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function copyMissingTree(sourceRoot, destinationRoot, options = {}) {
  const { ignoreFileNames = new Set() } = options;
  const sourceStats = await fsp.stat(sourceRoot);
  if (!sourceStats.isDirectory()) {
    if (!(await pathExists(destinationRoot))) {
      await fsp.mkdir(path.dirname(destinationRoot), { recursive: true });
      await fsp.copyFile(sourceRoot, destinationRoot);
    }
    return;
  }

  await fsp.mkdir(destinationRoot, { recursive: true });
  const entries = await fsp.readdir(sourceRoot, { withFileTypes: true });

  const dirs = [];
  const files = [];
  for (const entry of entries) {
    if (ignoreFileNames.has(entry.name)) continue;
    if (entry.isDirectory()) dirs.push(entry);
    else files.push(entry);
  }

  // Copy files in parallel (batch of 16)
  const BATCH_SIZE = 16;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (entry) => {
      const sourcePath = path.join(sourceRoot, entry.name);
      const destinationPath = path.join(destinationRoot, entry.name);
      if (!(await pathExists(destinationPath))) {
        await fsp.copyFile(sourcePath, destinationPath);
      }
    }));
  }

  // Recurse into directories in parallel
  await Promise.all(dirs.map(entry => {
    const sourcePath = path.join(sourceRoot, entry.name);
    const destinationPath = path.join(destinationRoot, entry.name);
    return copyMissingTree(sourcePath, destinationPath, options);
  }));
}

async function copyBundledPath(sourcePath, destinationPath, options = {}) {
  const { overwrite = false } = options;
  if (!(await pathExists(sourcePath))) {
    return;
  }

  const sourceStats = await fsp.stat(sourcePath);
  if (sourceStats.isDirectory()) {
    if (overwrite && (await pathExists(destinationPath))) {
      await fsp.rm(destinationPath, { recursive: true, force: true });
    }
    await copyMissingTree(sourcePath, destinationPath);
    return;
  }

  if (!overwrite && (await pathExists(destinationPath))) {
    return;
  }

  await fsp.mkdir(path.dirname(destinationPath), { recursive: true });
  await fsp.copyFile(sourcePath, destinationPath);
}

async function writeBytes(filePath, bytes) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, bytes);
}

async function fileMtimeMs(filePath) {
  const stats = await fsp.stat(filePath);
  return Math.floor(stats.mtimeMs);
}

function relativeToWorkspace(workspace, absolutePath) {
  return path.relative(workspace.workspaceRoot, path.resolve(absolutePath)).replace(/\\/g, "/");
}

function sha256Hex(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function ancestorCandidates(start) {
  const values = [];
  let current = path.resolve(start);
  while (true) {
    values.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return values;
}

async function collectFiles(root, recursive) {
  const entries = await fsp.readdir(root, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        results.push(...(await collectFiles(absolutePath, true)));
      }
      continue;
    }
    results.push(absolutePath);
  }
  return results;
}

function sanitizeRelativePath(relativePath) {
  const normalized = String(relativePath).replace(/\\/g, "/").trim();
  if (!normalized) {
    throw new Error(`Invalid relative path '${relativePath}'.`);
  }
  if (path.posix.isAbsolute(normalized) || path.win32.isAbsolute(normalized)) {
    throw new Error(`Invalid relative path '${relativePath}'.`);
  }

  const cleanParts = [];
  for (const part of normalized.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      throw new Error(`Invalid relative path '${relativePath}'.`);
    }
    cleanParts.push(part);
  }

  if (!cleanParts.length) {
    throw new Error(`Invalid relative path '${relativePath}'.`);
  }

  return cleanParts.join("/");
}

function sanitizeFileToken(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, "_");
}

function uniqueDestinationPath(root, fileName) {
  const parsed = path.parse(fileName);
  let candidate = path.join(root, fileName);
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(root, `${parsed.name}_${index}${parsed.ext}`);
    index += 1;
  }
  return candidate;
}

async function copyDirIfExists(source, destination) {
  if (!(await pathExists(source))) {
    return;
  }
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  await fsp.cp(source, destination, { recursive: true });
}

async function backupTimestampDir(workspace, kind) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const targetDir = path.join(workspace.backupRoot, kind, stamp);
  await fsp.mkdir(targetDir, { recursive: true });
  return targetDir;
}

async function backupSingleFile(workspace, sourcePath) {
  const backupDir = await backupTimestampDir(workspace, "save");
  const destination = path.join(backupDir, sanitizeRelativePath(relativeToWorkspace(workspace, sourcePath)));
  await writeBytes(destination, await fsp.readFile(sourcePath));
  return normalizePath(destination);
}

async function copyPathToBackupDir(workspace, sourcePath, backupDir) {
  const destination = path.join(backupDir, sanitizeRelativePath(relativeToWorkspace(workspace, sourcePath)));
  await writeBytes(destination, await fsp.readFile(sourcePath));
}

module.exports = {
  createShared,
  normalizePath,
  pathExists,
  readJson,
  parseJsonText,
  writeJson,
  writeBytes,
  fileMtimeMs,
  relativeToWorkspace,
  sha256Hex,
  collectFiles,
  sanitizeRelativePath,
  sanitizeFileToken,
  uniqueDestinationPath,
  copyDirIfExists,
  backupTimestampDir,
  backupSingleFile,
  copyPathToBackupDir,
  WORKSPACE_SUPPORT_FILE_SPECS,
  // Phase 3 Task 4 — Read-Only Bootstrap public API.
  prepareBalanceModLayout,
  BOOTSTRAP_READ_ONLY_FLAG,
  __private: {
    ensureBundledWorkspaceSupportFiles,
    ensureBundledWorkspaceSupportFileForAbsolutePath,
    restoreBundledWorkspaceFileForAbsolutePathInternal,
    restoreBundledWorkspaceCriticalFiles,
    resolveWorkspaceRepairRelativePathsForAbsolutePath,
  },
};
