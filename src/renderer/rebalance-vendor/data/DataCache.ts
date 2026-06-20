import type {
  BootstrapPayload,
  CatalogGroup,
  RuntimeDocument,
  JsonValue,
} from "../editor/types";

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
  readonly bootstrap: BootstrapPayload | null;
  readonly documents: Map<string, CachedDocument>;
  readonly isReady: boolean;

  getDocument(absolutePath: string): CachedDocument | null;
  getCatalog(): CatalogGroup[];
  getStandardValue(docPath: string, fieldPath: string): JsonValue | undefined;

  setOverride(docPath: string, fieldPath: string, value: JsonValue): void;
  clearOverride(docPath: string, fieldPath: string): void;
  clearAllOverrides(docPath: string): void;

  hydrate(payload: BootstrapPayload): void;
  hydrateDocument(
    docPath: string,
    doc: RuntimeDocument,
    absolutePath: string,
    relativePath: string,
    mtimeMs: number,
  ): void;
  setReady(ready: boolean): void;
  invalidate(): void;

  subscribe(
    path: string,
    listener: (doc: CachedDocument) => void,
  ): () => void;
  onCacheInvalidated(listener: () => void): () => void;
}

/**
 * Extracts a flat Record of standard values from a RuntimeDocument.
 * Uses quickEdit entries as the canonical field set.
 */
function extractStandardValues(raw: RuntimeDocument): Record<string, JsonValue> {
  const values: Record<string, JsonValue> = {};
  if (raw.quickEdit) {
    for (const entry of raw.quickEdit) {
      values[entry.path] = entry.value;
    }
  }
  return values;
}

export function createDataCache(): DataCache {
  let bootstrapPayload: BootstrapPayload | null = null;
  let ready = false;
  const documents = new Map<string, CachedDocument>();
  const subscribers = new Map<string, Set<(doc: CachedDocument) => void>>();
  const invalidationListeners = new Set<() => void>();

  function notifySubscribers(docPath: string, doc: CachedDocument): void {
    const subs = subscribers.get(docPath);
    if (subs) {
      for (const listener of subs) {
        listener(doc);
      }
    }
  }

  function notifyInvalidation(): void {
    for (const listener of invalidationListeners) {
      listener();
    }
  }

  const cache: DataCache = {
    get bootstrap() {
      return bootstrapPayload;
    },

    get documents() {
      return documents;
    },

    get isReady() {
      return ready;
    },

    getDocument(absolutePath: string): CachedDocument | null {
      return documents.get(absolutePath) ?? null;
    },

    getCatalog(): CatalogGroup[] {
      return bootstrapPayload?.catalog ?? [];
    },

    getStandardValue(
      docPath: string,
      fieldPath: string,
    ): JsonValue | undefined {
      const doc = documents.get(docPath);
      if (!doc) return undefined;
      return doc.standardValues[fieldPath];
    },

    setOverride(
      docPath: string,
      fieldPath: string,
      value: JsonValue,
    ): void {
      const doc = documents.get(docPath);
      if (!doc) return;

      doc.overrides[fieldPath] = value;
      doc.isDirty = Object.keys(doc.overrides).length > 0;
      notifySubscribers(docPath, doc);
    },

    clearOverride(docPath: string, fieldPath: string): void {
      const doc = documents.get(docPath);
      if (!doc) return;

      delete doc.overrides[fieldPath];
      doc.isDirty = Object.keys(doc.overrides).length > 0;
      notifySubscribers(docPath, doc);
    },

    clearAllOverrides(docPath: string): void {
      const doc = documents.get(docPath);
      if (!doc) return;

      doc.overrides = {};
      doc.isDirty = false;
      notifySubscribers(docPath, doc);
    },

    hydrate(payload: BootstrapPayload): void {
      bootstrapPayload = payload;
    },

    hydrateDocument(
      docPath: string,
      doc: RuntimeDocument,
      absolutePath: string,
      relativePath: string,
      mtimeMs: number,
    ): void {
      const existing = documents.get(docPath);
      const cached: CachedDocument = {
        absolutePath,
        relativePath,
        mtimeMs,
        raw: doc,
        standardValues: extractStandardValues(doc),
        overrides: existing?.overrides ?? {},
        isDirty: existing?.isDirty ?? false,
      };
      documents.set(docPath, cached);
    },

    setReady(r: boolean): void {
      ready = r;
    },

    invalidate(): void {
      documents.clear();
      bootstrapPayload = null;
      ready = false;
      notifyInvalidation();
    },

    subscribe(
      path: string,
      listener: (doc: CachedDocument) => void,
    ): () => void {
      let subs = subscribers.get(path);
      if (!subs) {
        subs = new Set();
        subscribers.set(path, subs);
      }
      subs.add(listener);

      return () => {
        subs!.delete(listener);
        if (subs!.size === 0) {
          subscribers.delete(path);
        }
      };
    },

    onCacheInvalidated(listener: () => void): () => void {
      invalidationListeners.add(listener);
      return () => {
        invalidationListeners.delete(listener);
      };
    },
  };

  return cache;
}
