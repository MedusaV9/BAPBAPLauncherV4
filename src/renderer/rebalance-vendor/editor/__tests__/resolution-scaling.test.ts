/**
 * Resolution Scaling Validation
 * Validates: Requirements 11.1, 11.2, 11.3
 *
 * Structural/content checks on CSS/TS files to verify:
 * 1. Motion system uses relative (small numeric) values for translations
 * 2. shell.css has responsive breakpoints at 1280px and 2560px
 * 3. tokens.css has @media (max-width: 1280px) block for spacing reduction
 * 4. CSS structure supports target viewports (1280x720, 1920x1080, 2560x1440, 3440x1440)
 */

import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const STYLES_DIR = path.resolve(__dirname, "../../styles");
const MOTION_PATH = path.resolve(__dirname, "../motion.ts");

const shellCss = fs.readFileSync(path.join(STYLES_DIR, "layout/shell.css"), "utf-8");
const tokensCss = fs.readFileSync(path.join(STYLES_DIR, "tokens.css"), "utf-8");
const motionTs = fs.readFileSync(MOTION_PATH, "utf-8");

describe("Resolution Scaling Validation", () => {
  describe("1. Motion system uses scalable translation values", () => {
    it("should not use px units in y/x animation values", () => {
      // GSAP treats bare numbers as px internally, but the values should be small
      // enough to scale well. The key requirement is that motion.ts does NOT
      // use string px values like "14px" or "22px" for y/x translations.
      const pxPattern = /\b[xy]:\s*["'][^"']*px[^"']*["']/g;
      const matches = motionTs.match(pxPattern);
      expect(matches).toBeNull();
    });

    it("should use small numeric values (<=40) for y translations", () => {
      // Extract all y: <number> patterns from motion.ts
      const yPattern = /\by:\s*(-?\d+(?:\.\d+)?)/g;
      const yValues: number[] = [];
      let match: RegExpExecArray | null;
      while ((match = yPattern.exec(motionTs)) !== null) {
        yValues.push(Math.abs(Number(match[1])));
      }

      expect(yValues.length).toBeGreaterThan(0);
      // All y translation values should be small enough to scale proportionally
      for (const val of yValues) {
        expect(val).toBeLessThanOrEqual(40);
      }
    });

    it("should use small numeric values (<=40) for x translations", () => {
      // Extract all x: <number> patterns from motion.ts (excluding comments)
      const xPattern = /\bx:\s*(-?\d+(?:\.\d+)?)/g;
      const xValues: number[] = [];
      let match: RegExpExecArray | null;
      const lines = motionTs.split("\n");
      while ((match = xPattern.exec(motionTs)) !== null) {
        // Skip matches inside comments (// or * lines)
        const lineNum = motionTs.substring(0, match.index).split("\n").length - 1;
        const line = lines[lineNum]?.trim() ?? "";
        if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
        xValues.push(Math.abs(Number(match[1])));
      }

      expect(xValues.length).toBeGreaterThan(0);
      for (const val of xValues) {
        expect(val).toBeLessThanOrEqual(40);
      }
    });
  });

  describe("2. shell.css has responsive breakpoints", () => {
    it("should have a responsive breakpoint at 1280px", () => {
      expect(shellCss).toContain("@media (max-width: 1280px)");
    });

    it("should have an ultrawide breakpoint at 2560px", () => {
      expect(shellCss).toContain("@media (min-width: 2560px)");
    });
  });

  describe("3. tokens.css has responsive spacing reduction", () => {
    it("should have a @media (max-width: 1280px) block", () => {
      expect(tokensCss).toContain("@media (max-width: 1280px)");
    });

    it("should reduce spacing values in the 1280px media query", () => {
      // Extract the media query block content
      const mediaBlockMatch = tokensCss.match(
        /@media\s*\(max-width:\s*1280px\)\s*\{([\s\S]*?)\n\}/,
      );
      expect(mediaBlockMatch).not.toBeNull();
      const block = mediaBlockMatch![1];

      // Should contain reduced spacing tokens
      expect(block).toContain("--space-xs");
      expect(block).toContain("--space-sm");
      expect(block).toContain("--space-md");
      expect(block).toContain("--space-lg");
      expect(block).toContain("--space-xl");
      expect(block).toContain("--space-2xl");
    });
  });

  describe("4. Layout supports target viewports", () => {
    it("should define min-width: 0 for flexible content sizing", () => {
      expect(shellCss).toContain("min-width: 0");
    });

    it("should use max-width: none for standard viewports (no artificial cap)", () => {
      expect(shellCss).toContain("max-width: none");
    });

    it("should define max-width constraint for ultrawide (1400px)", () => {
      expect(shellCss).toContain("max-width: 1400px");
    });

    it("should handle viewports <=1280px with adjusted grid", () => {
      // The 1280px media query should adjust the grid template
      const mediaBlock = shellCss.match(
        /@media\s*\(max-width:\s*1280px\)\s*\{([\s\S]*?)\n\}/,
      );
      expect(mediaBlock).not.toBeNull();
      // Should have a narrower sidebar column in the responsive block
      expect(mediaBlock![1]).toContain("grid-template-columns");
    });

    it("should handle ultrawide viewports (>=2560px) with wider content", () => {
      const ultrawideBlock = shellCss.match(
        /@media\s*\(min-width:\s*2560px\)\s*\{([\s\S]*?)\n\}/,
      );
      expect(ultrawideBlock).not.toBeNull();
      // Should set max-width to 1400px for content at ultrawide
      expect(ultrawideBlock![1]).toContain("1400px");
    });
  });
});
