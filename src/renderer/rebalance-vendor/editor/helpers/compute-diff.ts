/**
 * Diff helpers for Rebalance Studio — Phase 3 Task 15.
 *
 * Pure, dependency-free comparison of two plain object snapshots, producing a
 * flat list of {@link DiffHunk}s addressed by dotted paths. Used by the
 * `DiffView` component to compare two snapshots / files and selectively merge
 * the differences back into a target object via {@link applyDiff}.
 *
 * Rules:
 * - Recurses into nested plain objects only — arrays and primitives are leaves.
 * - Arrays are compared element-wise by index via JSON.stringify; if any
 *   element differs, the whole array is marked `modified` (no per-index hunks).
 * - Numeric / string / boolean / null values use deep-equality via
 *   JSON.stringify.
 * - Keys that exist on only one side are emitted as `added` / `removed` (the
 *   subtree is NOT recursed into — the entire subtree is the value).
 * - Equal leaves are emitted as `unchanged` so callers can render a complete
 *   side-by-side view.
 */

export type DiffOperation = "added" | "removed" | "modified" | "unchanged";

export interface DiffHunk {
  path: string;
  operation: DiffOperation;
  before: unknown;
  after: unknown;
}

/* ============================================================================
   Internal helpers
   ============================================================================ */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function deepEqual(a: unknown, b: unknown): boolean {
  // JSON.stringify gives stable element-wise comparison for arrays and value
  // equality for primitives. Objects with different key orders may not match,
  // but for snapshots produced by the same pipeline this is acceptable.
  return JSON.stringify(a) === JSON.stringify(b);
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/* ============================================================================
   computeDiff
   ============================================================================ */

/**
 * Compares two plain-object snapshots and returns a flat list of hunks.
 *
 * @param left  The "before" object.
 * @param right The "after" object.
 * @returns     Flat list of hunks, ordered by union of keys (left first).
 */
export function computeDiff(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): DiffHunk[] {
  return computeDiffInternal(left, right, "");
}

function computeDiffInternal(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  prefix: string,
): DiffHunk[] {
  const out: DiffHunk[] = [];

  // Preserve left key order, then append right-only keys.
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const k of Object.keys(left)) {
    if (!seen.has(k)) {
      seen.add(k);
      keys.push(k);
    }
  }
  for (const k of Object.keys(right)) {
    if (!seen.has(k)) {
      seen.add(k);
      keys.push(k);
    }
  }

  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const inLeft = Object.prototype.hasOwnProperty.call(left, key);
    const inRight = Object.prototype.hasOwnProperty.call(right, key);
    const leftVal = left[key];
    const rightVal = right[key];

    if (!inLeft && inRight) {
      out.push({ path, operation: "added", before: undefined, after: rightVal });
      continue;
    }

    if (inLeft && !inRight) {
      out.push({ path, operation: "removed", before: leftVal, after: undefined });
      continue;
    }

    // Both sides present — recurse only when both values are plain objects.
    if (isPlainObject(leftVal) && isPlainObject(rightVal)) {
      out.push(...computeDiffInternal(leftVal, rightVal, path));
      continue;
    }

    // Arrays / primitives / mismatched types compared by deep equality.
    if (deepEqual(leftVal, rightVal)) {
      out.push({ path, operation: "unchanged", before: leftVal, after: rightVal });
    } else {
      out.push({ path, operation: "modified", before: leftVal, after: rightVal });
    }
  }

  return out;
}

/* ============================================================================
   applyDiff
   ============================================================================ */

/**
 * Produces a new object by merging the supplied hunks into {@link target}.
 *
 * - `added` / `modified` → set the value at `path` to `hunk.after`.
 * - `removed`            → delete the key at `path` (parent object stays).
 * - `unchanged`          → no-op.
 *
 * The original `target` is never mutated — the result is a deep clone with
 * the hunks applied on top.
 */
export function applyDiff(
  target: Record<string, unknown>,
  hunks: DiffHunk[],
): Record<string, unknown> {
  const result: Record<string, unknown> = deepClone(target);

  for (const hunk of hunks) {
    switch (hunk.operation) {
      case "added":
      case "modified":
        setAtPath(result, hunk.path, hunk.after);
        break;
      case "removed":
        deleteAtPath(result, hunk.path);
        break;
      case "unchanged":
      default:
        break;
    }
  }

  return result;
}

function setAtPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".");
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const existing = cursor[seg];
    if (!isPlainObject(existing)) {
      cursor[seg] = {};
    }
    cursor = cursor[seg] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}

function deleteAtPath(target: Record<string, unknown>, path: string): void {
  const segments = path.split(".");
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const existing = cursor[seg];
    if (!isPlainObject(existing)) {
      return; // nothing to delete — path doesn't exist
    }
    cursor = existing;
  }
  delete cursor[segments[segments.length - 1]];
}
