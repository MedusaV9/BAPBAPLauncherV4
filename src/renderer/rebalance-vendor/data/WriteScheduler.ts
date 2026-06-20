import type {
  SaveDocumentRequest,
  SaveDocumentResponse,
} from "../editor/types";

/**
 * Minimal interface for the DiffEngine dependency.
 * WriteScheduler only needs to retrieve write payloads.
 */
export interface DiffEngineForWriter {
  getWritePayload(docPath: string): SaveDocumentRequest | null;
}

export interface WriteScheduler {
  /** Schedule a debounced write for the given document. */
  schedule(docPath: string): void;
  /** Immediately flush pending write(s). If no docPath, flush ALL pending. */
  flush(docPath?: string): Promise<void>;
  /** Cancel pending timer(s) without writing. If no docPath, cancel ALL. */
  cancel(docPath?: string): void;
  /** Number of documents with active debounce timers. */
  readonly pendingCount: number;
  /** Register a listener for successful writes. Returns unsubscribe function. */
  onWriteComplete(
    listener: (docPath: string, response: SaveDocumentResponse) => void,
  ): () => void;
  /** Register a listener for write errors (after retry exhausted). Returns unsubscribe function. */
  onWriteError(listener: (docPath: string, error: Error) => void): () => void;
  /** Cancel all timers and clear all listeners. */
  dispose(): void;
}

const DEFAULT_DEBOUNCE_MS = 800;
const RETRY_DELAY_MS = 500;

export function createWriteScheduler(
  diff: DiffEngineForWriter,
  saveDocument: (payload: SaveDocumentRequest) => Promise<SaveDocumentResponse>,
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
): WriteScheduler {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const writeListeners = new Set<
    (docPath: string, response: SaveDocumentResponse) => void
  >();
  const errorListeners = new Set<(docPath: string, error: Error) => void>();

  function schedule(docPath: string): void {
    // Cancel existing timer for this doc
    const existing = timers.get(docPath);
    if (existing != null) clearTimeout(existing);

    // Start new debounce timer
    const timer = setTimeout(() => {
      timers.delete(docPath);
      void executeWrite(docPath);
    }, debounceMs);

    timers.set(docPath, timer);
  }

  async function executeWrite(docPath: string): Promise<void> {
    const payload = diff.getWritePayload(docPath);
    if (payload == null) return;

    try {
      const response = await saveDocument(payload);
      for (const listener of writeListeners) {
        listener(docPath, response);
      }
    } catch {
      // Retry once after 500ms
      await delay(RETRY_DELAY_MS);
      try {
        const response = await saveDocument(payload);
        for (const listener of writeListeners) {
          listener(docPath, response);
        }
      } catch (retryError: unknown) {
        const error =
          retryError instanceof Error
            ? retryError
            : new Error(String(retryError));
        for (const listener of errorListeners) {
          listener(docPath, error);
        }
      }
    }
  }

  async function flush(docPath?: string): Promise<void> {
    const paths =
      docPath != null ? [docPath] : [...timers.keys()];

    for (const path of paths) {
      const timer = timers.get(path);
      if (timer != null) {
        clearTimeout(timer);
        timers.delete(path);
      }
    }

    // Write all pending docs
    await Promise.all(paths.map((path) => executeWrite(path)));
  }

  function cancel(docPath?: string): void {
    if (docPath != null) {
      const timer = timers.get(docPath);
      if (timer != null) {
        clearTimeout(timer);
        timers.delete(docPath);
      }
    } else {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    }
  }

  function onWriteComplete(
    listener: (docPath: string, response: SaveDocumentResponse) => void,
  ): () => void {
    writeListeners.add(listener);
    return () => {
      writeListeners.delete(listener);
    };
  }

  function onWriteError(
    listener: (docPath: string, error: Error) => void,
  ): () => void {
    errorListeners.add(listener);
    return () => {
      errorListeners.delete(listener);
    };
  }

  function dispose(): void {
    cancel();
    writeListeners.clear();
    errorListeners.clear();
  }

  return {
    schedule,
    flush,
    cancel,
    get pendingCount() {
      return timers.size;
    },
    onWriteComplete,
    onWriteError,
    dispose,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
