export const CONFIG_PACK_EXTENSION = ".rbpack";
export const CONFIG_PACK_SCHEMA_VERSION = 1;
export const CONFIG_PACK_ROOTS = ["Runtime", "Custom", "NativeUI", "ArenaPresets"] as const;
export const CONFIG_PACK_MODES = ["delta", "full"] as const;
export const CONFIG_PACK_CONTENT_ROLES = [
  "runtime-doc",
  "ability-swap-doc",
  "operation-doc",
  "custom-augment",
  "custom-icon",
  "native-ui-doc",
  "arena-preset-doc",
  "import-receipt",
] as const;
export const CONFIG_PACK_CONFLICT_STRATEGIES = [
  "replace-targeted-files",
  "skip-existing-files",
  "merge-json-by-overrides",
  "import-side-by-side",
] as const;

export type ConfigPackRoot = (typeof CONFIG_PACK_ROOTS)[number];
export type ConfigPackMode = (typeof CONFIG_PACK_MODES)[number];
export type ConfigPackContentRole = (typeof CONFIG_PACK_CONTENT_ROLES)[number];
export type ConfigPackConflictStrategy = (typeof CONFIG_PACK_CONFLICT_STRATEGIES)[number];

export interface ConfigPackToolInfo {
  tool: string;
  version: string;
}

export interface ConfigPackGameInfo {
  title: string;
  compatibleGameVersions?: string[];
  compatibleModVersions?: string[];
}

export interface ConfigPackRoots {
  runtime: boolean;
  custom: boolean;
  nativeUi: boolean;
  arenaPresets: boolean;
}

export interface ConfigPackSelectionSummary {
  runtimeCount: number;
  customCount: number;
  nativeUiCount: number;
  arenaPresetCount: number;
  abilitySwapCount: number;
  operationDocCount: number;
  customIconCount: number;
  importReceiptCount: number;
}

export interface ConfigPackFeatureFlags {
  includesRuntimeDocs: boolean;
  includesCustomAugments: boolean;
  includesCustomIcons: boolean;
  includesAbilitySwaps: boolean;
  includesOperationDocs: boolean;
  includesNativeUiDocs: boolean;
  includesArenaPresets: boolean;
  includesImportReceipts: boolean;
}

export interface ConfigPackContentPreview {
  title?: string;
  subtitle?: string;
  description?: string;
  iconPreviewPath?: string;
}

export interface ConfigPackContentEntry {
  root: ConfigPackRoot;
  path: string;
  kind: string;
  contentRole?: ConfigPackContentRole | string;
  targetType?: string;
  targetKey?: string;
  sha256?: string;
  sizeBytes?: number;
  preview?: ConfigPackContentPreview;
}

export interface ConfigPackManifest {
  schemaVersion: number;
  packId: string;
  packVersion: string;
  name: string;
  description?: string;
  author: string;
  createdAtUtc: string;
  createdWith: ConfigPackToolInfo;
  game: ConfigPackGameInfo;
  packageMode: ConfigPackMode;
  defaultConflictStrategy: ConfigPackConflictStrategy;
  roots: ConfigPackRoots;
  selectionSummary?: ConfigPackSelectionSummary;
  features?: ConfigPackFeatureFlags;
  contents: ConfigPackContentEntry[];
}

export interface ConfigPackImportReceipt {
  packId: string;
  packVersion: string;
  importedAtUtc: string;
  importedBy: ConfigPackToolInfo;
  backupPath?: string;
  manifestName?: string;
  manifestVersion?: string;
  importedFiles: Array<{
    root: ConfigPackRoot;
    path: string;
    targetAbsolutePath: string;
    previousSha256?: string;
    importedSha256?: string;
  }>;
}

export interface ConfigPackPreviewRequest {
  workspaceRoot: string;
  selection: string[];
  packId?: string;
  packVersion?: string;
  name?: string;
  description?: string;
  author?: string;
  packageMode?: ConfigPackMode;
  defaultConflictStrategy?: ConfigPackConflictStrategy;
}

export interface ConfigPackExportRequest extends ConfigPackPreviewRequest {
  outputPath: string;
}

export interface ConfigPackImportRequest {
  workspaceRoot: string;
  packPath: string;
  conflictStrategy?: ConfigPackConflictStrategy;
  createBackup?: boolean;
}

export interface ConfigPackPreviewResponse {
  packPath?: string;
  manifest: ConfigPackManifest;
  contents: ConfigPackContentEntry[];
  warnings: string[];
  fileCount: number;
  totalBytes: number;
}

export interface ConfigPackExportResponse {
  outputPath: string;
  manifest: ConfigPackManifest;
  contents: ConfigPackContentEntry[];
  writtenFiles: number;
  writtenBytes: number;
}

export interface ConfigPackImportResponse {
  packPath: string;
  manifest: ConfigPackManifest;
  backupPath?: string | null;
  importedAtUtc: string;
  importedFiles: Array<{
    root: ConfigPackRoot;
    path: string;
    targetAbsolutePath: string;
    previousSha256?: string;
    importedSha256?: string;
  }>;
  receiptPath: string;
  warnings: string[];
}

export interface ConfigPackDropRequest {
  workspaceRoot: string;
  packPath: string;
}

export interface ConfigPackDropResponse {
  sourcePath: string;
  destinationPath: string;
}

export interface ConfigPackReceiptSummary {
  receiptPath: string;
  packId: string;
  packVersion: string;
  importedAtUtc: string;
  importedBy: string;
  backupPath?: string | null;
  importedFileCount: number;
}

export interface InstalledPackSummary {
  packId: string;
  packVersion: string;
  name: string;
  author: string;
  packRoot: string;
  archivedPackPath?: string | null;
  active: boolean;
  activatedAtUtc?: string | null;
  contentFileCount: number;
  arenaPresetCount: number;
}
