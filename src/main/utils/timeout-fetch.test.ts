import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    DOWNLOAD_TIMEOUT_MS,
    MANIFEST_TIMEOUT_MS,
    fetchWithTimeout,
} from "./timeout-fetch";

describe("timeout-fetch", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe("constants", () => {
        it("MANIFEST_TIMEOUT_MS is 15000", () => {
            expect(MANIFEST_TIMEOUT_MS).toBe(15_000);
        });

        it("DOWNLOAD_TIMEOUT_MS is 30000", () => {
            expect(DOWNLOAD_TIMEOUT_MS).toBe(30_000);
        });
    });

    describe("fetchWithTimeout", () => {
        it("returns response on successful fetch within timeout", async () => {
            const mockResponse = new Response("ok", { status: 200 });
            vi.stubGlobal(
                "fetch",
                vi.fn().mockResolvedValue(mockResponse),
            );

            const result = await fetchWithTimeout("https://example.com/manifest.json");

            expect(result).toBe(mockResponse);
            expect(fetch).toHaveBeenCalledWith(
                "https://example.com/manifest.json",
                expect.objectContaining({ signal: expect.any(AbortSignal) }),
            );
        });

        it("passes options through to fetch", async () => {
            const mockResponse = new Response("ok", { status: 200 });
            vi.stubGlobal(
                "fetch",
                vi.fn().mockResolvedValue(mockResponse),
            );

            const headers = { Authorization: "Bearer token" };
            await fetchWithTimeout(
                "https://example.com/data",
                { method: "POST", headers },
                5000,
            );

            expect(fetch).toHaveBeenCalledWith(
                "https://example.com/data",
                expect.objectContaining({
                    method: "POST",
                    headers,
                    signal: expect.any(AbortSignal),
                }),
            );
        });

        it("throws descriptive error including URL on timeout", async () => {
            vi.stubGlobal(
                "fetch",
                vi.fn().mockImplementation(
                    (_url: string, opts: RequestInit) =>
                        new Promise((_resolve, reject) => {
                            opts.signal?.addEventListener("abort", () => {
                                const err = new Error("The operation was aborted.");
                                err.name = "AbortError";
                                reject(err);
                            });
                        }),
                ),
            );

            const fetchPromise = fetchWithTimeout(
                "https://example.com/slow",
                undefined,
                1000,
            );

            vi.advanceTimersByTime(1000);

            await expect(fetchPromise).rejects.toThrow(
                "Network request timed out after 1000ms: https://example.com/slow",
            );
        });

        it("uses MANIFEST_TIMEOUT_MS as default timeout", async () => {
            vi.stubGlobal(
                "fetch",
                vi.fn().mockImplementation(
                    (_url: string, opts: RequestInit) =>
                        new Promise((_resolve, reject) => {
                            opts.signal?.addEventListener("abort", () => {
                                const err = new Error("The operation was aborted.");
                                err.name = "AbortError";
                                reject(err);
                            });
                        }),
                ),
            );

            const fetchPromise = fetchWithTimeout("https://example.com/manifest.json");

            // Advance just under 15s - should not have timed out yet
            vi.advanceTimersByTime(14_999);
            // Advance the remaining 1ms to trigger timeout
            vi.advanceTimersByTime(1);

            await expect(fetchPromise).rejects.toThrow(
                "Network request timed out after 15000ms",
            );
        });

        it("cleans up timer on successful response", async () => {
            const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
            const mockResponse = new Response("ok", { status: 200 });
            vi.stubGlobal(
                "fetch",
                vi.fn().mockResolvedValue(mockResponse),
            );

            await fetchWithTimeout("https://example.com/data");

            expect(clearTimeoutSpy).toHaveBeenCalled();
        });

        it("cleans up timer on fetch error (non-timeout)", async () => {
            const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
            const networkError = new Error("ECONNREFUSED");
            vi.stubGlobal(
                "fetch",
                vi.fn().mockRejectedValue(networkError),
            );

            await expect(
                fetchWithTimeout("https://example.com/data"),
            ).rejects.toThrow("ECONNREFUSED");

            expect(clearTimeoutSpy).toHaveBeenCalled();
        });

        it("re-throws non-abort errors without wrapping", async () => {
            const networkError = new Error("DNS resolution failed");
            vi.stubGlobal(
                "fetch",
                vi.fn().mockRejectedValue(networkError),
            );

            await expect(
                fetchWithTimeout("https://bad.example.com"),
            ).rejects.toThrow("DNS resolution failed");
        });
    });
});
