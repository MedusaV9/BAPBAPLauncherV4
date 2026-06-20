const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { spawn } = require("node:child_process");

const packageJson = require("../package.json");
const {
  createShared,
  collectFiles,
  fileMtimeMs,
  normalizePath,
  pathExists,
  readJson,
  backupTimestampDir,
  backupSingleFile,
  copyDirIfExists,
  copyPathToBackupDir,
  sanitizeFileToken,
  uniqueDestinationPath,
  writeJson,
  WORKSPACE_SUPPORT_FILE_SPECS,
} = require("./shared.cjs");
const {
  buildCatalog,
  buildSummary,
  readLibraryMetadata,
  listLibraryEntries,
  readOperationCapabilities,
} = require("./catalog.cjs");
const { createPackOps } = require("./packs.cjs");

const bundledWorkspaceRoot = path.resolve(__dirname, "..", "default-workspace");
const referenceCatalogCache = new Map();

/**
 * Path containment check – ensures targetPath resolves inside the given root.
 * Throws if the resolved target escapes the workspace boundary.
 */
function assertPathInside(root, targetPath, label = "path") {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(targetPath);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Refusing ${label} outside the Rebalance workspace: ${targetPath}`);
  }
  return resolvedTarget;
}

/**
 * Enforce that a file path has a .json extension (case-insensitive).
 */
function assertJsonExtension(targetPath, label = "document") {
  const ext = path.extname(targetPath).toLowerCase();
  if (ext !== ".json") {
    throw new Error(`Refusing ${label} with disallowed extension "${ext}" (only .json is allowed): ${targetPath}`);
  }
}

function canBridgeLocalPreviewAsset(targetPath) {
  if (typeof targetPath !== "string" || !/^[A-Za-z]:[\\/]/.test(targetPath)) {
    return false;
  }
  if (/[\\/]AssetRip[\\/]|[\\/]ExportedProject[\\/]|[\\/]Assets[\\/](Texture2D|Sprite|Font)[\\/]/i.test(targetPath)) {
    return false;
  }
  return /[\\/]BalanceMod[\\/]Custom[\\/]/i.test(targetPath);
}

function createBackend({ app, dialog, shell }) {
  const shared = createShared(app);
  const launcherTool = {
    tool: "RebalanceBAP Launcher",
    version: packageJson.version ?? "0.1.0",
  };
  const packs = createPackOps(shared, launcherTool);

  /** Track the active workspace root for handlers that don't receive it explicitly. */
  let activeWorkspaceRoot = null;

  const handlers = {
    bootstrap: async ({ workspaceRoot } = {}) => {
      const settings = await shared.loadSettings();
      const hasExplicitWorkspace =
        typeof workspaceRoot === "string" && workspaceRoot.trim().length > 0;
      const workspace = hasExplicitWorkspace
        ? shared.workspaceRootsFromPath(workspaceRoot)
        : (settings.workspaceRoot ? shared.workspaceRootsFromPath(settings.workspaceRoot) : null)
          ?? (await shared.detectWorkspace());

      if (!workspace) {
        return {
          workspace: null,
          catalog: [],
          summary: buildSummary([]),
          settings,
        };
      }

      // Phase 3 Task 4: Read-Only Bootstrap.
      // Merely opening the Rebalance Studio (the bootstrap IPC handler) must
      // NOT create folders or seed bundled defaults on disk. We pass
      // { readOnly: true } here so ensureWorkspaceLayout becomes a no-op.
      // The first save / write flow (save_workspace_root, open_document,
      // save_document, create_custom_draft, repair_workspace_support_files,
      // pack import/export, etc.) will call ensureWorkspaceLayout() without
      // options, which provisions the folders on demand.
      await shared.ensureWorkspaceLayout(workspace, { readOnly: true });
      const catalog = await buildCatalog(workspace);
      activeWorkspaceRoot = workspace.workspaceRoot;
      return {
        workspace,
        catalog,
        summary: buildSummary(catalog),
        settings: {
          ...settings,
          workspaceRoot: workspace.workspaceRoot,
        },
      };
    },
    pick_workspace_root: async () => {
      const result = await dialog.showOpenDialog({
        title: "Select your BAPBAP game folder",
        properties: ["openDirectory"],
      });
      return result.canceled ? null : normalizePath(result.filePaths[0]);
    },
    pick_pack_export_path: async () => {
      const result = await dialog.showSaveDialog({
        title: "Choose where to save the RebalanceBAP pack",
        defaultPath: "rebalancebap-pack.rbpack",
        filters: [{ name: "RebalanceBAP Pack", extensions: ["rbpack"] }],
      });
      return result.canceled || !result.filePath ? null : normalizePath(result.filePath);
    },
    pick_pack_import_path: async () => {
      const result = await dialog.showOpenDialog({
        title: "Choose a RebalanceBAP pack to import",
        properties: ["openFile"],
        filters: [{ name: "RebalanceBAP Pack", extensions: ["rbpack"] }],
      });
      return result.canceled ? null : normalizePath(result.filePaths[0]);
    },
    save_workspace_root: async ({ workspaceRoot }) => {
      const workspace = shared.validateWorkspace(workspaceRoot);
      const settings = { workspaceRoot: workspace.workspaceRoot };
      await shared.persistSettings(settings);
      await shared.ensureWorkspaceLayout(workspace);
      await ensureFreshInstanceLibraryFallbacks(shared, workspace);
      const catalog = await buildCatalog(workspace);
      activeWorkspaceRoot = workspace.workspaceRoot;
      return { workspace, catalog, summary: buildSummary(catalog), settings };
    },
    open_document: async ({ workspaceRoot, absolutePath }) => {
      const workspace = shared.validateWorkspace(workspaceRoot);
      await shared.ensureWorkspaceLayout(workspace);
      const resolvedPath = assertPathInside(workspace.workspaceRoot, absolutePath, "open_document path");
      assertJsonExtension(resolvedPath, "open_document");
      if (!(await pathExists(resolvedPath))) {
        await restoreWorkspaceBundledFileForPath(shared, workspace, resolvedPath);
        await ensureWorkspaceSupportFileForPath(shared, workspace, resolvedPath, {
          refreshSupportFiles: true,
        });
      }
      let raw = null;
      try {
        raw = await readJson(resolvedPath);
      } catch (error) {
        const restored = await restoreWorkspaceBundledFileForPath(shared, workspace, resolvedPath, {
          overwrite: true,
        });
        const repaired = restored || await ensureWorkspaceSupportFileForPath(shared, workspace, resolvedPath, {
          refreshSupportFiles: true,
        });
        if (!repaired) {
          throw error;
        }
        raw = await readJson(resolvedPath);
      }
      const relativePath = path.relative(workspace.workspaceRoot, resolvedPath).replace(/\\/g, "/");
      raw = await enrichRuntimeDocumentWithBundledFallback(workspace, relativePath, raw);
      return {
        absolutePath: normalizePath(resolvedPath),
        relativePath,
        mtimeMs: await fileMtimeMs(resolvedPath),
        raw,
      };
    },
    save_document: async ({ request }) => {
      const workspace = shared.validateWorkspace(request.workspaceRoot);
      const resolvedPath = assertPathInside(workspace.workspaceRoot, request.absolutePath, "save_document path");
      assertJsonExtension(resolvedPath, "save_document");
      if (!(await pathExists(resolvedPath))) {
        throw new Error("The target file no longer exists on disk.");
      }
      const currentMtime = await fileMtimeMs(resolvedPath);
      if (request.expectedMtimeMs && currentMtime !== request.expectedMtimeMs) {
        throw new Error(
          "This file changed on disk while the launcher was open. Reload it before saving again.",
        );
      }
      const backupPath = request.createBackup
        ? await backupSingleFile(workspace, resolvedPath)
        : null;
      await writeJson(resolvedPath, request.raw);
      return {
        absolutePath: normalizePath(resolvedPath),
        mtimeMs: await fileMtimeMs(resolvedPath),
        backupPath,
        savedAtUtc: new Date().toISOString(),
      };
    },
    create_custom_draft: async ({ request }) => {
      const workspace = shared.validateWorkspace(request.workspaceRoot);
      await shared.ensureWorkspaceLayout(workspace);

      const sourcePath = await resolveCustomDraftSourcePath(workspace, request.sourceAbsolutePath);
      if (!sourcePath) {
        throw new Error(
          "No bundled starter draft is available yet. Re-open the profile once so the launcher can seed the default custom files.",
        );
      }

      const sourceRaw = await readJson(sourcePath);
      const displayName = resolveNextCustomDraftName(sourceRaw, sourcePath, request.suggestedName);
      const nextRaw = cloneJson(sourceRaw);
      nextRaw.displayName = displayName;
      nextRaw.key = await buildUniqueCustomDraftKey(workspace, displayName);
      delete nextRaw.id;
      delete nextRaw.resolvedName;

      if (!nextRaw.launcher || typeof nextRaw.launcher !== "object" || Array.isArray(nextRaw.launcher)) {
        nextRaw.launcher = {};
      }
      nextRaw.launcher.lastStarterSuggestedName = displayName;

      const destinationRoot = path.join(workspace.customRoot, "Augments");
      const destinationPath = uniqueDestinationPath(
        destinationRoot,
        `${buildCustomDraftFileToken(displayName)}.json`,
      );

      await writeJson(destinationPath, nextRaw);

      return {
        absolutePath: normalizePath(destinationPath),
        relativePath: path.relative(workspace.workspaceRoot, destinationPath).replace(/\\/g, "/"),
        mtimeMs: await fileMtimeMs(destinationPath),
        raw: nextRaw,
      };
    },
    create_workspace_snapshot: async ({ workspaceRoot }) => {
      const workspace = shared.validateWorkspace(workspaceRoot);
      await shared.ensureWorkspaceLayout(workspace);
      const backupDir = await backupTimestampDir(workspace, "snapshot");
      await copyDirIfExists(workspace.runtimeRoot, path.join(backupDir, "Runtime"));
      await copyDirIfExists(workspace.customRoot, path.join(backupDir, "Custom"));
      await copyDirIfExists(workspace.nativeUiRoot, path.join(backupDir, "NativeUI"));
      return { backupPath: normalizePath(backupDir), createdAtUtc: new Date().toISOString() };
    },
    repair_workspace_support_files: async ({ workspaceRoot }) => {
      const workspace = shared.validateWorkspace(workspaceRoot);
      await shared.ensureWorkspaceLayout(workspace);

      const balanceRoot = path.resolve(workspace.runtimeRoot, "..");
      const supportPaths = WORKSPACE_SUPPORT_FILE_SPECS
        .map((spec) => path.join(balanceRoot, spec.relativePath))
        .filter((absolutePath) => path.resolve(absolutePath).startsWith(balanceRoot));

      let backupPath = null;
      const existingPaths = [];
      for (const absolutePath of supportPaths) {
        if (await pathExists(absolutePath)) {
          existingPaths.push(absolutePath);
        }
      }

      if (existingPaths.length > 0) {
        const backupDir = await backupTimestampDir(workspace, "repair");
        for (const absolutePath of existingPaths) {
          await copyPathToBackupDir(workspace, absolutePath, backupDir);
        }
        backupPath = normalizePath(backupDir);
      }

      const repairedSupportFiles = await shared.ensureWorkspaceSupportFiles(workspace, {
        refreshSupportFiles: true,
      });

      await ensureFreshInstanceLibraryFallbacks(shared, workspace);

      return {
        backupPath,
        repairedSupportFiles,
        repairedAtUtc: new Date().toISOString(),
      };
    },
    launch_game: async ({ workspaceRoot }) => {
      const workspace = shared.validateWorkspace(workspaceRoot);
      if (!(await pathExists(workspace.gameExe))) {
        throw new Error("Could not find bapbap.exe in the selected game folder.");
      }
      const child = spawn(workspace.gameExe, [], { cwd: path.dirname(workspace.gameExe), detached: true, stdio: "ignore" });
      child.unref();
    },
    open_in_explorer: async ({ path: targetPath }) => {
      if (!activeWorkspaceRoot) {
        throw new Error("Cannot open in explorer: no active workspace root has been established.");
      }
      const resolvedPath = assertPathInside(activeWorkspaceRoot, targetPath, "open_in_explorer path");
      if (await pathExists(resolvedPath)) {
        shell.showItemInFolder(resolvedPath);
        return;
      }
      const result = await shell.openPath(resolvedPath);
      if (result) throw new Error(result);
    },
    export_pack_preview: async ({ request }) => {
      const workspace = shared.validateWorkspace(request.workspaceRoot);
      await shared.ensureWorkspaceLayout(workspace);
      return packs.buildPackPreview(workspace, request.selection ?? [], request);
    },
    export_pack: async ({ request }) => {
      const workspace = shared.validateWorkspace(request.workspaceRoot);
      await shared.ensureWorkspaceLayout(workspace);
      const preview = await packs.buildPackPreview(workspace, request.selection ?? [], request);
      return packs.writePackArchive(workspace, request.outputPath, preview);
    },
    import_pack_preview: async ({ request }) => packs.readPackPreview(request.packPath),
    import_pack: async ({ request }) => {
      const workspace = shared.validateWorkspace(request.workspaceRoot);
      await shared.ensureWorkspaceLayout(workspace);
      return packs.importPack(workspace, request);
    },
    drop_pack_to_mod: async ({ request }) => {
      const workspace = shared.validateWorkspace(request.workspaceRoot);
      await shared.ensureWorkspaceLayout(workspace);
      return packs.dropPackToMod(workspace, request.packPath);
    },
    list_import_receipts: async ({ workspaceRoot }) => {
      const workspace = shared.validateWorkspace(workspaceRoot);
      await shared.ensureWorkspaceLayout(workspace);
      return packs.listImportReceipts(workspace);
    },
    list_installed_packs: async ({ workspaceRoot }) => {
      const workspace = shared.validateWorkspace(workspaceRoot);
      await shared.ensureWorkspaceLayout(workspace);
      return packs.readInstalledPackSummaries(workspace);
    },
    set_active_content_pack: async ({ workspaceRoot, packId }) => {
      const workspace = shared.validateWorkspace(workspaceRoot);
      await shared.ensureWorkspaceLayout(workspace);
      return packs.setActiveContentPack(workspace, packId);
    },
    read_game_mode_index: async ({ workspaceRoot }) => {
      const workspace = shared.validateWorkspace(workspaceRoot);
      await shared.ensureWorkspaceLayout(workspace);
      const gameModeIndexPath = path.join(workspace.runtimeRoot, "ArenaSettings", "GameModes.index.json");
      if (!(await pathExists(gameModeIndexPath))) {
        return {
          absolutePath: normalizePath(gameModeIndexPath),
          raw: {
            entries: [],
            currentDisplayName: null,
            currentModeKey: null,
            currentGameModeId: null,
          },
        };
      }
      return { absolutePath: normalizePath(gameModeIndexPath), raw: await readJson(gameModeIndexPath) };
    },
    refresh_game_mode_probe: async ({ workspaceRoot }) => handlers.read_game_mode_index({ workspaceRoot }),
    read_operation_capabilities: async ({ workspaceRoot, absolutePath }) =>
      readOperationCapabilities(shared.validateWorkspace(workspaceRoot), absolutePath),
    read_library_metadata: async ({ workspaceRoot }) => {
      const workspace = shared.validateWorkspace(workspaceRoot);
      await shared.ensureWorkspaceLayout(workspace);
      await ensureFreshInstanceLibraryFallbacks(shared, workspace);
      return readLibraryMetadata(workspace);
    },
    list_library_entries: async ({ request }) => {
      const workspace = shared.validateWorkspace(request.workspaceRoot);
      await shared.ensureWorkspaceLayout(workspace);
      await ensureFreshInstanceLibraryFallbacks(shared, workspace);
      return listLibraryEntries(workspace, request);
    },
  };

  return {
    async invoke(command, args = {}) {
      const handler = handlers[command];
      if (!handler) {
        throw new Error(`Unknown Electron backend command '${command}'.`);
      }
      return handler(args);
    },
    fileSrc(targetPath) {
      if (!canBridgeLocalPreviewAsset(targetPath)) {
        throw new Error(`Refusing to bridge non-custom preview path '${targetPath}'.`);
      }
      return pathToFileURL(targetPath).toString();
    },
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function ensureFreshInstanceLibraryFallbacks(shared, workspace) {
  return shared.ensureWorkspaceSupportFiles(workspace);
}

async function enrichRuntimeDocumentWithBundledFallback(workspace, relativePath, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  const bundledPath = path.join(bundledWorkspaceRoot, relativePath);
  if (!(await pathExists(bundledPath))) {
    return raw;
  }

  let bundledRaw = null;
  try {
    bundledRaw = await readJson(bundledPath);
  } catch {
    bundledRaw = null;
  }

  if (!bundledRaw || typeof bundledRaw !== "object" || Array.isArray(bundledRaw)) {
    return raw;
  }

  const referenceCatalog = await loadReferenceCatalog(workspace);
  return mergeRuntimeDocument(raw, bundledRaw, referenceCatalog);
}

async function loadReferenceCatalog(workspace) {
  const workspacePaths = [
    workspace.libraryIconsIndexPath,
    workspace.libraryTemplatesIndexPath,
    path.join(workspace.customRoot, "Icons.index.json"),
  ];
  const bundledPaths = [
    path.join(bundledWorkspaceRoot, "Library", "Icons.index.json"),
    path.join(bundledWorkspaceRoot, "Library", "Templates.index.json"),
    path.join(bundledWorkspaceRoot, "Custom", "Icons.index.json"),
  ];

  const fingerprint = await buildReferenceCatalogFingerprint([...workspacePaths, ...bundledPaths]);
  const cacheKey = `${workspace.workspaceRoot}::${fingerprint}`;
  const cached = referenceCatalogCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const catalog = {
    icons: mergeCatalogItems(
      [...(await readIndexEntries(workspace.libraryIconsIndexPath)), ...(await readIndexEntries(path.join(workspace.customRoot, "Icons.index.json")))],
      [...(await readIndexEntries(path.join(bundledWorkspaceRoot, "Library", "Icons.index.json"))), ...(await readIndexEntries(path.join(bundledWorkspaceRoot, "Custom", "Icons.index.json")))],
      readIconChoiceKey,
    ),
    templates: mergeCatalogItems(
      await readIndexEntries(workspace.libraryTemplatesIndexPath),
      await readIndexEntries(path.join(bundledWorkspaceRoot, "Library", "Templates.index.json")),
      readTemplateChoiceKey,
    ),
  };
  referenceCatalogCache.set(cacheKey, catalog);
  return catalog;
}

async function buildReferenceCatalogFingerprint(paths) {
  const parts = [];
  for (const targetPath of paths) {
    if (!targetPath || !(await pathExists(targetPath))) {
      continue;
    }
    parts.push(`${normalizePath(targetPath)}:${await fileMtimeMs(targetPath)}`);
  }
  return parts.join("|");
}

async function readIndexEntries(indexPath) {
  if (!indexPath || !(await pathExists(indexPath))) {
    return [];
  }
  const raw = await readJson(indexPath);
  return extractIndexEntries(raw);
}

function extractIndexEntries(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === "object") {
    for (const key of ["entries", "items", "results", "icons", "templates"]) {
      if (Array.isArray(value[key])) {
        return value[key];
      }
    }
  }
  return [];
}

function mergeRuntimeDocument(primary, fallback, referenceCatalog) {
  const merged = {
    ...cloneJsonValue(fallback),
    ...cloneJsonValue(primary),
  };

  merged.quickEdit = mergeEntriesByKey(primary.quickEdit, fallback.quickEdit, (entry) => entry?.path ?? entry?.setting);
  merged.simpleSettings = mergeSimpleSettings(primary.simpleSettings, fallback.simpleSettings);
  merged.advanced = mergeAdvancedSection(primary.advanced, fallback.advanced);
  merged.referenceChoices = expandReferenceChoices(
    mergeEntriesByKey(primary.referenceChoices, fallback.referenceChoices, (entry) => entry?.path),
    referenceCatalog,
  );
  merged.iconChoices = mergeEntriesByKey(primary.iconChoices, fallback.iconChoices, readIconChoiceKey);
  merged.textTokens = mergeEntriesByKey(primary.textTokens, fallback.textTokens, (entry) => entry?.sourcePath ?? entry?.label);
  merged.librarySuggestions = mergeEntriesByKey(primary.librarySuggestions, fallback.librarySuggestions, (entry) => entry?.targetPath ?? entry?.blockId ?? entry?.label);
  merged.removalCandidates = mergeEntriesByKey(primary.removalCandidates, fallback.removalCandidates, (entry) => entry?.path ?? entry?.id ?? entry?.label);
  merged.namedCollections = mergeEntriesByKey(primary.namedCollections, fallback.namedCollections, (entry) => entry?.path ?? entry?.id ?? entry?.label);
  merged.guidedActions = mergeEntriesByKey(primary.guidedActions, fallback.guidedActions, (entry) => entry?.id ?? entry?.label ?? entry?.path);
  merged.collectionEditors = mergeEntriesByKey(primary.collectionEditors, fallback.collectionEditors, (entry) => entry?.path ?? entry?.label);
  merged.librarySlots = mergeEntriesByKey(primary.librarySlots, fallback.librarySlots, (entry) => entry?.slotId ?? entry?.path ?? entry?.label);
  merged.documentation = mergeStringArray(primary.documentation, fallback.documentation);
  merged.instructions = mergeStringArray(primary.instructions, fallback.instructions);
  merged.cardPreview = mergeDefinedFields(fallback.cardPreview, primary.cardPreview);
  merged.uiCapabilities = mergeDefinedFields(fallback.uiCapabilities, primary.uiCapabilities);
  merged.nativeUiPlacement = mergeDefinedFields(fallback.nativeUiPlacement, primary.nativeUiPlacement);

  if (fallback.operations || primary.operations) {
    merged.operations = {
      ...(fallback.operations ?? {}),
      ...(primary.operations ?? {}),
      entries: mergeEntriesByKey(primary.operations?.entries, fallback.operations?.entries, (entry) => `${entry?.type ?? "op"}::${entry?.path ?? entry?.label ?? ""}`),
    };
  }

  return merged;
}

function mergeSimpleSettings(primary, fallback) {
  if (!primary && !fallback) {
    return primary ?? fallback;
  }

  return {
    ...(fallback ?? {}),
    ...(primary ?? {}),
    whatYouCanChange: mergeStringArray(primary?.whatYouCanChange, fallback?.whatYouCanChange),
    copyAndSwapTips: mergeStringArray(primary?.copyAndSwapTips, fallback?.copyAndSwapTips),
    groups: mergeEntriesByKey(
      primary?.groups,
      fallback?.groups,
      (group) => group?.category,
      (primaryGroup, fallbackGroup) => ({
        ...(fallbackGroup ?? {}),
        ...(primaryGroup ?? {}),
        entries: mergeEntriesByKey(primaryGroup?.entries, fallbackGroup?.entries, (entry) => entry?.path ?? entry?.name),
      }),
    ),
  };
}

function mergeAdvancedSection(primary, fallback) {
  if (!primary && !fallback) {
    return primary ?? fallback;
  }

  return {
    ...(fallback ?? {}),
    ...(primary ?? {}),
    fields: mergeEntriesByKey(primary?.fields, fallback?.fields, (field) => field?.path),
    defaults: {
      ...(fallback?.defaults ?? {}),
      ...(primary?.defaults ?? {}),
    },
    effectiveValues: {
      ...(fallback?.effectiveValues ?? {}),
      ...(primary?.effectiveValues ?? {}),
    },
  };
}

function expandReferenceChoices(referenceChoices, referenceCatalog) {
  return (referenceChoices ?? []).map((choice) => {
    const availableReferences = new Set(Array.isArray(choice?.availableReferences) ? choice.availableReferences : []);
    const suggestions = new Set(Array.isArray(choice?.suggestions) ? choice.suggestions : []);
    const iconChoices = mergeEntriesByKey(
      Array.isArray(choice?.iconChoices) ? choice.iconChoices : [],
      [],
      readIconChoiceKey,
    );

    if (isPassiveReferenceChoice(choice)) {
      for (const reference of buildPassiveTemplateReferences(referenceCatalog.templates)) {
        availableReferences.add(reference);
      }
      suggestions.add("Passive");
      suggestions.add("Augment");
    }

    if (isSpriteReferenceChoice(choice)) {
      for (const iconChoice of referenceCatalog.icons) {
        const reference = readIconChoiceReference(iconChoice);
        if (!reference) {
          continue;
        }
        availableReferences.add(reference);
      }
      suggestions.add("Icon");
      suggestions.add("Sprite");
      const mergedIconChoices = mergeEntriesByKey(iconChoices, referenceCatalog.icons, readIconChoiceKey);
      choice = {
        ...choice,
        iconChoices: mergedIconChoices,
      };
    }

    return {
      ...choice,
      availableReferences: Array.from(availableReferences).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" })),
      suggestions: Array.from(suggestions).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" })),
    };
  });
}

function buildPassiveTemplateReferences(templates) {
  const references = new Set();
  for (const template of templates ?? []) {
    if ((template?.targetType ?? "").toLowerCase() !== "passive") {
      continue;
    }
    const targetKey = typeof template?.targetKey === "string" ? template.targetKey.trim() : "";
    if (!targetKey) {
      continue;
    }
    references.add(`PassiveSO:${targetKey.replace(/#.*$/, "")}`);
  }
  return references;
}

function isPassiveReferenceChoice(choice) {
  const referenceType = String(choice?.referenceType ?? "").toLowerCase();
  const currentReference = String(choice?.currentReference ?? "").toLowerCase();
  const label = String(choice?.label ?? "").toLowerCase();
  const pathValue = String(choice?.path ?? "").toLowerCase();
  return referenceType.includes("passive")
    || currentReference.startsWith("passiveso:")
    || label.includes("passive")
    || pathValue.includes("passive");
}

function isSpriteReferenceChoice(choice) {
  const referenceType = String(choice?.referenceType ?? "").toLowerCase();
  const currentReference = String(choice?.currentReference ?? "").toLowerCase();
  const label = String(choice?.label ?? "").toLowerCase();
  const pathValue = String(choice?.path ?? "").toLowerCase();
  return referenceType.includes("sprite")
    || referenceType.includes("icon")
    || currentReference.startsWith("sprite:")
    || label.includes("icon")
    || pathValue.includes("icon");
}

function mergeEntriesByKey(primaryEntries, fallbackEntries, keyResolver, mergeItem) {
  const mergedByKey = new Map();

  for (const entry of fallbackEntries ?? []) {
    const key = keyResolver(entry);
    if (!key) {
      continue;
    }
    mergedByKey.set(String(key).toLowerCase(), cloneJsonValue(entry));
  }

  for (const entry of primaryEntries ?? []) {
    const key = keyResolver(entry);
    if (!key) {
      continue;
    }
    const normalizedKey = String(key).toLowerCase();
    const existing = mergedByKey.get(normalizedKey);
    mergedByKey.set(
      normalizedKey,
      mergeItem
        ? mergeItem(entry, existing)
        : (existing ? mergeDefinedFields(existing, entry) : cloneJsonValue(entry)),
    );
  }

  return Array.from(mergedByKey.values());
}

function mergeCatalogItems(primaryEntries, fallbackEntries, keyResolver) {
  return mergeEntriesByKey(primaryEntries, fallbackEntries, keyResolver);
}

function mergeStringArray(primaryValues, fallbackValues) {
  return Array.from(new Set([...(fallbackValues ?? []), ...(primaryValues ?? [])].filter((value) => typeof value === "string" && value.trim())));
}

function readTemplateChoiceKey(entry) {
  return readFirstString(entry, ["templatePassiveKey", "targetKey", "file", "label"]);
}

function readIconChoiceKey(entry) {
  return readFirstString(entry, ["reference", "key", "value", "passiveKey", "sourcePassiveKey", "spriteName", "label"]);
}

function readIconChoiceReference(entry) {
  return readFirstString(entry, ["reference", "key", "value"]);
}

function readFirstString(entry, fields) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  for (const field of fields) {
    const candidate = entry[field];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function mergeDefinedFields(baseValue, overrideValue) {
  if (overrideValue === undefined || overrideValue === null || overrideValue === "") {
    return cloneJsonValue(baseValue);
  }
  if (baseValue === undefined || baseValue === null || baseValue === "") {
    return cloneJsonValue(overrideValue);
  }
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

function cloneJsonValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function ensureWorkspaceSupportFileForPath(shared, workspace, absolutePath, options = {}) {
  return shared.ensureWorkspaceSupportFileForAbsolutePath(workspace, absolutePath, options);
}

async function restoreWorkspaceBundledFileForPath(shared, workspace, absolutePath, options = {}) {
  return shared.restoreBundledWorkspaceFileForAbsolutePath(workspace, absolutePath, options);
}

async function resolveCustomDraftSourcePath(workspace, sourceAbsolutePath) {
  const candidatePaths = [];
  if (typeof sourceAbsolutePath === "string" && sourceAbsolutePath.trim()) {
    candidatePaths.push(path.resolve(sourceAbsolutePath));
  }

  candidatePaths.push(
    ...(await listCustomDraftSources(path.join(workspace.customRoot, "Augments"))),
    ...(await listCustomDraftSources(path.resolve(__dirname, "..", "default-workspace", "Custom", "Augments"))),
  );

  for (const candidate of candidatePaths) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function listCustomDraftSources(root) {
  if (!(await pathExists(root))) {
    return [];
  }

  const entries = await collectFiles(root, false);
  return entries
    .filter((entry) => entry.toLowerCase().endsWith(".json"))
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

function resolveNextCustomDraftName(sourceRaw, sourcePath, suggestedName) {
  if (typeof suggestedName === "string" && suggestedName.trim()) {
    return suggestedName.trim();
  }

  const sourceDisplayName =
    typeof sourceRaw?.displayName === "string" && sourceRaw.displayName.trim()
      ? sourceRaw.displayName.trim()
      : path.basename(sourcePath, path.extname(sourcePath));

  return sourceDisplayName.toLowerCase().startsWith("copy of ")
    ? sourceDisplayName
    : `Copy of ${sourceDisplayName}`;
}

function buildCustomDraftFileToken(displayName) {
  const token = sanitizeFileToken(displayName || "New_Custom_Augment").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return token || "New_Custom_Augment";
}

function buildCustomDraftKeyBase(displayName) {
  const token = String(displayName || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return token ? `P_CUSTOM_${token}` : "P_CUSTOM_NEW_AUGMENT";
}

async function buildUniqueCustomDraftKey(workspace, displayName) {
  const customAugmentRoot = path.join(workspace.customRoot, "Augments");
  const existingFiles = await listCustomDraftSources(customAugmentRoot);
  const existingKeys = new Set();

  for (const filePath of existingFiles) {
    try {
      const raw = await readJson(filePath);
      if (typeof raw?.key === "string" && raw.key.trim()) {
        existingKeys.add(raw.key.trim().toUpperCase());
      }
    } catch {
      // ignore malformed starter drafts while generating a new key
    }
  }

  const baseKey = buildCustomDraftKeyBase(displayName);
  let candidate = baseKey;
  let index = 2;
  while (existingKeys.has(candidate)) {
    candidate = `${baseKey}_${index}`;
    index += 1;
  }
  return candidate;
}

module.exports = {
  createBackend,
};
