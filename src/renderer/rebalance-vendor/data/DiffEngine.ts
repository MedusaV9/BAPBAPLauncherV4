import type {
  JsonValue,
  RuntimeDocument,
  SaveDocumentRequest,
} from "../editor/types";

// ---------------------------------------------------------------------------
// Minimal DataCache contract required by DiffEngine
// ---------------------------------------------------------------------------

export interface CachedDocument {
  absolutePath: string;
  relativePath: string;
  mtimeMs: number;
  raw: RuntimeDocument;
  standardValues: Record<string, JsonValue>;
  overrides: Record<string, JsonValue>;
  isDirty: boolean;
}

export interface DataCache {
  getDocument(absolutePath: string): CachedDocument | null;
  getStandardValue(docPath: string, fieldPath: string): JsonValue | undefined;
  readonly workspaceRoot: string;
}

// ---------------------------------------------------------------------------
// History types — Phase 3 Task 14
// ---------------------------------------------------------------------------

/**
 * Source of a history entry.
 * - 'user'   — single user edit (typed value, toggled checkbox, etc.)
 * - 'bulk'   — bulk operation (apply diff, multi-revert, paste)
 * - 'preset' — preset / template applied
 */
export type HistorySource = "user" | "bulk" | "preset";

/**
 * Sentinel field path used for whole-file resets.
 */
export const RESET_FIELD_PATH = "*";

/**
 * One entry in the undo / redo history stack.
 *
 * `before` and `after` are JSON-safe values that represent the override at
 * `fieldPath` immediately before and after the mutation. `null` is used as a
 * marker for "no override exists" (i.e. the standard value is in effect).
 *
 * For whole-file resets (`fieldPath === RESET_FIELD_PATH`) `before` is a JSON
 * object snapshot of all overrides on the doc and `after` is `null`.
 */
export interface HistoryEntry {
  id: string;
  /** ISO timestamp string (e.g. `2024-05-25T13:00:00.000Z`). */
  timestamp: string;
  docPath: string;
  fieldPath: string;
  before: JsonValue | null;
  after: JsonValue | null;
  label: string;
  source: HistorySource;
}

/**
 * Options accepted by `createDiffEngine`.
 */
export interface DiffEngineOptions {
  /** Maximum number of past entries kept. Oldest entries are dropped FIFO. Default 100. */
  historyLimit?: number;
  /** Idle window for coalescing successive same-path edits, in ms. Default 500. */
  coalesceWindowMs?: number;
  /** Storage backend (defaults to `window.localStorage` when available). Pass `null` to disable persistence. */
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  /** Override `Date.now` for deterministic testing. */
  now?: () => number;
  /** Override id generation for deterministic testing. */
  generateId?: () => string;
}

// ---------------------------------------------------------------------------
// DiffEngine public interface
// ---------------------------------------------------------------------------

export interface DiffEngineMutationOptions {
  /** Source label attached to the resulting history entry. Default `'user'`. */
  source?: HistorySource;
  /** Human-readable label override. */
  label?: string;
  /** Skip pushing a history entry for this mutation. */
  skipHistory?: boolean;
}

export interface DiffEngine {
  hasOverride(docPath: string, fieldPath: string): boolean;
  getOverrideCount(docPath: string): number;
  getAllOverrides(docPath: string): Record<string, JsonValue>;

  set(
    docPath: string,
    fieldPath: string,
    value: JsonValue,
    options?: DiffEngineMutationOptions,
  ): void;
  remove(
    docPath: string,
    fieldPath: string,
    options?: DiffEngineMutationOptions,
  ): void;
  reset(docPath: string, options?: DiffEngineMutationOptions): void;

  getWritePayload(docPath: string): SaveDocumentRequest | null;

  onDirtyChange(
    listener: (docPath: string, isDirty: boolean) => void,
  ): () => void;

  // -- History stack (Phase 3 Task 14) ------------------------------------
  /** Direct access to the history state. Treat as read-only for inspection. */
  readonly history: { past: HistoryEntry[]; future: HistoryEntry[] };
  /** Returns past entries (oldest → newest). Convenience copy of `history.past`. */
  getHistory(): HistoryEntry[];
  /** Reverts the most recent mutation. Returns `false` if nothing to undo. */
  undo(): boolean;
  /** Re-applies the most recently undone mutation. Returns `false` if nothing to redo. */
  redo(): boolean;
  /** Jumps to the state immediately after the entry with the given id was applied. */
  jumpTo(entryId: string): boolean;
  /** Clears past + future stacks and persisted history for this workspace. */
  clearHistory(): void;
  /** Subscribe to history-state changes. Returns an unsubscribe function. */
  onHistoryChange(listener: () => void): () => void;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export const HISTORY_STORAGE_KEY = "rebalancebap.history.v1";

interface PersistedShape {
  [workspaceRoot: string]: { past: HistoryEntry[]; future: HistoryEntry[] };
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.timestamp === "string" &&
    typeof entry.docPath === "string" &&
    typeof entry.fieldPath === "string" &&
    typeof entry.label === "string" &&
    (entry.source === "user" || entry.source === "bulk" || entry.source === "preset")
  );
}

function readPersistedHistory(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null,
  workspaceRoot: string,
): { past: HistoryEntry[]; future: HistoryEntry[] } {
  if (!storage) return { past: [], future: [] };
  try {
    const raw = storage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return { past: [], future: [] };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { past: [], future: [] };
    const slot = (parsed as PersistedShape)[workspaceRoot];
    if (!slot) return { past: [], future: [] };
    const past = Array.isArray(slot.past) ? slot.past.filter(isHistoryEntry) : [];
    const future = Array.isArray(slot.future) ? slot.future.filter(isHistoryEntry) : [];
    return { past, future };
  } catch {
    return { past: [], future: [] };
  }
}

function writePersistedHistory(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null,
  workspaceRoot: string,
  state: { past: HistoryEntry[]; future: HistoryEntry[] },
): void {
  if (!storage) return;
  try {
    const raw = storage.getItem(HISTORY_STORAGE_KEY);
    let payload: PersistedShape = {};
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          payload = parsed as PersistedShape;
        }
      } catch {
        payload = {};
      }
    }
    if (state.past.length === 0 && state.future.length === 0) {
      delete payload[workspaceRoot];
    } else {
      payload[workspaceRoot] = state;
    }
    storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Persistence failures (quota, disabled storage, serialization edge case)
    // must never break in-memory editing.
  }
}

function defaultStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Storage may throw in sandboxed iframes — fall through.
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deep equality check using JSON.stringify — simple and correct for JSON values.
 */
function deepEqual(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Apply a set of field-level overrides onto a raw document, returning a new
 * merged object suitable for writing to disk.
 */
export function applyOverridesToDocument(
  raw: RuntimeDocument,
  overrides: Map<string, JsonValue>,
): Record<string, JsonValue> {
  // Shallow clone the raw document as a plain object
  const merged: Record<string, JsonValue> = { ...raw } as Record<
    string,
    JsonValue
  >;

  for (const [fieldPath, value] of overrides) {
    setNestedValue(merged, fieldPath, value);
  }

  return merged;
}

/**
 * Set a value at a dot-notation path within an object, creating intermediary
 * objects as needed.
 */
function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: JsonValue,
): void {
  const segments = path.split(".");
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (
      current[seg] === null ||
      current[seg] === undefined ||
      typeof current[seg] !== "object"
    ) {
      current[seg] = {};
    }
    current = current[seg] as Record<string, unknown>;
  }

  const lastSeg = segments[segments.length - 1];
  current[lastSeg] = value;
}

let idCounter = 0;
function defaultGenerateId(): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `h_${Date.now().toString(36)}_${idCounter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultLabelFor(
  kind: "set" | "remove" | "reset",
  docPath: string,
  fieldPath: string,
): string {
  const fileName = docPath.split(/[\\/]/).pop() || docPath;
  if (kind === "reset") return `Reset ${fileName}`;
  if (kind === "remove") return `Revert ${fieldPath} in ${fileName}`;
  return `Edit ${fieldPath} in ${fileName}`;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDiffEngine(
  cache: DataCache,
  workspaceRoot: string,
  options: DiffEngineOptions = {},
): DiffEngine {
  /** docPath → (fieldPath → override value) */
  const overrides = new Map<string, Map<string, JsonValue>>();
  const dirtyListeners = new Set<(docPath: string, isDirty: boolean) => void>();
  const historyListeners = new Set<() => void>();

  const historyLimit = Math.max(1, options.historyLimit ?? 100);
  const coalesceWindowMs = Math.max(0, options.coalesceWindowMs ?? 500);
  const storage =
    options.storage === null
      ? null
      : options.storage ?? defaultStorage();
  const now = options.now ?? (() => Date.now());
  const generateId = options.generateId ?? defaultGenerateId;

  // Restore persisted history on construction.
  const restored = readPersistedHistory(storage, workspaceRoot);
  const history: { past: HistoryEntry[]; future: HistoryEntry[] } = {
    past: restored.past.slice(),
    future: restored.future.slice(),
  };

  // ------ Internal mutation primitives (do NOT touch history) -----------------

  function getDocOverridesRaw(docPath: string): Map<string, JsonValue> | undefined {
    return overrides.get(docPath);
  }

  function applyOverrideRaw(
    docPath: string,
    fieldPath: string,
    value: JsonValue,
  ): void {
    let docOverrides = overrides.get(docPath);
    const wasDirty = docOverrides !== undefined && docOverrides.size > 0;
    if (!docOverrides) {
      docOverrides = new Map();
      overrides.set(docPath, docOverrides);
    }
    docOverrides.set(fieldPath, value);
    if (!wasDirty) {
      notifyDirtyChange(docPath, true);
    }
  }

  function clearOverrideRaw(docPath: string, fieldPath: string): void {
    const docOverrides = overrides.get(docPath);
    if (!docOverrides) return;
    const wasDirty = docOverrides.size > 0;
    docOverrides.delete(fieldPath);
    if (docOverrides.size === 0) {
      overrides.delete(docPath);
      if (wasDirty) {
        notifyDirtyChange(docPath, false);
      }
    }
  }

  function clearAllOverridesRaw(docPath: string): void {
    const docOverrides = overrides.get(docPath);
    if (!docOverrides || docOverrides.size === 0) return;
    overrides.delete(docPath);
    notifyDirtyChange(docPath, false);
  }

  // ------ History bookkeeping ------------------------------------------------

  function persist(): void {
    writePersistedHistory(storage, workspaceRoot, history);
  }

  function notifyHistoryChange(): void {
    for (const listener of historyListeners) {
      listener();
    }
  }

  function pushHistoryEntry(entry: HistoryEntry, allowCoalesce: boolean): void {
    // Try to coalesce with the most recent past entry.
    if (
      allowCoalesce &&
      history.past.length > 0 &&
      coalesceWindowMs > 0 &&
      entry.fieldPath !== RESET_FIELD_PATH
    ) {
      const last = history.past[history.past.length - 1];
      const lastTime = Date.parse(last.timestamp);
      const entryTime = Date.parse(entry.timestamp);
      const sameTarget =
        last.docPath === entry.docPath &&
        last.fieldPath === entry.fieldPath &&
        last.source === entry.source &&
        last.fieldPath !== RESET_FIELD_PATH;
      const withinWindow =
        Number.isFinite(lastTime) &&
        Number.isFinite(entryTime) &&
        entryTime - lastTime <= coalesceWindowMs &&
        entryTime - lastTime >= 0;
      const continuous = JSON.stringify(last.after) === JSON.stringify(entry.before);
      if (sameTarget && withinWindow && continuous) {
        // Merge: keep original `before`, advance `after` and timestamp.
        last.after = entry.after;
        last.timestamp = entry.timestamp;
        last.label = entry.label;
        // Clearing future on continuing edits stays consistent.
        history.future = [];
        persist();
        notifyHistoryChange();
        return;
      }
    }

    history.past.push(entry);
    if (history.past.length > historyLimit) {
      history.past.splice(0, history.past.length - historyLimit);
    }
    history.future = [];
    persist();
    notifyHistoryChange();
  }

  function buildEntry(
    docPath: string,
    fieldPath: string,
    before: JsonValue | null,
    after: JsonValue | null,
    label: string,
    source: HistorySource,
  ): HistoryEntry {
    return {
      id: generateId(),
      timestamp: new Date(now()).toISOString(),
      docPath,
      fieldPath,
      before,
      after,
      label,
      source,
    };
  }

  function snapshotDocOverrides(docPath: string): Record<string, JsonValue> {
    const docOverrides = overrides.get(docPath);
    if (!docOverrides) return {};
    const out: Record<string, JsonValue> = {};
    for (const [k, v] of docOverrides) out[k] = v;
    return out;
  }

  function restoreDocOverrides(
    docPath: string,
    snapshot: Record<string, JsonValue>,
  ): void {
    const wasDirty = (overrides.get(docPath)?.size ?? 0) > 0;
    if (Object.keys(snapshot).length === 0) {
      if (wasDirty) {
        overrides.delete(docPath);
        notifyDirtyChange(docPath, false);
      } else {
        overrides.delete(docPath);
      }
      return;
    }
    const next = new Map<string, JsonValue>();
    for (const [k, v] of Object.entries(snapshot)) next.set(k, v);
    overrides.set(docPath, next);
    if (!wasDirty) {
      notifyDirtyChange(docPath, true);
    }
  }

  function applyEntryForward(entry: HistoryEntry): void {
    if (entry.fieldPath === RESET_FIELD_PATH) {
      // Forward = clear all overrides on this doc.
      clearAllOverridesRaw(entry.docPath);
      return;
    }
    if (entry.after === null) {
      clearOverrideRaw(entry.docPath, entry.fieldPath);
    } else {
      applyOverrideRaw(entry.docPath, entry.fieldPath, entry.after);
    }
  }

  function applyEntryBackward(entry: HistoryEntry): void {
    if (entry.fieldPath === RESET_FIELD_PATH) {
      // Backward = restore the snapshot stored in `before`.
      const snapshot =
        entry.before && typeof entry.before === "object" && !Array.isArray(entry.before)
          ? (entry.before as Record<string, JsonValue>)
          : {};
      restoreDocOverrides(entry.docPath, snapshot);
      return;
    }
    if (entry.before === null) {
      clearOverrideRaw(entry.docPath, entry.fieldPath);
    } else {
      applyOverrideRaw(entry.docPath, entry.fieldPath, entry.before);
    }
  }

  // ------ Query --------------------------------------------------------------

  function hasOverride(docPath: string, fieldPath: string): boolean {
    const docOverrides = overrides.get(docPath);
    return docOverrides !== undefined && docOverrides.has(fieldPath);
  }

  function getOverrideCount(docPath: string): number {
    const docOverrides = overrides.get(docPath);
    return docOverrides ? docOverrides.size : 0;
  }

  function getAllOverrides(docPath: string): Record<string, JsonValue> {
    const docOverrides = overrides.get(docPath);
    if (!docOverrides) return {};
    const result: Record<string, JsonValue> = {};
    for (const [key, val] of docOverrides) {
      result[key] = val;
    }
    return result;
  }

  // ------ Mutation -----------------------------------------------------------

  function set(
    docPath: string,
    fieldPath: string,
    value: JsonValue,
    mutationOptions?: DiffEngineMutationOptions,
  ): void {
    const standard = cache.getStandardValue(docPath, fieldPath);

    // If the value equals the standard, treat as a remove.
    if (deepEqual(value, standard)) {
      remove(docPath, fieldPath, mutationOptions);
      return;
    }

    const existingDocOverrides = getDocOverridesRaw(docPath);
    const before: JsonValue | null = existingDocOverrides?.has(fieldPath)
      ? (existingDocOverrides.get(fieldPath) as JsonValue)
      : null;

    // Short-circuit: identical override already in place — nothing to do.
    if (before !== null && deepEqual(before, value)) {
      return;
    }

    applyOverrideRaw(docPath, fieldPath, value);

    if (!mutationOptions?.skipHistory) {
      const entry = buildEntry(
        docPath,
        fieldPath,
        before,
        value,
        mutationOptions?.label ?? defaultLabelFor("set", docPath, fieldPath),
        mutationOptions?.source ?? "user",
      );
      pushHistoryEntry(entry, true);
    }
  }

  function remove(
    docPath: string,
    fieldPath: string,
    mutationOptions?: DiffEngineMutationOptions,
  ): void {
    const docOverrides = overrides.get(docPath);
    if (!docOverrides || !docOverrides.has(fieldPath)) {
      return;
    }
    const before = docOverrides.get(fieldPath) as JsonValue;

    clearOverrideRaw(docPath, fieldPath);

    if (!mutationOptions?.skipHistory) {
      const entry = buildEntry(
        docPath,
        fieldPath,
        before,
        null,
        mutationOptions?.label ?? defaultLabelFor("remove", docPath, fieldPath),
        mutationOptions?.source ?? "user",
      );
      pushHistoryEntry(entry, false);
    }
  }

  function reset(
    docPath: string,
    mutationOptions?: DiffEngineMutationOptions,
  ): void {
    const docOverrides = overrides.get(docPath);
    if (!docOverrides || docOverrides.size === 0) return;

    const snapshot = snapshotDocOverrides(docPath);
    clearAllOverridesRaw(docPath);

    if (!mutationOptions?.skipHistory) {
      const entry = buildEntry(
        docPath,
        RESET_FIELD_PATH,
        snapshot as JsonValue,
        null,
        mutationOptions?.label ?? defaultLabelFor("reset", docPath, RESET_FIELD_PATH),
        mutationOptions?.source ?? "user",
      );
      pushHistoryEntry(entry, false);
    }
  }

  // ------ Persistence --------------------------------------------------------

  function getWritePayload(docPath: string): SaveDocumentRequest | null {
    const docOverrides = overrides.get(docPath);
    if (!docOverrides || docOverrides.size === 0) return null;

    const cached = cache.getDocument(docPath);
    if (!cached) return null;

    const raw = applyOverridesToDocument(cached.raw, docOverrides);

    return {
      workspaceRoot,
      absolutePath: docPath,
      expectedMtimeMs: cached.mtimeMs,
      raw,
      createBackup: true,
    };
  }

  // ------ Events -------------------------------------------------------------

  function onDirtyChange(
    listener: (docPath: string, isDirty: boolean) => void,
  ): () => void {
    dirtyListeners.add(listener);
    return () => {
      dirtyListeners.delete(listener);
    };
  }

  function notifyDirtyChange(docPath: string, isDirty: boolean): void {
    for (const listener of dirtyListeners) {
      listener(docPath, isDirty);
    }
  }

  function onHistoryChange(listener: () => void): () => void {
    historyListeners.add(listener);
    return () => {
      historyListeners.delete(listener);
    };
  }

  // ------ History public API -------------------------------------------------

  function getHistory(): HistoryEntry[] {
    return history.past.slice();
  }

  function undo(): boolean {
    const entry = history.past.pop();
    if (!entry) return false;
    applyEntryBackward(entry);
    history.future.unshift(entry);
    persist();
    notifyHistoryChange();
    return true;
  }

  function redo(): boolean {
    const entry = history.future.shift();
    if (!entry) return false;
    applyEntryForward(entry);
    history.past.push(entry);
    persist();
    notifyHistoryChange();
    return true;
  }

  function jumpTo(entryId: string): boolean {
    // Jumping to an entry means: replay state to the moment immediately after
    // that entry was applied. The target ends up as the last item in `past`.
    const pastIdx = history.past.findIndex((e) => e.id === entryId);
    if (pastIdx >= 0) {
      // Undo until the target is the top of past.
      while (history.past.length - 1 > pastIdx) {
        const e = history.past.pop();
        if (!e) break;
        applyEntryBackward(e);
        history.future.unshift(e);
      }
      persist();
      notifyHistoryChange();
      return true;
    }

    const futureIdx = history.future.findIndex((e) => e.id === entryId);
    if (futureIdx >= 0) {
      // Redo through and including the target.
      for (let i = 0; i <= futureIdx; i++) {
        const e = history.future.shift();
        if (!e) break;
        applyEntryForward(e);
        history.past.push(e);
      }
      persist();
      notifyHistoryChange();
      return true;
    }

    return false;
  }

  function clearHistory(): void {
    history.past = [];
    history.future = [];
    persist();
    notifyHistoryChange();
  }

  // ------ Public API ---------------------------------------------------------

  return {
    hasOverride,
    getOverrideCount,
    getAllOverrides,
    set,
    remove,
    reset,
    getWritePayload,
    onDirtyChange,

    history,
    getHistory,
    undo,
    redo,
    jumpTo,
    clearHistory,
    onHistoryChange,
  };
}
