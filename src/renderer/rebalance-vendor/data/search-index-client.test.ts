// @vitest-environment jsdom
/**
 * Tests for the search-index client. We deliberately exercise the synchronous
 * fallback path because jsdom's worker support is unreliable for module
 * workers and we want hermetic, fast unit tests rather than real worker
 * round-trips. Worker construction is forced to fail by stubbing the global
 * `Worker` to `undefined` BEFORE the module under test is imported, so the
 * client takes the fallback branch.
 *
 * Phase 3 Task 17 — Worker-Backed Search Index.
 */

import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import type {
    SearchIndexClient,
    createSearchIndexClient as CreateClientFn,
} from "./search-index-client";

let createSearchIndexClient: typeof CreateClientFn;

beforeAll(async () => {
    // Force the fallback path — the client checks `typeof Worker === "undefined"`
    // and bails out to the in-process index when true.
    vi.stubGlobal("Worker", undefined);
    const mod = await import("./search-index-client");
    createSearchIndexClient = mod.createSearchIndexClient;
});

afterAll(() => {
    vi.unstubAllGlobals();
});

describe("createSearchIndexClient — fallback path (Phase 3 Task 17)", () => {
    it("addRecords + query work via fallback", async () => {
        const client: SearchIndexClient = createSearchIndexClient();
        await client.addRecords([
            { id: "a", tokens: ["fire", "wave"] },
            { id: "b", tokens: ["damage", "burn"] },
            { id: "c", tokens: ["poison"] },
        ]);

        const fireResults = await client.query("fire");
        expect(fireResults).toHaveLength(1);
        expect(fireResults[0].id).toBe("a");
        expect(fireResults[0].score).toBeGreaterThan(0);

        const damageResults = await client.query("damage burn");
        expect(damageResults[0].id).toBe("b");

        client.terminate();
    });

    it("removeRecord purges the record from queries", async () => {
        const client = createSearchIndexClient();
        await client.addRecords([
            { id: "x", tokens: ["damage"] },
            { id: "y", tokens: ["damage", "fire"] },
        ]);

        let results = await client.query("damage");
        expect(results.map((r) => r.id).sort()).toEqual(["x", "y"]);

        await client.removeRecord("x");

        results = await client.query("damage");
        expect(results.map((r) => r.id)).toEqual(["y"]);

        client.terminate();
    });

    it("clear empties the index", async () => {
        const client = createSearchIndexClient();
        await client.addRecords([
            { id: "a", tokens: ["fire"] },
            { id: "b", tokens: ["ice"] },
        ]);

        await client.clear();

        expect(await client.query("fire")).toEqual([]);
        expect(await client.query("ice")).toEqual([]);

        client.terminate();
    });

    it("respects the limit option through the fallback", async () => {
        const client = createSearchIndexClient();
        const records = Array.from({ length: 12 }, (_, i) => ({
            id: `r${i}`,
            tokens: ["damage"],
        }));
        await client.addRecords(records);

        const limited = await client.query("damage", { limit: 4 });
        expect(limited).toHaveLength(4);

        client.terminate();
    });

    it("methods return real Promise instances even in fallback mode", () => {
        const client = createSearchIndexClient();
        const p1 = client.addRecords([{ id: "a", tokens: ["fire"] }]);
        const p2 = client.removeRecord("a");
        const p3 = client.clear();
        const p4 = client.query("fire");

        expect(p1).toBeInstanceOf(Promise);
        expect(p2).toBeInstanceOf(Promise);
        expect(p3).toBeInstanceOf(Promise);
        expect(p4).toBeInstanceOf(Promise);

        // Ensure they all resolve cleanly.
        return Promise.all([p1, p2, p3, p4]).then(() => {
            client.terminate();
        });
    });

    it("terminate is idempotent and safe to call without prior work", () => {
        const client = createSearchIndexClient();
        expect(() => client.terminate()).not.toThrow();
        // A second call should also be a no-op.
        expect(() => client.terminate()).not.toThrow();
    });
});
