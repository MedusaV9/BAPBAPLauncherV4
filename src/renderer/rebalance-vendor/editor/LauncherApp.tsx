import { createDataCache } from "../data/DataCache";
import { createDiffEngine } from "../data/DiffEngine";
import { createWriteScheduler } from "../data/WriteScheduler";
import { DataLayerProvider } from "../data/DataCacheContext";
import { ShaderLoader, type LoadPhase } from "../components/ShaderLoader";
import { ShaderLoaderFallback } from "../components/ShaderLoaderFallback";
import { ShaderTransitionWrapper } from "../components/ShaderTransitions";
import { Button, Spinner } from "./ui";
import {
  CircleHelp,
  FileCog,
  Gamepad2,
  History,
  PackageOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { lazy, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { PageSkeletonProps } from "./components/SkeletonLoader";
import { PageSkeleton } from "./components/SkeletonLoader";
import { DeferredSuspense } from "./components/DeferredSuspense";
import { FadeInOnMount } from "./FadeInOnMount";
import { GlobalErrorBoundary } from "./components/GlobalErrorBoundary";
import { HistoryPanel } from "./components/HistoryPanel";
import { DiffView } from "./components/DiffView";
import { computeDiff, type DiffHunk } from "./helpers/compute-diff";
import { applyTheme, loadTheme, type ThemeId } from "./helpers/theme";
import launcherWordmarkAsset from "../../assets/brand/BAPBAP_Logo_Horizontal_White.svg";

import { launcherApi } from "./api";
import { createGuidedTour } from "./guidedTour";
import { getErrorMessage } from "./errors";
import gsap from "gsap";
import { useDrawerAnimation, useOverlayEntranceMotion, usePageTransition, useRebalanceInteractionMotion, useWorkspaceTopbarMotion, useToastStore, dismissToast, showToast, type PageTransitionDirection, type ToastItem } from "./motion";
import { useEnterTransition } from "./useEnterTransition";
import {
  cloneJson,
  formatJson,
  materializeRuntimeDocument,
  parseJsonObject,
  parseValueInput,
  toEditableOverrideMap,
} from "./document";
import type { ExperienceMode } from "./common";
import type { EditorGroupKey } from "./EditorPage";
import type {
  ConfigPackConflictStrategy,
  ConfigPackPreviewResponse,
  ConfigPackReceiptSummary,
  InstalledPackSummary,
} from "./configPacks";
import type {
  BootstrapPayload,
  CatalogEntry,
  GameModeIndexResponse,
  JsonObject,
  JsonValue,
  LibraryMetadataResponse,
  OperationCapabilitiesResponse,
  RuntimeDocument,
  SharedCollectionEntry,
  TargetOperationEntry,
} from "./types";

export type PageKey = "dashboard" | "editor" | "gamemode" | "library" | "remove" | "swap" | "custom" | "packs" | "settings" | "tutorial";

interface LoadedEntryState {
  document?: RuntimeDocument;
  absolutePath?: string;
  mtimeMs?: number;
  draftOverrides: Record<string, JsonValue>;
  draftOperations: TargetOperationEntry[];
  overrideText: string;
  overrideTextError?: string;
  customDraft?: JsonObject;
  customDraftTextError?: string;
  loading: boolean;
  saving: boolean;
  error?: string;
  lastSavedAt?: string;
  lastBackupPath?: string | null;
  operationCapabilities?: OperationCapabilitiesResponse | null;
}

interface PersistedEntryDraft {
  absolutePath?: string;
  draftOverrides?: Record<string, JsonValue>;
  draftOperations?: TargetOperationEntry[];
  overrideText?: string;
  customDraft?: JsonObject;
}

interface RebalanceSearchTarget {
  page: PageKey;
  entryId?: string | null;
  customId?: string | null;
  group?: EditorGroupKey | null;
  search?: string | null;
  command?: string | null;
}

interface RebalanceSearchItem {
  id: string;
  title: string;
  subtitle: string;
  section: string;
  badge: string;
  keywords: string[];
  priority: number;
  target: RebalanceSearchTarget;
}

interface SnapshotCopyTargetOption {
  id: string;
  label: string;
  description: string;
}

const SNAPSHOT_COPY_ALIAS_KEYS: Record<string, string[]> = {
  pointstowin: ["scoretowin"],
  pointsperroundwin: ["pointsperwin"],
  lobbysize: ["maxnumberofplayers"],
};

const RUNTIME_DOCUMENT_ALIAS_TARGETS: Record<string, string[]> = {
  "Item_Ability_BloodDive#433": ["P_BloodDive#196"],
  "Item_Ability_HpBonus#438": ["Consumable_L_HpBonus#59"],
  "Item_Ability_SpawnableBumper#446": ["Consumable_Bumper#8"],
};

const SETUP_COMPLETE_KEY = "rebalancebap.setup.complete";
const MODE_KEY = "rebalancebap.editor.mode";
const DRAFTS_KEY = "rebalancebap.entrydrafts";
const LIBRARY_PREFS_KEY = "rebalancebap.libraryprefs";
// Phase 4 — workspace-keyed doc snapshot store. Each entry on the active doc
// is { savedAt, overrides } where `overrides` is the materialised override map
// returned by `diffEngine.getAllOverrides(docPath)`. The Compare with snapshot
// HUD entry uses the LATEST snapshot's overrides as the LEFT side of the diff
// (current overrides as RIGHT). Persisted to localStorage so snapshots survive
// reloads, and restored when the workspace boots.
const DOC_SNAPSHOTS_KEY = "rebalancebap.docsnapshots.v1";
// Phase 4 — cap how many doc snapshots we retain per doc. Oldest entries are
// dropped FIFO once a save would push the list past this limit, both in the
// in-memory store and on the persisted localStorage payload.
const DOC_SNAPSHOTS_PER_DOC_LIMIT = 20;

interface DocSnapshotEntry {
  id: string;
  savedAt: string;
  overrides: Record<string, unknown>;
}

function createDocSnapshotId(): string {
  // Avoid relying on `crypto.randomUUID` — jsdom and older browser harnesses
  // don't always have it. A timestamp + random suffix is enough for HUD list
  // keys and for matching a snapshot back to a localStorage entry.
  return `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const bootstrapCache = new Map<string, BootstrapPayload>();
const packReceiptsCache = new Map<string, ConfigPackReceiptSummary[]>();
const installedPacksCache = new Map<string, InstalledPackSummary[]>();
const gameModeIndexCache = new Map<string, GameModeIndexResponse | null>();
const libraryMetadataCache = new Map<string, LibraryMetadataResponse>();
const libraryMetadataRequestCache = new Map<string, Promise<LibraryMetadataResponse>>();
const operationCapabilitiesCache = new Map<string, OperationCapabilitiesResponse | null>();
const preloadedPageModules = new Set<PageKey>();
const scheduledPageModulePreloads = new Map<PageKey, { kind: "idle" | "timeout"; handle: number }>();

type IdleCallbackHandle = number;
type IdleCallbackDeadlineLike = { didTimeout: boolean; timeRemaining: () => number };
type IdleWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (callback: (deadline: IdleCallbackDeadlineLike) => void, options?: { timeout?: number }) => IdleCallbackHandle;
    cancelIdleCallback?: (handle: IdleCallbackHandle) => void;
  };

const loadSetupPage = async () => {
  const module = await import("./SetupPage");
  return { default: module.SetupPage };
};

const loadDashboardPage = async () => {
  const module = await import("./DashboardPage");
  return { default: module.DashboardPage };
};

const loadEditorPage = async () => {
  const module = await import("./EditorPage");
  return { default: module.EditorPage };
};

const loadGameModePage = async () => {
  const module = await import("./GameModePage");
  return { default: module.GameModePage };
};

const loadAddLibraryPage = async () => {
  const module = await import("./AddLibraryPage");
  return { default: module.AddLibraryPage };
};

const loadRemoveWorkspacePanel = async () => {
  const module = await import("./RemoveWorkspacePanel");
  return { default: module.RemoveWorkspacePanel };
};

const loadSwapAbilityPage = async () => {
  const module = await import("./SwapAbilityPage");
  return { default: module.SwapAbilityPage };
};

const loadCustomBuilderPage = async () => {
  const module = await import("./CustomBuilderPage");
  return { default: module.CustomBuilderPage };
};

const loadPackToolsPage = async () => {
  const module = await import("./PackToolsPage");
  return { default: module.PackToolsPage };
};

const loadTutorialPage = async () => {
  const module = await import("./TutorialPage");
  return { default: module.TutorialPage };
};

const loadSettingsPage = async () => {
  const module = await import("./SettingsPage");
  return { default: module.SettingsPage };
};

const LazySetupPage = lazy(loadSetupPage);
const LazyDashboardPage = lazy(loadDashboardPage);
const LazyEditorPage = lazy(loadEditorPage);
const LazyGameModePage = lazy(loadGameModePage);
const LazyAddLibraryPage = lazy(loadAddLibraryPage);
const LazyRemoveWorkspacePanel = lazy(loadRemoveWorkspacePanel);
const LazySwapAbilityPage = lazy(loadSwapAbilityPage);
const LazyCustomBuilderPage = lazy(loadCustomBuilderPage);
const LazyPackToolsPage = lazy(loadPackToolsPage);
const LazyTutorialPage = lazy(loadTutorialPage);
const LazySettingsPage = lazy(loadSettingsPage);

function getWorkspaceCacheKey(workspaceRoot: string | null | undefined) {
  const normalized = workspaceRoot?.trim();
  return normalized && normalized.length > 0 ? normalized : "__selected_launcher_profile__";
}

function getOperationCapabilityCacheKey(workspaceRoot: string, absolutePath: string) {
  return `${workspaceRoot}::${absolutePath}`;
}

function scheduleIdleTask(task: () => void, timeout = 1200) {
  const idleWindow = window as IdleWindow;
  if (typeof idleWindow.requestIdleCallback === "function") {
    return {
      kind: "idle" as const,
      handle: idleWindow.requestIdleCallback(() => {
        task();
      }, { timeout }),
    };
  }
  return {
    kind: "timeout" as const,
    handle: window.setTimeout(task, Math.min(timeout, 320)),
  };
}

function cancelScheduledIdleTask(task: { kind: "idle" | "timeout"; handle: number } | null) {
  if (!task) {
    return;
  }
  if (task.kind === "idle") {
    const idleWindow = window as IdleWindow;
    idleWindow.cancelIdleCallback?.(task.handle);
    return;
  }
  window.clearTimeout(task.handle);
}

function preloadPageModule(pageKey: PageKey) {
  if (preloadedPageModules.has(pageKey)) {
    return;
  }
  switch (pageKey) {
    case "dashboard":
      void loadDashboardPage();
      break;
    case "editor":
      void loadEditorPage();
      break;
    case "gamemode":
      void loadGameModePage();
      break;
    case "library":
      void loadAddLibraryPage();
      break;
    case "remove":
      void loadRemoveWorkspacePanel();
      break;
    case "swap":
      void loadSwapAbilityPage();
      break;
    case "custom":
      void loadCustomBuilderPage();
      break;
    case "packs":
      void loadPackToolsPage();
      break;
    case "settings":
      void loadSettingsPage();
      break;
    case "tutorial":
      void loadTutorialPage();
      break;
    default:
      break;
  }
  preloadedPageModules.add(pageKey);
}

function requestPageModulePreload(pageKey: PageKey, timeout = 900) {
  if (preloadedPageModules.has(pageKey) || scheduledPageModulePreloads.has(pageKey)) {
    return;
  }

  const scheduledTask = scheduleIdleTask(() => {
    scheduledPageModulePreloads.delete(pageKey);
    preloadPageModule(pageKey);
  }, timeout);

  scheduledPageModulePreloads.set(pageKey, scheduledTask);
}

/** Depth map for determining page transition direction. */
const PAGE_DEPTH: Record<PageKey, number> = {
  dashboard: 0,
  editor: 1,
  gamemode: 1,
  library: 1,
  swap: 1,
  custom: 1,
  packs: 1,
  settings: 1,
  tutorial: 1,
  remove: 2,
};

/** Maps page labels used by renderDeferredPage to skeleton layout variants. */
const LABEL_TO_SKELETON_LAYOUT: Record<string, PageSkeletonProps["layout"]> = {
  Home: "dashboard",
  Change: "editor",
  "Game Mode": "editor",
  Insert: "list",
  Add: "list",
  Remove: "list",
  Swap: "editor",
  Create: "editor",
  Packs: "grid",
  Help: "list",
  Settings: "list",
  Setup: "editor",
};

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function loadDraftState(workspaceRoot: string, entryId: string): PersistedEntryDraft | null {
  try {
    const raw = window.localStorage.getItem(`${DRAFTS_KEY}:${workspaceRoot}`);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Record<string, PersistedEntryDraft>;
    return parsed?.[entryId] ?? null;
  } catch {
    return null;
  }
}

function clearDraftState(workspaceRoot: string, entryId: string) {
  try {
    const storageKey = `${DRAFTS_KEY}:${workspaceRoot}`;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw) as Record<string, PersistedEntryDraft>;
    if (!parsed || !(entryId in parsed)) {
      return;
    }
    delete parsed[entryId];
    window.localStorage.setItem(storageKey, JSON.stringify(parsed));
  } catch {
    // ignore local draft persistence issues
  }
}

function clearAllDraftState(workspaceRoot: string) {
  try {
    window.localStorage.removeItem(`${DRAFTS_KEY}:${workspaceRoot}`);
  } catch {
    // ignore local draft persistence issues
  }
}

function isSwapCatalogEntry(entry: CatalogEntry): boolean {
  const targetType = (entry.targetType ?? "").toLowerCase();
  const relativePath = (entry.relativePath ?? "").toLowerCase();
  const targetKey = (entry.targetKey ?? "").toLowerCase();
  return (
    targetType === "characterabilityswap"
    || relativePath.includes("abilityswap")
    || targetKey.includes("abilityswap")
  );
}

function toTitleCaseWords(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

function resolveSwapCharacterLabel(entry: CatalogEntry): string {
  const targetKey = entry.targetKey?.split("/")[0] ?? "";
  if (targetKey) {
    return toTitleCaseWords(targetKey.replace(/#\d+$/i, "").replace(/[_-]+/g, " "));
  }

  const fromPath = entry.relativePath?.match(/characters[\\/]+([^\\/]+)[\\/]+abilityswap\.json/i)?.[1];
  if (fromPath) {
    return toTitleCaseWords(fromPath.replace(/^\d+[_-]?/, "").replace(/[_-]+/g, " "));
  }

  const fromTitle = (entry.title ?? entry.displayName ?? "")
    .replace(/\s*\/\s*Ability Swap$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (fromTitle && !/^ability swap$/i.test(fromTitle)) {
    return toTitleCaseWords(fromTitle.replace(/[_-]+/g, " "));
  }

  return "Character";
}

function scoreSwapEntry(entry: CatalogEntry) {
  let score = 0;
  if (entry.targetKey) score += 8;
  if (entry.relativePath?.match(/characters[\\/]+\d+[_-]/i)) score += 2;
  if (entry.title && !/^ability swap$/i.test(entry.title.trim())) score += 3;
  if (entry.displayName && !/^ability swap$/i.test(entry.displayName.trim())) score += 2;
  return score;
}

function dedupeSwapEntries(entries: CatalogEntry[]) {
  const deduped = new Map<string, CatalogEntry>();
  for (const entry of entries) {
    const key = (entry.targetKey ?? "").toLowerCase() || resolveSwapCharacterLabel(entry).toLowerCase();
    const existing = deduped.get(key);
    if (!existing || scoreSwapEntry(entry) > scoreSwapEntry(existing)) {
      deduped.set(key, entry);
    }
  }

  return Array.from(deduped.values()).sort((left, right) =>
    resolveSwapCharacterLabel(left).localeCompare(resolveSwapCharacterLabel(right), undefined, { sensitivity: "base" }),
  );
}

function scoreSwapSourceEntry(entry: CatalogEntry) {
  let score = 0;
  const title = (entry.title ?? "").trim();
  const displayName = (entry.displayName ?? "").trim();
  const relativePath = entry.relativePath ?? "";

  if (entry.targetKey) score += 10;
  if (/[\\/]\d+_Ability_\d+\.json$/i.test(relativePath)) score += 6;
  if (/\/\s*(Basic|Special|Tactical|Ultimate|Ability \d+)$/i.test(title) || /\/\s*(Basic|Special|Tactical|Ultimate|Ability \d+)$/i.test(displayName)) {
    score += 5;
  }
  if (title && !/^Ability(?:\s|\[|$)/i.test(title)) score += 4;
  if (displayName && !/^Ability(?:\s|\[|$)/i.test(displayName)) score += 3;
  if (/Ability\[\d+\]\s+Ability\d+/i.test(title) || /Ability\[\d+\]\s+Ability\d+/i.test(displayName)) {
    score -= 4;
  }

  return score;
}

function dedupeSwapSourceEntries(entries: CatalogEntry[]) {
  const deduped = new Map<string, CatalogEntry>();
  for (const entry of entries) {
    const key = (entry.targetKey ?? "").toLowerCase() || entry.id.toLowerCase();
    const existing = deduped.get(key);
    if (!existing || scoreSwapSourceEntry(entry) > scoreSwapSourceEntry(existing)) {
      deduped.set(key, entry);
    }
  }
  return Array.from(deduped.values());
}

function scoreEditorCatalogEntry(entry: CatalogEntry) {
  let score = 0;
  const title = (entry.title ?? "").trim();
  const displayName = (entry.displayName ?? "").trim();
  const relativePath = entry.relativePath ?? "";

  if (entry.targetKey) score += 8;
  if (/[\\/]\d+_Ability_\d+\.json$/i.test(relativePath)) score += 6;
  if (/[\\/]\d+_[A-Za-z0-9]+\.json$/i.test(relativePath)) score += 2;
  if (/\/\s*(Basic|Special|Tactical|Ultimate|Ability \d+)$/i.test(title) || /\/\s*(Basic|Special|Tactical|Ultimate|Ability \d+)$/i.test(displayName)) {
    score += 4;
  }
  if (title && !/^Ability(?:\s|\[|$)/i.test(title) && !/^Unnamed$/i.test(title)) score += 3;
  if (displayName && !/^Ability(?:\s|\[|$)/i.test(displayName) && !/^Unnamed$/i.test(displayName)) score += 2;
  if (/Ability\[\d+\]\s+Ability\d+/i.test(title) || /Ability\[\d+\]\s+Ability\d+/i.test(displayName)) {
    score -= 4;
  }

  return score;
}

function dedupeCatalogEntries(entries: CatalogEntry[]) {
  const deduped = new Map<string, CatalogEntry>();
  for (const entry of entries) {
    const key = (entry.targetKey ?? "").toLowerCase() || entry.id.toLowerCase();
    const existing = deduped.get(key);
    if (!existing || scoreEditorCatalogEntry(entry) > scoreEditorCatalogEntry(existing)) {
      deduped.set(key, entry);
    }
  }
  return Array.from(deduped.values());
}

function filterEditorCatalogEntries(entries: CatalogEntry[], _groupKey?: string | null): CatalogEntry[] {
  if (!entries.length) {
    return entries;
  }
  return dedupeCatalogEntries(entries.filter((entry) => !isSwapCatalogEntry(entry)));
}

function findFirstEditorEntryId(catalog: BootstrapPayload["catalog"] | null | undefined, groupKey: string): string | null {
  const group = catalog?.find((entry) => entry.key === groupKey);
  return filterEditorCatalogEntries(group?.entries ?? [], groupKey)[0]?.id ?? null;
}

function findCatalogEntryByTargetKey(
  catalog: BootstrapPayload["catalog"] | null | undefined,
  targetKey: string | null | undefined,
): CatalogEntry | null {
  const normalizedTargetKey = targetKey?.trim().toLowerCase();
  if (!normalizedTargetKey) {
    return null;
  }

  for (const group of catalog ?? []) {
    for (const entry of group.entries ?? []) {
      if ((entry.targetKey ?? "").trim().toLowerCase() === normalizedTargetKey) {
        return entry;
      }
    }
  }

  return null;
}

function resolveRuntimeDocumentLoadEntry(
  entry: CatalogEntry,
  catalog: BootstrapPayload["catalog"] | null | undefined,
): CatalogEntry {
  const aliasTargets = RUNTIME_DOCUMENT_ALIAS_TARGETS[entry.targetKey ?? ""] ?? [];
  for (const aliasTarget of aliasTargets) {
    const mappedEntry = findCatalogEntryByTargetKey(catalog, aliasTarget);
    if (mappedEntry) {
      return mappedEntry;
    }
  }
  return entry;
}

function resolveEntryIdForPage(
  nextPage: PageKey,
  catalog: BootstrapPayload["catalog"] | null | undefined,
  currentEntryId: string | null,
  swapEntries: CatalogEntry[],
  editorGroup: EditorGroupKey,
): string | null {
  if (nextPage === "swap") {
    if (currentEntryId && swapEntries.some((entry) => entry.id === currentEntryId)) {
      return currentEntryId;
    }
    return swapEntries[0]?.id ?? null;
  }

  if (nextPage === "gamemode") {
    return findFirstEditorEntryId(catalog, "gamemode");
  }

  if (nextPage === "editor" || nextPage === "library" || nextPage === "remove") {
    if (currentEntryId && !swapEntries.some((entry) => entry.id === currentEntryId)) {
      return currentEntryId;
    }
    return findFirstEditorEntryId(catalog, editorGroup);
  }

  return currentEntryId;
}

function loadPersistedDraftMap(workspaceRoot: string): Record<string, PersistedEntryDraft> {
  try {
    const raw = window.localStorage.getItem(`${DRAFTS_KEY}:${workspaceRoot}`);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, PersistedEntryDraft>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function hasUnsavedDraftState(state: LoadedEntryState): boolean {
  const baseDocument = state.document;
  const baseOverrides = baseDocument ? toEditableOverrideMap(baseDocument) : {};
  const baseOperations = cloneJson(baseDocument?.operations?.entries ?? []);
  if (JSON.stringify(state.draftOverrides ?? {}) !== JSON.stringify(baseOverrides)) {
    return true;
  }
  if (JSON.stringify(state.draftOperations ?? []) !== JSON.stringify(baseOperations)) {
    return true;
  }
  if (state.overrideTextError || state.overrideText !== formatJson(state.draftOverrides ?? {})) {
    return true;
  }
  if (state.customDraftTextError) {
    return true;
  }
  if (state.customDraft) {
    const baseDraft = baseDocument ? (cloneJson(baseDocument) as unknown as JsonObject) : undefined;
    if (JSON.stringify(state.customDraft) !== JSON.stringify(baseDraft)) {
      return true;
    }
  }
  return false;
}

function loadLibraryPreferences(workspaceRoot: string): {
  favorites: string[];
  collections: SharedCollectionEntry[];
} {
  try {
    const raw = window.localStorage.getItem(`${LIBRARY_PREFS_KEY}:${workspaceRoot}`);
    if (!raw) {
      return { favorites: [], collections: [] };
    }
    const parsed = JSON.parse(raw) as {
      favorites?: string[];
      collections?: SharedCollectionEntry[];
    };
    return {
      favorites: Array.isArray(parsed?.favorites) ? parsed.favorites.filter((value): value is string => typeof value === "string") : [],
      collections: Array.isArray(parsed?.collections)
        ? parsed.collections.filter((value): value is SharedCollectionEntry => Boolean(value?.id && value?.label))
        : [],
    };
  } catch {
    return { favorites: [], collections: [] };
  }
}

function createCollectionId(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "collection"}-${Date.now().toString(36)}`;
}

function getRuntimeDefaultValue(document: RuntimeDocument, path: string): JsonValue | undefined {
  const quickDefault = document.quickEdit?.find((item) => item.path === path)?.defaultValue;
  if (quickDefault !== undefined) {
    return quickDefault;
  }

  const simpleDefault = document.simpleSettings?.groups
    ?.flatMap((group) => group.entries)
    .find((entry) => entry.path === path)?.defaultValue;
  if (simpleDefault !== undefined) {
    return simpleDefault;
  }

  return document.advanced?.defaults?.[path];
}

function getRuntimeEditablePaths(document: RuntimeDocument): string[] {
  const paths = new Set<string>();

  for (const item of document.quickEdit ?? []) {
    if (item.editable && item.path) {
      paths.add(item.path);
    }
  }

  for (const group of document.simpleSettings?.groups ?? []) {
    for (const entry of group.entries ?? []) {
      if (entry.editable && entry.path) {
        paths.add(entry.path);
      }
    }
  }

  for (const field of document.advanced?.fields ?? []) {
    if (field.editable !== false && field.path) {
      paths.add(field.path);
    }
  }

  return Array.from(paths);
}

function collectRuntimeValueMap(document: RuntimeDocument): Record<string, JsonValue> {
  const values: Record<string, JsonValue> = {};

  for (const item of document.quickEdit ?? []) {
    if (item.path && item.value !== undefined) {
      values[item.path] = cloneJson(item.value);
    }
  }

  for (const group of document.simpleSettings?.groups ?? []) {
    for (const entry of group.entries ?? []) {
      if (entry.path && entry.currentValue !== undefined) {
        values[entry.path] = cloneJson(entry.currentValue);
      }
    }
  }

  for (const field of document.advanced?.fields ?? []) {
    const candidate =
      field.effectiveValue ??
      field.currentValue ??
      document.advanced?.effectiveValues?.[field.path] ??
      document.advanced?.defaults?.[field.path];
    if (field.path && candidate !== undefined) {
      values[field.path] = cloneJson(candidate);
    }
  }

  return values;
}

function normalizeComparablePath(path: string): string {
  return path.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function buildComparableRuntimeValueMap(document: RuntimeDocument): Map<string, JsonValue> {
  const comparableValues = new Map<string, JsonValue>();
  const rawValues = collectRuntimeValueMap(document);

  for (const [path, value] of Object.entries(rawValues)) {
    const comparableKey = normalizeComparablePath(path);
    if (!comparableValues.has(comparableKey)) {
      comparableValues.set(comparableKey, cloneJson(value));
    }
    for (const aliasKey of SNAPSHOT_COPY_ALIAS_KEYS[comparableKey] ?? []) {
      if (!comparableValues.has(aliasKey)) {
        comparableValues.set(aliasKey, cloneJson(value));
      }
    }
  }

  return comparableValues;
}

function getGameModeSourceRole(entry: CatalogEntry, document?: RuntimeDocument): string {
  const runtimeSourceRole = typeof document?.sourceRole === "string" ? document.sourceRole.toLowerCase() : "";
  if (runtimeSourceRole) {
    return runtimeSourceRole;
  }

  const text = `${entry.title} ${entry.subtitle} ${entry.targetType ?? ""}`.toLowerCase();
  if (text.includes("current lobby") || text.includes("live snapshot") || text.includes("arenalobby")) {
    return "current_lobby";
  }
  if (text.includes("current preset")) {
    return "current_preset";
  }
  if (text.includes("saved")) {
    return "saved_preset";
  }
  if (text.includes("arena game mode")) {
    return "arena_game_mode";
  }
  if (text.includes("lobby config")) {
    return "lobby_config";
  }
  return "standard";
}

function isSnapshotCopyTarget(entry: CatalogEntry, document?: RuntimeDocument): boolean {
  const role = getGameModeSourceRole(entry, document);
  return role === "current_preset" || role === "saved_preset" || role === "lobby_config";
}

function buildSnapshotTargetOption(entry: CatalogEntry, document?: RuntimeDocument): SnapshotCopyTargetOption {
  const role = getGameModeSourceRole(entry, document);
  const label =
    document?.resolvedName?.trim() ||
    document?.displayName?.trim() ||
    entry.displayName?.trim() ||
    entry.title;

  const description =
    role === "current_preset"
      ? "Best default for scoring, zone, and the main reusable match rules."
      : role === "saved_preset"
        ? "Good when you want a reusable stored slot you can switch back to later."
        : "Use this when you need to carry lobby structure values such as player caps or team setup.";

  return {
    id: entry.id,
    label,
    description,
  };
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9#.[\]/\\:_ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSearchValue(value: JsonValue | undefined): string {
  if (value === undefined) {
    return "";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 160 ? `${serialized.slice(0, 160)}...` : serialized;
  } catch {
    return "";
  }
}

function scoreSearchItem(item: RebalanceSearchItem, normalizedQuery: string): number {
  if (!normalizedQuery) {
    return item.priority;
  }

  const haystack = normalizeSearchText([
    item.title,
    item.subtitle,
    item.section,
    item.badge,
    ...item.keywords,
  ].join(" "));

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return item.priority;
  }
  if (!tokens.every((token) => haystack.includes(token))) {
    return -1;
  }

  const title = normalizeSearchText(item.title);
  const subtitle = normalizeSearchText(item.subtitle);
  let score = item.priority;

  if (title === normalizedQuery) score += 80;
  if (title.startsWith(normalizedQuery)) score += 55;
  if (title.includes(normalizedQuery)) score += 35;
  if (subtitle.includes(normalizedQuery)) score += 12;
  for (const token of tokens) {
    if (title.startsWith(token)) score += 14;
    if (title.includes(token)) score += 8;
    if (subtitle.includes(token)) score += 3;
  }

  return score;
}

function findSearchCatalogEntryForLibraryOption(option: { targetKey?: string; file?: string; targetType?: string; displayName?: string }, entries: CatalogEntry[]): CatalogEntry | null {
  const normalizedTargetKey = option.targetKey?.trim().toLowerCase();
  if (normalizedTargetKey) {
    const targetMatch = entries.find((entry) => (entry.targetKey ?? "").trim().toLowerCase() === normalizedTargetKey);
    if (targetMatch) {
      return targetMatch;
    }
  }

  const normalizedFile = option.file?.replace(/\\/g, "/").toLowerCase();
  if (normalizedFile) {
    const fileMatch = entries.find((entry) => entry.relativePath?.replace(/\\/g, "/").toLowerCase().endsWith(normalizedFile));
    if (fileMatch) {
      return fileMatch;
    }
  }

  const normalizedDisplayName = option.displayName?.trim().toLowerCase();
  if (normalizedDisplayName) {
    return entries.find((entry) =>
      [entry.title, entry.displayName ?? "", entry.targetKey ?? ""]
        .some((value) => value.trim().toLowerCase() === normalizedDisplayName),
    ) ?? null;
  }

  return null;
}

function inferEditorGroupForSearchTarget(entry: CatalogEntry | null, fallback?: string | null): EditorGroupKey | null {
  const key = (entry?.group ?? fallback ?? "").toLowerCase();
  if (key === "augments" || key === "items" || key === "characters" || key === "managers" || key === "gamemode" || key === "nativeui") {
    return key;
  }

  const targetType = (entry?.targetType ?? fallback ?? "").toLowerCase();
  if (targetType.includes("item")) return "items";
  if (targetType.includes("character")) return "characters";
  if (targetType.includes("manager")) return "managers";
  if (targetType.includes("game") || targetType.includes("arena")) return "gamemode";
  return "augments";
}

function buildCatalogSearchTarget(entry: CatalogEntry, groupKey: string): RebalanceSearchTarget {
  const normalizedGroupKey = (groupKey || entry.group || "").toLowerCase();
  if (isSwapCatalogEntry(entry)) {
    return { page: "swap", entryId: entry.id, group: "characters" };
  }
  if (normalizedGroupKey === "custom") {
    return { page: "custom", customId: entry.id, search: "" };
  }
  if (normalizedGroupKey === "gamemode") {
    return { page: "gamemode", entryId: entry.id, group: "gamemode", search: "" };
  }
  return {
    page: "editor",
    entryId: entry.id,
    group: inferEditorGroupForSearchTarget(entry, normalizedGroupKey),
    search: "",
  };
}

function buildDocumentFieldSearchItems(entry: CatalogEntry, document: RuntimeDocument): RebalanceSearchItem[] {
  const target = buildCatalogSearchTarget(entry, entry.group);
  const displayTitle = document.resolvedName ?? document.displayName ?? entry.title;
  const fields: RebalanceSearchItem[] = [];
  const pushField = (source: string, label: string | undefined, path: string | undefined, description: string | undefined, value: JsonValue | undefined, defaultValue: JsonValue | undefined, index: number) => {
    if (!path) {
      return;
    }
    fields.push({
      id: `field:${entry.id}:${source}:${path}:${index}`,
      title: label?.trim() || resolveFriendlyFieldSearchLabel(path),
      subtitle: `${displayTitle} · ${path}`,
      section: "Field",
      badge: source,
      keywords: [
        entry.title,
        entry.subtitle,
        entry.relativePath,
        entry.targetKey ?? "",
        description ?? "",
        path,
        compactSearchValue(value),
        compactSearchValue(defaultValue),
      ],
      priority: target.page === "gamemode" ? 62 : 58,
      target: {
        ...target,
        search: label || path,
      },
    });
  };

  document.quickEdit?.forEach((item, index) =>
    pushField("Quick", item.setting, item.path, item.whatItDoes, item.value, item.defaultValue, index),
  );
  document.simpleSettings?.groups?.forEach((group, groupIndex) => {
    group.entries?.forEach((item, index) =>
      pushField(
        group.category ?? "Values",
        item.name,
        item.path,
        item.description,
        item.currentValue,
        item.defaultValue,
        groupIndex * 1000 + index,
      ),
    );
  });
  document.advanced?.fields?.forEach((field, index) =>
    pushField(
      "Advanced",
      field.label,
      field.path,
      field.description,
      field.effectiveValue ?? field.currentValue,
      document.advanced?.defaults?.[field.path],
      index,
    ),
  );

  return fields;
}

function resolveFriendlyFieldSearchLabel(path: string): string {
  const lastSegment = path.split(/[.[\]/\\]+/).filter(Boolean).at(-1) ?? path;
  return lastSegment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (value) => value.toUpperCase());
}

const pageItems: Array<{
  key: PageKey;
  label: string;
  description: string;
  icon: typeof Sparkles;
}> = [
  { key: "dashboard", label: "Home", description: "Pick the next safe edit for this profile.", icon: Sparkles },
  { key: "editor", label: "Change", description: "Tune one existing file and preview it before saving.", icon: FileCog },
  { key: "gamemode", label: "Game Mode", description: "Adjust rules, zones, teams, bots, and presets.", icon: Gamepad2 },
  { key: "swap", label: "Swap", description: "Replace one slot with another exported ability source.", icon: Wand2 },
  { key: "custom", label: "Create", description: "Build a brand-new augment draft with the live card studio.", icon: Wand2 },
  { key: "packs", label: "Packs", description: "Import, export, or switch one pack.", icon: FileCog },
  { key: "tutorial", label: "Help", description: "Check the guide and support tools.", icon: CircleHelp },
  { key: "settings", label: "Settings", description: "Profile paths, backups, and repair tools.", icon: Settings2 },
];

const PRIMARY_WORKSPACE_PAGE_KEYS: PageKey[] = ["dashboard", "editor", "gamemode", "swap", "custom", "packs"];
const SECONDARY_WORKSPACE_PAGE_KEYS: PageKey[] = [];
const UTILITY_WORKSPACE_PAGE_KEYS: PageKey[] = ["tutorial", "settings"];
const GUIDED_PRIMARY_PAGE_KEYS: PageKey[] = [...PRIMARY_WORKSPACE_PAGE_KEYS, ...UTILITY_WORKSPACE_PAGE_KEYS];

const EMBEDDED_PRIMARY_PAGE_KEYS: PageKey[] = PRIMARY_WORKSPACE_PAGE_KEYS;
const EMBEDDED_SECONDARY_PAGE_KEYS: PageKey[] = SECONDARY_WORKSPACE_PAGE_KEYS;
const EMBEDDED_UTILITY_PAGE_KEYS: PageKey[] = UTILITY_WORKSPACE_PAGE_KEYS;
const FOCUS_WORKSPACE_PAGE_KEYS: PageKey[] = [
  "dashboard",
  "editor",
  "gamemode",
  "library",
  "remove",
  "swap",
  "custom",
  "packs",
  "tutorial",
  "settings",
];

function isEditorSubflowPage(page: PageKey) {
  return page === "library" || page === "remove";
}

export interface LauncherAppProps {
  embedded?: boolean;
  initialPage?: PageKey;
  workspaceRoot?: string | null;
  profileLabel?: string | null;
  track?: string | null;
  instanceSource?: string | null;
  compatibilityWarning?: string | null;
  onEmbeddedStatus?: (
    status: {
      phase: "shell" | "bootstrap" | "catalog" | "sync" | "ready" | "error";
      progress: number;
      detail: string;
    },
  ) => void;
}

const TOAST_ICONS: Record<string, string> = {
  success: "✓",
  error: "✕",
  warning: "⚠",
  info: "ℹ",
};

function ToastContainer() {
  const toasts = useToastStore();
  if (toasts.length === 0) return null;
  return (
    <div className="rebalance-toast-container" aria-live="assertive" role="status">
      {toasts.map((toast) => (
        <div key={toast.id} className={`rebalance-toast rebalance-toast--${toast.type}`}>
          <span className="rebalance-toast-icon" aria-hidden>{TOAST_ICONS[toast.type] ?? "ℹ"}</span>
          <span className="rebalance-toast-message">{toast.message}</span>
          <button className="rebalance-toast-dismiss" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification">✕</button>
          <span className="rebalance-toast-progress" />
        </div>
      ))}
    </div>
  );
}

const PAGE_DISPLAY_NAME: Record<string, string> = {
  dashboard: "Home",
  editor: "Editor",
  gamemode: "Game Mode",
  library: "Library",
  remove: "Remove",
  swap: "Swap",
  custom: "Custom Builder",
  packs: "Packs",
  settings: "Settings",
  tutorial: "Help",
};

function Breadcrumb({
  page,
  entryTitle,
  onNavigateHome,
}: {
  page: string;
  entryTitle?: string | null;
  onNavigateHome: () => void;
}) {
  const pageName = PAGE_DISPLAY_NAME[page] ?? page;
  const isHome = page === "dashboard";

  return (
    <nav className="rebalance-breadcrumb" aria-label="Breadcrumb">
      <button
        type="button"
        className={`rebalance-breadcrumb-item ${isHome ? "is-active" : ""}`}
        onClick={isHome ? undefined : onNavigateHome}
      >
        Home
      </button>
      {!isHome && (
        <>
          <span className="rebalance-breadcrumb-separator" aria-hidden>›</span>
          <span className={`rebalance-breadcrumb-item ${!entryTitle ? "is-active" : ""}`}>
            {pageName}
          </span>
        </>
      )}
      {entryTitle && !isHome && (
        <>
          <span className="rebalance-breadcrumb-separator" aria-hidden>›</span>
          <span className="rebalance-breadcrumb-item is-active">{entryTitle}</span>
        </>
      )}
    </nav>
  );
}

export function LauncherApp({
  embedded = false,
  initialPage = "dashboard",
  workspaceRoot = null,
  profileLabel = null,
  track = null,
  instanceSource = null,
  compatibilityWarning = null,
  onEmbeddedStatus,
}: LauncherAppProps = {}) {
  // Data layer: singleton DataCache for in-memory reads
  const [dataCache] = useState(() => createDataCache());
  const [diffEngine] = useState(() => createDiffEngine(dataCache as any, workspaceRoot ?? ""));
  const [writeScheduler] = useState(() => createWriteScheduler(diffEngine, (payload) => launcherApi.saveDocument(payload)));
  // TODO: Wire orchestrateBootstrap() to replace the existing boot flow

  const normalizedInitialPage = isEditorSubflowPage(initialPage) ? "editor" : initialPage;
  const [page, setPage] = useState<PageKey>(normalizedInitialPage);
  const prevPageRef = useRef<PageKey>(normalizedInitialPage);
  const [transitionDirection, setTransitionDirection] = useState<PageTransitionDirection>("deeper");
  const { enterRef: pageEnterRef } = usePageTransition(transitionDirection);
  const [editorUtilityDrawer, setEditorUtilityDrawer] = useState<"add" | "remove" | null>(
    initialPage === "library" ? "add" : initialPage === "remove" ? "remove" : null,
  );
  const [toolRailExpanded, setToolRailExpanded] = useState(!FOCUS_WORKSPACE_PAGE_KEYS.includes(normalizedInitialPage));
  const [workspaceTopStripHidden, setWorkspaceTopStripHidden] = useState(false);
  const [workspaceStatus, setWorkspaceStatus] = useState<{
    phase: "shell" | "bootstrap" | "catalog" | "sync" | "ready" | "error";
    progress: number;
    detail: string;
  }>({
    phase: "shell",
    progress: 0.12,
    detail: "Preparing the embedded Rebalance shell.",
  });
  const [editorGroup, setEditorGroup] = useState<EditorGroupKey>("augments");
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [shaderProgress, setShaderProgress] = useState(0);
  const [shaderPhase, setShaderPhase] = useState<LoadPhase>("initializing");
  const [shaderComplete, setShaderComplete] = useState(false);
  // enterTransitionRef removed — shader no longer gates UI visibility
  const [useWebGLFallback, setUseWebGLFallback] = useState(false);
  // shaderDissolved: the WebGL dissolve finished (shader content done), triggers GSAP exit
  const [shaderDissolved, setShaderDissolved] = useState(false);

  const handleShaderDissolved = useCallback(() => {
    setShaderDissolved(true);
  }, []);

  const handleShaderExitComplete = useCallback(() => {
    setShaderComplete(true);
  }, []);

  const handleShaderError = useCallback(() => {
    setUseWebGLFallback(true);
    // Don't set shaderComplete — the fallback component will still show loading progress.
    // It will be dismissed when bootstrap completes via the dissolved → exit flow.
  }, []);
  const [uiMode, setUiMode] = useState<ExperienceMode>("guided");
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [workspaceInput, setWorkspaceInput] = useState("");
  const [search, setSearch] = useState("");
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  // Phase 3/4 — Compare-snapshot Command HUD wiring. activeDiff renders a
  // floating DiffView modal when populated. The 'Compare with snapshot'
  // command pulls real LEFT/RIGHT data from the DiffEngine when an active
  // doc has history (last entry's `before` vs current overrides), and falls
  // back to a placeholder demo diff (with an explanatory toast) otherwise.
  const [activeDiff, setActiveDiff] = useState<DiffHunk[] | null>(null);
  // Theme cycling for the Command HUD 'Toggle theme' action. Loaded from
  // localStorage on mount via `loadTheme(workspaceRoot)` so the HUD reflects
  // the persisted choice from a prior session.
  const [currentTheme, setCurrentTheme] = useState<ThemeId>(() => loadTheme(workspaceRoot ?? null));
  // Phase 4 — workspace-keyed doc snapshot store. Map<docPath, snapshots[]>.
  // The Command HUD's "Save current as snapshot" entry pushes a new entry
  // here, and "Compare with snapshot" reads the latest entry for the active
  // doc as the LEFT side of the diff. Persisted to localStorage and restored
  // on workspace bootstrap.
  const [docSnapshots, setDocSnapshots] = useState<Map<string, DocSnapshotEntry[]>>(() => new Map());
  const [librarySearchSeed, setLibrarySearchSeed] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedCustomId, setSelectedCustomId] = useState<string | null>(null);
  const [entryState, setEntryState] = useState<Record<string, LoadedEntryState>>({});
  const [selectedPackPaths, setSelectedPackPaths] = useState<string[]>([]);
  const [packReceipts, setPackReceipts] = useState<ConfigPackReceiptSummary[]>([]);
  const [installedPacks, setInstalledPacks] = useState<InstalledPackSummary[]>([]);
  const [gameModeIndex, setGameModeIndex] = useState<GameModeIndexResponse | null>(null);
  const [copyingGameModeSnapshot, setCopyingGameModeSnapshot] = useState(false);
  const [creatingCustomDraft, setCreatingCustomDraft] = useState(false);
  const [libraryMetadata, setLibraryMetadata] = useState<LibraryMetadataResponse | null>(null);
  const [favoriteOptionIds, setFavoriteOptionIds] = useState<string[]>([]);
  const [localLibraryCollections, setLocalLibraryCollections] = useState<SharedCollectionEntry[]>([]);
  const [persistedDraftCount, setPersistedDraftCount] = useState(0);
  const [packExportState, setPackExportState] = useState({
    packId: "rebalancebap.pack",
    packVersion: "0.1.0",
    name: "RebalanceBAP Pack",
    description: "Shared RebalanceBAP changes",
    author: "Sonic0810",
    outputPath: "",
    preview: null as ConfigPackPreviewResponse | null,
    busy: false,
  });
  const [packImportState, setPackImportState] = useState({
    packPath: "",
    conflictStrategy: "replace-targeted-files" as ConfigPackConflictStrategy,
    createBackup: true,
    preview: null as ConfigPackPreviewResponse | null,
    busy: false,
  });
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [showQuickStart, setShowQuickStart] = useState(false);
  const [tourRunId, setTourRunId] = useState(0);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const deferredGlobalSearchQuery = useDeferredValue(globalSearchQuery.trim());
  const guidedTourRef = useRef<ReturnType<typeof createGuidedTour> | null>(null);
  const tourTimerRef = useRef<number | null>(null);
  const suppressTourSeenRef = useRef(false);
  const entryStateRef = useRef(entryState);
  const globalSearchInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceToggleButtonRef = useRef<HTMLButtonElement | null>(null);
  const drawerReturnFocusRef = useRef<HTMLElement | null>(null);
  const restoreDrawerFocusRef = useRef(false);
  const embeddedRootRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const underlineRef = useRef<HTMLDivElement | null>(null);
  const embeddedStageRef = useRef<HTMLElement | null>(null);
  const embeddedMainRef = useRef<HTMLElement | null>(null);
  const shellMainRef = useRef<HTMLElement | null>(null);
  const workspaceDrawerAnim = useDrawerAnimation<HTMLElement>(toolRailExpanded);
  const workspaceDrawerRef = workspaceDrawerAnim.ref;
  const globalSearchMotionRef = useOverlayEntranceMotion<HTMLDivElement>(globalSearchOpen).ref;
  const editorUtilityDrawerMotionRef = useOverlayEntranceMotion<HTMLDivElement>(editorUtilityDrawer !== null).ref;
  const interactionMotionRef = useRebalanceInteractionMotion<HTMLDivElement>();
  const workspaceTopbarMotionRef = useWorkspaceTopbarMotion<HTMLDivElement>(workspaceTopStripHidden);
  const lastWorkspaceScrollTopRef = useRef(0);

  // Track page transitions for directional animation
  useEffect(() => {
    const oldDepth = PAGE_DEPTH[prevPageRef.current] ?? 0;
    const newDepth = PAGE_DEPTH[page] ?? 0;
    if (page !== prevPageRef.current) {
      const dir: PageTransitionDirection =
        newDepth > oldDepth ? "deeper" :
        newDepth < oldDepth ? "shallower" :
        "lateral";
      setTransitionDirection(dir);
      prevPageRef.current = page;

      // Scroll content area to top before entry animation starts
      const scrollTarget = shellMainRef.current ?? embeddedStageRef.current;
      if (scrollTarget) {
        scrollTarget.scrollTo({ top: 0, behavior: "instant" });
      }
    }
  }, [page]);

  // Animate the nav underline indicator to the active nav item
  useEffect(() => {
    const navContainer = navRef.current;
    const underline = underlineRef.current;
    if (!navContainer || !underline) return;
    const activeItem = navContainer.querySelector('.is-active') as HTMLElement;
    if (!activeItem) return;
    gsap.to(underline, { left: activeItem.offsetLeft, width: activeItem.offsetWidth, duration: 0.2, ease: "power2.out" });
  }, [page]);

  const workspaceTopStripHiddenRef = useRef(false);
  const isFocusWorkspacePage = FOCUS_WORKSPACE_PAGE_KEYS.includes(page);
  const updateWorkspaceTopStripHidden = useCallback((nextHidden: boolean) => {
    if (workspaceTopStripHiddenRef.current === nextHidden) {
      return;
    }
    workspaceTopStripHiddenRef.current = nextHidden;
    setWorkspaceTopStripHidden(nextHidden);
  }, []);
  const updateToolRailExpanded = useCallback((nextExpanded: boolean) => {
    if (nextExpanded === toolRailExpanded) {
      return;
    }
    if (nextExpanded) {
      drawerReturnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      restoreDrawerFocusRef.current = false;
    } else {
      restoreDrawerFocusRef.current = true;
    }
    setToolRailExpanded(nextExpanded);
  }, [toolRailExpanded]);
  const setEmbeddedRootNode = useCallback((node: HTMLDivElement | null) => {
    embeddedRootRef.current = node;
    interactionMotionRef.current = node;
  }, [interactionMotionRef]);
  const setShellRootNode = useCallback((node: HTMLDivElement | null) => {
    interactionMotionRef.current = node;
  }, [interactionMotionRef]);
  const toggleToolRail = useCallback(() => {
    updateToolRailExpanded(!toolRailExpanded);
  }, [toolRailExpanded, updateToolRailExpanded]);
  const reportEmbeddedStatus = (
    phase: "shell" | "bootstrap" | "catalog" | "sync" | "ready" | "error",
    progress: number,
    detail: string,
  ) => {
    setWorkspaceStatus({
      phase,
      progress: Math.min(1, Math.max(0, progress)),
      detail,
    });
  };

  function commitEntryState(
    updater: (current: Record<string, LoadedEntryState>) => Record<string, LoadedEntryState>,
  ) {
    setEntryState((current) => {
      const next = updater(current);
      entryStateRef.current = next;
      return next;
    });
  }

  useEffect(() => {
    void refreshBootstrap();
  }, [workspaceRoot]);

  useEffect(() => {
    if (!embedded || !onEmbeddedStatus) {
      return;
    }
    onEmbeddedStatus(workspaceStatus);
  }, [embedded, onEmbeddedStatus, workspaceStatus]);

  // After bootstrap payload is received, smoothly fill the shader
  useEffect(() => {
    if (bootstrap && !shaderComplete) {
      setShaderProgress(1.0);
      setShaderPhase("complete");
      // If using the fallback (no WebGL), mark dissolved after a short delay
      // since the fallback has no dissolve animation of its own.
      if (useWebGLFallback) {
        const timerId = window.setTimeout(() => setShaderDissolved(true), 600);
        return () => window.clearTimeout(timerId);
      }
    }
  }, [bootstrap, shaderComplete, useWebGLFallback]);

  useEffect(() => {
    try {
      setShowQuickStart(window.localStorage.getItem("rebalancebap.quickstart.dismissed") !== "true");
    } catch {
      setShowQuickStart(true);
    }
  }, []);

  useEffect(() => {
    if (embedded) {
      setUiMode("studio");
      setSetupComplete(true);
      return;
    }
    if (!isTauriRuntime()) {
      setSetupComplete(true);
      return;
    }
    try {
      const savedMode = window.localStorage.getItem(MODE_KEY);
      if (savedMode === "guided" || savedMode === "studio") {
        setUiMode(savedMode);
      }
      const setupFlag = window.localStorage.getItem(SETUP_COMPLETE_KEY);
      setSetupComplete(setupFlag === "true" ? true : false);
    } catch {
      setUiMode("guided");
      setSetupComplete(false);
    }
  }, []);

  useEffect(() => {
    if (bootstrap?.workspace) {
      setWorkspaceInput(bootstrap.workspace.workspaceRoot);
    }
  }, [bootstrap?.workspace?.workspaceRoot]);

  useEffect(() => {
    if (bootstrap?.workspace?.workspaceRoot) {
      const cachedWorkspaceRoot = bootstrap.workspace.workspaceRoot;
      setPackReceipts(packReceiptsCache.get(cachedWorkspaceRoot) ?? []);
      setInstalledPacks(installedPacksCache.get(cachedWorkspaceRoot) ?? []);
      setGameModeIndex(gameModeIndexCache.get(cachedWorkspaceRoot) ?? null);
      setLibraryMetadata(libraryMetadataCache.get(cachedWorkspaceRoot) ?? null);
      setPersistedDraftCount(Object.keys(loadPersistedDraftMap(cachedWorkspaceRoot)).length);
      const preferences = loadLibraryPreferences(bootstrap.workspace.workspaceRoot);
      setFavoriteOptionIds(preferences.favorites);
      setLocalLibraryCollections(preferences.collections);
      return;
    }
    setPersistedDraftCount(0);
  }, [bootstrap?.workspace?.workspaceRoot]);

  useEffect(() => {
    if (!bootstrap?.workspace?.workspaceRoot) {
      return;
    }

    const preloadPlan: Record<PageKey, readonly PageKey[]> = {
      dashboard: ["dashboard", "editor", "custom", "gamemode"],
      editor: ["editor", "dashboard", "custom", "library"],
      gamemode: ["gamemode", "dashboard", "editor"],
      library: ["library", "editor", "custom"],
      remove: ["remove", "editor", "dashboard"],
      swap: ["swap", "editor", "dashboard"],
      custom: ["custom", "dashboard", "editor", "library"],
      packs: ["packs", "dashboard", "settings"],
      settings: ["settings", "dashboard", "tutorial"],
      tutorial: ["tutorial", "dashboard", "settings"],
    };

    const warmPages = preloadPlan[page] ?? [page, "dashboard"];
    warmPages.forEach((pageKey, index) => {
      requestPageModulePreload(pageKey, 320 + index * 180);
    });
  }, [bootstrap?.workspace?.workspaceRoot, page]);

  useEffect(() => {
    const workspaceRoot = bootstrap?.workspace?.workspaceRoot;
    if (!workspaceRoot) {
      return;
    }

    try {
      window.localStorage.setItem(
        `${LIBRARY_PREFS_KEY}:${workspaceRoot}`,
        JSON.stringify({
          favorites: favoriteOptionIds,
          collections: localLibraryCollections,
        }),
      );
    } catch {
      // ignore local library preference persistence issues
    }
  }, [bootstrap?.workspace?.workspaceRoot, favoriteOptionIds, localLibraryCollections]);

  // Phase 4 — restore docSnapshots from localStorage when the active workspace
  // changes. The on-disk shape is { [docPath: string]: DocSnapshotEntry[] }.
  // Storage may throw in sandboxed iframes / hosted modes — treat any failure
  // as "no snapshots yet" rather than blocking bootstrap.
  useEffect(() => {
    const workspaceRoot = bootstrap?.workspace?.workspaceRoot;
    if (!workspaceRoot) {
      setDocSnapshots(new Map());
      return;
    }
    try {
      const raw = window.localStorage.getItem(`${DOC_SNAPSHOTS_KEY}:${workspaceRoot}`);
      if (!raw) {
        setDocSnapshots(new Map());
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setDocSnapshots(new Map());
        return;
      }
      const next = new Map<string, DocSnapshotEntry[]>();
      for (const [docPath, list] of Object.entries(parsed as Record<string, unknown>)) {
        if (!Array.isArray(list)) {
          continue;
        }
        const validEntries = (list as unknown[])
          .filter(
            (entry): entry is { id?: unknown; savedAt: string; overrides: Record<string, unknown> } =>
              Boolean(entry)
              && typeof entry === "object"
              && typeof (entry as DocSnapshotEntry).savedAt === "string"
              && Boolean((entry as DocSnapshotEntry).overrides)
              && typeof (entry as DocSnapshotEntry).overrides === "object",
          )
          .map((entry): DocSnapshotEntry => ({
            // Backfill an id for snapshots persisted before the id field
            // existed. Stable per session — the value is regenerated on next
            // restore, but it stays consistent for HUD rendering until then.
            id: typeof entry.id === "string" && entry.id.length > 0 ? entry.id : createDocSnapshotId(),
            savedAt: entry.savedAt,
            overrides: entry.overrides,
          }));
        if (validEntries.length) {
          // Defensive cap on restore — if a corrupted/older payload exceeds
          // the per-doc limit, keep only the most recent ones so the live
          // store and the next persistence round-trip stay in sync.
          next.set(docPath, validEntries.slice(-DOC_SNAPSHOTS_PER_DOC_LIMIT));
        }
      }
      setDocSnapshots(next);
    } catch {
      setDocSnapshots(new Map());
    }
  }, [bootstrap?.workspace?.workspaceRoot]);

  // Phase 4 — persist docSnapshots whenever they change. Keyed by the active
  // workspace root so snapshots are scoped per workspace just like drafts and
  // library preferences. Wrapped in try/catch — quota or disabled storage
  // must never break in-memory editing.
  useEffect(() => {
    const workspaceRoot = bootstrap?.workspace?.workspaceRoot;
    if (!workspaceRoot) {
      return;
    }
    try {
      const payload: Record<string, DocSnapshotEntry[]> = {};
      for (const [docPath, list] of docSnapshots) {
        if (list.length) {
          payload[docPath] = list;
        }
      }
      const storageKey = `${DOC_SNAPSHOTS_KEY}:${workspaceRoot}`;
      if (Object.keys(payload).length === 0) {
        window.localStorage.removeItem(storageKey);
      } else {
        window.localStorage.setItem(storageKey, JSON.stringify(payload));
      }
    } catch {
      // ignore doc snapshot persistence issues
    }
  }, [bootstrap?.workspace?.workspaceRoot, docSnapshots]);

  useEffect(() => {
    const workspaceRoot = bootstrap?.workspace?.workspaceRoot;
    if (!workspaceRoot) {
      return;
    }

    if (page === "packs") {
      if (!packReceiptsCache.has(workspaceRoot)) {
        void refreshPackReceipts(workspaceRoot);
      }
      if (!installedPacksCache.has(workspaceRoot)) {
        void refreshInstalledPacks(workspaceRoot);
      }
      return;
    }

    if (page === "gamemode") {
      if (!gameModeIndexCache.has(workspaceRoot)) {
        void refreshGameModeIndex(workspaceRoot);
      }
    }

    const shouldLoadLibraryMetadata =
      page === "editor" ||
      page === "library" ||
      page === "remove" ||
      page === "custom" ||
      page === "gamemode";

    if (shouldLoadLibraryMetadata && !libraryMetadataCache.has(workspaceRoot)) {
      void refreshLibraryMetadata(workspaceRoot);
    }
  }, [bootstrap?.workspace?.workspaceRoot, page]);

  useEffect(() => {
    const workspaceRoot = bootstrap?.workspace?.workspaceRoot;
    if (!globalSearchOpen || !workspaceRoot) {
      return;
    }

    if (!libraryMetadataCache.has(workspaceRoot)) {
      void refreshLibraryMetadata(workspaceRoot);
    }
    if (!installedPacksCache.has(workspaceRoot)) {
      void refreshInstalledPacks(workspaceRoot);
    }
    if (!packReceiptsCache.has(workspaceRoot)) {
      void refreshPackReceipts(workspaceRoot);
    }
    if (!gameModeIndexCache.has(workspaceRoot)) {
      void refreshGameModeIndex(workspaceRoot);
    }
  }, [bootstrap?.workspace?.workspaceRoot, globalSearchOpen]);

  useEffect(() => {
    const workspaceRoot = bootstrap?.workspace?.workspaceRoot;
    if (!workspaceRoot) {
      return;
    }

    const dirtyEntries = Object.entries(entryState).filter(([, state]) => hasUnsavedDraftState(state));
    setPersistedDraftCount(dirtyEntries.length);

    let cancelled = false;
    let scheduledIdleTask: { kind: "idle" | "timeout"; handle: number } | null = null;
    const timerId = window.setTimeout(() => {
      scheduledIdleTask = scheduleIdleTask(() => {
        if (cancelled) {
          return;
        }
        try {
          if (!dirtyEntries.length) {
            clearAllDraftState(workspaceRoot);
            return;
          }

          const payload = Object.fromEntries(
            dirtyEntries.map(([entryId, state]) => [
              entryId,
              {
                absolutePath: state.absolutePath,
                draftOverrides: state.draftOverrides,
                draftOperations: state.draftOperations,
                overrideText: state.overrideText,
                customDraft: state.customDraft,
                lastSavedAt: state.lastSavedAt,
              },
            ]),
          );
          window.localStorage.setItem(`${DRAFTS_KEY}:${workspaceRoot}`, JSON.stringify(payload));
        } catch {
          // ignore local draft persistence issues
        }
      });
    }, 420);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
      cancelScheduledIdleTask(scheduledIdleTask);
    };
  }, [bootstrap?.workspace?.workspaceRoot, entryState]);

  useEffect(() => {
    entryStateRef.current = entryState;
  }, [entryState]);

  useEffect(() => {
    if (toolRailExpanded || !restoreDrawerFocusRef.current) {
      return;
    }
    const candidate = drawerReturnFocusRef.current;
    const target =
      candidate && document.contains(candidate)
        ? candidate
        : workspaceToggleButtonRef.current;
    target?.focus();
    drawerReturnFocusRef.current = null;
    restoreDrawerFocusRef.current = false;
  }, [toolRailExpanded]);

  useEffect(() => {
    if (!toolRailExpanded) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        // Immediately hide the drawer element to prevent offscreen overflow
        // detection before React re-renders (audit timing race)
        const drawer = document.querySelector(".rebalance-workspace-drawer");
        if (drawer instanceof HTMLElement) {
          drawer.style.visibility = "hidden";
        }
        updateToolRailExpanded(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toolRailExpanded, updateToolRailExpanded]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "k") {
        event.preventDefault();
        setGlobalSearchOpen(true);
        updateWorkspaceTopStripHidden(false);
        return;
      }
      if (event.key === "Escape" && globalSearchOpen) {
        event.preventDefault();
        setGlobalSearchOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [globalSearchOpen, updateWorkspaceTopStripHidden]);

  // Phase 3 Task 14 — global undo/redo wired to the DiffEngine history stack.
  // Cmd/Ctrl+Z (no shift)            → undo
  // Cmd/Ctrl+Shift+Z OR Cmd/Ctrl+Y   → redo
  // Skips when focus is in editable controls so native browser undo wins.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") {
        return;
      }

      const active = typeof document !== "undefined" ? document.activeElement : null;
      if (active instanceof HTMLElement) {
        const tag = active.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || active.isContentEditable) {
          return;
        }
      }

      if (key === "y" || (key === "z" && event.shiftKey)) {
        const ok = diffEngine.redo();
        if (ok) {
          event.preventDefault();
        }
        return;
      }

      // Plain Cmd/Ctrl+Z → undo.
      const ok = diffEngine.undo();
      if (ok) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [diffEngine]);

  useEffect(() => {
    if (!globalSearchOpen) {
      return;
    }
    updateWorkspaceTopStripHidden(false);
    const frameId = window.requestAnimationFrame(() => {
      globalSearchInputRef.current?.focus();
      globalSearchInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [globalSearchOpen, updateWorkspaceTopStripHidden]);

  useEffect(() => {
    if (!bannerMessage) {
      return;
    }
    const timerId = window.setTimeout(() => setBannerMessage(null), 5200);
    return () => window.clearTimeout(timerId);
  }, [bannerMessage]);

  useEffect(() => {
    workspaceTopStripHiddenRef.current = false;
    setWorkspaceTopStripHidden(false);
    lastWorkspaceScrollTopRef.current = 0;
  }, [page, toolRailExpanded, globalSearchOpen, editorUtilityDrawer]);

  useEffect(() => {
    if (!isFocusWorkspacePage) {
      updateWorkspaceTopStripHidden(false);
      return;
    }

    const overlayOpen = () => {
      if (toolRailExpanded || globalSearchOpen || editorUtilityDrawer) {
        return true;
      }
      if (typeof document === "undefined") {
        return false;
      }
      return Boolean(
        document.querySelector(
          ".task-picker-overlay, .task-picker-sheet-shell, .rebalance-global-search-dialog, [role='dialog'][aria-modal='true'], .rebalance-nav-drawer-backdrop",
        ),
      );
    };

    const handleOffset = (nextOffset: number) => {
      if (overlayOpen() || nextOffset <= 12) {
        lastWorkspaceScrollTopRef.current = nextOffset;
        updateWorkspaceTopStripHidden(false);
        return;
      }

      const previousOffset = lastWorkspaceScrollTopRef.current;
      const delta = nextOffset - previousOffset;
      lastWorkspaceScrollTopRef.current = nextOffset;
      if (Math.abs(delta) < 8) {
        return;
      }
      if (delta > 0) {
        updateWorkspaceTopStripHidden(true);
        return;
      }
      updateWorkspaceTopStripHidden(false);
    };

    let scheduledAnimationFrame = 0;
    let pendingOffset = 0;
    const queueOffset = (nextOffset: number) => {
      pendingOffset = nextOffset;
      if (scheduledAnimationFrame) {
        return;
      }
      scheduledAnimationFrame = window.requestAnimationFrame(() => {
        scheduledAnimationFrame = 0;
        handleOffset(pendingOffset);
      });
    };

    if (embedded) {
      const scrollHost = embeddedMainRef.current;
      const readEmbeddedOffset = () =>
        Math.max(
          scrollHost?.scrollTop ?? 0,
          window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0,
        );

      const onScroll = () => queueOffset(readEmbeddedOffset());
      scrollHost?.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
      return () => {
        scrollHost?.removeEventListener("scroll", onScroll);
        window.removeEventListener("scroll", onScroll);
        if (scheduledAnimationFrame) {
          window.cancelAnimationFrame(scheduledAnimationFrame);
        }
      };
    }

    const onWindowScroll = () => queueOffset(window.scrollY || document.documentElement.scrollTop || 0);
    window.addEventListener("scroll", onWindowScroll, { passive: true });
    onWindowScroll();
    return () => {
      window.removeEventListener("scroll", onWindowScroll);
      if (scheduledAnimationFrame) {
        window.cancelAnimationFrame(scheduledAnimationFrame);
      }
    };
  }, [editorUtilityDrawer, embedded, globalSearchOpen, isFocusWorkspacePage, toolRailExpanded, updateWorkspaceTopStripHidden]);

  useEffect(() => {
    if (!embedded) {
      return;
    }

    let cancelled = false;
    let rafOne = 0;
    let rafTwo = 0;

    const resetScroll = () => {
      const hostStage = embeddedRootRef.current?.closest(".tools-rebalance-host-stage");
      const scrollingTargets = [
        document.scrollingElement,
        document.documentElement,
        document.body,
        hostStage instanceof HTMLElement ? hostStage : null,
        embeddedStageRef.current,
        embeddedMainRef.current,
      ];

      for (const target of scrollingTargets) {
        if (!(target instanceof HTMLElement)) {
          continue;
        }
        target.scrollTop = 0;
        target.scrollLeft = 0;
      }

      // Keep the shell at absolute top. Scrolling the page header into view places it
      // underneath the sticky workspace topbar in the direct browser harness.
    };

    rafOne = window.requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }
      resetScroll();
      rafTwo = window.requestAnimationFrame(() => {
        if (!cancelled) {
          resetScroll();
        }
      });
    });

    return () => {
      cancelled = true;
      if (rafOne) {
        window.cancelAnimationFrame(rafOne);
      }
      if (rafTwo) {
        window.cancelAnimationFrame(rafTwo);
      }
    };
  }, [embedded, page, selectedEntryId]);

  useEffect(() => {
    if (!tourRunId) {
      return;
    }
    if (tourTimerRef.current !== null) {
      window.clearTimeout(tourTimerRef.current);
    }
    if (guidedTourRef.current) {
      suppressTourSeenRef.current = true;
      guidedTourRef.current.destroy();
      guidedTourRef.current = null;
      suppressTourSeenRef.current = false;
    }
    tourTimerRef.current = window.setTimeout(() => {
      const waitStart = Date.now();
      const startTourWhenReady = () => {
        if (document.querySelector('[data-tour="dashboard-start"]') || Date.now() - waitStart > 5000) {
          guidedTourRef.current = createGuidedTour({
            setPage: (nextPage) => navigateTo(nextPage),
            onSeen: markInteractiveTourSeen,
          });
          guidedTourRef.current.drive();
          return;
        }
        tourTimerRef.current = window.setTimeout(startTourWhenReady, 120);
      };

      startTourWhenReady();
    }, 220);
    return () => {
      if (tourTimerRef.current !== null) {
        window.clearTimeout(tourTimerRef.current);
        tourTimerRef.current = null;
      }
    };
  }, [tourRunId]);

  useEffect(() => {
    return () => {
      if (tourTimerRef.current !== null) {
        window.clearTimeout(tourTimerRef.current);
      }
      if (guidedTourRef.current) {
        suppressTourSeenRef.current = true;
        guidedTourRef.current.destroy();
        guidedTourRef.current = null;
        suppressTourSeenRef.current = false;
      }
    };
  }, []);

  const editorGroups = useMemo(
    () =>
      bootstrap?.catalog.filter((group) =>
        ["augments", "items", "characters", "managers", "gamemode", "nativeui"].includes(group.key),
      ) ?? [],
    [bootstrap],
  );

  const customGroup = useMemo(() => bootstrap?.catalog.find((group) => group.key === "custom") ?? null, [bootstrap]);
  const gameModeGroup = useMemo(() => bootstrap?.catalog.find((group) => group.key === "gamemode") ?? null, [bootstrap]);
  const activeGroup = useMemo(() => editorGroups.find((group) => group.key === editorGroup) ?? null, [editorGroup, editorGroups]);
  const pageItemsForMode = useMemo(() => {
    const items = [...pageItems];
    if (uiMode === "studio") {
      items[1] = { ...items[1], label: "Change", description: "Edit one file at a time." };
    } else {
      items[1] = { ...items[1], label: "Change", description: "Adjust simple values fast." };
    }
    return uiMode === "guided" ? items.filter((item) => GUIDED_PRIMARY_PAGE_KEYS.includes(item.key)) : items;
  }, [uiMode]);
  const embeddedPrimaryPageItems = useMemo(
    () => pageItemsForMode.filter((item) => EMBEDDED_PRIMARY_PAGE_KEYS.includes(item.key)),
    [pageItemsForMode],
  );
  const embeddedSecondaryPageItems = useMemo(
    () => pageItemsForMode.filter((item) => EMBEDDED_SECONDARY_PAGE_KEYS.includes(item.key)),
    [pageItemsForMode],
  );
  const embeddedUtilityPageItems = useMemo(
    () => pageItemsForMode.filter((item) => EMBEDDED_UTILITY_PAGE_KEYS.includes(item.key)),
    [pageItemsForMode],
  );
  useEffect(() => {
    if (initialPage === "library" || initialPage === "remove") {
      setEditorUtilityDrawer(initialPage === "library" ? "add" : "remove");
      setPage("editor");
      return;
    }
    setEditorUtilityDrawer(null);
    setPage(initialPage);
  }, [initialPage]);

  useEffect(() => {
    const normalizedInitialPageForRail = isEditorSubflowPage(initialPage) ? "editor" : initialPage;
    setToolRailExpanded(!FOCUS_WORKSPACE_PAGE_KEYS.includes(normalizedInitialPageForRail));
  }, [initialPage]);

  useEffect(() => {
    setToolRailExpanded((current) => {
      if (FOCUS_WORKSPACE_PAGE_KEYS.includes(page)) {
        return false;
      }
      if (page === "dashboard" || page === "tutorial" || page === "settings") {
        return true;
      }
      return current;
    });
  }, [page]);

  useEffect(() => {
    if (!embedded) {
      return;
    }

    window.requestAnimationFrame(() => {
      const resetElement = (element: HTMLElement | null) => {
        if (!element) {
          return;
        }
        element.scrollTop = 0;
        element.scrollLeft = 0;
        if (typeof element.scrollTo === "function") {
          try {
            element.scrollTo({ top: 0, left: 0 });
          } catch {
            element.scrollTo(0, 0);
          }
        }
      };

      try {
        window.scrollTo(0, 0);
      } catch {
        // ignore host scroll reset issues in embedded mode
      }

      const hostStage = embeddedRootRef.current?.closest(".tools-rebalance-host-stage");
      resetElement(hostStage instanceof HTMLElement ? hostStage : null);
      resetElement(document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null);
      resetElement(embeddedRootRef.current);
      resetElement(embeddedStageRef.current);
      resetElement(embeddedMainRef.current);
    });
  }, [embedded, page]);

  const shouldShowSetup = !embedded && isTauriRuntime() && setupComplete === false;
  const compactChromePage = ["dashboard", "editor", "gamemode", "library", "remove", "swap", "custom", "packs", "tutorial", "settings"].includes(page);
  const allCatalogEntries = useMemo(() => bootstrap?.catalog.flatMap((group) => group.entries) ?? [], [bootstrap]);

  const activeEditorEntries = useMemo(
    () => filterEditorCatalogEntries(activeGroup?.entries ?? [], activeGroup?.key),
    [activeGroup?.entries, activeGroup?.key],
  );
  const filteredEntries = useMemo(() => filterEntries(activeEditorEntries, deferredSearch), [activeEditorEntries, deferredSearch]);
  const filteredCustomEntries = useMemo(() => filterEntries(customGroup?.entries ?? [], deferredSearch), [customGroup?.entries, deferredSearch]);
  const filteredGameModeEntries = useMemo(
    () => filterEntries(gameModeGroup?.entries ?? [], deferredSearch),
    [deferredSearch, gameModeGroup?.entries],
  );

  const selectedEntry = useMemo(
    () => filteredEntries.find((entry) => entry.id === selectedEntryId) ?? activeEditorEntries[0] ?? null,
    [activeEditorEntries, filteredEntries, selectedEntryId],
  );
  const selectedCustomEntry = useMemo(
    () =>
      customGroup?.entries.find((entry) => entry.id === selectedCustomId || entry.absolutePath === selectedCustomId)
      ?? filteredCustomEntries[0]
      ?? customGroup?.entries[0]
      ?? null,
    [customGroup?.entries, filteredCustomEntries, selectedCustomId],
  );
  const selectedGameModeEntry = useMemo(
    () => filteredGameModeEntries.find((entry) => entry.id === selectedEntryId) ?? gameModeGroup?.entries[0] ?? null,
    [filteredGameModeEntries, gameModeGroup?.entries, selectedEntryId],
  );
  const snapshotCopyTargets = useMemo(
    () =>
      (gameModeGroup?.entries ?? [])
        .filter((entry) => entry.id !== selectedGameModeEntry?.id)
        .filter((entry) => isSnapshotCopyTarget(entry, entryState[entry.id]?.document))
        .map((entry) => buildSnapshotTargetOption(entry, entryState[entry.id]?.document)),
    [entryState, gameModeGroup?.entries, selectedGameModeEntry?.id],
  );

  const selectedRuntimeState = selectedEntry ? entryState[selectedEntry.id] : undefined;
  const selectedCustomState = selectedCustomEntry ? entryState[selectedCustomEntry.id] : undefined;
  const selectedGameModeState = selectedGameModeEntry ? entryState[selectedGameModeEntry.id] : undefined;
  const swapEntries = useMemo(
    () =>
      dedupeSwapEntries(
        (bootstrap?.catalog.find((group) => group.key === "characters")?.entries ?? []).filter(
          (entry) => entry.targetType === "CharacterAbilitySwap" || entry.relativePath.toLowerCase().includes("abilityswap"),
        ),
      ),
    [bootstrap],
  );
  const swapSourceEntries = useMemo(
    () =>
      dedupeSwapSourceEntries(
        allCatalogEntries.filter((entry) => {
          const normalizedPath = (entry.relativePath ?? "").toLowerCase();
          const normalizedTargetType = (entry.targetType ?? "").toLowerCase();
          const normalizedTargetKey = (entry.targetKey ?? "").toLowerCase();
          if (normalizedPath.includes("abilityswap")) {
            return false;
          }
          return (
            normalizedTargetType === "characterability"
            || normalizedPath.includes("/abilities/")
            || normalizedPath.includes("\\abilities\\")
            || normalizedTargetKey.includes("/ability[")
          );
        }),
      ),
    [allCatalogEntries],
  );
  const selectedSwapEntry = useMemo(
    () => swapEntries.find((entry) => entry.id === selectedEntryId) ?? swapEntries[0] ?? null,
    [selectedEntryId, swapEntries],
  );
  const selectedSwapState = selectedSwapEntry ? entryState[selectedSwapEntry.id] : undefined;
  const unsavedDraftCount = useMemo(() => {
    const loadedDirtyCount = Object.values(entryState).filter(hasUnsavedDraftState).length;
    return Math.max(persistedDraftCount, loadedDirtyCount);
  }, [entryState, persistedDraftCount]);
  const isEntryDirty = useCallback((entryId: string) => {
    const state = entryState[entryId];
    return state ? hasUnsavedDraftState(state) : false;
  }, [entryState]);
  const getEntryDirtyCount = useCallback((entryId: string) => {
    const state = entryState[entryId];
    if (!state) {
      return 0;
    }
    const baseDocument = state.document;
    const baseOverrides = baseDocument ? toEditableOverrideMap(baseDocument) : {};
    let count = 0;
    const draftKeys = Object.keys(state.draftOverrides ?? {});
    const baseKeys = Object.keys(baseOverrides ?? {});
    const allKeys = new Set([...draftKeys, ...baseKeys]);
    for (const key of allKeys) {
      if (JSON.stringify(state.draftOverrides?.[key]) !== JSON.stringify(baseOverrides?.[key])) {
        count++;
      }
    }
    return count;
  }, [entryState]);
  const homeRecentChangeTitle = selectedEntry?.title ?? selectedEntry?.displayName ?? selectedEntry?.targetKey ?? null;
  const homeLastDraftTitle = selectedCustomEntry?.title ?? selectedCustomEntry?.displayName ?? selectedCustomEntry?.targetKey ?? null;
  const globalSearchIndex = useMemo(() => {
    const items: RebalanceSearchItem[] = [];
    const pushItem = (item: RebalanceSearchItem | null | undefined) => {
      if (!item?.title?.trim()) {
        return;
      }
      items.push({
        ...item,
        title: item.title.trim(),
        subtitle: item.subtitle.trim(),
        keywords: item.keywords.filter((value): value is string => typeof value === "string" && value.trim().length > 0),
      });
    };

    for (const item of pageItemsForMode) {
      pushItem({
        id: `tool:${item.key}`,
        title: item.label,
        subtitle: item.description,
        section: "Tool",
        badge: "Open tab",
        keywords: [item.key, item.description],
        priority: item.key === page ? 72 : 68,
        target: { page: item.key },
      });
    }

    for (const group of bootstrap?.catalog ?? []) {
      for (const entry of group.entries ?? []) {
        const target = buildCatalogSearchTarget(entry, group.key);
        const catalogSearchTitle = isSwapCatalogEntry(entry)
          ? `${resolveSwapCharacterLabel(entry)} / Ability Swap`
          : entry.title || entry.displayName || entry.targetKey || entry.relativePath;
        pushItem({
          id: `file:${entry.id}`,
          title: catalogSearchTitle,
          subtitle: [group.label, entry.subtitle, entry.relativePath].filter(Boolean).join(" · "),
          section: "File",
          badge: target.page === "swap" ? "Swap" : target.page === "custom" ? "Create" : target.page === "gamemode" ? "Game Mode" : "Change",
          keywords: [
            entry.title,
            entry.displayName ?? "",
            entry.targetKey ?? "",
            entry.targetType ?? "",
            entry.absolutePath,
            entry.relativePath,
            ...(entry.tags ?? []),
          ],
          priority: target.page === page ? 66 : 54,
          target,
        });
      }
    }

    for (const [entryId, state] of Object.entries(entryState)) {
      const document = state.document;
      if (!document) {
        continue;
      }
      const entry = allCatalogEntries.find((candidate) => candidate.id === entryId || candidate.absolutePath === state.absolutePath);
      if (!entry) {
        continue;
      }
      buildDocumentFieldSearchItems(entry, document).forEach(pushItem);
    }

    for (const option of libraryMetadata?.allOptions ?? []) {
      const sourceEntry = findSearchCatalogEntryForLibraryOption(option, allCatalogEntries);
      const targetGroup = inferEditorGroupForSearchTarget(sourceEntry, option.sourceGroup ?? option.source ?? option.targetType);
      pushItem({
        id: `option:${option.optionId}`,
        title: option.label || option.resolvedName || option.displayName || option.path,
        subtitle: [option.category, option.sourceGroup ?? option.source, option.path].filter(Boolean).join(" · "),
        section: "Library",
        badge: option.editable === false ? "Read only" : "Value",
        keywords: [
          option.description ?? "",
          option.targetType ?? "",
          option.targetKey ?? "",
          option.displayName ?? "",
          option.resolvedName ?? "",
          option.file ?? "",
          compactSearchValue(option.currentValue),
          compactSearchValue(option.defaultValue),
          ...(option.searchHints ?? []),
        ],
        priority: 48,
        target: {
          page: "library",
          entryId: sourceEntry?.id ?? null,
          group: targetGroup,
          search: option.label || option.path,
        },
      });
    }

    for (const block of libraryMetadata?.blocks ?? []) {
      pushItem({
        id: `block:${block.blockId}`,
        title: block.label,
        subtitle: [block.category, block.family, block.description].filter(Boolean).join(" · "),
        section: "Library",
        badge: "Add block",
        keywords: [block.blockId, block.description ?? "", block.riskLevel ?? "", ...(block.pathHints ?? []), ...(block.editableValueKeys ?? [])],
        priority: 47,
        target: { page: "library", search: block.label },
      });
    }

    for (const effect of libraryMetadata?.effects ?? []) {
      pushItem({
        id: `effect:${effect.effectId ?? effect.label}`,
        title: effect.label,
        subtitle: [effect.family, effect.description].filter(Boolean).join(" · "),
        section: "Library",
        badge: "Effect",
        keywords: [effect.effectId ?? "", ...(effect.commonFields ?? []), ...(effect.blockIds ?? []), ...(effect.editableFields ?? [])],
        priority: 42,
        target: { page: "library", search: effect.label },
      });
    }

    for (const template of libraryMetadata?.templates ?? []) {
      const title = template.title ?? template.label ?? template.displayName ?? template.targetKey ?? template.file ?? "";
      pushItem({
        id: `template:${template.targetKey ?? template.file ?? title}`,
        title,
        subtitle: [template.description, template.targetType, template.file].filter(Boolean).join(" · "),
        section: "Create",
        badge: "Template",
        keywords: [template.runtimeType ?? "", template.iconReference ?? "", template.templatePassiveKey ?? "", template.iconSourcePassiveKey ?? ""],
        priority: 46,
        target: { page: "custom", search: title },
      });
    }

    for (const icon of libraryMetadata?.icons ?? []) {
      const title = icon.label ?? icon.spriteName ?? icon.value ?? icon.reference ?? icon.key ?? "";
      pushItem({
        id: `icon:${icon.value ?? icon.reference ?? icon.key ?? title}`,
        title,
        subtitle: [icon.group, icon.description, icon.spriteName].filter(Boolean).join(" · "),
        section: "Icon",
        badge: "Art",
        keywords: [icon.value ?? "", icon.reference ?? "", icon.sourcePassiveKey ?? "", icon.passiveKey ?? "", icon.spriteGuid ?? ""],
        priority: 38,
        target: { page: "custom", search: title },
      });
    }

    for (const collection of libraryMetadata?.sharedCollections ?? []) {
      pushItem({
        id: `collection:${collection.id}`,
        title: collection.label,
        subtitle: collection.description ?? `${collection.optionIds?.length ?? 0} saved option(s)`,
        section: "Library",
        badge: "Collection",
        keywords: [collection.id, ...(collection.optionIds ?? [])],
        priority: 43,
        target: { page: "library", search: collection.label },
      });
    }

    for (const pack of installedPacks) {
      pushItem({
        id: `pack:${pack.packId}`,
        title: pack.name || pack.packId,
        subtitle: [pack.packVersion, pack.active ? "Active" : "", pack.packRoot].filter(Boolean).join(" · "),
        section: "Packs",
        badge: pack.active ? "Active pack" : "Installed",
        keywords: [pack.packId, pack.author ?? "", pack.packRoot ?? "", pack.archivedPackPath ?? ""],
        priority: 44,
        target: { page: "packs", search: pack.name || pack.packId },
      });
    }

    for (const receipt of packReceipts) {
      pushItem({
        id: `receipt:${receipt.receiptPath}`,
        title: receipt.packId,
        subtitle: `Imported ${receipt.importedFileCount} file(s) · ${receipt.receiptPath}`,
        section: "Packs",
        badge: "Receipt",
        keywords: [receipt.packVersion, receipt.importedBy, receipt.backupPath ?? ""],
        priority: 36,
        target: { page: "packs", search: receipt.packId },
      });
    }

    // Push Commands
    pushItem({
      id: "cmd:save",
      title: "Command: Save Active File",
      subtitle: "Save unsaved overrides and write updates back to disk",
      section: "Command",
      badge: "Action",
      keywords: ["save", "write", "disk", "store", "commit"],
      priority: 95,
      target: { page: page, command: "save" },
    });
    pushItem({
      id: "cmd:revert",
      title: "Command: Revert Active Changes",
      subtitle: "Discard all unsaved overrides in the active editor file",
      section: "Command",
      badge: "Action",
      keywords: ["revert", "discard", "undo", "cancel", "clear"],
      priority: 90,
      target: { page: page, command: "revert" },
    });
    pushItem({
      id: "cmd:reset",
      title: "Command: Reset File to Defaults",
      subtitle: "Reset all values in the active file back to vanilla settings",
      section: "Command",
      badge: "Action",
      keywords: ["reset", "vanilla", "default", "clean", "restore"],
      priority: 85,
      target: { page: page, command: "reset" },
    });
    pushItem({
      id: "cmd:launch",
      title: "Command: Launch Modded Game",
      subtitle: "Boot the game with modded parameters enabled",
      section: "Command",
      badge: "Action",
      keywords: ["launch", "play", "game", "boot", "run", "start"],
      priority: 100,
      target: { page: page, command: "launch" },
    });
    pushItem({
      id: "cmd:backup",
      title: "Command: Backup Workspace Snapshot",
      subtitle: "Create a copy of current workspace overrides state",
      section: "Command",
      badge: "Action",
      keywords: ["backup", "snapshot", "save", "archive", "export"],
      priority: 80,
      target: { page: page, command: "backup" },
    });
    pushItem({
      id: "cmd:repair",
      title: "Command: Repair Support Files",
      subtitle: "Restore standard modding template files",
      section: "Command",
      badge: "Action",
      keywords: ["repair", "restore", "fix", "clean", "reset"],
      priority: 75,
      target: { page: page, command: "repair" },
    });

    // Phase 3 Task 15 — Compare snapshots (placeholder pre-Phase 4 source picker).
    pushItem({
      id: "cmd:compare-snapshot",
      title: "Command: Compare with snapshot",
      subtitle: "Diff the workspace against a saved snapshot (preview)",
      section: "Command",
      badge: "Diff",
      keywords: ["compare", "diff", "snapshot", "merge", "delta", "review"],
      priority: 78,
      target: { page: page, command: "compare-snapshot" },
    });
    // Phase 4 — Save current workspace overrides as a named snapshot for the
    // active doc. The Compare with snapshot HUD entry above reads the LATEST
    // entry created here as the LEFT side of its diff.
    pushItem({
      id: "cmd:save-snapshot",
      title: "Command: Save current as snapshot",
      subtitle: "Capture current overrides for this doc to compare against later",
      section: "Command",
      badge: "Snapshot",
      keywords: ["save", "snapshot", "capture", "store", "checkpoint", "stash", "version"],
      priority: 79,
      target: { page: page, command: "save-snapshot" },
    });
    // Phase 3 — surface the History panel from the Command HUD as well as the topbar.
    pushItem({
      id: "cmd:open-history",
      title: historyOpen ? "Command: Close History panel" : "Command: Open History panel",
      subtitle: "Browse the DiffEngine undo/redo timeline",
      section: "Command",
      badge: "Panel",
      keywords: ["history", "timeline", "undo", "redo", "panel", "stack", "diff"],
      priority: 73,
      target: { page: page, command: "open-history" },
    });
    // Phase 3 Task 21 — cycle through the four theme variants from the HUD.
    pushItem({
      id: "cmd:toggle-theme",
      title: "Command: Toggle theme",
      subtitle: `Cycle Default → Light → AMOLED → High Contrast (current: ${currentTheme})`,
      section: "Command",
      badge: "Theme",
      keywords: ["theme", "appearance", "light", "dark", "amoled", "contrast", "color"],
      priority: 70,
      target: { page: page, command: "toggle-theme" },
    });

    return Array.from(new Map(items.map((item) => [item.id, item])).values());
  }, [allCatalogEntries, bootstrap?.catalog, currentTheme, entryState, historyOpen, installedPacks, libraryMetadata, packReceipts, page, pageItemsForMode]);

  const visibleGlobalSearchResults = useMemo(() => {
    const normalizedQuery = normalizeSearchText(deferredGlobalSearchQuery);
    const scored = globalSearchIndex
      .map((item) => ({ item, score: scoreSearchItem(item, normalizedQuery) }))
      .filter((entry) => entry.score >= 0)
      .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title, undefined, { sensitivity: "base" }));

    return scored.slice(0, normalizedQuery ? 18 : 10).map((entry) => entry.item);
  }, [deferredGlobalSearchQuery, globalSearchIndex]);

  useEffect(() => {
    if (!bootstrap?.workspace) {
      return;
    }

    const activeEntry =
      page === "custom"
        ? selectedCustomEntry
        : page === "gamemode"
          ? selectedGameModeEntry
          : page === "swap"
            ? selectedSwapEntry
            : page === "editor" || page === "library" || page === "remove"
              ? selectedEntry
              : null;

    if (activeEntry) {
      void ensureDocumentLoaded(activeEntry);
    }
  }, [
    bootstrap?.workspace?.workspaceRoot,
    page,
    selectedEntry?.id,
    selectedCustomEntry?.id,
    selectedGameModeEntry?.id,
    selectedSwapEntry?.id,
  ]);

  useEffect(() => {
    if (!selectedEntryId) {
      return;
    }
    if (!["editor", "library", "remove"].includes(page)) {
      return;
    }
    if (!swapEntries.some((entry) => entry.id === selectedEntryId)) {
      return;
    }
    const fallbackEntryId = findFirstEditorEntryId(bootstrap?.catalog, editorGroup);
    if (fallbackEntryId && fallbackEntryId !== selectedEntryId) {
      setSelectedEntryId(fallbackEntryId);
    }
  }, [bootstrap?.catalog, editorGroup, page, selectedEntryId, swapEntries]);

  useEffect(() => {
    if (page !== "editor") {
      return;
    }
    if (!selectedEntry || !isSwapCatalogEntry(selectedEntry)) {
      return;
    }
    const fallbackEditorEntryId = activeEditorEntries[0]?.id ?? null;
    if (fallbackEditorEntryId && fallbackEditorEntryId !== selectedEntry.id) {
      setSelectedEntryId(fallbackEditorEntryId);
    }
  }, [activeEditorEntries, page, selectedEntry]);

  useEffect(() => {
    if (!embedded) {
      return;
    }
    if (bootError) {
      if (workspaceStatus.phase !== "error" || workspaceStatus.detail !== bootError) {
        reportEmbeddedStatus("error", 1, bootError);
      }
      return;
    }
    if (booting || setupComplete === null) {
      return;
    }
    if (workspaceStatus.phase !== "ready") {
      reportEmbeddedStatus("ready", 1, "Rebalance studio is ready.");
    }
  }, [bootError, booting, embedded, setupComplete, workspaceStatus.detail, workspaceStatus.phase]);

  function applyBootstrapPayload(payload: BootstrapPayload) {
    setBootstrap(payload);
    startTransition(() => {
      const nextGroup = payload.catalog.find((group) => group.key === editorGroup) ?? payload.catalog.find((group) => group.key === "augments");
      const nextEditorEntryId = nextGroup ? findFirstEditorEntryId(payload.catalog, nextGroup.key) : null;
      if (nextEditorEntryId) {
        setSelectedEntryId(nextEditorEntryId);
      }
      const nextCustom = payload.catalog.find((group) => group.key === "custom")?.entries[0];
      if (nextCustom) {
        setSelectedCustomId(nextCustom.id);
      }
    });
  }

  async function refreshBootstrap() {
    const cacheKey = getWorkspaceCacheKey(workspaceRoot);
    const cachedPayload = bootstrapCache.get(cacheKey);

    setBootError(null);
    if (cachedPayload) {
      setBooting(false);
      reportEmbeddedStatus("ready", 1, "Opened the cached Rebalance workspace.");
      applyBootstrapPayload(cachedPayload);
    } else {
      setBooting(true);
      reportEmbeddedStatus("bootstrap", 0.18, "Reading the selected launcher profile.");
      setShaderProgress(0.1);
      setShaderPhase("loading-catalog");
    }

    try {
      const payload = await launcherApi.bootstrap(workspaceRoot);
      bootstrapCache.set(cacheKey, payload);
      setShaderProgress(0.8);
      setShaderPhase("caching-documents");
      reportEmbeddedStatus("catalog", 0.58, "Parsing files, values, effects, and packs.");
      applyBootstrapPayload(payload);
      setShaderProgress(0.95);
      setShaderPhase("finalizing");
      reportEmbeddedStatus("sync", 0.88, "Finalizing the embedded workspace.");
      if (embedded) {
        reportEmbeddedStatus("ready", 1, "Rebalance studio is ready.");
      }
    } catch (error) {
      const message = getErrorMessage(error);
      if (cachedPayload) {
        setBannerMessage(message);
      } else {
        setBootError(message);
        reportEmbeddedStatus("error", 1, message);
      }
    } finally {
      setBooting(false);
    }
  }

  function toggleFavoriteOption(optionId: string) {
    setFavoriteOptionIds((current) =>
      current.includes(optionId) ? current.filter((entry) => entry !== optionId) : [...current, optionId],
    );
  }

  function createLocalLibraryCollection(label: string, description?: string) {
    const trimmed = label.trim();
    if (!trimmed) {
      return;
    }

    setLocalLibraryCollections((current) => {
      if (current.some((entry) => entry.label.localeCompare(trimmed, undefined, { sensitivity: "accent" }) === 0)) {
        return current;
      }

      return [
        ...current,
        {
          id: createCollectionId(trimmed),
          label: trimmed,
          description: description?.trim() || "A personal library collection for quick access.",
          optionIds: [],
        },
      ];
    });
  }

  function toggleCollectionMembership(collectionId: string, optionId: string) {
    setLocalLibraryCollections((current) =>
      current.map((collection) => {
        if (collection.id !== collectionId) {
          return collection;
        }

        const optionIds = collection.optionIds ?? [];
        return {
          ...collection,
          optionIds: optionIds.includes(optionId)
            ? optionIds.filter((entry) => entry !== optionId)
            : [...optionIds, optionId],
        };
      }),
    );
  }

  async function chooseWorkspace() {
    try {
      const picked = await launcherApi.pickWorkspaceRoot();
      if (picked) {
        setWorkspaceInput(picked);
      }
    } catch (error) {
      setBannerMessage(getErrorMessage(error));
    }
  }

  async function applyWorkspace() {
    try {
      const payload = await launcherApi.saveWorkspaceRoot(workspaceInput);
      const nextWorkspaceRoot = payload.workspace?.workspaceRoot ?? workspaceInput.trim();
      if (nextWorkspaceRoot) {
        bootstrapCache.set(getWorkspaceCacheKey(nextWorkspaceRoot), payload);
      }
      applyBootstrapPayload(payload);
      setBannerMessage("Workspace updated. The launcher reloaded the config catalog.");
    } catch (error) {
      setBannerMessage(getErrorMessage(error));
    }
  }

  async function ensureDocumentLoaded(entry: CatalogEntry, options?: { force?: boolean; discardDrafts?: boolean }) {
    const workspaceRoot = bootstrap?.workspace?.workspaceRoot;
    if (!workspaceRoot) {
      return;
    }
    const loadEntry = resolveRuntimeDocumentLoadEntry(entry, bootstrap?.catalog);
    if (options?.discardDrafts) {
      clearDraftState(workspaceRoot, entry.id);
    }
    const existing = entryState[entry.id];
    if ((existing?.document && !options?.force) || existing?.loading) {
      return;
    }
    commitEntryState((current) => ({
      ...current,
      [entry.id]: existing
        ? {
            ...existing,
            loading: true,
            saving: false,
            error: undefined,
          }
        : { draftOverrides: {}, draftOperations: [], overrideText: "{}", loading: true, saving: false },
    }));
    try {
      const operationCapabilityCacheKey = getOperationCapabilityCacheKey(workspaceRoot, loadEntry.absolutePath);
      const cachedOperationCapabilities = options?.force
        ? undefined
        : operationCapabilitiesCache.get(operationCapabilityCacheKey);
      const operationCapabilitiesPromise = cachedOperationCapabilities !== undefined
        ? Promise.resolve(cachedOperationCapabilities)
        : launcherApi
            .readOperationCapabilities(workspaceRoot, loadEntry.absolutePath)
            .then((response) => {
              operationCapabilitiesCache.set(operationCapabilityCacheKey, response);
              return response;
            })
            .catch(() => {
              operationCapabilitiesCache.set(operationCapabilityCacheKey, null);
              return null;
            });

      const [payload, operationCapabilities] = await Promise.all([
        launcherApi.openDocument(workspaceRoot, loadEntry.absolutePath),
        operationCapabilitiesPromise,
      ]);
      const document = payload.raw;
      const persistedDraft = options?.discardDrafts ? null : loadDraftState(workspaceRoot, entry.id);
      commitEntryState((current) => ({
        ...current,
        [entry.id]: {
          absolutePath: payload.absolutePath,
          document,
          mtimeMs: payload.mtimeMs,
          draftOverrides: persistedDraft?.draftOverrides ?? toEditableOverrideMap(document),
          draftOperations: persistedDraft?.draftOperations ?? cloneJson(document.operations?.entries ?? []),
          overrideText: persistedDraft?.overrideText ?? formatJson(document.overrides ?? {}),
          customDraft: entry.group === "custom"
            ? (persistedDraft?.customDraft as JsonObject | undefined) ?? (cloneJson(document) as unknown as JsonObject)
            : undefined,
          loading: false,
          saving: false,
          operationCapabilities,
        },
      }));
    } catch (error) {
      commitEntryState((current) => ({
        ...current,
        [entry.id]: existing
          ? { ...existing, loading: false, saving: false, error: getErrorMessage(error) }
          : { draftOverrides: {}, draftOperations: [], overrideText: "{}", loading: false, saving: false, error: getErrorMessage(error) },
      }));
    }
  }

  function updateValueOverride(entryId: string, item: { path: string; valueType?: string; defaultValue?: JsonValue }, nextRawValue: string | boolean) {
    const current = entryState[entryId];
    if (!current) {
      return;
    }
    try {
      const nextValue = typeof nextRawValue === "boolean" ? nextRawValue : parseValueInput(nextRawValue, item.valueType);
      const nextOverrides = { ...current.draftOverrides };
      if (item.defaultValue !== undefined && JSON.stringify(item.defaultValue) === JSON.stringify(nextValue)) {
        delete nextOverrides[item.path];
      } else {
        nextOverrides[item.path] = nextValue;
      }
      commitEntryState((state) => ({
        ...state,
        [entryId]: { ...current, draftOverrides: nextOverrides, overrideText: formatJson(nextOverrides), overrideTextError: undefined },
      }));
    } catch (error) {
      commitEntryState((state) => ({ ...state, [entryId]: { ...current, error: getErrorMessage(error) } }));
    }
  }

  function updateJsonOverride(
    entryId: string,
    path: string,
    nextValue: JsonValue,
    options?: {
      defaultValue?: JsonValue;
      clearOverridePrefixes?: string[];
      clearOperationPrefixes?: string[];
    },
  ) {
    const current = entryState[entryId];
    if (!current) {
      return;
    }

    const nextOverrides = { ...current.draftOverrides };
    for (const prefix of options?.clearOverridePrefixes ?? []) {
      for (const key of Object.keys(nextOverrides)) {
        if (key === prefix || key.startsWith(prefix)) {
          delete nextOverrides[key];
        }
      }
    }

    if (options?.defaultValue !== undefined && JSON.stringify(options.defaultValue) === JSON.stringify(nextValue)) {
      delete nextOverrides[path];
    } else {
      nextOverrides[path] = cloneJson(nextValue);
    }

    const nextOperations = current.draftOperations.filter(
      (operation) => !(options?.clearOperationPrefixes ?? []).some((prefix) => operation.path === prefix || operation.path.startsWith(prefix)),
    );

    commitEntryState((state) => ({
      ...state,
      [entryId]: {
        ...current,
        draftOverrides: nextOverrides,
        draftOperations: nextOperations,
        overrideText: formatJson(nextOverrides),
        overrideTextError: undefined,
        error: undefined,
      },
    }));
  }

  function resetValueOverride(
    entryId: string,
    path: string,
    options?: {
      clearOverridePrefixes?: string[];
      clearOperationPrefixes?: string[];
    },
  ) {
    const current = entryState[entryId];
    if (!current) {
      return;
    }

    const nextOverrides = { ...current.draftOverrides };
    delete nextOverrides[path];
    for (const prefix of options?.clearOverridePrefixes ?? []) {
      for (const key of Object.keys(nextOverrides)) {
        if (key === prefix || key.startsWith(prefix)) {
          delete nextOverrides[key];
        }
      }
    }

    const nextOperations = current.draftOperations.filter(
      (operation) => !(options?.clearOperationPrefixes ?? []).some((prefix) => operation.path === prefix || operation.path.startsWith(prefix)),
    );

    commitEntryState((state) => ({
      ...state,
      [entryId]: {
        ...current,
        draftOverrides: nextOverrides,
        draftOperations: nextOperations,
        overrideText: formatJson(nextOverrides),
        overrideTextError: undefined,
        error: undefined,
      },
    }));
  }

  function queueOperation(entryId: string, operation: TargetOperationEntry) {
    const current = entryState[entryId];
    if (!current) {
      return;
    }
    commitEntryState((state) => ({
      ...state,
      [entryId]: {
        ...current,
        draftOperations: [...current.draftOperations, cloneJson(operation)],
        error: undefined,
      },
    }));
  }

  function removeQueuedOperation(entryId: string, index: number) {
    const current = entryState[entryId];
    if (!current) {
      return;
    }
    commitEntryState((state) => ({
      ...state,
      [entryId]: {
        ...current,
        draftOperations: current.draftOperations.filter((_, operationIndex) => operationIndex !== index),
        error: undefined,
      },
    }));
  }

  function clearQueuedOperations(entryId: string) {
    const current = entryState[entryId];
    if (!current) {
      return;
    }
    commitEntryState((state) => ({
      ...state,
      [entryId]: {
        ...current,
        draftOperations: [],
        error: undefined,
      },
    }));
  }

  function resetAllDrafts() {
    const workspaceRoot = bootstrap?.workspace?.workspaceRoot;
    if (!workspaceRoot) {
      return;
    }

    commitEntryState((current) =>
      Object.fromEntries(
        Object.entries(current).map(([entryId, state]) => {
          const document = state.document;
          const resetOverrides = document ? toEditableOverrideMap(document) : {};
          const resetOperations = cloneJson(document?.operations?.entries ?? []);
          const resetCustomDraft =
            state.customDraft && document ? (cloneJson(document) as unknown as JsonObject) : undefined;
          return [
            entryId,
            {
              ...state,
              draftOverrides: resetOverrides,
              draftOperations: resetOperations,
              overrideText: formatJson(resetOverrides),
              overrideTextError: undefined,
              customDraft: resetCustomDraft,
              customDraftTextError: undefined,
              error: undefined,
            },
          ];
        }),
      ),
    );
    clearAllDraftState(workspaceRoot);
    setBannerMessage("All unsaved drafts were cleared. Saved files were left untouched.");
  }

  function updateOverrideText(entryId: string, text: string) {
    const current = entryState[entryId];
    if (!current) {
      return;
    }
    try {
      const parsed = parseJsonObject(text) as Record<string, JsonValue>;
      commitEntryState((state) => ({
        ...state,
        [entryId]: { ...current, draftOverrides: parsed, overrideText: text, overrideTextError: undefined },
      }));
    } catch (error) {
      commitEntryState((state) => ({ ...state, [entryId]: { ...current, overrideText: text, overrideTextError: getErrorMessage(error) } }));
    }
  }

  function revertDocument(entryId: string) {
    const current = entryState[entryId];
    const document = current?.document;
    if (!current || !document) {
      return;
    }
    const resetOverrides = toEditableOverrideMap(document);
    commitEntryState((state) => ({
      ...state,
      [entryId]: {
        ...current,
        draftOverrides: resetOverrides,
        draftOperations: cloneJson(document.operations?.entries ?? []),
        overrideText: formatJson(resetOverrides),
        overrideTextError: undefined,
        error: undefined,
      },
    }));
  }

  function resetToDefaults(entryId: string) {
    const current = entryState[entryId];
    if (!current) {
      return;
    }
    commitEntryState((state) => ({
      ...state,
      [entryId]: { ...current, draftOverrides: {}, draftOperations: [], overrideText: "{}", overrideTextError: undefined, error: undefined },
    }));
  }

  async function saveRuntimeEntry(entryId: string) {
    const current = entryStateRef.current[entryId];
    if (!current?.document || !bootstrap?.workspace || !current.absolutePath || !current.mtimeMs || current.overrideTextError) {
      return;
    }
    const materialized = materializeRuntimeDocument(current.document, current.draftOverrides, current.draftOperations) as JsonObject;
    const savedOverrides = toEditableOverrideMap(materialized as RuntimeDocument);
    commitEntryState((state) => ({ ...state, [entryId]: { ...current, saving: true } }));
    try {
      const response = await launcherApi.saveDocument({
        workspaceRoot: bootstrap.workspace.workspaceRoot,
        absolutePath: current.absolutePath,
        expectedMtimeMs: current.mtimeMs,
        raw: materialized,
        createBackup: true,
      });
      commitEntryState((state) => ({
        ...state,
        [entryId]: {
          ...current,
          document: materialized as RuntimeDocument,
          draftOverrides: savedOverrides,
          draftOperations: cloneJson((materialized as RuntimeDocument).operations?.entries ?? []),
          overrideText: formatJson(savedOverrides),
          overrideTextError: undefined,
          mtimeMs: response.mtimeMs,
          saving: false,
          lastSavedAt: response.savedAtUtc,
          lastBackupPath: response.backupPath ?? null,
          error: undefined,
        },
      }));
      setBannerMessage("Config saved successfully. A backup was created automatically.");
    } catch (error) {
      commitEntryState((state) => ({ ...state, [entryId]: { ...current, saving: false, error: getErrorMessage(error) } }));
    }
  }

  async function copyGameModeSnapshotToTarget(targetEntryId: string) {
    const sourceEntry = selectedGameModeEntry;
    const targetEntry = gameModeGroup?.entries.find((entry) => entry.id === targetEntryId) ?? null;
    if (!sourceEntry || !targetEntry || !bootstrap?.workspace) {
      return;
    }

    if (getGameModeSourceRole(sourceEntry, selectedGameModeState?.document) !== "current_lobby") {
      setBannerMessage("Open Live Snapshot first, then copy it into a restart-safe target.");
      return;
    }

    setCopyingGameModeSnapshot(true);
    try {
      await ensureDocumentLoaded(targetEntry);

      const latestSourceState = entryStateRef.current[sourceEntry.id];
      const latestTargetState = entryStateRef.current[targetEntry.id];
      if (!latestSourceState?.document || !latestTargetState?.document) {
        throw new Error("Open both the live snapshot and the target file once so the launcher can copy between them.");
      }

      const sourceMaterialized = materializeRuntimeDocument(
        latestSourceState.document,
        latestSourceState.draftOverrides,
        latestSourceState.draftOperations,
      );
      const sourceValues = buildComparableRuntimeValueMap(sourceMaterialized);
      const targetPaths = getRuntimeEditablePaths(latestTargetState.document);
      const nextOverrides = { ...latestTargetState.draftOverrides };

      let copiedCount = 0;
      for (const path of targetPaths) {
        const comparableTargetPath = normalizeComparablePath(path);
        const candidateValue = sourceValues.get(comparableTargetPath);
        if (candidateValue === undefined) {
          continue;
        }

        copiedCount += 1;
        const nextValue = cloneJson(candidateValue);
        const defaultValue = getRuntimeDefaultValue(latestTargetState.document, path);

        if (defaultValue !== undefined && JSON.stringify(defaultValue) === JSON.stringify(nextValue)) {
          delete nextOverrides[path];
        } else {
          nextOverrides[path] = nextValue;
        }
      }

      if (!copiedCount) {
        setBannerMessage("No overlapping editable values were found between Live Snapshot and that target yet.");
        return;
      }

      commitEntryState((state) => ({
        ...state,
        [targetEntry.id]: {
          ...latestTargetState,
          draftOverrides: nextOverrides,
          overrideText: formatJson(nextOverrides),
          overrideTextError: undefined,
          error: undefined,
        },
      }));
      startTransition(() => setSelectedEntryId(targetEntry.id));
      setBannerMessage(`Live Snapshot copied into ${buildSnapshotTargetOption(targetEntry, latestTargetState.document).label}. Review it, then save when ready.`);
    } catch (error) {
      setBannerMessage(getErrorMessage(error));
    } finally {
      setCopyingGameModeSnapshot(false);
    }
  }

  function updateCustomField(entryId: string, path: string, value: JsonValue) {
    commitEntryState((state) => {
      const current = state[entryId];
      if (!current?.customDraft) {
        return state;
      }
      const nextDraft = setDraftPath(current.customDraft, path, value);
      return { ...state, [entryId]: { ...current, customDraft: nextDraft, customDraftTextError: undefined } };
    });
  }

  function removeCustomField(entryId: string, path: string) {
    commitEntryState((state) => {
      const current = state[entryId];
      if (!current?.customDraft) {
        return state;
      }
      const nextDraft = unsetDraftPath(current.customDraft, path);
      return { ...state, [entryId]: { ...current, customDraft: nextDraft, customDraftTextError: undefined } };
    });
  }

  function replaceCustomDraft(entryId: string, nextDraft: JsonObject) {
    commitEntryState((state) => {
      const current = state[entryId];
      if (!current?.customDraft) {
        return state;
      }
      return { ...state, [entryId]: { ...current, customDraft: cloneJson(nextDraft), customDraftTextError: undefined } };
    });
  }

  async function saveCustomEntry(entryId: string) {
    const current = entryStateRef.current[entryId];
    if (!current?.customDraft || !current.absolutePath || !current.mtimeMs || !bootstrap?.workspace) {
      return;
    }
    commitEntryState((state) => ({ ...state, [entryId]: { ...current, saving: true } }));
    try {
      const response = await launcherApi.saveDocument({
        workspaceRoot: bootstrap.workspace.workspaceRoot,
        absolutePath: current.absolutePath,
        expectedMtimeMs: current.mtimeMs,
        raw: current.customDraft,
        createBackup: true,
      });
      commitEntryState((state) => ({
        ...state,
        [entryId]: { ...current, mtimeMs: response.mtimeMs, saving: false, lastSavedAt: response.savedAtUtc, lastBackupPath: response.backupPath ?? null },
      }));
      setBannerMessage("Custom augment saved. The new JSON is ready for the mod to load.");
    } catch (error) {
      commitEntryState((state) => ({ ...state, [entryId]: { ...current, saving: false, error: getErrorMessage(error) } }));
    }
  }

  async function createCustomDraft() {
    if (!bootstrap?.workspace || creatingCustomDraft) {
      return;
    }

    const sourceEntry =
      selectedCustomEntry
      ?? customGroup?.entries.find((entry) => entry.id === selectedCustomId)
      ?? customGroup?.entries[0]
      ?? null;

    setCreatingCustomDraft(true);
    try {
      const payload = await launcherApi.createCustomDraft({
        workspaceRoot: bootstrap.workspace.workspaceRoot,
        sourceAbsolutePath: sourceEntry?.absolutePath ?? null,
      });

      commitEntryState((state) => ({
        ...state,
        [payload.absolutePath]: {
          absolutePath: payload.absolutePath,
          document: payload.raw,
          mtimeMs: payload.mtimeMs,
          draftOverrides: toEditableOverrideMap(payload.raw),
          draftOperations: cloneJson(payload.raw.operations?.entries ?? []),
          overrideText: formatJson(payload.raw.overrides ?? {}),
          customDraft: cloneJson(payload.raw) as unknown as JsonObject,
          loading: false,
          saving: false,
          error: undefined,
          operationCapabilities: null,
        },
      }));

      await refreshBootstrap();

      startTransition(() => {
        setSearch("");
        setPage("custom");
        setSelectedCustomId(payload.absolutePath);
      });
      setBannerMessage("A new starter draft was created and opened in Create.");
    } catch (error) {
      setBannerMessage(getErrorMessage(error));
    } finally {
      setCreatingCustomDraft(false);
    }
  }

  function togglePackPathSelection(path: string) {
    setSelectedPackPaths((current) =>
      current.includes(path) ? current.filter((entry) => entry !== path) : [...current, path],
    );
  }

  function selectPackGroup(groupKey: string) {
    const group = bootstrap?.catalog.find((entry) => entry.key === groupKey);
    if (!group) {
      return;
    }
    setSelectedPackPaths((current) => {
      const next = new Set(current);
      for (const entry of group.entries) {
        next.add(entry.absolutePath);
      }
      return Array.from(next);
    });
  }

  function clearPackSelection() {
    setSelectedPackPaths([]);
  }

  async function refreshPackReceipts(workspaceRoot?: string) {
    const root = workspaceRoot ?? bootstrap?.workspace?.workspaceRoot;
    if (!root) {
      return;
    }
    try {
      const receipts = await launcherApi.listImportReceipts(root);
      packReceiptsCache.set(root, receipts);
      setPackReceipts(receipts);
    } catch (error) {
      setBannerMessage(getErrorMessage(error));
    }
  }

  async function refreshInstalledPacks(workspaceRoot?: string) {
    const root = workspaceRoot ?? bootstrap?.workspace?.workspaceRoot;
    if (!root) {
      return;
    }
    try {
      const packs = await launcherApi.listInstalledPacks(root);
      installedPacksCache.set(root, packs);
      setInstalledPacks(packs);
    } catch (error) {
      setBannerMessage(getErrorMessage(error));
    }
  }

  async function refreshGameModeIndex(workspaceRoot?: string) {
    const root = workspaceRoot ?? bootstrap?.workspace?.workspaceRoot;
    if (!root) {
      return;
    }
    try {
      const index = await launcherApi.readGameModeIndex(root);
      gameModeIndexCache.set(root, index);
      setGameModeIndex(index);
    } catch {
      gameModeIndexCache.set(root, null);
      setGameModeIndex(null);
    }
  }

  async function refreshGameModeProbeNow() {
    const root = bootstrap?.workspace?.workspaceRoot;
    if (!root) {
      return;
    }
    try {
      const index = await launcherApi.refreshGameModeProbe(root);
      gameModeIndexCache.set(root, index);
      setGameModeIndex(index);
      setBannerMessage("Game mode probe refreshed from the latest runtime export.");
    } catch (error) {
      setBannerMessage(getErrorMessage(error));
    }
  }

  async function activateInstalledPack(packId: string) {
    const root = bootstrap?.workspace?.workspaceRoot;
    if (!root) {
      return;
    }
    try {
      const result = await launcherApi.setActiveContentPack(root, packId);
      setInstalledPacks((current) => {
        const nextPacks = current.map((pack) => ({
          ...pack,
          active: pack.packId === result.packId,
          activatedAtUtc: pack.packId === result.packId ? result.activatedAtUtc ?? null : null,
        }));
        installedPacksCache.set(root, nextPacks);
        return nextPacks;
      });
      setBannerMessage(`Active content pack switched to ${result.name}. Content changes usually need a game restart or a fresh lobby.`);
    } catch (error) {
      setBannerMessage(getErrorMessage(error));
    }
  }

  async function refreshLibraryMetadata(workspaceRoot?: string) {
    const root = workspaceRoot ?? bootstrap?.workspace?.workspaceRoot;
    if (!root) {
      return;
    }
    try {
      const cachedMetadata = libraryMetadataCache.get(root);
      if (cachedMetadata) {
        setLibraryMetadata(cachedMetadata);
        return;
      }

      let pendingRequest = libraryMetadataRequestCache.get(root);
      if (!pendingRequest) {
        pendingRequest = launcherApi.readLibraryMetadata(root);
        libraryMetadataRequestCache.set(root, pendingRequest);
      }

      const metadata = await pendingRequest;
      libraryMetadataRequestCache.delete(root);
      libraryMetadataCache.set(root, metadata);
      setLibraryMetadata(metadata);
    } catch (error) {
      libraryMetadataRequestCache.delete(root);
      setBannerMessage(getErrorMessage(error));
    }
  }

  async function choosePackExportPath() {
    try {
      const path = await launcherApi.pickPackExportPath();
      if (path) {
        setPackExportState((current) => ({ ...current, outputPath: path }));
      }
    } catch (error) {
      setBannerMessage(getErrorMessage(error));
    }
  }

  async function choosePackImportPath() {
    try {
      const path = await launcherApi.pickPackImportPath();
      if (path) {
        setPackImportState((current) => ({ ...current, packPath: path }));
      }
    } catch (error) {
      setBannerMessage(getErrorMessage(error));
    }
  }

  async function previewExportPack() {
    if (!bootstrap?.workspace) {
      return;
    }
    try {
      const preview = await launcherApi.exportPackPreview({
        workspaceRoot: bootstrap.workspace.workspaceRoot,
        selection: selectedPackPaths,
        packId: packExportState.packId,
        packVersion: packExportState.packVersion,
        name: packExportState.name,
        description: packExportState.description,
        author: packExportState.author,
        packageMode: "delta",
        defaultConflictStrategy: "replace-targeted-files",
      });
      setPackExportState((current) => ({ ...current, preview }));
      setBannerMessage(`Pack preview ready. ${preview.fileCount} file(s) will be exported.`);
    } catch (error) {
      setBannerMessage(getErrorMessage(error));
    }
  }

  async function exportPack() {
    if (!bootstrap?.workspace) {
      return;
    }
    try {
      const response = await launcherApi.exportPack({
        workspaceRoot: bootstrap.workspace.workspaceRoot,
        selection: selectedPackPaths,
        packId: packExportState.packId,
        packVersion: packExportState.packVersion,
        name: packExportState.name,
        description: packExportState.description,
        author: packExportState.author,
        packageMode: "delta",
        defaultConflictStrategy: "replace-targeted-files",
        outputPath: packExportState.outputPath,
      });
      setPackExportState((current) => ({
        ...current,
        preview: {
          packPath: response.outputPath,
          manifest: response.manifest,
          contents: response.contents,
          warnings: [],
          fileCount: response.writtenFiles,
          totalBytes: response.writtenBytes,
        },
      }));
      setBannerMessage(`Pack exported to ${response.outputPath}`);
    } catch (error) {
      setBannerMessage(getErrorMessage(error));
    }
  }

  async function previewImportPack() {
    if (!bootstrap?.workspace || !packImportState.packPath) {
      return;
    }
    try {
      const preview = await launcherApi.importPackPreview({
        workspaceRoot: bootstrap.workspace.workspaceRoot,
        packPath: packImportState.packPath,
        conflictStrategy: packImportState.conflictStrategy,
        createBackup: packImportState.createBackup,
      });
      setPackImportState((current) => ({ ...current, preview }));
      setBannerMessage(`Import preview ready. ${preview.fileCount} file(s) would be applied.`);
    } catch (error) {
      setBannerMessage(getErrorMessage(error));
    }
  }

  async function importPackNow() {
    if (!bootstrap?.workspace || !packImportState.packPath) {
      return;
    }
    try {
      const result = await launcherApi.importPack({
        workspaceRoot: bootstrap.workspace.workspaceRoot,
        packPath: packImportState.packPath,
        conflictStrategy: packImportState.conflictStrategy,
        createBackup: packImportState.createBackup,
      });
      setBannerMessage(`Pack imported. Receipt written to ${result.receiptPath}. Content changes usually need a game restart or a fresh lobby.`);
      await refreshPackReceipts(bootstrap.workspace.workspaceRoot);
      await refreshInstalledPacks(bootstrap.workspace.workspaceRoot);
    } catch (error) {
      setBannerMessage(getErrorMessage(error));
    }
  }

  async function dropPackToModNow() {
    if (!bootstrap?.workspace || !packImportState.packPath) {
      return;
    }
    try {
      const result = await launcherApi.dropPackToMod({
        workspaceRoot: bootstrap.workspace.workspaceRoot,
        packPath: packImportState.packPath,
      });
      setBannerMessage(`Pack copied to mod drop folder: ${result.destinationPath}`);
    } catch (error) {
      setBannerMessage(getErrorMessage(error));
    }
  }

  async function createSnapshotBackup() {
    if (!bootstrap?.workspace) {
      return;
    }
    try {
      const result = await launcherApi.createWorkspaceSnapshot(bootstrap.workspace.workspaceRoot);
      setBannerMessage(`Workspace snapshot created at ${result.backupPath}`);
    } catch (error) {
      setBannerMessage(getErrorMessage(error));
    }
  }

  async function repairWorkspaceSupportData() {
    if (!bootstrap?.workspace) {
      return;
    }
    const currentWorkspaceRoot = bootstrap.workspace.workspaceRoot;
    try {
      const result = await launcherApi.repairWorkspaceSupportFiles(currentWorkspaceRoot);
      bootstrapCache.delete(getWorkspaceCacheKey(currentWorkspaceRoot));
      libraryMetadataCache.delete(currentWorkspaceRoot);
      libraryMetadataRequestCache.delete(currentWorkspaceRoot);
      operationCapabilitiesCache.clear();
      await refreshBootstrap();
      await refreshLibraryMetadata(currentWorkspaceRoot);
      const repairedCount = result.repairedSupportFiles.length;
      setBannerMessage(
        repairedCount > 0
          ? `Standard profile data restored. Repaired ${repairedCount} support file(s).`
          : "Standard profile data rechecked. No support files needed repair.",
      );
    } catch (error) {
      setBannerMessage(getErrorMessage(error));
    }
  }

  async function launchGameNow() {
    if (!bootstrap?.workspace) {
      return;
    }
    try {
      await launcherApi.launchGame(bootstrap.workspace.workspaceRoot);
      setBannerMessage("BAPBAP launch requested.");
    } catch (error) {
      setBannerMessage(getErrorMessage(error));
    }
  }

  function dismissQuickStart() {
    try {
      window.localStorage.setItem("rebalancebap.quickstart.dismissed", "true");
    } catch {
      // ignore storage issues in hosted/mock mode
    }
    setShowQuickStart(false);
    setBannerMessage("Tutorial marked as seen. You can still reopen it anytime from the sidebar.");
  }

  function openEditorUtilityDrawer(
    nextDrawer: "add" | "remove",
    seed = "",
    groupOverride: EditorGroupKey = editorGroup,
    entryIdOverride?: string | null,
  ) {
    const nextEntryId = resolveEntryIdForPage(
      "editor",
      bootstrap?.catalog,
      entryIdOverride ?? selectedEntryId,
      swapEntries,
      groupOverride,
    );
    setWorkspaceTopStripHidden(false);
    setToolRailExpanded(false);
    setLibrarySearchSeed(nextDrawer === "add" ? seed : "");
    setEditorUtilityDrawer(nextDrawer);
    setEditorGroup(groupOverride);
    startTransition(() => {
      setSelectedEntryId(entryIdOverride ?? nextEntryId);
      setPage("editor");
      setSearch(seed);
    });
  }

  function navigateTo(nextPage: PageKey) {
    if (nextPage === "library") {
      openEditorUtilityDrawer("add");
      return;
    }
    if (nextPage === "remove") {
      openEditorUtilityDrawer("remove");
      return;
    }
    const nextEntryId = resolveEntryIdForPage(nextPage, bootstrap?.catalog, selectedEntryId, swapEntries, editorGroup);
    setWorkspaceTopStripHidden(false);
    setEditorUtilityDrawer(null);
    setLibrarySearchSeed("");
    if (FOCUS_WORKSPACE_PAGE_KEYS.includes(nextPage)) {
      setToolRailExpanded(false);
    }
    startTransition(() => {
      setSelectedEntryId(nextEntryId);
      setPage(nextPage);
      setSearch("");
    });
  }

  function openGlobalSearchResult(result: RebalanceSearchItem) {
    const target = result.target;
    setGlobalSearchOpen(false);
    setGlobalSearchQuery("");
    setWorkspaceTopStripHidden(false);
    if (target.command) {
      if (target.command === "save") {
        const activeEntry = page === "custom" ? selectedCustomEntry : page === "gamemode" ? selectedGameModeEntry : page === "swap" ? selectedSwapEntry : selectedEntry;
        if (activeEntry) {
          if (page === "custom") {
            void saveCustomEntry(activeEntry.id);
          } else {
            void saveRuntimeEntry(activeEntry.id);
          }
        }
      } else if (target.command === "revert") {
        const activeEntry = page === "gamemode" ? selectedGameModeEntry : selectedEntry;
        if (activeEntry) {
          revertDocument(activeEntry.id);
        }
      } else if (target.command === "reset") {
        const activeEntry = page === "gamemode" ? selectedGameModeEntry : selectedEntry;
        if (activeEntry) {
          resetToDefaults(activeEntry.id);
        }
      } else if (target.command === "launch") {
        launchGameNow();
      } else if (target.command === "backup") {
        createSnapshotBackup();
      } else if (target.command === "repair") {
        repairWorkspaceSupportData();
      } else if (target.command === "compare-snapshot") {
        // Phase 4 — real snapshot picker. Prefer the LATEST workspace snapshot
        // saved via `cmd:save-snapshot` for the active doc. When no snapshot
        // exists yet, fall back to the previous DiffEngine-history behaviour
        // (last entry's `before` vs current overrides) and toast the user to
        // explain how to populate snapshots.
        //   LEFT  = latest docSnapshots entry's overrides (when present), or
        //           last history entry's `before` (history fallback), or {}
        //   RIGHT = diffEngine.getAllOverrides(activeDocPath) — the current
        //           in-memory overrides for the active doc.
        const activeEntryForDiff =
          page === "custom"
            ? selectedCustomEntry
            : page === "gamemode"
              ? selectedGameModeEntry
              : page === "swap"
                ? selectedSwapEntry
                : selectedEntry;
        const activeDocPath = activeEntryForDiff?.absolutePath ?? null;

        const docPathSnapshots = activeDocPath ? docSnapshots.get(activeDocPath) ?? [] : [];

        if (activeDocPath && docPathSnapshots.length > 0) {
          const latestSnapshot = docPathSnapshots[docPathSnapshots.length - 1];
          const left = (latestSnapshot.overrides ?? {}) as Record<string, unknown>;
          const right = diffEngine.getAllOverrides(activeDocPath) as Record<string, unknown>;
          setActiveDiff(computeDiff(left, right));
          return;
        }

        // No snapshots yet — fall back to history.before behaviour and toast.
        const docHistory = activeDocPath
          ? diffEngine.getHistory().filter((entry) => entry.docPath === activeDocPath)
          : [];

        if (activeDocPath && docHistory.length > 0) {
          let left: Record<string, unknown> = {};
          if (docHistory.length > 1) {
            const lastBefore = docHistory[docHistory.length - 1].before;
            if (lastBefore && typeof lastBefore === "object" && !Array.isArray(lastBefore)) {
              left = lastBefore as Record<string, unknown>;
            }
          }
          const right = diffEngine.getAllOverrides(activeDocPath) as Record<string, unknown>;
          setActiveDiff(computeDiff(left, right));
        } else {
          const demo = computeDiff({}, { exampleField: 1 });
          setActiveDiff(demo);
        }
        showToast(
          "No snapshots yet — use Save current as snapshot first",
          "info",
        );
      } else if (target.command === "save-snapshot") {
        // Phase 4 — capture the current overrides for the active doc as a
        // named workspace snapshot. The Compare with snapshot HUD entry uses
        // the LATEST entry pushed here as the LEFT side of its diff. The
        // snapshot list is workspace-keyed and persisted via the docSnapshots
        // useEffect below.
        const activeEntryForSave =
          page === "custom"
            ? selectedCustomEntry
            : page === "gamemode"
              ? selectedGameModeEntry
              : page === "swap"
                ? selectedSwapEntry
                : selectedEntry;
        const activeDocPath = activeEntryForSave?.absolutePath ?? null;

        if (!activeDocPath) {
          showToast(
            "Open a file first to capture a snapshot of its overrides.",
            "info",
          );
          return;
        }

        const overrides = diffEngine.getAllOverrides(activeDocPath) as Record<string, unknown>;
        const entry: DocSnapshotEntry = {
          id: createDocSnapshotId(),
          savedAt: new Date().toISOString(),
          overrides,
        };
        setDocSnapshots((current) => {
          const next = new Map(current);
          const existing = next.get(activeDocPath) ?? [];
          // FIFO cap — keep the latest DOC_SNAPSHOTS_PER_DOC_LIMIT entries
          // and drop the oldest. The Compare with snapshot HUD entry uses
          // the LAST entry as the LEFT side of the diff, so newest-at-end
          // ordering is preserved.
          const appended = [...existing, entry];
          const capped = appended.length > DOC_SNAPSHOTS_PER_DOC_LIMIT
            ? appended.slice(appended.length - DOC_SNAPSHOTS_PER_DOC_LIMIT)
            : appended;
          next.set(activeDocPath, capped);
          return next;
        });
        showToast("Snapshot saved", "success");
      } else if (target.command === "open-history") {
        setHistoryOpen(true);
      } else if (target.command === "toggle-theme") {
        const order: ThemeId[] = ["default", "light", "amoled", "high-contrast"];
        const idx = order.indexOf(currentTheme);
        const next = order[(idx + 1) % order.length] ?? "default";
        setCurrentTheme(next);
        applyTheme(next, workspaceRoot ?? null);
        showToast(`Theme switched to ${next}`, "success");
      }
      return;
    }
    if (target.page === "library") {
      openEditorUtilityDrawer("add", target.search ?? "", target.group ?? editorGroup, target.entryId);
      return;
    }
    if (target.page === "remove") {
      openEditorUtilityDrawer("remove", target.search ?? "", target.group ?? editorGroup, target.entryId);
      return;
    }
    setEditorUtilityDrawer(null);
    setLibrarySearchSeed("");
    if (FOCUS_WORKSPACE_PAGE_KEYS.includes(target.page)) {
      setToolRailExpanded(false);
    }
    if (target.group) {
      setEditorGroup(target.group);
    }

    startTransition(() => {
      if (target.customId) {
        setSelectedCustomId(target.customId);
      }
      if (target.entryId) {
        setSelectedEntryId(target.entryId);
      } else if (target.page === "editor" || target.page === "library" || target.page === "remove" || target.page === "gamemode") {
        setSelectedEntryId(resolveEntryIdForPage(target.page, bootstrap?.catalog, selectedEntryId, swapEntries, target.group ?? editorGroup));
      } else if (target.page === "swap") {
        setSelectedEntryId(swapEntries[0]?.id ?? selectedEntryId);
      }
      setPage(target.page);
      setSearch(target.search ?? "");
    });
  }

  function markInteractiveTourSeen() {
    if (suppressTourSeenRef.current) {
      return;
    }
    try {
      window.localStorage.setItem("rebalancebap.quickstart.dismissed", "true");
      window.localStorage.setItem("rebalancebap.interactive-tour.seen", "true");
    } catch {
      // ignore storage issues in hosted/mock mode
    }
    setShowQuickStart(false);
    setBannerMessage("Interactive tutorial closed. You can restart it anytime from the dashboard or tutorial page.");
  }

  function startInteractiveTour() {
    if (guidedTourRef.current) {
      suppressTourSeenRef.current = true;
      guidedTourRef.current.destroy();
      guidedTourRef.current = null;
      suppressTourSeenRef.current = false;
    }
    setBannerMessage("Interactive tutorial started. We will guide you through the safest editing workflow.");
    navigateTo("settings");
    setTourRunId((current) => current + 1);
  }

  function storeModePreference(nextMode: ExperienceMode) {
    setUiMode(nextMode);
    try {
      window.localStorage.setItem(MODE_KEY, nextMode);
    } catch {
      // ignore storage issues in hosted/mock mode
    }
  }

  function finishSetup(nextMode?: ExperienceMode) {
    storeModePreference(nextMode ?? uiMode);
    try {
      window.localStorage.setItem(SETUP_COMPLETE_KEY, "true");
    } catch {
      // ignore storage issues in hosted/mock mode
    }
    setSetupComplete(true);
    navigateTo("dashboard");
  }

  // Shader overlay — renders on top while bootstrap is loading, dissolves away when complete.
  // The main UI always renders beneath it so it's visible the moment the shader fades.
  const shaderOverlay = !shaderComplete ? (
    <ShaderTransitionWrapper show={!shaderDissolved} onExitComplete={handleShaderExitComplete}>
      {useWebGLFallback ? (
        <ShaderLoaderFallback progress={shaderProgress} phase={shaderPhase} />
      ) : (
        <ShaderLoader
          progress={shaderProgress}
          phase={shaderPhase}
          onComplete={handleShaderDissolved}
          onError={handleShaderError}
        />
      )}
    </ShaderTransitionWrapper>
  ) : null;

  if (booting || setupComplete === null) {
    // Main content is not ready yet (no bootstrap data), but we still render the
    // shader overlay rather than blocking rendering entirely.
    return (
      <>
        {shaderOverlay}
        <div className={embedded ? "rebalance-embedded-loading-shell" : "flex min-h-screen items-center justify-center px-6"}>
          <div className={embedded ? "rebalance-embedded-loading-inline rebalance-boot-loading-inline rebalance-loading-card" : "soft-panel rounded-[28px] px-8 py-10 rebalance-loading-card"}>
            <div className="rebalance-loading-head">
              <Spinner color="secondary" size="sm" />
              <strong>{embedded ? "Loading Rebalance studio" : "Loading launcher workspace"}</strong>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (shouldShowSetup) {
    return (
      <DeferredSuspense fallback={<PageSkeleton layout="editor" />}>
        <FadeInOnMount>
        <LazySetupPage
          bootstrap={bootstrap}
          workspaceInput={workspaceInput}
          onWorkspaceInputChange={setWorkspaceInput}
          onChooseWorkspace={chooseWorkspace}
          onApplyWorkspace={applyWorkspace}
          mode={uiMode}
          onModeChange={storeModePreference}
          onFinishSetup={() => finishSetup()}
          onOpenTutorial={() => navigateTo("tutorial")}
        />
        </FadeInOnMount>
      </DeferredSuspense>
    );
  }

  const currentPageMeta = pageItemsForMode.find((item) => item.key === page);
  const sessionLabel = profileLabel ?? bootstrap?.workspace?.workspaceRoot ?? "Selected launcher profile";
  const shellRailCollapsed = isFocusWorkspacePage && !toolRailExpanded;
  const workspaceCompactChrome = isFocusWorkspacePage;
  const visibleEmbeddedPrimaryPageItems = embeddedPrimaryPageItems;
  const visibleEmbeddedSecondaryPageItems = embeddedSecondaryPageItems;
  const visibleEmbeddedUtilityPageItems = embeddedUtilityPageItems;
  const shellPrimaryPageItems = pageItemsForMode.filter((item) => PRIMARY_WORKSPACE_PAGE_KEYS.includes(item.key));
  const shellSecondaryPageItems = pageItemsForMode.filter((item) => SECONDARY_WORKSPACE_PAGE_KEYS.includes(item.key));
  const shellUtilityPageItems = pageItemsForMode.filter((item) => UTILITY_WORKSPACE_PAGE_KEYS.includes(item.key));
  const railToggleLabel = toolRailExpanded ? "Close tools" : "Tools";
  const focusStatusLabel = unsavedDraftCount > 0 ? `${unsavedDraftCount} unsaved` : null;
  const currentWorkspaceToolLabel =
    editorUtilityDrawer === "add"
      ? "Change / Add"
      : editorUtilityDrawer === "remove"
        ? "Change / Remove"
        : currentPageMeta?.label ?? "Workspace";
  const renderGlobalSearchButton = (variant: "embedded" | "shell") => (
    <button
      type="button"
      className="rebalance-global-search-trigger"
      data-testid={`rebalance-${variant}-global-search-trigger`}
      aria-label="Search everything in Rebalance"
      onClick={() => {
        setGlobalSearchOpen(true);
        updateWorkspaceTopStripHidden(false);
      }}
    >
      <Search className="h-4 w-4" />
      <span className="rebalance-global-search-trigger-label">Search files, values, packs...</span>
      <kbd>Ctrl K</kbd>
    </button>
  );
  const renderDrawerNavButton = (item: (typeof pageItems)[number], testIdPrefix: string) => {
    const Icon = item.icon;
    const active = item.key === page || (item.key === "editor" && (isEditorSubflowPage(page) || editorUtilityDrawer !== null));
    return (
      <button
        key={`${testIdPrefix}-${item.key}`}
        className={`rebalance-embedded-nav-chip rebalance-embedded-rail-nav-chip ${active ? "is-active" : ""}`}
        data-page-active={active ? "true" : "false"}
        data-testid={`${testIdPrefix}-${item.key}`}
        aria-label={item.label}
        title={item.label}
        onFocus={() => requestPageModulePreload(item.key)}
        onMouseEnter={() => requestPageModulePreload(item.key)}
        onClick={() => {
          if (item.key === "swap" && swapEntries.length > 0) {
            setEditorGroup("characters");
            setSelectedEntryId((current) =>
              swapEntries.some((entry) => entry.id === current) ? current : swapEntries[0]?.id ?? current,
            );
          }
          navigateTo(item.key);
        }}
        type="button"
      >
        <span className="rebalance-embedded-nav-chip-icon">
          <Icon className="h-4 w-4" />
        </span>
        <span className="rebalance-embedded-nav-chip-copy">
          <span className="rebalance-embedded-nav-chip-label">{item.label}</span>
        </span>
      </button>
    );
  };
  const renderWorkspaceDrawer = (variant: "embedded" | "shell") => {
    const primaryItems = variant === "embedded" ? visibleEmbeddedPrimaryPageItems : shellPrimaryPageItems;
    const secondaryItems = variant === "embedded" ? visibleEmbeddedSecondaryPageItems : shellSecondaryPageItems;
    const utilityItems = variant === "embedded" ? visibleEmbeddedUtilityPageItems : shellUtilityPageItems;
    const testIdPrefix =
      variant === "embedded"
        ? {
            root: "rebalance-embedded-rail",
            primary: "rebalance-embedded-nav",
            secondary: "rebalance-embedded-secondary-nav",
            utility: "rebalance-embedded-utility-nav",
          }
        : {
            root: "rebalance-shell-rail",
            primary: "rebalance-shell-nav",
            secondary: "rebalance-shell-secondary-nav",
            utility: "rebalance-shell-utility-nav",
          };

    return (
      <aside
        ref={workspaceDrawerRef}
        className={variant === "embedded" ? "soft-panel rebalance-embedded-rail rebalance-workspace-drawer" : "atelier-sidebar rebalance-shell-sidebar rebalance-workspace-drawer"}
        data-testid={testIdPrefix.root}
        data-drawer-phase={workspaceDrawerAnim.phase}
      >
        <div className="rebalance-embedded-rail-brand">
          {workspaceDrawerAnim.phase === "open" ? (
            <Button
              className="rebalance-embedded-rail-toggle"
              variant="flat"
              isIconOnly
              aria-label={railToggleLabel}
              onPress={() => updateToolRailExpanded(false)}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          ) : null}
          <div className="rebalance-launcher-brand-lockup">
            <img className="rebalance-launcher-brand-logo" src={launcherWordmarkAsset} alt="BAPBAP" />
          </div>
          <p className="rebalance-embedded-rail-kicker">RebalanceBAP</p>
          <h1 className="rebalance-embedded-rail-title">Rebalance</h1>
          <p className="rebalance-embedded-rail-copy">One focused workspace for runtime files, rules, swaps, and packs.</p>
        </div>

        <div className="rebalance-embedded-rail-nav-groups">
          <div className="rebalance-embedded-rail-nav-section">
            <div className="rebalance-embedded-nav-section-head">
              <p className="rebalance-embedded-nav-group-label">Workflows</p>
            </div>
            <nav ref={navRef} className="rebalance-embedded-nav-strip rebalance-embedded-rail-nav" aria-label="Primary Rebalance pages" data-testid={`${testIdPrefix.primary}-strip`}>
              {primaryItems.map((item) => renderDrawerNavButton(item, testIdPrefix.primary))}
              <div className="rebalance-topbar__underline" ref={underlineRef} />
            </nav>
          </div>

          {secondaryItems.length ? (
            <div className="rebalance-embedded-rail-nav-section rebalance-embedded-rail-nav-section--secondary">
              <p className="rebalance-embedded-nav-group-label">Precision</p>
              <nav className="rebalance-embedded-nav-strip rebalance-embedded-rail-nav rebalance-embedded-rail-nav--secondary" aria-label="Secondary Rebalance pages">
                {secondaryItems.map((item) => renderDrawerNavButton(item, testIdPrefix.secondary))}
              </nav>
            </div>
          ) : null}

          {utilityItems.length ? (
            <div className="rebalance-embedded-rail-nav-section rebalance-embedded-rail-nav-section--utility">
              <p className="rebalance-embedded-nav-group-label">Support</p>
              <nav className="rebalance-embedded-nav-strip rebalance-embedded-rail-nav rebalance-embedded-rail-nav--utility" aria-label="Utility Rebalance pages">
                {utilityItems.map((item) => renderDrawerNavButton(item, testIdPrefix.utility))}
              </nav>
            </div>
          ) : null}
        </div>
      </aside>
    );
  };
  const renderGlobalSearchDialog = (variant: "embedded" | "shell") => {
    if (!globalSearchOpen) {
      return null;
    }

    const queryIsEmpty = !deferredGlobalSearchQuery.trim();
    return (
      <div ref={globalSearchMotionRef} className="rebalance-global-search-overlay" data-testid={`rebalance-${variant}-global-search-overlay`}>
        <button
          type="button"
          className="rebalance-global-search-backdrop"
          data-motion-backdrop
          aria-label="Close search"
          onClick={() => setGlobalSearchOpen(false)}
        />
        <section
          className="rebalance-global-search-dialog"
          data-motion-dialog
          role="dialog"
          aria-modal="true"
          aria-labelledby={`rebalance-${variant}-global-search-title`}
        >
          <div className="rebalance-global-search-head">
            <div>
              <p className="atelier-kicker">Search index</p>
              <h2 id={`rebalance-${variant}-global-search-title`}>Find anything in Rebalance</h2>
            </div>
            <Button variant="flat" isIconOnly aria-label="Close search" onPress={() => setGlobalSearchOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="rebalance-global-search-input-shell">
            <Search className="h-4 w-4" />
            <input
              ref={globalSearchInputRef}
              value={globalSearchQuery}
              onChange={(event) => setGlobalSearchQuery(event.currentTarget.value)}
              placeholder="Try: Anna ability, zone, damage, icon, pack, Arena..."
              aria-label="Search all Rebalance data"
            />
          </div>
          <div className="rebalance-global-search-body thin-scrollbar">
            <div className="rebalance-global-search-meta">
              <span>{queryIsEmpty ? "Suggested" : `${visibleGlobalSearchResults.length} result(s)`}</span>
              <span>{globalSearchIndex.length} indexed item(s)</span>
            </div>
            {visibleGlobalSearchResults.length ? (
              <div className="rebalance-global-search-results" role="listbox" aria-label="Rebalance search results">
                {visibleGlobalSearchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    className="rebalance-global-search-result"
                    data-motion-result
                    data-testid={result.id === "cmd:save-snapshot" ? "launcher-snapshot-save-cmd" : undefined}
                    role="option"
                    onClick={() => openGlobalSearchResult(result)}
                  >
                    <span className="rebalance-global-search-result-main">
                      <span className="rebalance-global-search-result-title">{result.title}</span>
                      <span className="rebalance-global-search-result-subtitle">{result.subtitle}</span>
                    </span>
                    <span className="rebalance-global-search-result-tags">
                      <span>{result.section}</span>
                      <strong>{result.badge}</strong>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rebalance-global-search-empty">
                <strong>No match yet</strong>
                <p>Search by in-game name, file path, setting path, current/default value, pack name, icon, or workflow.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    );
  };
  const renderWorkspaceTopBar = (variant: "embedded" | "shell") => (
    <div
      ref={workspaceTopbarMotionRef}
      className={`rebalance-workspace-topbar rebalance-workspace-topbar--${variant} ${workspaceTopStripHidden ? "is-hidden" : ""}`}
      data-motion-topbar
      data-testid={`rebalance-${variant}-workspace-topbar`}
    >
        <div className="rebalance-workspace-topbar-row">
        <div className="rebalance-workspace-topbar-context">
          <Button
            ref={workspaceToggleButtonRef}
            className="rebalance-workspace-topbar-toggle rebalance-workspace-topbar-toggle--icon"
            data-testid={`rebalance-${variant}-focus-toggle`}
            aria-label={railToggleLabel}
            variant="flat"
            startContent={toolRailExpanded ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            isIconOnly
            onPress={toggleToolRail}
          />
          <div className="rebalance-workspace-topbar-meta">
            <strong>{sessionLabel}</strong>
            <span className="rebalance-workspace-topbar-tooltag">{currentWorkspaceToolLabel}</span>
          </div>
        </div>
        <div className="rebalance-workspace-global-search-slot">
          {renderGlobalSearchButton(variant)}
        </div>
        <div className="rebalance-workspace-topbar-actions">
          {page === "editor" ? (
            <>
              <Button className="rebalance-workspace-action-button" variant="flat" size="sm" onPress={() => openEditorUtilityDrawer("add")}>
                Add
              </Button>
              <Button className="rebalance-workspace-action-button" variant="flat" size="sm" onPress={() => openEditorUtilityDrawer("remove")}>
                Remove
              </Button>
            </>
          ) : null}
          {focusStatusLabel ? <span className="rebalance-workspace-topbar-status">{focusStatusLabel}</span> : null}
          <Button
            className="rebalance-workspace-action-button"
            data-testid="launcher-toggle-history"
            data-active={historyOpen ? "true" : "false"}
            variant="flat"
            size="sm"
            startContent={<History className="h-4 w-4" />}
            onPress={() => setHistoryOpen((prev) => !prev)}
            aria-label={historyOpen ? "Close history panel" : "Open history panel"}
            aria-pressed={historyOpen}
            title={historyOpen ? "Hide DiffEngine history (toggle)" : "Show DiffEngine history (toggle)"}
          >
            History
          </Button>
          <Button
            className={variant === "embedded" ? "rebalance-embedded-launch-button" : "shell-launch-button"}
            color="secondary"
            variant="flat"
            startContent={<Gamepad2 className="h-4 w-4" />}
            onPress={launchGameNow}
          >
            Launch
          </Button>
        </div>
      </div>
    </div>
  );
  const renderDeferredPage = (label: string, content: JSX.Element, layout?: PageSkeletonProps["layout"]) => {
    const resolvedLayout = layout ?? LABEL_TO_SKELETON_LAYOUT[label] ?? "editor";
    return (
      <DeferredSuspense fallback={<PageSkeleton layout={resolvedLayout} />}>
        <FadeInOnMount>{content}</FadeInOnMount>
      </DeferredSuspense>
    );
  };

  const closeEditorUtilityDrawer = () => {
    setEditorUtilityDrawer(null);
    setLibrarySearchSeed("");
  };

  const renderEditorUtilityDrawer = () => {
    if (page !== "editor" || !editorUtilityDrawer) {
      return null;
    }

    const title = editorUtilityDrawer === "add" ? "Add into Change" : "Remove / Restore";
    const description =
      editorUtilityDrawer === "add"
        ? "Insert reusable blocks or copy indexed values without leaving the current Change file."
        : "Queue focused remove actions for the active file. The file stays in Change so context is not lost.";

    return (
      <div ref={editorUtilityDrawerMotionRef} className="rebalance-editor-utility-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <button
          type="button"
          className="rebalance-editor-utility-backdrop"
          data-motion-backdrop
          aria-label="Close Change drawer"
          onClick={closeEditorUtilityDrawer}
        />
        <aside className="rebalance-editor-utility-panel thin-scrollbar" data-motion-dialog>
          <header className="rebalance-editor-utility-head">
            <div>
              <p className="atelier-kicker">Change utility</p>
              <h3>{title}</h3>
              <span>{description}</span>
            </div>
            <Button variant="flat" size="sm" onPress={closeEditorUtilityDrawer}>
              Close
            </Button>
          </header>
          <div className="rebalance-editor-utility-body">
            {editorUtilityDrawer === "add" ? (
              renderDeferredPage(
                "Add",
                <LazyAddLibraryPage
                  editorGroups={editorGroups}
                  editorGroup={editorGroup}
                  mode={uiMode}
                  onChangeGroup={(group) => {
                    setEditorGroup(group);
                    setSelectedEntryId(findFirstEditorEntryId(bootstrap?.catalog, group));
                  }}
                  entries={filteredEntries}
                  search={search}
                  onSearchChange={setSearch}
                  selectedEntry={selectedEntry}
                  selectedState={selectedRuntimeState}
                  onSelectEntry={(entryId) => setSelectedEntryId(entryId)}
                  onQueueOperation={(operation) => selectedEntry && queueOperation(selectedEntry.id, operation)}
                  onRemoveQueuedOperation={(index) => selectedEntry && removeQueuedOperation(selectedEntry.id, index)}
                  onClearQueuedOperations={() => selectedEntry && clearQueuedOperations(selectedEntry.id)}
                  onSave={() => selectedEntry && void saveRuntimeEntry(selectedEntry.id)}
                  onReload={() => selectedEntry && void ensureDocumentLoaded(selectedEntry, { force: true, discardDrafts: true })}
                  libraryMetadata={libraryMetadata}
                  workspaceRoot={bootstrap?.workspace?.workspaceRoot}
                  catalogEntries={allCatalogEntries}
                  librarySearchSeed={librarySearchSeed}
                  favoriteOptionIds={favoriteOptionIds}
                  localCollections={localLibraryCollections}
                  onToggleFavorite={toggleFavoriteOption}
                  onCreateCollection={createLocalLibraryCollection}
                  onToggleCollectionMembership={toggleCollectionMembership}
                  embedded={embedded}
                />,
              )
            ) : selectedEntry && selectedRuntimeState?.document ? (
              renderDeferredPage(
                "Remove",
                <LazyRemoveWorkspacePanel
                  document={materializeRuntimeDocument(
                    selectedRuntimeState.document,
                    selectedRuntimeState.draftOverrides ?? {},
                    selectedRuntimeState.draftOperations ?? [],
                  )}
                  draftOperations={selectedRuntimeState.draftOperations ?? []}
                  onQueueOperation={(operation) => queueOperation(selectedEntry.id, operation)}
                  onRemoveQueuedOperation={(index) => removeQueuedOperation(selectedEntry.id, index)}
                  onClearQueuedOperations={() => clearQueuedOperations(selectedEntry.id)}
                  onResetFile={() => resetToDefaults(selectedEntry.id)}
                />,
              )
            ) : (
              <div className="task-empty-card">
                <p>Choose a Change file first, then reopen this drawer.</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    );
  };

  const renderEmbeddedPage = () => (
    <div className="rebalance-embedded-page-shell" data-testid={`rebalance-page-${page}`} ref={pageEnterRef as React.RefObject<HTMLDivElement>}>
      {page === "dashboard" ? (
        renderDeferredPage(
          "Home",
          <LazyDashboardPage
            bootstrap={bootstrap}
            embedded
            showQuickStart={showQuickStart}
            onDismissQuickStart={dismissQuickStart}
            onStartInteractiveTour={startInteractiveTour}
            onOpenFolder={(path) => void launcherApi.openInExplorer(path)}
            onSnapshot={createSnapshotBackup}
            onRepairWorkspaceData={repairWorkspaceSupportData}
            onOpenChangeSomething={() => {
              setEditorGroup("augments");
              setSelectedEntryId(findFirstEditorEntryId(bootstrap?.catalog, "augments"));
              navigateTo("editor");
            }}
            onOpenGameMode={() => {
              setEditorGroup("gamemode");
              setSelectedEntryId(findFirstEditorEntryId(bootstrap?.catalog, "gamemode"));
              navigateTo("gamemode");
            }}
            onOpenCreateSomething={() => {
              navigateTo("custom");
            }}
            onOpenSwap={() => {
              setEditorGroup("characters");
              setSelectedEntryId(swapEntries[0]?.id ?? null);
              navigateTo("swap");
            }}
            onOpenImportExport={() => {
              navigateTo("packs");
            }}
            recentChangeTitle={homeRecentChangeTitle}
            lastDraftTitle={homeLastDraftTitle}
            unsavedDraftCount={unsavedDraftCount}
          />,
        )
      ) : null}
      {page === "editor" ? (
        renderDeferredPage(
          "Change",
          <LazyEditorPage
            editorGroups={editorGroups}
            editorGroup={editorGroup}
            mode={uiMode}
            onChangeGroup={(group) => {
              setEditorGroup(group);
              setSelectedEntryId(findFirstEditorEntryId(bootstrap?.catalog, group));
            }}
            entries={filteredEntries}
            search={search}
            onSearchChange={setSearch}
            selectedEntry={selectedEntry}
            selectedState={selectedRuntimeState}
            libraryIcons={libraryMetadata?.icons ?? []}
            libraryTemplates={libraryMetadata?.templates ?? []}
            onSelectEntry={(entryId) => setSelectedEntryId(entryId)}
            onUpdateValue={(item, value) => selectedEntry && updateValueOverride(selectedEntry.id, item, value)}
            onResetValue={(path) => selectedEntry && resetValueOverride(selectedEntry.id, path)}
            onOverrideTextChange={(value) => selectedEntry && updateOverrideText(selectedEntry.id, value)}
            onSave={() => selectedEntry && void saveRuntimeEntry(selectedEntry.id)}
            onRevert={() => selectedEntry && revertDocument(selectedEntry.id)}
            onReset={() => selectedEntry && resetToDefaults(selectedEntry.id)}
            onReload={() => selectedEntry && void ensureDocumentLoaded(selectedEntry, { force: true, discardDrafts: true })}
            supplementarySection={null}
            previewDisplayMode="large"
            collapseSidebarOnSelection
            embeddedCompact
            isEntryDirty={isEntryDirty}
            getEntryDirtyCount={getEntryDirtyCount}
          />,
        )
      ) : null}
      {page === "gamemode" ? (
        renderDeferredPage(
          "Game Mode",
          <LazyGameModePage
            entries={filteredGameModeEntries}
            search={search}
            onSearchChange={setSearch}
            selectedEntry={selectedGameModeEntry}
            selectedState={selectedGameModeState}
            mode={uiMode}
            onSelectEntry={(entryId) => setSelectedEntryId(entryId)}
            onUpdateValue={(item, value) => selectedGameModeEntry && updateValueOverride(selectedGameModeEntry.id, item, value)}
            onResetValue={(path) =>
              selectedGameModeEntry &&
              resetValueOverride(selectedGameModeEntry.id, path, {
                clearOperationPrefixes: [path],
              })
            }
            onSetCollectionValue={(path, value, defaultValue) =>
              selectedGameModeEntry &&
              updateJsonOverride(selectedGameModeEntry.id, path, value, {
                defaultValue,
                clearOverridePrefixes: [`${path}[`],
                clearOperationPrefixes: [path, `${path}[`],
              })
            }
            onOverrideTextChange={(value) => selectedGameModeEntry && updateOverrideText(selectedGameModeEntry.id, value)}
            onSave={() => selectedGameModeEntry && void saveRuntimeEntry(selectedGameModeEntry.id)}
            onRevert={() => selectedGameModeEntry && revertDocument(selectedGameModeEntry.id)}
            onReset={() => selectedGameModeEntry && resetToDefaults(selectedGameModeEntry.id)}
            onReload={() => selectedGameModeEntry && void ensureDocumentLoaded(selectedGameModeEntry, { force: true, discardDrafts: true })}
            libraryMetadata={libraryMetadata}
            gameModeIndex={gameModeIndex}
            onRefreshGameModeIndex={() => void refreshGameModeProbeNow()}
            snapshotCopyTargets={snapshotCopyTargets}
            copySnapshotBusy={copyingGameModeSnapshot}
            onCopySnapshotToTarget={(targetId) => void copyGameModeSnapshotToTarget(targetId)}
            embedded={embedded}
          />,
        )
      ) : null}
      {page === "library" ? (
        renderDeferredPage(
          "Insert",
          <LazyAddLibraryPage
            editorGroups={editorGroups}
            editorGroup={editorGroup}
            mode={uiMode}
            onChangeGroup={(group) => {
              setEditorGroup(group);
              setSelectedEntryId(findFirstEditorEntryId(bootstrap?.catalog, group));
            }}
            entries={filteredEntries}
            search={search}
            onSearchChange={setSearch}
            selectedEntry={selectedEntry}
            selectedState={selectedRuntimeState}
            onSelectEntry={(entryId) => setSelectedEntryId(entryId)}
            onQueueOperation={(operation) => selectedEntry && queueOperation(selectedEntry.id, operation)}
            onRemoveQueuedOperation={(index) => selectedEntry && removeQueuedOperation(selectedEntry.id, index)}
            onClearQueuedOperations={() => selectedEntry && clearQueuedOperations(selectedEntry.id)}
            onSave={() => selectedEntry && void saveRuntimeEntry(selectedEntry.id)}
            onReload={() => selectedEntry && void ensureDocumentLoaded(selectedEntry, { force: true, discardDrafts: true })}
            libraryMetadata={libraryMetadata}
            workspaceRoot={bootstrap?.workspace?.workspaceRoot}
            catalogEntries={allCatalogEntries}
            librarySearchSeed={librarySearchSeed}
            favoriteOptionIds={favoriteOptionIds}
            localCollections={localLibraryCollections}
            onToggleFavorite={toggleFavoriteOption}
            onCreateCollection={createLocalLibraryCollection}
            onToggleCollectionMembership={toggleCollectionMembership}
            embedded={embedded}
          />,
        )
      ) : null}
      {page === "remove" ? (
        renderDeferredPage(
          "Remove",
          <LazyEditorPage
            editorGroups={editorGroups}
            editorGroup={editorGroup}
            mode={uiMode}
            onChangeGroup={(group) => {
              setEditorGroup(group);
              setSelectedEntryId(findFirstEditorEntryId(bootstrap?.catalog, group));
            }}
            entries={filteredEntries}
            search={search}
            onSearchChange={setSearch}
            selectedEntry={selectedEntry}
            selectedState={selectedRuntimeState}
            libraryIcons={libraryMetadata?.icons ?? []}
            libraryTemplates={libraryMetadata?.templates ?? []}
            onSelectEntry={(entryId) => setSelectedEntryId(entryId)}
            onUpdateValue={(item, value) => selectedEntry && updateValueOverride(selectedEntry.id, item, value)}
            onResetValue={(path) => selectedEntry && resetValueOverride(selectedEntry.id, path)}
            onOverrideTextChange={(value) => selectedEntry && updateOverrideText(selectedEntry.id, value)}
            onSave={() => selectedEntry && void saveRuntimeEntry(selectedEntry.id)}
            onRevert={() => selectedEntry && revertDocument(selectedEntry.id)}
            onReset={() => selectedEntry && resetToDefaults(selectedEntry.id)}
            onReload={() => selectedEntry && void ensureDocumentLoaded(selectedEntry, { force: true, discardDrafts: true })}
            flowLabel="Remove"
            selectionTitle="Choose one file"
            selectionCopy="Pick the file you want to trim down, then queue one concrete remove action at a time."
            visibleGroups={["augments", "items", "characters", "managers", "gamemode"]}
            previewTitle="Target card"
            previewSubtitle="This is the current ripped-skin card for the file you are trimming down. Keep it next to the remove candidates so the before/after stays obvious."
            previewDisplayMode="large"
            quickEditTitle="Current values"
            quickEditSubtitle="Keep these as reference while you remove something. They are not the primary task on this screen."
            quickEditCollapsed
            collapseSidebarOnSelection
            embeddedCompact
            isEntryDirty={isEntryDirty}
            getEntryDirtyCount={getEntryDirtyCount}
            supplementarySection={
              selectedEntry && selectedRuntimeState?.document ? (
                renderDeferredPage(
                  "Remove",
                  <LazyRemoveWorkspacePanel
                    document={materializeRuntimeDocument(
                      selectedRuntimeState.document,
                      selectedRuntimeState.draftOverrides ?? {},
                      selectedRuntimeState.draftOperations ?? [],
                    )}
                    draftOperations={selectedRuntimeState.draftOperations ?? []}
                    onQueueOperation={(operation) => queueOperation(selectedEntry.id, operation)}
                    onRemoveQueuedOperation={(index) => removeQueuedOperation(selectedEntry.id, index)}
                    onClearQueuedOperations={() => clearQueuedOperations(selectedEntry.id)}
                    onResetFile={() => resetToDefaults(selectedEntry.id)}
                  />,
                )
              ) : null
            }
          />,
        )
      ) : null}
      {page === "swap" ? (
        renderDeferredPage(
          "Swap",
          <LazySwapAbilityPage
            entries={swapEntries}
            sourceEntries={swapSourceEntries}
            selectedEntry={selectedSwapEntry}
            selectedState={selectedSwapState}
            embedded={embedded}
            onSelectEntry={(entryId) => setSelectedEntryId(entryId)}
            onUpdateValue={(item, value) => selectedSwapEntry && updateValueOverride(selectedSwapEntry.id, item, value)}
            onSave={() => selectedSwapEntry && void saveRuntimeEntry(selectedSwapEntry.id)}
            onReload={() => selectedSwapEntry && void ensureDocumentLoaded(selectedSwapEntry, { force: true, discardDrafts: true })}
          />,
        )
      ) : null}
      {page === "custom" ? (
        renderDeferredPage(
          "Create",
          <LazyCustomBuilderPage
            workspaceRoot={bootstrap?.workspace?.workspaceRoot}
            entries={filteredCustomEntries}
            mode={uiMode}
            search={search}
            onSearchChange={setSearch}
            selectedEntry={selectedCustomEntry}
            selectedState={selectedCustomState}
            libraryMetadata={libraryMetadata}
            onSelectEntry={(entryId) => setSelectedCustomId(entryId)}
            onToggleEnabled={(value) => selectedCustomEntry && updateCustomField(selectedCustomEntry.id, "enabled", value)}
            onChangeString={(path, value) => selectedCustomEntry && updateCustomField(selectedCustomEntry.id, path, value)}
            onChangeNumber={(path, value) => {
              if (!selectedCustomEntry) {
                return;
              }
              const parsed = Number(value);
              updateCustomField(selectedCustomEntry.id, path, Number.isFinite(parsed) ? parsed : 0);
            }}
            onChangeBoolean={(path, value) => selectedCustomEntry && updateCustomField(selectedCustomEntry.id, path, value)}
            onChangeValue={(path, value) => selectedCustomEntry && updateCustomField(selectedCustomEntry.id, path, value)}
            onRemoveValue={(path) => selectedCustomEntry && removeCustomField(selectedCustomEntry.id, path)}
            onReplaceDraft={(draft) => selectedCustomEntry && replaceCustomDraft(selectedCustomEntry.id, draft)}
            onSave={() => selectedCustomEntry && void saveCustomEntry(selectedCustomEntry.id)}
            onCreateDraft={() => void createCustomDraft()}
            onOpenFile={() => selectedCustomEntry && void launcherApi.openInExplorer(selectedCustomEntry.absolutePath)}
            creatingDraft={creatingCustomDraft}
          />,
        )
      ) : null}
      {page === "packs" ? (
        renderDeferredPage(
          "Packs",
          <LazyPackToolsPage
            embedded
            catalogGroups={bootstrap?.catalog ?? []}
            selectedPaths={selectedPackPaths}
            onTogglePath={togglePackPathSelection}
            onSelectGroup={selectPackGroup}
            onClearSelection={clearPackSelection}
            exportState={packExportState}
            onExportStateChange={(patch) => setPackExportState((current) => ({ ...current, ...patch }))}
            onPickExportPath={() => void choosePackExportPath()}
            onPreviewExport={() => void previewExportPack()}
            onExportPack={() => void exportPack()}
            importState={packImportState}
            onImportStateChange={(patch) => setPackImportState((current) => ({ ...current, ...patch }))}
            onPickImportPath={() => void choosePackImportPath()}
            onPreviewImport={() => void previewImportPack()}
            onImportPack={() => void importPackNow()}
            onDropPackToMod={() => void dropPackToModNow()}
            installedPacks={installedPacks}
            onRefreshInstalledPacks={() => void refreshInstalledPacks()}
            onSetActivePack={(packId) => void activateInstalledPack(packId)}
            receipts={packReceipts}
            onRefreshReceipts={() => void refreshPackReceipts()}
            onOpenFolder={(path) => void launcherApi.openInExplorer(path)}
          />,
        )
      ) : null}
      {page === "tutorial" ? (
        renderDeferredPage(
          "Help",
          <LazyTutorialPage
            bootstrap={bootstrap}
            embedded={embedded}
            mode={uiMode}
            onPageChange={(nextPage) => navigateTo(nextPage)}
            onStartInteractiveTour={startInteractiveTour}
            onOpenFolder={(path) => void launcherApi.openInExplorer(path)}
            onSnapshot={createSnapshotBackup}
            onDismissQuickStart={dismissQuickStart}
            onChangeMode={storeModePreference}
          />,
        )
      ) : null}
      {page === "settings" ? (
        renderDeferredPage(
          "Settings",
          <LazySettingsPage
            bootstrap={bootstrap}
            embedded={embedded}
            profileLabel={profileLabel}
            track={track}
            instanceSource={instanceSource}
            compatibilityWarning={compatibilityWarning}
            mode={uiMode}
            onChangeMode={storeModePreference}
            workspaceInput={workspaceInput}
            onWorkspaceInputChange={setWorkspaceInput}
            onChooseWorkspace={chooseWorkspace}
            onApplyWorkspace={applyWorkspace}
            onRefreshCatalog={refreshBootstrap}
            onSnapshot={createSnapshotBackup}
            onOpenFolder={(path) => void launcherApi.openInExplorer(path)}
            onOpenPackTools={() => navigateTo("packs")}
            onRestartSetup={() => {
              try {
                window.localStorage.setItem(SETUP_COMPLETE_KEY, "false");
              } catch {
                // ignore storage issues in hosted/mock mode
              }
              setSetupComplete(false);
            }}
          />,
        )
      ) : null}
      {renderEditorUtilityDrawer()}
    </div>
  );

  if (embedded) {
    return (
      <GlobalErrorBoundary>
      <DataLayerProvider value={{ cache: dataCache, diff: diffEngine, writer: writeScheduler }}>
      {shaderOverlay}
      <div
        className="rebalance-embedded-root"
        data-page={page}
        data-focus-mode={shellRailCollapsed ? "true" : "false"}
        data-workspace-page={isFocusWorkspacePage ? "true" : "false"}
        data-tool-rail-expanded={toolRailExpanded ? "true" : "false"}
        data-testid="rebalance-embedded-root"
        ref={setEmbeddedRootNode}
      >
      <div
        className="rebalance-embedded-shell"
        data-focus-mode={shellRailCollapsed ? "true" : "false"}
        data-workspace-page={isFocusWorkspacePage ? "true" : "false"}
        data-workspace-strip-hidden={workspaceTopStripHidden ? "true" : "false"}
        data-tool-rail-expanded={toolRailExpanded ? "true" : "false"}
        data-testid="rebalance-embedded-shell"
      >
          {workspaceDrawerAnim.shouldRender ? (
            <>
              <button
                type="button"
                className="rebalance-nav-drawer-backdrop"
                aria-label="Close tool drawer"
                onClick={() => updateToolRailExpanded(false)}
              />
              {renderWorkspaceDrawer("embedded")}
            </>
          ) : null}
          {renderGlobalSearchDialog("embedded")}

          <section className="rebalance-embedded-stage rebalance-stage-frame" data-page={page} data-testid="rebalance-embedded-stage" ref={embeddedStageRef}>
            <div className="rebalance-stage-top">
              <header className={`soft-panel rebalance-embedded-header ${workspaceCompactChrome ? "is-focus" : ""}`} data-testid="rebalance-embedded-header" data-enter-header>
                {renderWorkspaceTopBar("embedded")}

                {compatibilityWarning ? (
                  <div className="rebalance-embedded-header-note rebalance-embedded-header-note--warning" data-testid="rebalance-embedded-compatibility-warning">
                    {compatibilityWarning}
                  </div>
                ) : null}
                {bannerMessage ? <div className="rebalance-embedded-header-note rebalance-embedded-header-note--success">{bannerMessage}</div> : null}
                {bootError ? <div className="rebalance-embedded-header-note rebalance-embedded-header-note--error">{bootError}</div> : null}
              </header>
            </div>

            <Breadcrumb page={page} entryTitle={homeRecentChangeTitle} onNavigateHome={() => navigateTo("dashboard")} />

            <section className="rebalance-embedded-main rebalance-stage-page" data-page={page} data-testid="rebalance-embedded-main" ref={embeddedMainRef} data-enter-content>
              {renderEmbeddedPage()}
            </section>
          </section>
        </div>
      </div>
      <ToastContainer />
      <HistoryPanel open={historyOpen} engine={diffEngine} onClose={() => setHistoryOpen(false)} />
      {activeDiff !== null ? (
        <div
          className="rebalance-compare-snapshot-overlay"
          data-testid="launcher-compare-snapshot-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Compare with snapshot"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(2, 4, 10, 0.55)",
            backdropFilter: "blur(4px)",
            padding: 24,
          }}
        >
          <div
            style={{
              width: "min(880px, 100%)",
              maxHeight: "80vh",
              overflow: "auto",
              background: "var(--bg-1, #0b1020)",
              border: "1px solid var(--line, rgba(40,52,86,0.4))",
              borderRadius: 12,
              padding: 16,
              boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
            }}
          >
            <DiffView
              hunks={activeDiff}
              onApply={(selected) => {
                showToast(
                  `Apply is preview-only — ${selected.length} hunk(s) would be merged once the snapshot picker is wired (Phase 4).`,
                  "info",
                );
                setActiveDiff(null);
              }}
              onCancel={() => setActiveDiff(null)}
            />
          </div>
        </div>
      ) : null}
      <div className="rebalance-sr-only" aria-live="polite" role="status" id="rebalance-status-live" />
      </DataLayerProvider>
      </GlobalErrorBoundary>
    );
  }

  return (
    <GlobalErrorBoundary>
    <>
    {shaderOverlay}
    <div className="min-h-screen text-slate-100">
      <div
        className="atelier-shell mx-auto flex min-h-screen max-w-[1480px] gap-6 px-4 py-5"
        data-focus-mode={shellRailCollapsed ? "true" : "false"}
        data-workspace-page={isFocusWorkspacePage ? "true" : "false"}
        data-workspace-strip-hidden={workspaceTopStripHidden ? "true" : "false"}
        data-tool-rail-expanded={toolRailExpanded ? "true" : "false"}
        ref={setShellRootNode}
      >
        {workspaceDrawerAnim.shouldRender ? (
          <>
            <button
              type="button"
              className="rebalance-nav-drawer-backdrop"
              aria-label="Close tool drawer"
              onClick={() => updateToolRailExpanded(false)}
            />
            {renderWorkspaceDrawer("shell")}
          </>
        ) : null}
        {renderGlobalSearchDialog("shell")}

        <main className="min-w-0 flex-1 rebalance-shell-main rebalance-stage-frame" data-page={page} ref={shellMainRef}>
          <div className="rebalance-stage-top">
            {compactChromePage ? (
              <div className="rebalance-shell-toolbar-stack">
                {renderWorkspaceTopBar("shell")}
                {bannerMessage || bootError ? (
                  <div className="space-y-3">
                    {bannerMessage ? <div className="rounded-[18px] border border-[#5871ff]/24 bg-[#5871ff]/8 px-4 py-3 text-sm text-[#dce5ff]">{bannerMessage}</div> : null}
                    {bootError ? <div className="rounded-[18px] border border-rose-500/20 bg-rose-500/8 px-4 py-3 text-sm text-rose-200">{bootError}</div> : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <header className="soft-panel rebalance-shell-header rounded-[22px] px-6 py-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-3xl font-semibold text-slate-100">{pageItemsForMode.find((item) => item.key === page)?.label}</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{pageItemsForMode.find((item) => item.key === page)?.description}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button isDisabled={unsavedDraftCount === 0} variant="flat" onPress={resetAllDrafts}>
                      {unsavedDraftCount > 0 ? `Reset drafts (${unsavedDraftCount})` : "Reset drafts"}
                    </Button>
                    <Button variant="flat" startContent={<CircleHelp className="h-4 w-4" />} onPress={() => navigateTo("tutorial")}>
                      Help
                    </Button>
                  </div>
                </div>
                <div className="rebalance-shell-header-note rebalance-shell-header-note--warning mt-4 rounded-[18px] border border-slate-700/60 bg-[#111821] px-4 py-3 text-sm text-slate-300">
                  Restart first. Most content, custom, and pack changes are safest after a full game restart.
                </div>
                {bannerMessage ? <div className="rebalance-shell-header-note rebalance-shell-header-note--success mt-4 rounded-[18px] border border-[#5871ff]/24 bg-[#5871ff]/8 px-4 py-3 text-sm text-[#dce5ff]">{bannerMessage}</div> : null}
                {bootError ? <div className="rebalance-shell-header-note rebalance-shell-header-note--error mt-4 rounded-[18px] border border-rose-500/20 bg-rose-500/8 px-4 py-3 text-sm text-rose-200">{bootError}</div> : null}
              </header>
            )}
          </div>

          <div className={`rebalance-shell-page rebalance-stage-page ${compactChromePage ? "is-compact" : ""}`} ref={pageEnterRef as React.RefObject<HTMLDivElement>}>
            {page === "dashboard" ? (
              renderDeferredPage(
                "Home",
                <LazyDashboardPage
                  bootstrap={bootstrap}
                  showQuickStart={showQuickStart}
                  onDismissQuickStart={dismissQuickStart}
                  onStartInteractiveTour={startInteractiveTour}
                  onOpenFolder={(path) => void launcherApi.openInExplorer(path)}
                  onSnapshot={createSnapshotBackup}
                  onRepairWorkspaceData={repairWorkspaceSupportData}
                  onOpenChangeSomething={() => {
                    setEditorGroup("augments");
                    setSelectedEntryId(findFirstEditorEntryId(bootstrap?.catalog, "augments"));
                    navigateTo("editor");
                  }}
                  onOpenGameMode={() => {
                    setEditorGroup("gamemode");
                    setSelectedEntryId(findFirstEditorEntryId(bootstrap?.catalog, "gamemode"));
                    navigateTo("gamemode");
                  }}
                  onOpenCreateSomething={() => {
                    navigateTo("custom");
                  }}
                  onOpenSwap={() => {
                    setEditorGroup("characters");
                    setSelectedEntryId(swapEntries[0]?.id ?? null);
                    navigateTo("swap");
                  }}
                  onOpenImportExport={() => {
                    navigateTo("packs");
                  }}
                  recentChangeTitle={homeRecentChangeTitle}
                  lastDraftTitle={homeLastDraftTitle}
                  unsavedDraftCount={unsavedDraftCount}
                />,
              )
            ) : null}
            {page === "editor" ? (
              renderDeferredPage(
                "Change",
                <LazyEditorPage
                  editorGroups={editorGroups}
                  editorGroup={editorGroup}
                  mode={uiMode}
                  onChangeGroup={(group) => {
                    setEditorGroup(group);
                    setSelectedEntryId(findFirstEditorEntryId(bootstrap?.catalog, group));
                  }}
                  entries={filteredEntries}
                  search={search}
                  onSearchChange={setSearch}
                  selectedEntry={selectedEntry}
                  selectedState={selectedRuntimeState}
                  libraryIcons={libraryMetadata?.icons ?? []}
                  libraryTemplates={libraryMetadata?.templates ?? []}
                  onSelectEntry={(entryId) => setSelectedEntryId(entryId)}
                  onUpdateValue={(item, value) => selectedEntry && updateValueOverride(selectedEntry.id, item, value)}
                  onResetValue={(path) => selectedEntry && resetValueOverride(selectedEntry.id, path)}
                  onOverrideTextChange={(value) => selectedEntry && updateOverrideText(selectedEntry.id, value)}
                  onSave={() => selectedEntry && void saveRuntimeEntry(selectedEntry.id)}
                  onRevert={() => selectedEntry && revertDocument(selectedEntry.id)}
                  onReset={() => selectedEntry && resetToDefaults(selectedEntry.id)}
                  onReload={() => selectedEntry && void ensureDocumentLoaded(selectedEntry, { force: true, discardDrafts: true })}
                  isEntryDirty={isEntryDirty}
                  getEntryDirtyCount={getEntryDirtyCount}
                />,
              )
            ) : null}
      {page === "gamemode" ? (
              renderDeferredPage(
                "Game Mode",
                <LazyGameModePage
                  entries={filteredGameModeEntries}
                  search={search}
                  onSearchChange={setSearch}
                  selectedEntry={selectedGameModeEntry}
                  selectedState={selectedGameModeState}
                  mode={uiMode}
                  onSelectEntry={(entryId) => setSelectedEntryId(entryId)}
                  onUpdateValue={(item, value) => selectedGameModeEntry && updateValueOverride(selectedGameModeEntry.id, item, value)}
                  onResetValue={(path) =>
                    selectedGameModeEntry &&
                    resetValueOverride(selectedGameModeEntry.id, path, {
                      clearOperationPrefixes: [path],
                    })
                  }
                  onSetCollectionValue={(path, value, defaultValue) =>
                    selectedGameModeEntry &&
                    updateJsonOverride(selectedGameModeEntry.id, path, value, {
                      defaultValue,
                      clearOverridePrefixes: [`${path}[`],
                      clearOperationPrefixes: [path, `${path}[`],
                    })
                  }
                  onOverrideTextChange={(value) => selectedGameModeEntry && updateOverrideText(selectedGameModeEntry.id, value)}
                  onSave={() => selectedGameModeEntry && void saveRuntimeEntry(selectedGameModeEntry.id)}
                  onRevert={() => selectedGameModeEntry && revertDocument(selectedGameModeEntry.id)}
                  onReset={() => selectedGameModeEntry && resetToDefaults(selectedGameModeEntry.id)}
                  onReload={() => selectedGameModeEntry && void ensureDocumentLoaded(selectedGameModeEntry, { force: true, discardDrafts: true })}
                  libraryMetadata={libraryMetadata}
                  gameModeIndex={gameModeIndex}
                  onRefreshGameModeIndex={() => void refreshGameModeProbeNow()}
                  snapshotCopyTargets={snapshotCopyTargets}
                  copySnapshotBusy={copyingGameModeSnapshot}
                  onCopySnapshotToTarget={(targetId) => void copyGameModeSnapshotToTarget(targetId)}
                  embedded={embedded}
                />,
              )
            ) : null}
            {page === "library" ? (
              renderDeferredPage(
                "Create",
                <LazyAddLibraryPage
                  editorGroups={editorGroups}
                  editorGroup={editorGroup}
                  mode={uiMode}
            onChangeGroup={(group) => {
              setEditorGroup(group);
              setSelectedEntryId(findFirstEditorEntryId(bootstrap?.catalog, group));
            }}
                  entries={filteredEntries}
                  search={search}
                  onSearchChange={setSearch}
                  selectedEntry={selectedEntry}
                  selectedState={selectedRuntimeState}
                  onSelectEntry={(entryId) => setSelectedEntryId(entryId)}
                  onQueueOperation={(operation) => selectedEntry && queueOperation(selectedEntry.id, operation)}
                  onRemoveQueuedOperation={(index) => selectedEntry && removeQueuedOperation(selectedEntry.id, index)}
                  onClearQueuedOperations={() => selectedEntry && clearQueuedOperations(selectedEntry.id)}
                  onSave={() => selectedEntry && void saveRuntimeEntry(selectedEntry.id)}
                  onReload={() => selectedEntry && void ensureDocumentLoaded(selectedEntry, { force: true, discardDrafts: true })}
                  libraryMetadata={libraryMetadata}
                  workspaceRoot={bootstrap?.workspace?.workspaceRoot}
                  catalogEntries={allCatalogEntries}
                  librarySearchSeed={librarySearchSeed}
                  favoriteOptionIds={favoriteOptionIds}
                  localCollections={localLibraryCollections}
                  onToggleFavorite={toggleFavoriteOption}
                  onCreateCollection={createLocalLibraryCollection}
                  onToggleCollectionMembership={toggleCollectionMembership}
                  embedded={embedded}
                />,
              )
            ) : null}
            {page === "remove" ? (
              renderDeferredPage(
                "Remove",
                <LazyEditorPage
                  editorGroups={editorGroups}
                  editorGroup={editorGroup}
                  mode={uiMode}
                  onChangeGroup={(group) => {
                    setEditorGroup(group);
                    setSelectedEntryId(findFirstEditorEntryId(bootstrap?.catalog, group));
                  }}
                  entries={filteredEntries}
                  search={search}
                  onSearchChange={setSearch}
                  selectedEntry={selectedEntry}
                  selectedState={selectedRuntimeState}
                  libraryIcons={libraryMetadata?.icons ?? []}
                  libraryTemplates={libraryMetadata?.templates ?? []}
                  onSelectEntry={(entryId) => setSelectedEntryId(entryId)}
                  onUpdateValue={(item, value) => selectedEntry && updateValueOverride(selectedEntry.id, item, value)}
                  onResetValue={(path) => selectedEntry && resetValueOverride(selectedEntry.id, path)}
                  onOverrideTextChange={(value) => selectedEntry && updateOverrideText(selectedEntry.id, value)}
                  onSave={() => selectedEntry && void saveRuntimeEntry(selectedEntry.id)}
                  onRevert={() => selectedEntry && revertDocument(selectedEntry.id)}
                  onReset={() => selectedEntry && resetToDefaults(selectedEntry.id)}
                  onReload={() => selectedEntry && void ensureDocumentLoaded(selectedEntry, { force: true, discardDrafts: true })}
                  flowLabel="Remove"
                  selectionTitle="Choose one file"
                  selectionCopy="Pick the file you want to trim down, then queue one concrete remove action at a time."
                  visibleGroups={["augments", "items", "characters", "managers", "gamemode"]}
                  previewTitle="Target card"
                  previewSubtitle="This is the current ripped-skin card for the file you are trimming down. Keep it next to the remove candidates so the before/after stays obvious."
                  quickEditTitle="Current values"
                  quickEditSubtitle="Keep these as reference while you remove something. They are not the primary task on this screen."
                  quickEditCollapsed
                  isEntryDirty={isEntryDirty}
                  getEntryDirtyCount={getEntryDirtyCount}
                  supplementarySection={
                    selectedEntry && selectedRuntimeState?.document ? (
                      renderDeferredPage(
                        "Remove",
                        <LazyRemoveWorkspacePanel
                          document={materializeRuntimeDocument(
                            selectedRuntimeState.document,
                            selectedRuntimeState.draftOverrides ?? {},
                            selectedRuntimeState.draftOperations ?? [],
                          )}
                          draftOperations={selectedRuntimeState.draftOperations ?? []}
                          onQueueOperation={(operation) => queueOperation(selectedEntry.id, operation)}
                          onRemoveQueuedOperation={(index) => removeQueuedOperation(selectedEntry.id, index)}
                          onClearQueuedOperations={() => clearQueuedOperations(selectedEntry.id)}
                          onResetFile={() => resetToDefaults(selectedEntry.id)}
                        />,
                      )
                    ) : null
                  }
                />,
              )
            ) : null}
            {page === "swap" ? (
              renderDeferredPage(
                "Swap",
                <LazySwapAbilityPage
                  entries={swapEntries}
                  sourceEntries={swapSourceEntries}
                  selectedEntry={selectedSwapEntry}
                  selectedState={selectedSwapState}
                  embedded={embedded}
                  onSelectEntry={(entryId) => setSelectedEntryId(entryId)}
                  onUpdateValue={(item, value) => selectedSwapEntry && updateValueOverride(selectedSwapEntry.id, item, value)}
                  onSave={() => selectedSwapEntry && void saveRuntimeEntry(selectedSwapEntry.id)}
                  onReload={() => selectedSwapEntry && void ensureDocumentLoaded(selectedSwapEntry, { force: true, discardDrafts: true })}
                />,
              )
            ) : null}
            {page === "custom" ? (
              renderDeferredPage(
                "Create",
                <LazyCustomBuilderPage
                  workspaceRoot={bootstrap?.workspace?.workspaceRoot}
                  entries={filteredCustomEntries}
                  mode={uiMode}
                  search={search}
                  onSearchChange={setSearch}
                  selectedEntry={selectedCustomEntry}
                  selectedState={selectedCustomState}
                  libraryMetadata={libraryMetadata}
                  onSelectEntry={(entryId) => setSelectedCustomId(entryId)}
                  onToggleEnabled={(value) => selectedCustomEntry && updateCustomField(selectedCustomEntry.id, "enabled", value)}
                  onChangeString={(path, value) => selectedCustomEntry && updateCustomField(selectedCustomEntry.id, path, value)}
                  onChangeNumber={(path, value) => {
                    if (!selectedCustomEntry) {
                      return;
                    }
                    const parsed = Number(value);
                    updateCustomField(selectedCustomEntry.id, path, Number.isFinite(parsed) ? parsed : 0);
                  }}
                  onChangeBoolean={(path, value) => selectedCustomEntry && updateCustomField(selectedCustomEntry.id, path, value)}
                  onChangeValue={(path, value) => selectedCustomEntry && updateCustomField(selectedCustomEntry.id, path, value)}
                  onRemoveValue={(path) => selectedCustomEntry && removeCustomField(selectedCustomEntry.id, path)}
                  onReplaceDraft={(draft) => selectedCustomEntry && replaceCustomDraft(selectedCustomEntry.id, draft)}
                  onSave={() => selectedCustomEntry && void saveCustomEntry(selectedCustomEntry.id)}
                  onCreateDraft={() => void createCustomDraft()}
                  onOpenFile={() => selectedCustomEntry && void launcherApi.openInExplorer(selectedCustomEntry.absolutePath)}
                  creatingDraft={creatingCustomDraft}
                />,
              )
            ) : null}
            {page === "packs" ? (
              renderDeferredPage(
                "Packs",
                <LazyPackToolsPage
                  embedded={embedded}
                  catalogGroups={bootstrap?.catalog ?? []}
                  selectedPaths={selectedPackPaths}
                  onTogglePath={togglePackPathSelection}
                  onSelectGroup={selectPackGroup}
                  onClearSelection={clearPackSelection}
                  exportState={packExportState}
                  onExportStateChange={(patch) => setPackExportState((current) => ({ ...current, ...patch }))}
                  onPickExportPath={() => void choosePackExportPath()}
                  onPreviewExport={() => void previewExportPack()}
                  onExportPack={() => void exportPack()}
                  importState={packImportState}
                  onImportStateChange={(patch) => setPackImportState((current) => ({ ...current, ...patch }))}
                  onPickImportPath={() => void choosePackImportPath()}
                  onPreviewImport={() => void previewImportPack()}
                  onImportPack={() => void importPackNow()}
                  onDropPackToMod={() => void dropPackToModNow()}
                  installedPacks={installedPacks}
                  onRefreshInstalledPacks={() => void refreshInstalledPacks()}
                  onSetActivePack={(packId) => void activateInstalledPack(packId)}
                  receipts={packReceipts}
                  onRefreshReceipts={() => void refreshPackReceipts()}
                  onOpenFolder={(path) => void launcherApi.openInExplorer(path)}
                />,
              )
            ) : null}
            {page === "tutorial" ? (
              renderDeferredPage(
                "Help",
                <LazyTutorialPage
                  bootstrap={bootstrap}
                  embedded={embedded}
                  mode={uiMode}
                  onPageChange={(nextPage) => navigateTo(nextPage)}
                  onStartInteractiveTour={startInteractiveTour}
                  onOpenFolder={(path) => void launcherApi.openInExplorer(path)}
                  onSnapshot={createSnapshotBackup}
                  onDismissQuickStart={dismissQuickStart}
                  onChangeMode={storeModePreference}
                />,
              )
            ) : null}
            {page === "settings" ? (
              renderDeferredPage(
                "Settings",
                <LazySettingsPage
                  bootstrap={bootstrap}
                  embedded={embedded}
                  profileLabel={profileLabel}
                  track={track}
                  instanceSource={instanceSource}
                  compatibilityWarning={compatibilityWarning}
                  mode={uiMode}
                  onChangeMode={storeModePreference}
                  workspaceInput={workspaceInput}
                  onWorkspaceInputChange={setWorkspaceInput}
                  onChooseWorkspace={chooseWorkspace}
                  onApplyWorkspace={applyWorkspace}
                  onRefreshCatalog={refreshBootstrap}
                  onSnapshot={createSnapshotBackup}
                  onOpenFolder={(path) => void launcherApi.openInExplorer(path)}
                  onOpenPackTools={() => navigateTo("packs")}
                  onRestartSetup={() => {
                    try {
                      window.localStorage.setItem(SETUP_COMPLETE_KEY, "false");
                    } catch {
                      // ignore storage issues in hosted/mock mode
                    }
                    setSetupComplete(false);
                  }}
                />,
              )
            ) : null}
            {renderEditorUtilityDrawer()}
          </div>
        </main>
      </div>
    </div>
    <HistoryPanel open={historyOpen} engine={diffEngine} onClose={() => setHistoryOpen(false)} />
    {activeDiff !== null ? (
      <div
        className="rebalance-compare-snapshot-overlay"
        data-testid="launcher-compare-snapshot-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Compare with snapshot"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(2, 4, 10, 0.55)",
          backdropFilter: "blur(4px)",
          padding: 24,
        }}
      >
        <div
          style={{
            width: "min(880px, 100%)",
            maxHeight: "80vh",
            overflow: "auto",
            background: "var(--bg-1, #0b1020)",
            border: "1px solid var(--line, rgba(40,52,86,0.4))",
            borderRadius: 12,
            padding: 16,
            boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
          }}
        >
          <DiffView
            hunks={activeDiff}
            onApply={(selected) => {
              showToast(
                `Apply is preview-only — ${selected.length} hunk(s) would be merged once the snapshot picker is wired (Phase 4).`,
                "info",
              );
              setActiveDiff(null);
            }}
            onCancel={() => setActiveDiff(null)}
          />
        </div>
      </div>
    ) : null}
    </>
    </GlobalErrorBoundary>
  );
}

function filterEntries(entries: CatalogEntry[], term: string): CatalogEntry[] {
  if (!term) {
    return entries;
  }
  return entries.filter((entry) =>
    [entry.title, entry.subtitle, entry.relativePath, entry.targetKey ?? "", entry.targetType ?? "", ...entry.tags]
      .join(" ")
      .toLowerCase()
      .includes(term),
  );
}

function setDraftPath(root: JsonObject, path: string, value: JsonValue): JsonObject {
  const clone = cloneJson(root);
  const rawSegments = path.split(".").filter(Boolean);
  let current: unknown = clone;

  for (let index = 0; index < rawSegments.length - 1; index += 1) {
    const segment = rawSegments[index];
    const nextSegment = rawSegments[index + 1];
    const nextIsIndex = /^\d+$/.test(nextSegment);

    if (Array.isArray(current)) {
      const currentIndex = Number(segment);
      if (!Number.isInteger(currentIndex)) {
        return clone;
      }
      if (current[currentIndex] === undefined) {
        current[currentIndex] = nextIsIndex ? [] : {};
      }
      current = current[currentIndex];
      continue;
    }

    if (!current || typeof current !== "object") {
      return clone;
    }

    const record = current as Record<string, unknown>;
    if (record[segment] === undefined) {
      record[segment] = nextIsIndex ? [] : {};
    }
    current = record[segment];
  }

  const lastSegment = rawSegments[rawSegments.length - 1];
  if (Array.isArray(current)) {
    const currentIndex = Number(lastSegment);
    if (Number.isInteger(currentIndex)) {
      current[currentIndex] = value;
    }
    return clone;
  }

  if (current && typeof current === "object") {
    (current as Record<string, JsonValue>)[lastSegment] = value;
  }

  return clone;
}

function unsetDraftPath(root: JsonObject, path: string): JsonObject {
  const clone = cloneJson(root);
  const segments = path.split(".").filter(Boolean);
  if (!segments.length) {
    return clone;
  }

  let current: unknown = clone;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (Array.isArray(current)) {
      const currentIndex = Number(segment);
      if (!Number.isInteger(currentIndex)) {
        return clone;
      }
      current = current[currentIndex];
      continue;
    }
    if (!current || typeof current !== "object") {
      return clone;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  const lastSegment = segments[segments.length - 1];
  if (Array.isArray(current)) {
    const currentIndex = Number(lastSegment);
    if (Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < current.length) {
      current.splice(currentIndex, 1);
    }
    return clone;
  }

  if (current && typeof current === "object") {
    delete (current as Record<string, unknown>)[lastSegment];
  }

  return clone;
}
