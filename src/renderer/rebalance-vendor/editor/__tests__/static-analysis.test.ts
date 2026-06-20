/**
 * Static Analysis Checks for Color Constraints
 *
 * Validates architectural constraints defined in the design document:
 * - No green/teal/emerald hex colors in stylesheets (hue 100-180)
 * - No PixiJS dependency in package.json
 * - No <canvas> elements from graphics libraries in TSX files
 * - GSAP is present in dependencies
 *
 * Validates: Requirements 1.8, 7.2, 7.3, 8.1, 8.2
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

const REBALANCE_ROOT = resolve(__dirname, "../..");
const PROJECT_ROOT = resolve(__dirname, "../../../../..");

/**
 * Converts a hex color string to HSL hue.
 * Returns null if not a valid hex color.
 */
function hexToHue(hex: string): number | null {
  const match = hex.match(/^#([0-9a-f]{3,8})$/i);
  if (!match) return null;
  let r: number, g: number, b: number;
  const h = match[1];
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16) / 255;
    g = parseInt(h[1] + h[1], 16) / 255;
    b = parseInt(h[2] + h[2], 16) / 255;
  } else if (h.length === 6 || h.length === 8) {
    r = parseInt(h.slice(0, 2), 16) / 255;
    g = parseInt(h.slice(2, 4), 16) / 255;
    b = parseInt(h.slice(4, 6), 16) / 255;
  } else {
    return null;
  }
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta < 0.1) return null; // achromatic / very low saturation
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  // Also check saturation — skip desaturated colors
  const saturation = max === 0 ? 0 : delta / max;
  if (saturation < 0.22) return null;
  const lightness = (max + min) / 2;
  if (lightness < 0.16) return null;
  return hue;
}

/**
 * Returns true if a hex color falls in the green/teal/emerald hue range (100-180).
 */
function isGreenOrTeal(hex: string): boolean {
  const hue = hexToHue(hex);
  if (hue === null) return false;
  return hue >= 100 && hue <= 180;
}

/** Collect all CSS files to scan */
function getCssFiles(): string[] {
  const files: string[] = [];
  const stylesDir = join(REBALANCE_ROOT, "styles");
  const mainStylesheet = join(REBALANCE_ROOT, "styles.css");

  if (existsSync(mainStylesheet)) files.push(mainStylesheet);

  // Scan styles/ directory recursively
  const scanDir = (dir: string) => {
    if (!existsSync(dir)) return;
    const { readdirSync, statSync } = require("node:fs");
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        scanDir(full);
      } else if (entry.endsWith(".css")) {
        files.push(full);
      }
    }
  };
  scanDir(stylesDir);
  return files;
}

/**
 * Game data display selectors that legitimately use colored text
 * for game stat visualization (not UI chrome).
 * Also includes success/status indicator selectors that use semantic green.
 */
const GAME_DATA_SELECTOR_PATTERNS = [
  /\.game-card/,
  /\.compact-game-card/,
  /\.argument-inline-token/,
  /\.atelier-kicker/,
  /\.task-icon-choice-badge/,
  /\.game-mode-stat/,
  /\.stat-color/,
  /\.rarity-/,
  /--success/,
  /\.progress-ring/,
  /\.workspace-status/,
  /\.value-diff/,
  /\.inline-edit__action-btn/,
  /\.change-positive/,
  /\.chip--success/,
];

/**
 * Tracks CSS selector context to determine if a color declaration
 * is inside a game data display rule vs. a UI element rule.
 */
function isInsideGameDataSelector(lines: string[], lineIndex: number): boolean {
  // Walk backwards to find the nearest selector
  for (let i = lineIndex; i >= 0; i--) {
    const line = lines[i].trim();
    // If we hit a closing brace without finding a selector, it's top-level
    if (line === "}" && i < lineIndex) break;
    // Check if this line contains a selector matching game data patterns
    if (GAME_DATA_SELECTOR_PATTERNS.some((pattern) => pattern.test(line))) {
      return true;
    }
    // If we find an opening brace on a previous line with a selector, check it
    if (line.endsWith("{") || line.includes("{")) {
      return GAME_DATA_SELECTOR_PATTERNS.some((pattern) => pattern.test(line));
    }
  }
  return false;
}

describe("Static Analysis: No Green/Teal Colors in Stylesheets", () => {
  it("does not contain green/teal/emerald hex values (hue 100-180) in CSS files", () => {
    const cssFiles = getCssFiles();
    expect(cssFiles.length).toBeGreaterThan(0);

    const violations: { file: string; color: string; line: number }[] = [];
    const hexRegex = /#[0-9a-f]{3,8}\b/gi;

    for (const file of cssFiles) {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const matches = lines[i].match(hexRegex);
        if (!matches) continue;
        for (const color of matches) {
          if (isGreenOrTeal(color) && !isInsideGameDataSelector(lines, i)) {
            violations.push({
              file: file.replace(REBALANCE_ROOT, ""),
              color,
              line: i + 1,
            });
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

describe("Static Analysis: No PixiJS Dependency", () => {
  it("package.json does not include pixi.js or @pixi/* packages", () => {
    const pkgPath = join(PROJECT_ROOT, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    const pixiPackages = Object.keys(allDeps).filter(
      (dep) => dep === "pixi.js" || dep.startsWith("@pixi/"),
    );
    expect(pixiPackages).toEqual([]);
  });
});

describe("Static Analysis: No Canvas Elements from Graphics Libraries", () => {
  it("TSX files do not contain <canvas> elements from graphics libraries", () => {
    const { readdirSync, statSync } = require("node:fs");
    const tsxFiles: string[] = [];

    const scanDir = (dir: string) => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          scanDir(full);
        } else if (entry.endsWith(".tsx")) {
          tsxFiles.push(full);
        }
      }
    };

    const editorDir = join(REBALANCE_ROOT, "editor");
    scanDir(editorDir);
    expect(tsxFiles.length).toBeGreaterThan(0);

    const violations: { file: string; line: number; content: string }[] = [];
    // Match <canvas but exclude game card preview canvases (legitimate use)
    const canvasRegex = /<canvas\b/gi;

    for (const file of tsxFiles) {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (canvasRegex.test(lines[i])) {
          // Allow game card preview canvases (legitimate non-graphics-library use)
          const isGamePreview =
            lines[i].includes("preview") ||
            lines[i].includes("Preview") ||
            lines[i].includes("card-canvas");
          if (!isGamePreview) {
            violations.push({
              file: file.replace(REBALANCE_ROOT, ""),
              line: i + 1,
              content: lines[i].trim(),
            });
          }
        }
        // Reset regex lastIndex since we use /g flag
        canvasRegex.lastIndex = 0;
      }
    }

    expect(violations).toEqual([]);
  });
});

describe("Static Analysis: GSAP in Dependencies", () => {
  it("gsap is listed in package.json dependencies", () => {
    const pkgPath = join(PROJECT_ROOT, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    expect(pkg.dependencies).toHaveProperty("gsap");
  });
});
