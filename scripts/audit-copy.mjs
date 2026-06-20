#!/usr/bin/env node
/**
 * Phase 3 Task 10 — Copy audit scanner.
 *
 * Scans the Rebalance Studio source tree for forbidden phrases that should
 * not appear in user-facing UI strings. Forbidden phrases come from
 * `apps/bapbap-launcher/src/renderer/rebalance-vendor/editor/copy.ts`.
 *
 * Allowed in:
 *   - Inside <details>...</details> disclosures (technical detail behind toggle)
 *   - Comments (lines starting with // or inside `/* ... *​/`)
 *   - test files (*.test.ts, *.test.tsx)
 *   - copy.ts itself (where we declare the forbidden list)
 *   - audit script itself
 *
 * Exit 0 if clean, 1 otherwise. CI calls this script before build.
 *
 * Usage:
 *   node scripts/audit-copy.mjs
 *   node scripts/audit-copy.mjs --json
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const SCAN_ROOT = join(REPO_ROOT, "src", "renderer");

/**
 * Forbidden phrases — duplicated from copy.ts FORBIDDEN_PHRASES.
 * Keep in sync.
 */
const FORBIDDEN_PHRASES = [
  "Find one ",
  "Receipts",
  "BAPBAPBalanceMod.dll",
  "embedded shell",
  "syncing the editor workspace",
  "View requirement",
];

/** Files (relative to repo root) that may legitimately contain forbidden phrases. */
const ALLOWLIST = new Set([
  "src/renderer/rebalance-vendor/editor/copy.ts",
  "scripts/audit-copy.mjs",
  // Existing tests preserve audit history & expectations
  "src/renderer/rebalance-vendor/editor/__tests__/static-analysis.test.ts",
  // tools-workspace-helpers.ts retains the technical constant for backward
  // compatibility — actual user-facing strings now come from copy.ts.
  "src/renderer/components/workspaces/tools-workspace-helpers.ts",
  // Mock data fixtures use real-looking technical file paths, not UI copy.
  "src/renderer/harness/mock-api.ts",
  "src/renderer/rebalance-vendor/editor/mockApi.ts",
]);

/** Skip these directories entirely. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".vite",
  ".vite-temp",
  "dist",
  "release",
  "output",
  "playwright",
  "playwright-cli",
  ".playwright-cli",
  "artifacts",
  "build",
  "__tests__", // tests legitimately reference forbidden strings
]);

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".jsx"]);

const violations = [];

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let s;
    try {
      s = await stat(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      yield* walk(full);
    } else {
      const ext = entry.slice(entry.lastIndexOf("."));
      if (!SCAN_EXTENSIONS.has(ext)) continue;
      // Skip test files — they often reference forbidden strings to assert behavior
      if (/\.test\.(ts|tsx|js|jsx|mjs)$/i.test(entry)) continue;
      if (/\.spec\.(ts|tsx|js|jsx|mjs)$/i.test(entry)) continue;
      yield full;
    }
  }
}

/**
 * Strips block comments and line comments from source text, plus content
 * inside <details>...</details> disclosures, before scanning for forbidden phrases.
 * Approximate but sufficient for our purposes.
 */
function strippedSource(text) {
  let stripped = text;

  // Block comments
  stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, " ");

  // Line comments
  stripped = stripped.replace(/(^|[^:])\/\/[^\n\r]*/g, "$1");

  // <details>...</details> blocks (case-insensitive, multiline)
  stripped = stripped.replace(/<details\b[^>]*>[\s\S]*?<\/details>/gi, " ");

  return stripped;
}

/**
 * Extracts only string literal contents from source code (single, double, and
 * template strings), preserving original line numbers so violation reports
 * remain accurate. Returns an array of `{ line, text }` for each string
 * literal found in the file. This avoids flagging TypeScript identifiers like
 * `ConfigPackReceiptSummary` as containing the forbidden phrase "Receipts".
 */
function extractStringLiterals(rawSource) {
  const cleaned = strippedSource(rawSource);
  const literals = [];

  let i = 0;
  let line = 1;
  const len = cleaned.length;

  while (i < len) {
    const c = cleaned[i];
    if (c === "\n") {
      line += 1;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      const startLine = line;
      let j = i + 1;
      let body = "";
      while (j < len) {
        const ch = cleaned[j];
        if (ch === "\\") {
          // Skip escaped character
          body += ch + (cleaned[j + 1] ?? "");
          j += 2;
          continue;
        }
        if (ch === "\n") {
          line += 1;
          if (quote !== "`") {
            // Unterminated single-line string — bail to avoid runaway scan
            break;
          }
          body += ch;
          j += 1;
          continue;
        }
        if (ch === quote) {
          // End of literal
          j += 1;
          break;
        }
        body += ch;
        j += 1;
      }
      literals.push({ line: startLine, text: body });
      i = j;
      continue;
    }
    i += 1;
  }
  return literals;
}

async function scanFile(absolutePath) {
  const rel = relative(REPO_ROOT, absolutePath).replace(/\\/g, "/");
  if (ALLOWLIST.has(rel)) return;

  let text;
  try {
    text = await readFile(absolutePath, "utf8");
  } catch {
    return;
  }

  const literals = extractStringLiterals(text);
  for (const literal of literals) {
    for (const phrase of FORBIDDEN_PHRASES) {
      if (literal.text.includes(phrase)) {
        const snippet = literal.text.length > 160 ? literal.text.slice(0, 160) + "…" : literal.text;
        violations.push({
          file: rel,
          line: literal.line,
          phrase,
          snippet,
        });
      }
    }
  }
}

(async () => {
  for await (const file of walk(SCAN_ROOT)) {
    await scanFile(file);
  }

  const json = process.argv.includes("--json");

  if (violations.length === 0) {
    if (!json) {
      console.log("✓ Copy audit clean — no forbidden phrases in user-facing source.");
    } else {
      console.log(JSON.stringify({ ok: true, violations: [] }, null, 2));
    }
    process.exit(0);
  }

  if (json) {
    console.log(JSON.stringify({ ok: false, violations }, null, 2));
  } else {
    console.error(`✗ Copy audit failed — ${violations.length} forbidden phrase occurrence(s):\n`);
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}  ${JSON.stringify(v.phrase)}`);
      console.error(`    ${v.snippet}`);
    }
    console.error(
      "\nForbidden phrases must appear only inside <details> disclosures, or in copy.ts/test files.\n",
    );
  }
  process.exit(1);
})();
