/**
 * Network fetch wrapper with AbortController-based timeouts.
 *
 * Prevents indefinite hangs by aborting in-flight requests that exceed
 * a configurable timeout threshold.
 */

/** Default timeout for manifest/metadata JSON fetches (15 seconds). */
export const MANIFEST_TIMEOUT_MS = 15_000;

/** Default timeout for download operations - first byte (30 seconds). */
export const DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * Wraps the global `fetch` with an AbortController timeout.
 *
 * If the response does not arrive within `timeoutMs`, the request is aborted
 * and a descriptive error (including the URL) is thrown.
 *
 * @param url - The URL to fetch.
 * @param options - Standard RequestInit options (headers, method, body, etc.).
 * @param timeoutMs - Timeout in milliseconds. Defaults to {@link MANIFEST_TIMEOUT_MS}.
 * @returns The fetch Response on success.
 * @throws Error with URL context when the request times out.
 */
export async function fetchWithTimeout(
    url: string,
    options?: RequestInit,
    timeoutMs: number = MANIFEST_TIMEOUT_MS,
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        return response;
    } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new Error(
                `Network request timed out after ${timeoutMs}ms: ${url}`,
            );
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}
