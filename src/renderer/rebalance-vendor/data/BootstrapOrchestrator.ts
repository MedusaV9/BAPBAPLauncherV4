import type { DataCache } from "./DataCache";
import type {
  BootstrapPayload,
  RuntimeDocument,
  LibraryMetadataResponse,
} from "../editor/types";

export type LoadPhase =
  | "initializing"
  | "loading-catalog"
  | "caching-documents"
  | "loading-library"
  | "finalizing"
  | "complete";

export interface BootstrapResult {
  success: boolean;
  payload: BootstrapPayload | null;
  error?: string;
  durationMs: number;
}

export interface BootstrapApi {
  bootstrap(workspaceRoot: string): Promise<BootstrapPayload>;
  openDocument(
    workspaceRoot: string,
    absolutePath: string,
  ): Promise<{
    document: RuntimeDocument;
    absolutePath: string;
    relativePath: string;
    mtimeMs: number;
  }>;
  readLibraryMetadata(workspaceRoot: string): Promise<LibraryMetadataResponse>;
}

/**
 * Orchestrates the multi-step bootstrap process, reporting progress
 * to the ShaderLoader as each phase completes.
 *
 * Phase 1 (0 → 0.25): Load catalog via api.bootstrap()
 * Phase 2 (0.30 → 0.85): Batch-load all documents (10 at a time)
 * Phase 3 (0.85 → 0.95): Load library metadata
 * Phase 4 (1.0): Mark cache ready
 *
 * Progress is monotonically increasing and bounded within [0.0, 1.0].
 */
export async function orchestrateBootstrap(
  workspaceRoot: string,
  cache: DataCache,
  api: BootstrapApi,
  onProgress: (progress: number, phase: LoadPhase) => void,
): Promise<BootstrapResult> {
  const startMs = performance.now();
  let lastProgress = 0;

  // Ensure progress is monotonically increasing and clamped to [0, 1]
  function reportProgress(value: number, phase: LoadPhase): void {
    const clamped = Math.min(1, Math.max(0, value));
    if (clamped >= lastProgress) {
      lastProgress = clamped;
      onProgress(clamped, phase);
    }
  }

  try {
    // Phase 1: Initialize and load catalog + workspace structure
    reportProgress(0, "initializing");
    reportProgress(0.05, "loading-catalog");

    const payload = await api.bootstrap(workspaceRoot);
    cache.hydrate(payload);
    reportProgress(0.25, "loading-catalog");

    // Phase 2: Cache all documents from the catalog in batches of 10
    reportProgress(0.3, "caching-documents");

    const docPaths = payload.catalog
      .flatMap((group) => group.entries)
      .map((entry) => entry.absolutePath);

    const batchSize = 10;
    const totalDocs = docPaths.length;

    if (totalDocs > 0) {
      for (let i = 0; i < totalDocs; i += batchSize) {
        const batch = docPaths.slice(i, i + batchSize);
        const docs = await Promise.all(
          batch.map((path) => api.openDocument(workspaceRoot, path)),
        );

        for (const doc of docs) {
          cache.hydrateDocument(
            doc.absolutePath,
            doc.document,
            doc.absolutePath,
            doc.relativePath,
            doc.mtimeMs,
          );
        }

        // Progress proportional within 0.30 → 0.85 range
        const completedCount = Math.min(i + batch.length, totalDocs);
        const batchProgress = 0.3 + 0.55 * (completedCount / totalDocs);
        reportProgress(batchProgress, "caching-documents");
      }
    } else {
      // No documents to load, skip to end of phase 2
      reportProgress(0.85, "caching-documents");
    }

    // Phase 3: Load library metadata
    reportProgress(0.85, "loading-library");
    const _library = await api.readLibraryMetadata(workspaceRoot);
    reportProgress(0.95, "loading-library");

    // Phase 4: Finalize — mark cache ready
    reportProgress(0.95, "finalizing");
    cache.setReady(true);
    reportProgress(1.0, "complete");

    return {
      success: true,
      payload,
      durationMs: performance.now() - startMs,
    };
  } catch (error) {
    return {
      success: false,
      payload: null,
      error: error instanceof Error ? error.message : String(error),
      durationMs: performance.now() - startMs,
    };
  }
}
