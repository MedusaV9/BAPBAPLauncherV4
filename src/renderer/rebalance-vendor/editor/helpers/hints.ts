/**
 * Phase 3 Task 23 — Hints helper.
 *
 * Type-safe access to the contextual hint catalog defined in `hints.json`.
 * UI components (e.g. `<HintPopover hintId="quick-edit-damage" />`) call into
 * `getHint(id)` which never throws; unknown ids resolve to `null`.
 */

import hintsData from "../hints.json";

export interface HintEntry {
  title: string;
  body: string;
  example?: string | null;
  clipPath?: string | null;
}

export type HintId = string;

interface HintsFile {
  version: number;
  hints: Record<HintId, HintEntry>;
}

const data = hintsData as HintsFile;

function isHintEntry(value: unknown): value is HintEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<HintEntry>;
  return typeof entry.title === "string" && typeof entry.body === "string";
}

export function loadHints(): Record<HintId, HintEntry> {
  if (!data || typeof data !== "object" || !data.hints || typeof data.hints !== "object") {
    return {};
  }
  const out: Record<HintId, HintEntry> = {};
  for (const [id, entry] of Object.entries(data.hints)) {
    if (isHintEntry(entry)) out[id] = entry;
  }
  return out;
}

export function getHint(id: HintId): HintEntry | null {
  if (!id) return null;
  const entry = data?.hints?.[id];
  return isHintEntry(entry) ? entry : null;
}

export function hasHint(id: HintId): boolean {
  return getHint(id) !== null;
}

export function listHintIds(): HintId[] {
  return Object.keys(loadHints());
}
