import net from "node:net";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const appDir = path.resolve(import.meta.dirname, "..");
const artifactDir = path.join(appDir, "output", "playwright", "rebalance-ui-audit");

const viewports = [
  { id: "1280x720", width: 1280, height: 720 },
  { id: "1920x1080", width: 1920, height: 1080 },
  { id: "2560x1440", width: 2560, height: 1440 },
  { id: "3440x1440", width: 3440, height: 1440 },
];

const pages = [
  { id: "home", initialPage: "home", testId: "rebalance-page-dashboard" },
  { id: "change", initialPage: "editor", testId: "rebalance-page-editor" },
  { id: "game-mode", initialPage: "game-mode", testId: "rebalance-page-gamemode" },
  { id: "swap", initialPage: "swap", testId: "rebalance-page-swap" },
  { id: "create", initialPage: "create", testId: "rebalance-page-custom" },
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
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function spawnHarnessServer(port) {
  const env = {
    ...process.env,
    VITE_HARNESS_PORT: `${port}`,
  };
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

async function auditCurrentDom(page, label, viewport) {
  const result = await page.evaluate(
    ({ currentLabel, currentViewport }) => {
      const root = document.documentElement;
      const bodyText = document.body.innerText.replace(/\s+/g, " ").trim();
      const colorProps = [
        "color",
        "backgroundColor",
        "borderTopColor",
        "borderRightColor",
        "borderBottomColor",
        "borderLeftColor",
        "outlineColor",
      ];
      const interactiveSelector = [
        "button",
        "input",
        "select",
        "textarea",
        "[role='button']",
        ".task-choice",
        ".task-record",
        ".task-quick-control",
        ".task-value-browser-row",
        ".task-swap-source-card",
        ".support-card",
      ].join(",");

      function parseColor(value) {
        const match = String(value).match(/rgba?\(([^)]+)\)/i);
        if (!match) return null;
        const parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
        if (parts.length < 3 || parts.some((part, index) => index < 3 && Number.isNaN(part))) return null;
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

      function isVisible(element) {
        if (!(element instanceof HTMLElement)) return false;
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < 0.05) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 1 && rect.height > 1;
      }

      function selectorFor(element) {
        if (!(element instanceof HTMLElement)) return element.tagName.toLowerCase();
        const testId = element.getAttribute("data-testid");
        if (testId) return `[data-testid="${testId}"]`;
        const className = String(element.className || "").split(/\s+/).filter(Boolean).slice(0, 4).join(".");
        return className ? `${element.tagName.toLowerCase()}.${className}` : element.tagName.toLowerCase();
      }

      const visibleElements = Array.from(document.querySelectorAll(interactiveSelector)).filter(isVisible);
      const horizontalOffscreen = [];
      const autoContent = [];
      const greenish = [];

      for (const element of visibleElements) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (rect.left < -4 || rect.right > window.innerWidth + 4) {
          horizontalOffscreen.push({
            selector: selectorFor(element),
            text: element.textContent?.replace(/\s+/g, " ").trim().slice(0, 90) ?? "",
            left: Math.round(rect.left),
            right: Math.round(rect.right),
          });
        }
        if (style.contentVisibility === "auto") {
          autoContent.push({
            selector: selectorFor(element),
            text: element.textContent?.replace(/\s+/g, " ").trim().slice(0, 90) ?? "",
          });
        }
        for (const prop of colorProps) {
          const value = style[prop];
          if (isGreenOrTeal(value)) {
            greenish.push({
              selector: selectorFor(element),
              prop,
              value,
              text: element.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ?? "",
            });
            break;
          }
        }
      }

      const rootRect = document.querySelector("[data-testid='rebalance-embedded-root']")?.getBoundingClientRect();
      return {
        label: currentLabel,
        viewport: currentViewport,
        bodyTextLength: bodyText.length,
        document: {
          clientWidth: root.clientWidth,
          scrollWidth: root.scrollWidth,
          clientHeight: root.clientHeight,
          scrollHeight: root.scrollHeight,
        },
        embeddedRoot: rootRect
          ? {
              left: Math.round(rootRect.left),
              right: Math.round(rootRect.right),
              width: Math.round(rootRect.width),
              height: Math.round(rootRect.height),
            }
          : null,
        horizontalOverflow: root.scrollWidth > root.clientWidth + 4,
        horizontalOffscreen: horizontalOffscreen.slice(0, 12),
        autoContent: autoContent.slice(0, 12),
        greenish: greenish.slice(0, 12),
      };
    },
    { currentLabel: label, currentViewport: viewport },
  );

  const failures = [];
  if (result.bodyTextLength < 40) failures.push("page body has too little visible text");
  if (result.horizontalOverflow) failures.push(`document has horizontal overflow (${result.document.scrollWidth} > ${result.document.clientWidth})`);
  if (result.horizontalOffscreen.length) failures.push(`visible controls are offscreen horizontally: ${JSON.stringify(result.horizontalOffscreen)}`);
  if (result.autoContent.length) failures.push(`visible interactive surfaces still use content-visibility:auto: ${JSON.stringify(result.autoContent)}`);
  if (result.greenish.length) failures.push(`green/teal UI colors found: ${JSON.stringify(result.greenish)}`);
  return { result, failures };
}

async function verifyDrawerNavigation(page, viewport) {
  const toolsButton = page.getByRole("button", { name: /^Tools$/ }).first();
  await toolsButton.click();
  await page.waitForSelector(".rebalance-workspace-drawer", { timeout: 10_000 });
  await screenshot(page, `${viewport.id}-drawer-nav.png`);
  const labels = await page.locator(".rebalance-workspace-drawer .rebalance-embedded-nav-chip-label").evaluateAll((nodes) =>
    nodes.map((node) => node.textContent?.trim()).filter(Boolean),
  );
  const expected = ["Home", "Change", "Game Mode", "Swap", "Create", "Packs", "Help", "Settings"];
  const unexpected = labels.filter((label) => !expected.includes(label));
  const missing = expected.filter((label) => !labels.includes(label));
  if (unexpected.length || missing.length) {
    throw new Error(`Drawer nav mismatch for ${viewport.id}: labels=${JSON.stringify(labels)}, missing=${JSON.stringify(missing)}, unexpected=${JSON.stringify(unexpected)}`);
  }
  await page.keyboard.press("Escape");
}

async function verifyGlobalSearch(page, pageSpec, viewport) {
  await page.locator('[data-testid="rebalance-embedded-global-search-trigger"]').first().click();
  await page.waitForSelector('[data-testid="rebalance-embedded-global-search-overlay"] .rebalance-global-search-dialog', { timeout: 10_000 });
  await page.getByLabel("Search all Rebalance data").fill("Fire Wave");
  await page.waitForSelector(".rebalance-global-search-results", { timeout: 10_000 });
  await screenshot(page, `${viewport.id}-${pageSpec.id}-global-search.png`);
  await page.keyboard.press("Escape");
  await page.waitForSelector('[data-testid="rebalance-embedded-global-search-overlay"]', { state: "detached", timeout: 10_000 });
}

async function exercisePage(page, pageSpec, viewport) {
  if (pageSpec.id === "home" && (viewport.id === "1280x720" || viewport.id === "3440x1440")) {
    await verifyGlobalSearch(page, pageSpec, viewport);
    await verifyDrawerNavigation(page, viewport);
    return;
  }

  if (pageSpec.id === "change") {
    await page.getByRole("button", { name: "All values" }).click();
    await page.waitForSelector(".task-value-browser--editor .task-value-browser-detail-stack", { timeout: 10_000 });
    await page.waitForSelector(".task-value-browser--editor .task-value-browser-row", { timeout: 10_000 });
    await screenshot(page, `${viewport.id}-change-all-values.png`);
    return;
  }

  if (pageSpec.id === "game-mode") {
    for (const label of ["Rules", "Zone", "Lobby", "Bots", "Presets", "Experimental"]) {
      const button = page.getByRole("button", { name: label }).first();
      if (await button.count()) {
        await button.click();
        await page.waitForTimeout(80);
      }
    }
    await page.getByRole("button", { name: "Change source" }).first().click();
    await page.waitForSelector("text=Choose one source", { timeout: 10_000 });
    await screenshot(page, `${viewport.id}-game-mode-source-drawer.png`);
    await page.keyboard.press("Escape");
    return;
  }

  if (pageSpec.id === "swap") {
    await page.getByRole("button", { name: "Browse sources" }).last().click();
    await page.waitForSelector("text=Source browser", { timeout: 10_000 });
    await screenshot(page, `${viewport.id}-swap-source-drawer.png`);
    const otherSources = page.getByRole("button", { name: "Other sources" }).first();
    if (await otherSources.count()) {
      await otherSources.click();
      await page.waitForTimeout(120);
    }
    await page.keyboard.press("Escape");
    return;
  }

  if (pageSpec.id === "create") {
    await page.locator('[data-testid="rebalance-page-custom"]').getByRole("button", { name: "Tools" }).click();
    await page.waitForSelector('[data-testid="rebalance-create-picker-sheet"] .task-picker-sheet', { timeout: 10_000 });
    await page.waitForSelector('[data-testid="rebalance-create-picker-sheet"] textarea', { timeout: 10_000 });
    await screenshot(page, `${viewport.id}-create-tools-drawer.png`);
    await page.keyboard.press("Escape");
    return;
  }

  if (pageSpec.id === "packs") {
    for (const label of ["Import", "Export", "Installed"]) {
      await page.getByRole("button", { name: label }).click();
      await page.waitForTimeout(100);
    }
    return;
  }

  if (pageSpec.id === "settings") {
    const folders = page.getByRole("button", { name: "Folders" }).first();
    if (await folders.count()) {
      await folders.click();
      await page.waitForTimeout(100);
    }
  }
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
  };

  try {
    await waitForHarness(`${baseUrl}/rebalance.html`);
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(error.message);
    });

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const pageSpec of pages) {
        const label = `${viewport.id}-${pageSpec.id}`;
        await page.goto(rebalanceUrl(baseUrl, pageSpec.initialPage), { waitUntil: "networkidle", timeout: 60_000 });
        await page.waitForSelector(`[data-testid="${pageSpec.testId}"]`, { timeout: 20_000 });
        await page.waitForTimeout(180);
        await screenshot(page, `${label}.png`);
        await exercisePage(page, pageSpec, viewport);
        const { result, failures } = await auditCurrentDom(page, label, viewport);
        summary.pages.push({ page: pageSpec.id, viewport: viewport.id, metrics: result, failures });
        if (failures.length) {
          throw new Error(`${label} failed audit: ${failures.join("; ")}`);
        }
      }
    }

    const severeConsoleErrors = consoleErrors.filter((text) => !/favicon|manifest|source map/i.test(text));
    summary.consoleErrors = severeConsoleErrors;
    if (severeConsoleErrors.length) {
      throw new Error(`Console errors during Rebalance UI audit: ${JSON.stringify(severeConsoleErrors.slice(0, 8))}`);
    }

    await writeFile(path.join(artifactDir, "summary.json"), JSON.stringify(summary, null, 2));
    console.log(`rebalance-ui-audit: OK (${summary.pages.length} page/viewport checks)`);
    console.log(`rebalance-ui-audit: artifacts ${artifactDir}`);
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
    summary.harnessLogTail = harnessLog.join("").split(/\r?\n/).slice(-80);
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
  console.error(`rebalance-ui-audit: FAILED -> ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
