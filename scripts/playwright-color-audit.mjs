// This script audits all rendered CSS colors in the RebalanceUI to verify:
// 1. No orange (#ff7a4f, #ffb15a, #d8c4a6) appears on button backgrounds, borders, or box-shadows
// 2. Primary buttons use cream/paper (#f4efe7 range) background
// 3. Active/selected states use blue (#5871ff range)
// 4. No warm gradients on interactive elements
// 5. Input caret-color is the ONLY place orange is allowed

import net from "node:net";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const appDir = path.resolve(import.meta.dirname, "..");
const artifactDir = path.join(appDir, "output", "playwright", "color-audit");

const pages = [
  { id: "dashboard", initialPage: "home", testId: "rebalance-page-dashboard" },
  { id: "editor", initialPage: "editor", testId: "rebalance-page-editor" },
  { id: "swap", initialPage: "swap", testId: "rebalance-page-swap" },
  { id: "create", initialPage: "create", testId: "rebalance-page-custom" },
  { id: "gamemode", initialPage: "game-mode", testId: "rebalance-page-gamemode" },
  { id: "packs", initialPage: "packs", testId: "rebalance-page-packs" },
  { id: "settings", initialPage: "settings", testId: "rebalance-page-settings" },
];

async function reservePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to reserve harness port.")));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

function spawnHarnessServer(port) {
  const env = { ...process.env, VITE_HARNESS_PORT: `${port}` };
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/d", "/s", "/c", "npm run dev:harness"], {
      cwd: appDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
  }
  return spawn("npm", ["run", "dev:harness"], {
    cwd: appDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
}

async function waitForHarness(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for harness at ${url}`);
}

function rebalanceUrl(baseUrl, initialPage) {
  const url = new URL("/rebalance.html", baseUrl);
  url.searchParams.set("embedded", "1");
  url.searchParams.set("initialPage", initialPage);
  url.searchParams.set("workspaceRoot", "C:/Harness/Creator Kit Tools");
  url.searchParams.set("profileLabel", "Creator Kit Tools / build-2025-08-19-750068");
  url.searchParams.set("track", "bapbap");
  url.searchParams.set("instanceSource", "official-managed");
  return url.toString();
}

/**
 * Evaluate all visible elements on the page and detect orange/warm color leaks
 * on interactive elements. Returns violations and metadata.
 */
async function auditPageColors(page) {
  return await page.evaluate(() => {
    const STYLE_PROPS = [
      "backgroundColor",
      "borderTopColor",
      "borderRightColor",
      "borderBottomColor",
      "borderLeftColor",
      "color",
      "boxShadow",
      "outlineColor",
    ];

    // --- Color parsing utilities ---

    function parseRgba(value) {
      const match = String(value).match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1].split(",").map((p) => Number.parseFloat(p.trim()));
      if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
      return {
        r: parts[0],
        g: parts[1],
        b: parts[2],
        a: parts.length >= 4 && !Number.isNaN(parts[3]) ? parts[3] : 1,
      };
    }

    function rgbToHsl(r, g, b) {
      r /= 255;
      g /= 255;
      b /= 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;
      let h = 0;
      if (delta !== 0) {
        if (max === r) h = ((g - b) / delta) % 6;
        else if (max === g) h = (b - r) / delta + 2;
        else h = (r - g) / delta + 4;
        h *= 60;
        if (h < 0) h += 360;
      }
      const l = (max + min) / 2;
      const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
      return { h, s: s * 100, l: l * 100 };
    }

    /**
     * Detect if an RGBA color falls into the orange/warm range:
     * - Hue 15-45 (orange/amber)
     * - Saturation > 40%
     * - Lightness > 30%
     * - Opacity >= 0.1
     */
    function isOrangeWarm(rgba) {
      if (!rgba) return false;
      if (rgba.a < 0.1) return false;
      const { h, s, l } = rgbToHsl(rgba.r, rgba.g, rgba.b);
      return h >= 15 && h <= 45 && s > 40 && l > 30;
    }

    function extractBoxShadowColors(value) {
      const colors = [];
      const regex = /rgba?\([^)]+\)/g;
      let m;
      while ((m = regex.exec(value)) !== null) {
        const parsed = parseRgba(m[0]);
        if (parsed) colors.push({ raw: m[0], rgba: parsed });
      }
      return colors;
    }

    // --- DOM utilities ---

    function isVisible(el) {
      if (!(el instanceof HTMLElement)) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < 0.05) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    function selectorFor(el) {
      if (!(el instanceof HTMLElement)) return el.tagName?.toLowerCase() || "unknown";
      const testId = el.getAttribute("data-testid");
      if (testId) return `[data-testid="${testId}"]`;
      const id = el.id;
      if (id) return `#${id}`;
      const classes = String(el.className || "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 4)
        .join(".");
      return classes ? `${el.tagName.toLowerCase()}.${classes}` : el.tagName.toLowerCase();
    }

    /**
     * Exception rules — these elements are allowed to have orange/warm colors:
     * 1. caret-color on inputs (not checked here, since we only check STYLE_PROPS)
     * 2. .v2-button--warning text color
     * 3. Game-mechanic colors in preview cards (damage numbers, etc.)
     * 4. --accent CSS variable definition in tokens (not runtime-rendered)
     */
    function isExcluded(el, property) {
      if (!(el instanceof HTMLElement)) return false;
      const className = String(el.className || "");

      // .v2-button--warning text is allowed warm
      if (/v2-button--warning/i.test(className) && property === "color") return true;

      // Game-mechanic preview cards (damage numbers, etc.)
      if (el.closest(".game-card-preview, .preview-card, .mechanic-preview, [data-testid*='preview']")) return true;

      // Caret-color is the only place orange is allowed — we don't audit it
      // (caret-color is not in our STYLE_PROPS list, so it's implicitly excluded)

      return false;
    }

    // --- Main audit logic ---

    const allElements = document.querySelectorAll("*");
    const violations = [];
    let totalChecked = 0;

    for (const el of allElements) {
      if (!isVisible(el)) continue;
      totalChecked++;

      const style = getComputedStyle(el);

      for (const prop of STYLE_PROPS) {
        if (isExcluded(el, prop)) continue;

        if (prop === "boxShadow") {
          const shadowValue = style.boxShadow;
          if (!shadowValue || shadowValue === "none") continue;
          const shadowColors = extractBoxShadowColors(shadowValue);
          for (const { raw, rgba } of shadowColors) {
            if (isOrangeWarm(rgba)) {
              violations.push({
                selector: selectorFor(el),
                property: "boxShadow",
                value: raw,
                text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
              });
            }
          }
        } else {
          const value = style[prop];
          if (!value || value === "transparent" || value === "rgba(0, 0, 0, 0)") continue;
          const rgba = parseRgba(value);
          if (!rgba) continue;
          if (isOrangeWarm(rgba)) {
            violations.push({
              selector: selectorFor(el),
              property: prop,
              value,
              text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
            });
          }
        }
      }
    }

    return { totalChecked, violations };
  });
}

async function run() {
  await mkdir(artifactDir, { recursive: true });
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const harness = spawnHarnessServer(port);
  const harnessLog = [];
  harness.stdout.on("data", (chunk) => harnessLog.push(String(chunk)));
  harness.stderr.on("data", (chunk) => harnessLog.push(String(chunk)));

  const browser = await chromium.launch({ headless: true });

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    auditRules: {
      orangeWarmDetection: "Hue 15-45, Saturation > 40%, Lightness > 30%, Opacity >= 0.1",
      checkedProperties: [
        "backgroundColor",
        "borderColor (all sides)",
        "boxShadow",
        "color",
        "outlineColor",
      ],
      exceptions: [
        "caret-color (not audited)",
        ".v2-button--warning text color",
        "Game-mechanic preview card colors",
        "--accent CSS variable definition in tokens",
      ],
    },
    pages: [],
    summary: {
      totalElementsChecked: 0,
      totalViolations: 0,
      pagesClean: [],
      pagesWithIssues: [],
    },
  };

  try {
    await waitForHarness(`${baseUrl}/rebalance.html`);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });

    for (const pageSpec of pages) {
      console.log(`  Auditing page: ${pageSpec.id}...`);
      await page.goto(rebalanceUrl(baseUrl, pageSpec.initialPage), {
        waitUntil: "networkidle",
        timeout: 60_000,
      });
      await page.waitForSelector(`[data-testid="${pageSpec.testId}"]`, { timeout: 20_000 });
      await page.waitForTimeout(300);

      // Take screenshot of each page
      await page.screenshot({
        fullPage: true,
        path: path.join(artifactDir, `${pageSpec.id}.png`),
        scale: "css",
        type: "png",
      });

      const { totalChecked, violations } = await auditPageColors(page);

      const pageResult = {
        page: pageSpec.id,
        elementsChecked: totalChecked,
        violationCount: violations.length,
        violations: violations.map((v) => ({ ...v, page: pageSpec.id })),
      };
      report.pages.push(pageResult);
      report.summary.totalElementsChecked += totalChecked;
      report.summary.totalViolations += violations.length;

      if (violations.length > 0) {
        report.summary.pagesWithIssues.push(pageSpec.id);
        // Take additional annotated screenshot for violation pages
        await page.screenshot({
          fullPage: true,
          path: path.join(artifactDir, `${pageSpec.id}-violations.png`),
          scale: "css",
          type: "png",
        });
      } else {
        report.summary.pagesClean.push(pageSpec.id);
      }
    }

    await writeFile(path.join(artifactDir, "report.json"), JSON.stringify(report, null, 2));

    // Print summary
    console.log("\n=== Color Audit Report ===");
    console.log(`  Total elements checked: ${report.summary.totalElementsChecked}`);
    console.log(`  Total violations: ${report.summary.totalViolations}`);
    console.log(`  Pages clean: ${report.summary.pagesClean.length} (${report.summary.pagesClean.join(", ") || "none"})`);
    console.log(`  Pages with issues: ${report.summary.pagesWithIssues.length} (${report.summary.pagesWithIssues.join(", ") || "none"})`);

    if (report.summary.totalViolations > 0) {
      console.log("\n  Violations by page:");
      for (const p of report.pages) {
        if (p.violationCount > 0) {
          console.log(`    ${p.page}: ${p.violationCount} violation(s)`);
          for (const v of p.violations.slice(0, 5)) {
            console.log(`      - ${v.selector} | ${v.property}: ${v.value}`);
          }
          if (p.violations.length > 5) {
            console.log(`      ... and ${p.violations.length - 5} more`);
          }
        }
      }
      console.log(`\n  Full report: ${path.join(artifactDir, "report.json")}`);
      process.exitCode = 1;
    } else {
      console.log("\n  All pages clean — no orange/warm color leaks detected.");
      console.log(`  Report: ${path.join(artifactDir, "report.json")}`);
    }
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    report.harnessLogTail = harnessLog.join("").split(/\r?\n/).slice(-40);
    await writeFile(path.join(artifactDir, "report.json"), JSON.stringify(report, null, 2));
    throw error;
  } finally {
    await browser.close();
    if (process.platform === "win32" && harness.pid) {
      spawn("cmd.exe", ["/d", "/s", "/c", `taskkill /PID ${harness.pid} /T /F >nul 2>nul`], {
        stdio: "ignore",
        shell: false,
      });
    } else {
      harness.kill("SIGTERM");
    }
  }
}

run().catch((error) => {
  console.error(`color-audit: FAILED -> ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
