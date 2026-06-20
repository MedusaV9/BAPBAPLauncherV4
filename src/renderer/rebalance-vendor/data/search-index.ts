/**
 * Pure inverted-index implementation used by both the main thread and the
 * Web Worker entry (`search-index.worker.ts`). Has no external dependencies
 * and no DOM/Worker globals so it is safe to import in any environment.
 *
 * Phase 3 Task 17 — Worker-Backed Search Index.
 */

export interface SearchRecord {
    id: string;
    /**
     * Pre-tokenized fields. Tokens are case-insensitive — they will be
     * lowercased internally if not already.
     */
    tokens: string[];
    metadata?: Record<string, unknown>;
}

export interface SearchQueryOptions {
    limit?: number;
}

export interface SearchResult {
    id: string;
    score: number;
    metadata?: Record<string, unknown>;
}

export interface SearchIndex {
    addRecord(record: SearchRecord): void;
    addRecords(records: SearchRecord[]): void;
    removeRecord(id: string): void;
    clear(): void;
    query(text: string, opts?: SearchQueryOptions): SearchResult[];
    /** Number of indexed records (mainly for tests/diagnostics). */
    readonly size: number;
}

const TOKEN_SPLIT_RE = /[\s\p{P}\p{S}]+/u;

/**
 * Tokenize a query string or raw text. Lower-cased, split on whitespace and
 * unicode punctuation/symbol characters, empty tokens removed.
 *
 * Exported so callers (e.g. record builders) can stay consistent with how the
 * index parses queries.
 */
export function tokenize(input: string): string[] {
    if (!input) return [];
    const lower = input.toLowerCase();
    const parts = lower.split(TOKEN_SPLIT_RE);
    const out: string[] = [];
    for (const part of parts) {
        if (part.length > 0) out.push(part);
    }
    return out;
}

interface InternalRecord {
    id: string;
    tokens: Set<string>;
    /** Original token list (lowercased) for partial-match fallback. */
    tokenList: string[];
    metadata?: Record<string, unknown>;
}

export function createSearchIndex(): SearchIndex {
    /** id -> record */
    const records = new Map<string, InternalRecord>();
    /** token -> set of record ids that contain that exact token */
    const inverted = new Map<string, Set<string>>();

    function indexInternal(rec: InternalRecord): void {
        for (const token of rec.tokens) {
            let bucket = inverted.get(token);
            if (!bucket) {
                bucket = new Set();
                inverted.set(token, bucket);
            }
            bucket.add(rec.id);
        }
    }

    function deindexInternal(rec: InternalRecord): void {
        for (const token of rec.tokens) {
            const bucket = inverted.get(token);
            if (!bucket) continue;
            bucket.delete(rec.id);
            if (bucket.size === 0) inverted.delete(token);
        }
    }

    function normalize(record: SearchRecord): InternalRecord {
        const tokenList: string[] = [];
        const set = new Set<string>();
        for (const raw of record.tokens) {
            if (typeof raw !== "string" || raw.length === 0) continue;
            const lowered = raw.toLowerCase();
            // Allow callers to pass already-tokenized strings, but also
            // tolerate richer phrases by re-tokenizing them.
            if (TOKEN_SPLIT_RE.test(lowered)) {
                for (const piece of tokenize(lowered)) {
                    if (!set.has(piece)) {
                        set.add(piece);
                        tokenList.push(piece);
                    }
                }
            } else if (!set.has(lowered)) {
                set.add(lowered);
                tokenList.push(lowered);
            }
        }
        return {
            id: record.id,
            tokens: set,
            tokenList,
            metadata: record.metadata,
        };
    }

    function addRecord(record: SearchRecord): void {
        if (!record || typeof record.id !== "string" || record.id.length === 0) {
            return;
        }
        // Replace any existing record with the same id.
        const existing = records.get(record.id);
        if (existing) deindexInternal(existing);
        const normalized = normalize(record);
        records.set(normalized.id, normalized);
        indexInternal(normalized);
    }

    function addRecords(items: SearchRecord[]): void {
        if (!Array.isArray(items)) return;
        for (const item of items) addRecord(item);
    }

    function removeRecord(id: string): void {
        const existing = records.get(id);
        if (!existing) return;
        deindexInternal(existing);
        records.delete(id);
    }

    function clear(): void {
        records.clear();
        inverted.clear();
    }

    function query(text: string, opts?: SearchQueryOptions): SearchResult[] {
        const queryTokens = tokenize(text);
        if (queryTokens.length === 0) return [];

        // candidateId -> exact match count
        const exactHits = new Map<string, number>();
        for (const token of queryTokens) {
            const bucket = inverted.get(token);
            if (!bucket) continue;
            for (const id of bucket) {
                exactHits.set(id, (exactHits.get(id) ?? 0) + 1);
            }
        }

        // Partial-match fallback boost: for each query token, find indexed
        // tokens that contain the query token as a substring (or vice-versa)
        // and award a small score. This kicks in primarily when there are
        // no exact matches, but also lifts close-but-not-exact records.
        const partialHits = new Map<string, number>();
        for (const token of queryTokens) {
            if (token.length < 2) continue;
            for (const rec of records.values()) {
                if (exactHits.has(rec.id) && exactHits.get(rec.id)! > 0) {
                    // Already an exact hit for some token — only add partial
                    // credit for *other* query tokens it doesn't fully match.
                    if (rec.tokens.has(token)) continue;
                }
                let matched = false;
                for (const recToken of rec.tokenList) {
                    if (recToken === token) continue;
                    if (recToken.includes(token) || token.includes(recToken)) {
                        matched = true;
                        break;
                    }
                }
                if (matched) {
                    partialHits.set(rec.id, (partialHits.get(rec.id) ?? 0) + 1);
                }
            }
        }

        const total = queryTokens.length;
        const candidates = new Set<string>([
            ...exactHits.keys(),
            ...partialHits.keys(),
        ]);
        const results: SearchResult[] = [];
        for (const id of candidates) {
            const exact = exactHits.get(id) ?? 0;
            const partial = partialHits.get(id) ?? 0;
            // Jaccard-style: exact matches are full weight, partial matches
            // contribute 0.25 each. Score is normalized to [0, 1].
            const raw = exact + partial * 0.25;
            const score = raw / total;
            if (score <= 0) continue;
            const rec = records.get(id);
            results.push({
                id,
                score,
                metadata: rec?.metadata,
            });
        }

        results.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            // Stable-ish tie-breaker on id to keep results deterministic.
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        });

        const limit = opts?.limit;
        if (typeof limit === "number" && limit >= 0 && results.length > limit) {
            return results.slice(0, limit);
        }
        return results;
    }

    return {
        addRecord,
        addRecords,
        removeRecord,
        clear,
        query,
        get size() {
            return records.size;
        },
    };
}
