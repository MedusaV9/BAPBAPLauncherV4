/**
 * Playwright Visual Regression Baseline
 *
 * Captures baseline screenshots of all 7 Rebalance UI pages at two key viewports
 * (1280×720 and 3440×1440) for future visual regression comparison.
 *
 * Verifies:
 * - No horizontal overflow at either viewport
 * - No green/teal UI colors present
 * - Content containment at ultrawide (≤1920px centered)
 *
 * Usage: npm run playwright:visual-regression-baseline
 */
import net from "node:net";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const appDir = path.resolve(import.meta.dirname, "..");
const artifactDir = path.join(appDir, "output", "playwright", "visual-regression-baseline");

const viewports = [
  { id: "1280x720", width: 1280, height: 720 },
  { id: "3440x1440", width: 3440, height: 1440 },
];

const pages = [
  { id: "home", initialPage: "home", testId: "rebalance-page-dashboard" },
  { id: "change", initialPage: "editor", testId: "rebalance-page-editor" },
  { id: "create", initialPage: "create", testId: "rebalance-page-custom" },
  { id: "swap", initialPage: "swap", testId: "rebalance-page-swap" },
  { id: "game-mode", initialPage: "game-mode", testId: "rebalance-page-gamemode" },
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

async function screenshot(page, fileName) {
  await page.screenshot({
    fullPage: true,
    path: path.join(artifactDir, fileName),
    scale: "css",
    type: "png",
  });
}

/**
 * Audits the current DOM state for visual regressions:
 * - horizontal overflow
 * - green/teal colors in UI elements
 * - content containment at ultrawide
 */
async function auditPage(page, label, viewport) {
  const result = await page.evaluate(
    ({ currentLabel, currentViewport }) => {
      const root = document.documentElement;
      const colorProps = [
        "color",
        "backgroundColor",
        "borderTopColor",
        "borderRightColor",
        "borderBottomColor",
        "borderLeftColor",
      ];
      const interactiveSelector = [
        "button", "input", "select", "textarea",
        "[role='button']", ".support-card", ".task-choice",
        ".task-record", ".task-quick-control",
        ".task-value-browser-row", ".task-swap-source-card",
      ].join(",");

      function parseColor(value) {
        const match = String(value).match(/rgba?\(([^)]+)\)/i);
        if (!match) return null;
        const parts = match[1].split(",").map((p) => Number.parseFloat(p.trim()));
        if (parts.length < 3 || parts.some((p, i) => i < 3 && Number.isNaN(p))) return null;
        return { r: parts[0], g: parts[1], b: parts[2], a: parts.length >= 4 && !Number.isNaN(parts[3]) ? parts[3] : 1 };
      }

      function isGreenOrTeal(value) {
        const color = parseColor(value);
        if (!color || color.a < 0.08) return false;
        const r = color.r / 255;
        const g = color.g / 255;
        const b = color.b / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;
        if (delta < 0.1) return false;
        let hue = 0;
        if (max === r) hue = ((g - b) / delta) % 6;
        if (max === g) hue = (b - r) / delta + 2;
        if (max === b) hue = (r - g) / delta + 4;
        hue *= 60;
        if (hue < 0) hue += 360;
        const saturation = max === 0 ? 0 : delta / max;
        const lightness = (max + min) / 2;
        return hue >= 105 && hue <= 185 && saturation >= 0.22 && lightness >= 0.16;
      }

      function isVisible(el) {
        if (!(el instanceof HTMLElement)) return false;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < 0.05) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 1 && rect.height > 1;
      }

      function selectorFor(el) {
        if (!(el instanceof HTMLElement)) return el.tagName.toLowerCase();
        const testId = el.getAttribute("data-testid");
        if (testId) return `[data-testid="${testId}"]`;
        const cls = String(el.className || "").split(/\s+/).filter(Boolean).slice(0, 3).join(".");
        return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
      }

      const visibleElements = Array.from(document.querySelectorAll(interactiveSelector)).filter(isVisible);
      const greenish = [];

      for (const el of visibleElements) {
        const style = getComputedStyle(el);
        for (const prop of colorProps) {
          if (isGreenOrTeal(style[prop])) {
            greenish.push({ selector: selectorFor(el), prop, value: style[prop] });
            break;
          }
        }
      }

      // Content containment: embedded root should be ≤1920px wide
      const embeddedRoot = document.querySelector("[data-testid='rebalance-embedded-root']");
      const rootRect = embeddedRoot?.getBoundingClientRect();
      const contentContained = rootRect ? rootRect.width <= 1924 : null; // 4px tolerance

      // Clipped controls: check interactive elements are not clipped by overflow:hidden parents
      const clippedControls = [];
      for (const el of visibleElements) {
        const elRect = el.getBoundingClientRect();
        let parent = el.parentElement;
        while (parent && parent !== document.body) {
          const parentStyle = getComputedStyle(parent);
          if (parentStyle.overflow === "hidden" || parentStyle.overflowX === "hidden" || parentStyle.overflowY === "hidden") {
            const parentRect = parent.getBoundingClientRect();
            const tolerance = 2;
            if (
              elRect.right > parentRect.right + tolerance ||
              elRect.bottom > parentRect.bottom + tolerance ||
              elRect.left < parentRect.left - tolerance ||
              elRect.top < parentRect.top - tolerance
            ) {
              clippedControls.push({ selector: selectorFor(el), parentSelector: selectorFor(parent) });
              break;
            }
          }
          parent = parent.parentElement;
        }
      }

      return {
        label: currentLabel,
        viewport: currentViewport,
        horizontalOverflow: root.scrollWidth > root.clientWidth + 4,
        documentScrollWidth: root.scrollWidth,
        documentClientWidth: root.clientWidth,
        greenish: greenish.slice(0, 10),
        contentContained,
        embeddedRootWidth: rootRect ? Math.round(rootRect.width) : null,
        clippedControls: clippedControls.slice(0, 10),
      };
    },
    { currentLabel: label, currentViewport: viewport },
  );

  const failures = [];
  if (result.horizontalOverflow) {
    failures.push(`horizontal overflow: scrollWidth ${result.documentScrollWidth} > clientWidth ${result.documentClientWidth}`);
  }
  if (result.greenish.length) {
    failures.push(`green/teal UI colors: ${JSON.stringify(result.greenish)}`);
  }
  if (result.clippedControls && result.clippedControls.length) {
    failures.push(`clipped controls: ${JSON.stringify(result.clippedControls)}`);
  }
  if (viewport.width >= 2200 && result.contentContained === false) {
    failures.push(`content NOT contained at ultrawide: embedded root width = ${result.embeddedRootWidth}px (expected ≤1920px)`);
  }

  return { result, failures };
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
  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    viewports,
    pages: [],
    allPassed: true,
  };

  try {
    await waitForHarness(`${baseUrl}/rebalance.html`);
    const page = await browser.newPage();

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const pageSpec of pages) {
        const label = `${viewport.id}-${pageSpec.id}`;
        await page.goto(rebalanceUrl(baseUrl, pageSpec.initialPage), { waitUntil: "networkidle", timeout: 60_000 });
        await page.waitForSelector(`[data-testid="${pageSpec.testId}"]`, { timeout: 20_000 });
        await page.waitForTimeout(200);

        // Take baseline screenshot
        await screenshot(page, `${label}.png`);

        // Run audit checks
        const { result, failures } = await auditPage(page, label, viewport);
        summary.pages.push({ page: pageSpec.id, viewport: viewport.id, metrics: result, failures });

        if (failures.length) {
          summary.allPassed = false;
          console.warn(`  WARN [${label}]: ${failures.join("; ")}`);
        } else {
          console.log(`  OK   [${label}]`);
        }
      }
    }

    await writeFile(path.join(artifactDir, "summary.json"), JSON.stringify(summary, null, 2));

    if (summary.allPassed) {
      console.log(`\nvisual-regression-baseline: ALL PASSED (${summary.pages.length} page/viewport captures)`);
    } else {
      const failCount = summary.pages.filter((p) => p.failures.length > 0).length;
      console.error(`\nvisual-regression-baseline: ${failCount} page(s) have warnings`);
      process.exitCode = 1;
    }
    console.log(`visual-regression-baseline: screenshots saved to ${artifactDir}`);
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
    summary.harnessLogTail = harnessLog.join("").split(/\r?\n/).slice(-60);
    await writeFile(path.join(artifactDir, "summary.json"), JSON.stringify(summary, null, 2));
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
  console.error(`visual-regression-baseline: FAILED -> ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
