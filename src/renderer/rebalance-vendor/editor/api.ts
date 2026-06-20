import { convertFileSrc, invoke } from "@tauri-apps/api/core";

import { mockApi } from "./mockApi";
import {
  hydrateBootstrapPayload,
  hydrateDocumentPayload,
  hydrateLibraryEntryListResponse,
  hydrateLibraryMetadataResponse,
  hydrateOperationCapabilitiesResponse,
} from "./bundledFallbacks";
import {
  CONFIG_PACK_CONFLICT_STRATEGIES,
  CONFIG_PACK_MODES,
  type ConfigPackDropRequest,
  type ConfigPackDropResponse,
  type ConfigPackExportRequest,
  type ConfigPackExportResponse,
  type ConfigPackImportRequest,
  type ConfigPackImportResponse,
  type InstalledPackSummary,
  type ConfigPackPreviewRequest,
  type ConfigPackPreviewResponse,
  type ConfigPackReceiptSummary,
} from "./configPacks";
import type {
  BootstrapPayload,
  CreateCustomDraftRequest,
  DocumentPayload,
  GameModeIndexResponse,
  LibraryEntryListResponse,
  LibraryEntryQuery,
  LibraryMetadataResponse,
  OperationCapabilitiesResponse,
  SaveDocumentRequest,
  SaveDocumentResponse,
  SnapshotBackupResponse,
  WorkspaceRepairResponse,
} from "./types";

/**
 * PostMessage origin validation for embedded runtime communication.
 * Uses window.location.origin when available; falls back to "*" for file:// protocol in development.
 */
const expectedOrigin: string = typeof window !== "undefined" ? window.location.origin : "";
const targetOrigin: string = (expectedOrigin && expectedOrigin !== "null") ? expectedOrigin : "*";

const LIBRARY_ENTRY_CACHE_TTL_MS = 5000;
const libraryEntryListCache = new Map<string, { expiresAt: number; response: LibraryEntryListResponse }>();
const libraryEntryListRequestCache = new Map<string, Promise<LibraryEntryListResponse>>();

type ElectronRebalanceBridge = {
  invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
  fileSrc(targetPath: string): Promise<string>;
};

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isElectronRuntime(): boolean {
  return typeof window !== "undefined" && typeof getElectronBridge()?.invoke === "function";
}

function isEmbeddedRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("embedded") === "1" && window.parent !== window;
  } catch {
    return false;
  }
}

function serializeLibraryEntryQuery(request: LibraryEntryQuery) {
  const normalizedOptionIds = Array.isArray(request.optionIds)
    ? [...request.optionIds].filter(Boolean).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }))
    : [];
  return JSON.stringify({
    workspaceRoot: request.workspaceRoot,
    search: request.search?.trim() ?? "",
    category: request.category ?? "",
    source: request.source ?? "",
    safety: request.safety ?? "",
    targetType: request.targetType ?? "",
    valueType: request.valueType ?? "",
    editable: request.editable ?? "editable",
    optionIds: normalizedOptionIds,
    limit: request.limit ?? 0,
  });
}

function hasDesktopBackend(): boolean {
  return isTauriRuntime() || isElectronRuntime() || isEmbeddedRuntime();
}

function getElectronBridge(): ElectronRebalanceBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (typeof window.electronAPI?.invoke === "function" && typeof window.electronAPI?.fileSrc === "function") {
    return window.electronAPI as ElectronRebalanceBridge;
  }
  if (typeof window.v2Api?.rebalance?.invoke === "function" && typeof window.v2Api?.rebalance?.fileSrc === "function") {
    return window.v2Api.rebalance as ElectronRebalanceBridge;
  }
  return null;
}

function requireElectronApi() {
  const bridge = getElectronBridge();
  if (!bridge) {
    throw new Error("Electron bridge is not available.");
  }
  return bridge;
}

function nextEmbedRequestId(): string {
  if (typeof window !== "undefined" && typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `rebalance-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* --------------------------------------------------------------------------
   Phase 3 Task 2 — Embedded Bridge Timeouts, Cancellation & Connection-Lost
   --------------------------------------------------------------------------
   Every postMessage round-trip now races against a configurable timeout
   (default 8s) and an optional AbortSignal. Listeners are cleared on timeout,
   abort, resolve, and reject so a wedged parent never leaks listeners.
   --------------------------------------------------------------------------- */

/**
 * Default timeout for any embedded host invoke / fileSrc request.
 */
export const EMBED_BRIDGE_DEFAULT_TIMEOUT_MS = 8000;

/**
 * Override for tests / harness — when set, ALL bridge requests use this
 * timeout instead of the default. Tests assign and reset.
 */
let bridgeTimeoutOverrideMs: number | null = null;

export function setEmbedBridgeTimeoutForTesting(timeoutMs: number | null): void {
  bridgeTimeoutOverrideMs = timeoutMs;
}

/**
 * Specialised error so callers can distinguish "host never responded" from
 * "host returned an error payload".
 */
export class BridgeTimeoutError extends Error {
  readonly code = "BRIDGE_TIMEOUT" as const;
  constructor(timeoutMs: number) {
    super(`Embedded bridge request timed out after ${timeoutMs}ms.`);
    this.name = "BridgeTimeoutError";
  }
}

/**
 * Specialised error for cancelled requests.
 */
export class BridgeAbortError extends Error {
  readonly code = "BRIDGE_ABORTED" as const;
  constructor(reason?: unknown) {
    super(reason instanceof Error ? reason.message : "Embedded bridge request aborted.");
    this.name = "BridgeAbortError";
  }
}

/**
 * Optional advanced bridge call options. Existing call sites can pass plain
 * payloads only; opt-in to timeout/signal control as needed.
 */
export interface EmbedBridgeOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Lightweight observer hooks so the host panel can reflect connection state
 * without polling. Wired up from RebalanceEmbedPanel.
 */
type ConnectionEvent = "request-start" | "request-success" | "request-timeout" | "request-error";
type ConnectionListener = (event: ConnectionEvent) => void;
const connectionListeners = new Set<ConnectionListener>();

export function subscribeBridgeConnectionState(listener: ConnectionListener): () => void {
  connectionListeners.add(listener);
  return () => {
    connectionListeners.delete(listener);
  };
}

function notifyConnection(event: ConnectionEvent): void {
  for (const listener of connectionListeners) {
    try {
      listener(event);
    } catch {
      /* listener errors must not affect the bridge */
    }
  }
}

function requestEmbeddedHost<TResult>(
  type: "invoke",
  payload: { command: string; args?: Record<string, unknown> },
  options?: EmbedBridgeOptions,
): Promise<TResult>;
function requestEmbeddedHost<TResult>(
  type: "fileSrc",
  payload: { targetPath: string },
  options?: EmbedBridgeOptions,
): Promise<TResult>;
function requestEmbeddedHost<TResult>(
  type: "invoke" | "fileSrc",
  payload: Record<string, unknown>,
  options: EmbedBridgeOptions = {},
): Promise<TResult> {
  if (!isEmbeddedRuntime() || !window.parent) {
    throw new Error("Embedded host bridge is not available.");
  }

  const id = nextEmbedRequestId();
  const timeoutMs =
    bridgeTimeoutOverrideMs !== null
      ? bridgeTimeoutOverrideMs
      : options.timeoutMs ?? EMBED_BRIDGE_DEFAULT_TIMEOUT_MS;
  const signal = options.signal;

  return new Promise<TResult>((resolve, reject) => {
    let settled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let abortHandler: (() => void) | null = null;

    const cleanup = () => {
      window.removeEventListener("message", handleMessage);
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      if (abortHandler && signal) {
        signal.removeEventListener("abort", abortHandler);
        abortHandler = null;
      }
    };

    const settleResolve = (value: TResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      notifyConnection("request-success");
      resolve(value);
    };

    const settleReject = (reason: unknown, event: ConnectionEvent) => {
      if (settled) return;
      settled = true;
      cleanup();
      notifyConnection(event);
      reject(reason);
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) {
        return;
      }
      if (expectedOrigin && expectedOrigin !== "null" && event.origin !== expectedOrigin) {
        return;
      }
      const response = event.data as
        | {
            source: "rebalance-host";
            type: "invoke-result" | "fileSrc-result";
            id: string;
            result: TResult;
          }
        | {
            source: "rebalance-host";
            type: "invoke-error" | "fileSrc-error";
            id: string;
            error: string;
          }
        | undefined;
      if (!response || response.source !== "rebalance-host" || response.id !== id) {
        return;
      }
      if ("error" in response) {
        settleReject(new Error(response.error || "Embedded host request failed."), "request-error");
        return;
      }
      settleResolve(response.result);
    };

    window.addEventListener("message", handleMessage);

    if (signal) {
      if (signal.aborted) {
        settleReject(new BridgeAbortError(signal.reason), "request-error");
        return;
      }
      abortHandler = () => settleReject(new BridgeAbortError(signal.reason), "request-error");
      signal.addEventListener("abort", abortHandler);
    }

    if (timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        settleReject(new BridgeTimeoutError(timeoutMs), "request-timeout");
      }, timeoutMs);
    }

    notifyConnection("request-start");
    window.parent.postMessage(
      {
        source: "rebalance-embed",
        type,
        id,
        ...payload,
      },
      targetOrigin,
    );
  });
}

const PREVIEW_PATH_KEYS = new Set([
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

const normalizedPreviewAssetPathCache = new Map<string, Promise<string>>();

function canBridgeLocalPreviewAsset(previewPath: string): boolean {
  if (!/^[A-Za-z]:[\\/]/.test(previewPath)) {
    return false;
  }
  if (/[\\/]AssetRip[\\/]|[\\/]ExportedProject[\\/]|[\\/]Assets[\\/](Texture2D|Sprite|Font)[\\/]/i.test(previewPath)) {
    return false;
  }
  return /[\\/]BalanceMod[\\/]Custom[\\/]/i.test(previewPath);
}

function normalizePreviewAssetPathSync(previewPath: string): string {
  const trimmed = previewPath.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (/^(https?:\/\/|data:|blob:|asset:|file:)/i.test(trimmed)) {
    return trimmed;
  }

  const spriteTextureCandidate = /[\\/]Sprite[\\/].+\.asset$/i.test(trimmed)
    ? trimmed.replace(/[\\/]Sprite[\\/]/i, "\\Texture2D\\").replace(/\.asset$/i, ".png")
    : trimmed;
  const normalizedCandidate = spriteTextureCandidate.replace(/\//g, "\\");
  const isAbsoluteWindowsPath = /^[A-Za-z]:[\\/]/.test(normalizedCandidate);

  if (isAbsoluteWindowsPath && /\.(png|jpe?g|webp|gif|svg)$/i.test(normalizedCandidate)) {
    if (isTauriRuntime()) {
      return convertFileSrc(normalizedCandidate);
    }
    return normalizedCandidate;
  }

  return trimmed;
}

async function normalizePreviewAssetPath(previewPath: string): Promise<string> {
  const normalized = normalizePreviewAssetPathSync(previewPath);
  const requiresDesktopFileSrc =
    (isElectronRuntime() || isEmbeddedRuntime())
    && /^[A-Za-z]:[\\/]/.test(normalized)
    && /\.(png|jpe?g|webp|gif|svg)$/i.test(normalized);

  if (!requiresDesktopFileSrc) {
    return normalized;
  }

  if (!canBridgeLocalPreviewAsset(normalized)) {
    return "";
  }

  const cacheKey = `${isElectronRuntime() ? "electron" : "embedded"}:${normalized}`;
  const cached = normalizedPreviewAssetPathCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    if (isElectronRuntime()) {
      return requireElectronApi().fileSrc(normalized);
    }
    return requestEmbeddedHost<string>("fileSrc", { targetPath: normalized });
  })();

  normalizedPreviewAssetPathCache.set(cacheKey, pending);
  try {
    return await pending;
  } catch (error) {
    normalizedPreviewAssetPathCache.delete(cacheKey);
    throw error;
  }
}

async function normalizePreviewPayload<T>(value: T): Promise<T> {
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => normalizePreviewPayload(item))) as Promise<T>;
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof rawValue === "string" && PREVIEW_PATH_KEYS.has(key)) {
      output[key] = await normalizePreviewAssetPath(rawValue);
      continue;
    }
    output[key] = await normalizePreviewPayload(rawValue);
  }
  return output as T;
}

async function invokeRaw<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return isElectronRuntime()
    ? await requireElectronApi().invoke<T>(command, args)
    : isEmbeddedRuntime()
      ? await requestEmbeddedHost<T>("invoke", { command, args })
      : await invoke<T>(command, args);
}

async function invokeNormalized<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return normalizePreviewPayload(await invokeRaw<T>(command, args));
}

async function invokeHydrated<TResponse, TResult>(
  command: string,
  hydrate: (response: TResponse) => TResult,
  args?: Record<string, unknown>,
): Promise<TResult> {
  return normalizePreviewPayload(hydrate(await invokeRaw<TResponse>(command, args)));
}

export const launcherApi = {
  async bootstrap(workspaceRoot?: string | null): Promise<BootstrapPayload> {
    if (!hasDesktopBackend()) {
      return hydrateBootstrapPayload(await mockApi.bootstrap());
    }
    return invokeHydrated<BootstrapPayload, BootstrapPayload>(
      "bootstrap",
      hydrateBootstrapPayload,
      workspaceRoot ? { workspaceRoot } : undefined,
    );
  },

  async pickWorkspaceRoot(): Promise<string | null> {
    if (!isTauriRuntime()) {
      if (isElectronRuntime()) {
        return requireElectronApi().invoke<string | null>("pick_workspace_root");
      }
      if (isEmbeddedRuntime()) {
        return requestEmbeddedHost<string | null>("invoke", { command: "pick_workspace_root" });
      }
      return mockApi.pickWorkspaceRoot();
    }
    return invoke<string | null>("pick_workspace_root");
  },

  async saveWorkspaceRoot(workspaceRoot: string): Promise<BootstrapPayload> {
    if (!hasDesktopBackend()) {
      return hydrateBootstrapPayload(await mockApi.saveWorkspaceRoot());
    }
    return invokeHydrated<BootstrapPayload, BootstrapPayload>(
      "save_workspace_root",
      hydrateBootstrapPayload,
      { workspaceRoot },
    );
  },

  async openDocument(workspaceRoot: string, absolutePath: string): Promise<DocumentPayload> {
    if (!hasDesktopBackend()) {
      return hydrateDocumentPayload(await mockApi.openDocument(workspaceRoot, absolutePath));
    }
    return invokeHydrated<DocumentPayload, DocumentPayload>(
      "open_document",
      hydrateDocumentPayload,
      { workspaceRoot, absolutePath },
    );
  },

  async saveDocument(request: SaveDocumentRequest): Promise<SaveDocumentResponse> {
    if (!hasDesktopBackend()) {
      return mockApi.saveDocument(request);
    }
    return invokeNormalized<SaveDocumentResponse>("save_document", { request });
  },

  async createCustomDraft(request: CreateCustomDraftRequest): Promise<DocumentPayload> {
    if (!hasDesktopBackend()) {
      return hydrateDocumentPayload(await mockApi.createCustomDraft(request));
    }
    return invokeHydrated<DocumentPayload, DocumentPayload>(
      "create_custom_draft",
      hydrateDocumentPayload,
      { request },
    );
  },

  async createWorkspaceSnapshot(workspaceRoot: string): Promise<SnapshotBackupResponse> {
    if (!hasDesktopBackend()) {
      return mockApi.createWorkspaceSnapshot();
    }
    return invokeNormalized<SnapshotBackupResponse>("create_workspace_snapshot", { workspaceRoot });
  },

  async repairWorkspaceSupportFiles(workspaceRoot: string): Promise<WorkspaceRepairResponse> {
    if (!hasDesktopBackend()) {
      return mockApi.repairWorkspaceSupportFiles();
    }
    return invokeNormalized<WorkspaceRepairResponse>("repair_workspace_support_files", { workspaceRoot });
  },

  async launchGame(workspaceRoot: string): Promise<void> {
    if (!isTauriRuntime()) {
      if (isElectronRuntime()) {
        return requireElectronApi().invoke("launch_game", { workspaceRoot });
      }
      if (isEmbeddedRuntime()) {
        return requestEmbeddedHost("invoke", { command: "launch_game", args: { workspaceRoot } });
      }
      return mockApi.launchGame();
    }
    return invoke("launch_game", { workspaceRoot });
  },

  async openInExplorer(path: string): Promise<void> {
    if (!isTauriRuntime()) {
      if (isElectronRuntime()) {
        return requireElectronApi().invoke("open_in_explorer", { path });
      }
      if (isEmbeddedRuntime()) {
        return requestEmbeddedHost("invoke", { command: "open_in_explorer", args: { path } });
      }
      return mockApi.openInExplorer();
    }
    return invoke("open_in_explorer", { path });
  },

  async pickPackExportPath(): Promise<string | null> {
    if (!isTauriRuntime()) {
      if (isElectronRuntime()) {
        return requireElectronApi().invoke<string | null>("pick_pack_export_path");
      }
      if (isEmbeddedRuntime()) {
        return requestEmbeddedHost<string | null>("invoke", { command: "pick_pack_export_path" });
      }
      return mockApi.pickPackExportPath();
    }
    return invoke<string | null>("pick_pack_export_path");
  },

  async pickPackImportPath(): Promise<string | null> {
    if (!isTauriRuntime()) {
      if (isElectronRuntime()) {
        return requireElectronApi().invoke<string | null>("pick_pack_import_path");
      }
      if (isEmbeddedRuntime()) {
        return requestEmbeddedHost<string | null>("invoke", { command: "pick_pack_import_path" });
      }
      return mockApi.pickPackImportPath();
    }
    return invoke<string | null>("pick_pack_import_path");
  },

  async exportPackPreview(request: ConfigPackPreviewRequest): Promise<ConfigPackPreviewResponse> {
    if (!hasDesktopBackend()) {
      return createMockPackPreview(request);
    }
    return invokeNormalized<ConfigPackPreviewResponse>("export_pack_preview", { request });
  },

  async exportPack(request: ConfigPackExportRequest): Promise<ConfigPackExportResponse> {
    if (!hasDesktopBackend()) {
      const preview = await createMockPackPreview(request);
      return {
        outputPath: request.outputPath,
        manifest: preview.manifest,
        contents: preview.contents,
        writtenFiles: preview.fileCount,
        writtenBytes: preview.totalBytes,
      };
    }
    return invokeNormalized<ConfigPackExportResponse>("export_pack", { request });
  },

  async importPackPreview(request: ConfigPackImportRequest): Promise<ConfigPackPreviewResponse> {
    if (!hasDesktopBackend()) {
      return createMockImportPreview(request.packPath);
    }
    return invokeNormalized<ConfigPackPreviewResponse>("import_pack_preview", { request });
  },

  async importPack(request: ConfigPackImportRequest): Promise<ConfigPackImportResponse> {
    if (!hasDesktopBackend()) {
      const preview = await createMockImportPreview(request.packPath);
      return {
        packPath: request.packPath,
        manifest: preview.manifest,
        backupPath: null,
        importedAtUtc: new Date().toISOString(),
        importedFiles: [],
        receiptPath: "",
        warnings: [],
      };
    }
    return invokeNormalized<ConfigPackImportResponse>("import_pack", { request });
  },

  async dropPackToMod(request: ConfigPackDropRequest): Promise<ConfigPackDropResponse> {
    if (!isTauriRuntime()) {
      if (isElectronRuntime()) {
        return requireElectronApi().invoke<ConfigPackDropResponse>("drop_pack_to_mod", { request });
      }
      if (isEmbeddedRuntime()) {
        return requestEmbeddedHost<ConfigPackDropResponse>("invoke", { command: "drop_pack_to_mod", args: { request } });
      }
      return {
        sourcePath: request.packPath,
        destinationPath: `${request.workspaceRoot}/Gamefiles/Latest/UserData/BalanceMod/PackDrop/${request.packPath.split("/").pop() ?? "ImportedPack.rbpack"}`,
      };
    }
    return invoke<ConfigPackDropResponse>("drop_pack_to_mod", { request });
  },

  async listImportReceipts(workspaceRoot: string): Promise<ConfigPackReceiptSummary[]> {
    if (!hasDesktopBackend()) {
      return mockApi.listImportReceipts(workspaceRoot);
    }
    return invokeNormalized<ConfigPackReceiptSummary[]>("list_import_receipts", { workspaceRoot });
  },

  async listInstalledPacks(workspaceRoot: string): Promise<InstalledPackSummary[]> {
    if (!hasDesktopBackend()) {
      return mockApi.listInstalledPacks(workspaceRoot);
    }
    return invokeNormalized<InstalledPackSummary[]>("list_installed_packs", { workspaceRoot });
  },

  async setActiveContentPack(workspaceRoot: string, packId: string): Promise<InstalledPackSummary> {
    if (!hasDesktopBackend()) {
      return mockApi.setActiveContentPack(workspaceRoot, packId);
    }
    return invokeNormalized<InstalledPackSummary>("set_active_content_pack", { workspaceRoot, packId });
  },

  async readGameModeIndex(workspaceRoot: string): Promise<GameModeIndexResponse> {
    if (!hasDesktopBackend()) {
      return mockApi.readGameModeIndex(workspaceRoot);
    }
    return invokeNormalized<GameModeIndexResponse>("read_game_mode_index", { workspaceRoot });
  },

  async refreshGameModeProbe(workspaceRoot: string): Promise<GameModeIndexResponse> {
    if (!hasDesktopBackend()) {
      return mockApi.refreshGameModeProbe(workspaceRoot);
    }
    return invokeNormalized<GameModeIndexResponse>("refresh_game_mode_probe", { workspaceRoot });
  },

  async readOperationCapabilities(
    workspaceRoot: string,
    absolutePath: string,
  ): Promise<OperationCapabilitiesResponse> {
    if (!hasDesktopBackend()) {
      return hydrateOperationCapabilitiesResponse(
        await mockApi.readOperationCapabilities(workspaceRoot, absolutePath),
      );
    }
    return invokeHydrated<OperationCapabilitiesResponse, OperationCapabilitiesResponse>(
      "read_operation_capabilities",
      hydrateOperationCapabilitiesResponse,
      {
        workspaceRoot,
        absolutePath,
      },
    );
  },

  async readLibraryMetadata(workspaceRoot: string): Promise<LibraryMetadataResponse> {
    if (!hasDesktopBackend()) {
      return hydrateLibraryMetadataResponse(await mockApi.readLibraryMetadata(workspaceRoot));
    }
    return invokeHydrated<LibraryMetadataResponse, LibraryMetadataResponse>(
      "read_library_metadata",
      hydrateLibraryMetadataResponse,
      { workspaceRoot },
    );
  },

  async listLibraryEntries(request: LibraryEntryQuery): Promise<LibraryEntryListResponse> {
    const cacheKey = serializeLibraryEntryQuery(request);
    const cachedEntry = libraryEntryListCache.get(cacheKey);
    if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
      return cachedEntry.response;
    }

    const pendingRequest = libraryEntryListRequestCache.get(cacheKey);
    if (pendingRequest) {
      return pendingRequest;
    }

    const requestPromise = (async () => {
      const response = !hasDesktopBackend()
        ? hydrateLibraryEntryListResponse(await mockApi.listLibraryEntries(request))
        : await invokeHydrated<LibraryEntryListResponse, LibraryEntryListResponse>(
            "list_library_entries",
            hydrateLibraryEntryListResponse,
            { request },
          );
      libraryEntryListCache.set(cacheKey, {
        expiresAt: Date.now() + LIBRARY_ENTRY_CACHE_TTL_MS,
        response,
      });
      return response;
    })();

    libraryEntryListRequestCache.set(cacheKey, requestPromise);
    return requestPromise.finally(() => {
      libraryEntryListRequestCache.delete(cacheKey);
    });
  },
};

function createMockPackPreview(request: ConfigPackPreviewRequest): Promise<ConfigPackPreviewResponse> {
  const contents = (request.selection ?? []).map((absolutePath) => {
    const normalized = absolutePath.split("\\").join("/");
    const runtimeRoot = `${request.workspaceRoot}/Gamefiles/Latest/UserData/BalanceMod/Runtime/`;
    const customRoot = `${request.workspaceRoot}/Gamefiles/Latest/UserData/BalanceMod/Custom/`;
    const nativeRoot = `${request.workspaceRoot}/Gamefiles/Latest/UserData/BalanceMod/NativeUI/`;
    const arenaPresetRoot = `${request.workspaceRoot}/Gamefiles/Latest/UserData/BalanceMod/ArenaPresets/`;

    if (normalized.startsWith(runtimeRoot)) {
      const relativePath = normalized.replace(runtimeRoot, "");
      return {
        root: "Runtime" as const,
        path: relativePath,
        kind: "json",
        contentRole: relativePath.includes("/AbilitySwap")
          ? "ability-swap-doc"
          : relativePath.endsWith(".operations.json")
            ? "operation-doc"
            : "runtime-doc",
        preview: {
          title: relativePath.split("/").pop() ?? relativePath,
          subtitle: "Runtime document",
        },
      };
    }
    if (normalized.startsWith(customRoot)) {
      const relativePath = normalized.replace(customRoot, "");
      return {
        root: "Custom" as const,
        path: relativePath,
        kind: relativePath.toLowerCase().endsWith(".png") ? "image" : "json",
        contentRole: relativePath.includes("/Icons/") ? "custom-icon" : "custom-augment",
        preview: {
          title: relativePath.split("/").pop() ?? relativePath,
          subtitle: relativePath.includes("/Icons/") ? "Custom icon" : "Custom augment",
        },
      };
    }
    if (normalized.startsWith(nativeRoot)) {
      const relativePath = normalized.replace(nativeRoot, "");
      return {
        root: "NativeUI" as const,
        path: relativePath,
        kind: "json",
        contentRole: "native-ui-doc",
        preview: {
          title: relativePath.split("/").pop() ?? relativePath,
          subtitle: "Game Mode / DevArguments file",
        },
      };
    }
    if (normalized.startsWith(arenaPresetRoot)) {
      const relativePath = normalized.replace(arenaPresetRoot, "");
      return {
        root: "ArenaPresets" as const,
        path: relativePath,
        kind: "json",
        contentRole: "arena-preset-doc",
        preview: {
          title: relativePath.split("/").pop() ?? relativePath,
          subtitle: "Arena preset",
        },
      };
    }
    return {
      root: "Runtime" as const,
      path: normalized.replace(`${request.workspaceRoot}/`, ""),
      kind: "json",
      contentRole: "runtime-doc",
      preview: {
        title: normalized.split("/").pop() ?? "Selected file",
        subtitle: "Workspace file",
      },
    };
  });

  const selectionSummary = {
    runtimeCount: contents.filter((content) => content.root === "Runtime").length,
    customCount: contents.filter((content) => content.root === "Custom").length,
    nativeUiCount: contents.filter((content) => content.root === "NativeUI").length,
    arenaPresetCount: contents.filter((content) => content.root === "ArenaPresets").length,
    abilitySwapCount: contents.filter((content) => content.contentRole === "ability-swap-doc").length,
    operationDocCount: contents.filter((content) => content.contentRole === "operation-doc").length,
    customIconCount: contents.filter((content) => content.contentRole === "custom-icon").length,
    importReceiptCount: 0,
  };

  const manifest = {
    schemaVersion: 1,
    packId: request.packId ?? "rebalancebap.mock-pack",
    packVersion: request.packVersion ?? "0.1.0",
    name: request.name ?? "Mock Pack",
    description: request.description ?? "Mock pack preview",
    author: request.author ?? "RebalanceBAP",
    createdAtUtc: new Date().toISOString(),
    createdWith: {
      tool: "RebalanceBAP Launcher",
      version: "0.1.0",
    },
    game: {
      title: "BAPBAP",
      compatibleGameVersions: [],
      compatibleModVersions: [],
    },
    packageMode: request.packageMode ?? CONFIG_PACK_MODES[0],
    defaultConflictStrategy: request.defaultConflictStrategy ?? CONFIG_PACK_CONFLICT_STRATEGIES[0],
    roots: {
      runtime: contents.some((content) => content.root === "Runtime"),
      custom: contents.some((content) => content.root === "Custom"),
      nativeUi: contents.some((content) => content.root === "NativeUI"),
      arenaPresets: contents.some((content) => content.root === "ArenaPresets"),
    },
    selectionSummary,
    features: {
      includesRuntimeDocs: selectionSummary.runtimeCount > 0,
      includesCustomAugments: contents.some((content) => content.contentRole === "custom-augment"),
      includesCustomIcons: selectionSummary.customIconCount > 0,
      includesAbilitySwaps: selectionSummary.abilitySwapCount > 0,
      includesOperationDocs: selectionSummary.operationDocCount > 0,
      includesNativeUiDocs: selectionSummary.nativeUiCount > 0,
      includesArenaPresets: selectionSummary.arenaPresetCount > 0,
      includesImportReceipts: false,
    },
    contents,
  } as ConfigPackPreviewResponse["manifest"];

  return Promise.resolve({
    packPath: undefined,
    manifest,
    contents,
    warnings: contents.length ? [] : ["Pick at least one file so the preview has something to export."],
    fileCount: contents.length,
    totalBytes: contents.length * 1024,
  });
}

function createMockImportPreview(packPath: string): Promise<ConfigPackPreviewResponse> {
  const contents = [
    {
      root: "Runtime" as const,
      path: "Passives/0158_P_FIREWAVE.json",
      kind: "json",
      contentRole: "runtime-doc",
      preview: { title: "P_Firewave", subtitle: "Runtime document" },
    },
    {
      root: "Custom" as const,
      path: "Augments/00_Example_Firewave.json",
      kind: "json",
      contentRole: "custom-augment",
      preview: { title: "Custom Firewave Plus", subtitle: "Custom augment" },
    },
    {
      root: "ArenaPresets" as const,
      path: "MyCustomMode.json",
      kind: "json",
      contentRole: "arena-preset-doc",
      preview: { title: "My Custom Mode", subtitle: "Arena preset" },
    },
  ];

  const selectionSummary = {
    runtimeCount: 1,
    customCount: 1,
    nativeUiCount: 0,
    arenaPresetCount: 1,
    abilitySwapCount: 0,
    operationDocCount: 0,
    customIconCount: 0,
    importReceiptCount: 0,
  };

  return Promise.resolve({
    packPath,
    manifest: {
      schemaVersion: 1,
      packId: "rebalancebap.mock-pack",
      packVersion: "0.1.0",
      name: "Mock Pack",
      description: "Mock import preview",
      author: "RebalanceBAP",
      createdAtUtc: new Date().toISOString(),
      createdWith: {
        tool: "RebalanceBAP Launcher",
        version: "0.1.0",
      },
      game: {
        title: "BAPBAP",
        compatibleGameVersions: [],
        compatibleModVersions: [],
      },
      packageMode: CONFIG_PACK_MODES[0],
      defaultConflictStrategy: CONFIG_PACK_CONFLICT_STRATEGIES[0],
      roots: {
        runtime: true,
        custom: true,
        nativeUi: false,
        arenaPresets: true,
      },
      selectionSummary,
      features: {
        includesRuntimeDocs: true,
        includesCustomAugments: true,
        includesCustomIcons: false,
        includesAbilitySwaps: false,
        includesOperationDocs: false,
        includesNativeUiDocs: false,
        includesArenaPresets: true,
        includesImportReceipts: false,
      },
      contents,
    },
    contents,
    warnings: [],
    fileCount: contents.length,
    totalBytes: 2048,
  });
}
