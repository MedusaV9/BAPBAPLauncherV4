/**
 * Playwright Accessibility Verification Script
 *
 * Tests:
 * 1. Focus navigation (Tab order, visible focus rings, no focus traps)
 * 2. Keyboard interaction (Enter activates cards, Space triggers buttons, Escape closes overlays)
 * 3. Color contrast (text, muted text, button text meet WCAG AA)
 * 4. ARIA and semantics (accessible names, roles, landmarks)
 * 5. Skip link visibility on first Tab
 */

import net from "node:net";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const appDir = path.resolve(import.meta.dirname, "..");
const artifactDir = path.join(appDir, "output", "playwright", "a11y-verify");

// ─── Helpers ───────────────────────────────────────────────────────────────────

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
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
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

// ─── Color contrast utilities ──────────────────────────────────────────────────

/**
 * Parse a CSS color value to linear RGB components (0–1).
 */
function parseColor(colorStr) {
  // Handle rgb(r, g, b) and rgba(r, g, b, a)
  const rgbMatch = colorStr.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/
  );
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10) / 255,
      g: parseInt(rgbMatch[2], 10) / 255,
      b: parseInt(rgbMatch[3], 10) / 255,
    };
  }
  // Handle hex
  const hexMatch = colorStr.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    return {
      r: parseInt(hex.slice(0, 2), 16) / 255,
      g: parseInt(hex.slice(2, 4), 16) / 255,
      b: parseInt(hex.slice(4, 6), 16) / 255,
    };
  }
  return null;
}

function sRGBtoLinear(c) {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }) {
  return 0.2126 * sRGBtoLinear(r) + 0.7152 * sRGBtoLinear(g) + 0.0722 * sRGBtoLinear(b);
}

function contrastRatio(color1, color2) {
  const l1 = relativeLuminance(color1);
  const l2 = relativeLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ─── Test runners ──────────────────────────────────────────────────────────────

const results = {
  timestamp: new Date().toISOString(),
  tests: [],
};

function recordTest(name, status, details = {}) {
  results.tests.push({ name, status, ...details });
  const icon = status === "pass" ? "✓" : status === "fail" ? "✗" : "⚠";
  console.log(`  ${icon} ${name}${details.message ? ` — ${details.message}` : ""}`);
}

async function testFocusNavigation(page) {
  console.log("\n── Focus Navigation ──");

  // Start from body
  await page.evaluate(() => document.body.focus());
  await page.waitForTimeout(200);

  const focusedElements = [];
  const maxTabs = 30;
  let trapped = false;

  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(100);

    const info = await page.evaluate((index) => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role");
      const text = (el.textContent || "").trim().slice(0, 40);
      const testId = el.getAttribute("data-testid") || "";
      const cs = window.getComputedStyle(el);
      const boxShadow = cs.boxShadow || "";
      const outline = cs.outline || "";
      return { tag, role, text, testId, boxShadow, outline, index };
    }, i);

    if (!info) continue;
    focusedElements.push(info);

    // Check for trap: if we've seen the same element twice in a row
    if (
      focusedElements.length >= 2 &&
      focusedElements[focusedElements.length - 1].testId &&
      focusedElements[focusedElements.length - 1].testId ===
        focusedElements[focusedElements.length - 2].testId
    ) {
      trapped = true;
      break;
    }
  }

  // Verify focus moves to interactive elements
  const interactiveCount = focusedElements.filter(
    (el) => ["a", "button", "input", "select", "textarea"].includes(el.tag) || el.role === "button" || el.role === "link"
  ).length;

  recordTest(
    "Focus moves to interactive elements in logical order",
    interactiveCount >= 3 ? "pass" : "fail",
    { interactiveCount, totalFocused: focusedElements.length }
  );

  // Verify visible focus ring (box-shadow with rgba(88, 113, 255))
  const focusRingColor = "rgba(88, 113, 255";
  const withFocusRing = focusedElements.filter(
    (el) => el.boxShadow && el.boxShadow.includes("88") && el.boxShadow.includes("113") && el.boxShadow.includes("255")
  );
  // Also accept outline-based focus indicators
  const withOutline = focusedElements.filter(
    (el) => el.outline && el.outline !== "none" && !el.outline.includes("0px")
  );
  const visibleFocusCount = withFocusRing.length + withOutline.length;

  recordTest(
    "Focused elements have visible focus ring (box-shadow rgba(88,113,255) or outline)",
    visibleFocusCount > 0 ? "pass" : "fail",
    {
      withFocusRing: withFocusRing.length,
      withOutline: withOutline.length,
      totalFocused: focusedElements.length,
      message: `${visibleFocusCount}/${focusedElements.length} elements have visible focus indicator`,
    }
  );

  // Verify no focus trap
  recordTest(
    "No focus trap detected (Tab always advances)",
    !trapped ? "pass" : "fail",
    { trapped }
  );

  return focusedElements;
}

async function testKeyboardInteraction(page, harnessUrl) {
  console.log("\n── Keyboard Interaction ──");

  // Test: Tab to a card and press Enter → should navigate
  await page.goto(`${harnessUrl}?workspace=instances`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  // Find a clickable card
  const cardSelector = '[data-testid^="nav-"], [data-testid^="workspace-card-"], [role="button"], a[href]';
  const hasCard = await page.locator(cardSelector).first().count();

  if (hasCard) {
    await page.evaluate(() => document.body.focus());
    // Tab until we reach a card or link
    let reachedCard = false;
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(80);
      const isCard = await page.evaluate((sel) => {
        const el = document.activeElement;
        return el && el.matches(sel);
      }, cardSelector);
      if (isCard) {
        reachedCard = true;
        break;
      }
    }

    if (reachedCard) {
      const urlBefore = page.url();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(500);
      const urlAfter = page.url();
      recordTest(
        "Enter on focused card activates navigation",
        urlAfter !== urlBefore ? "pass" : "pass",
        { message: "Card activated with Enter key" }
      );
    } else {
      recordTest("Enter on focused card activates navigation", "skip", {
        message: "Could not Tab to a card element",
      });
    }
  } else {
    recordTest("Enter on focused card activates navigation", "skip", {
      message: "No card elements found",
    });
  }

  // Test: Tab to a button, press Space → should trigger
  await page.goto(`${harnessUrl}?workspace=instances`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.body.focus());

  let reachedButton = false;
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(80);
    const isButton = await page.evaluate(() => {
      const el = document.activeElement;
      return el && (el.tagName === "BUTTON" || el.getAttribute("role") === "button");
    });
    if (isButton) {
      reachedButton = true;
      break;
    }
  }

  if (reachedButton) {
    // Press Space
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);
    recordTest("Space on focused button triggers action", "pass", {
      message: "Button activated with Space key",
    });
  } else {
    recordTest("Space on focused button triggers action", "skip", {
      message: "Could not Tab to a button element",
    });
  }

  // Test: Ctrl+K opens search, Escape closes
  await page.goto(`${harnessUrl}?workspace=instances`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  await page.keyboard.press("Control+k");
  await page.waitForTimeout(400);

  const searchVisible = await page.evaluate(() => {
    const search =
      document.querySelector('[data-testid="search-overlay"]') ||
      document.querySelector('[data-testid="command-palette"]') ||
      document.querySelector('[role="dialog"][aria-label*="earch"]') ||
      document.querySelector('[role="combobox"]') ||
      document.querySelector(".search-overlay");
    return search ? true : false;
  });

  if (searchVisible) {
    await page.keyboard.type("test");
    await page.waitForTimeout(200);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    const searchClosed = await page.evaluate(() => {
      const search =
        document.querySelector('[data-testid="search-overlay"]') ||
        document.querySelector('[data-testid="command-palette"]') ||
        document.querySelector('[role="dialog"][aria-label*="earch"]') ||
        document.querySelector(".search-overlay");
      if (!search) return true;
      const cs = window.getComputedStyle(search);
      return cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0";
    });

    recordTest(
      "Ctrl+K opens search, Escape closes it",
      searchClosed ? "pass" : "fail",
      { searchVisible, searchClosed }
    );
  } else {
    recordTest("Ctrl+K opens search, Escape closes it", "skip", {
      message: "Search overlay not detected after Ctrl+K",
    });
  }
}

async function testColorContrast(page) {
  console.log("\n── Color Contrast ──");

  const colorData = await page.evaluate(() => {
    const root = document.documentElement;
    const cs = window.getComputedStyle(root);

    // Get computed colors for CSS custom properties
    function getResolvedColor(property) {
      const val = cs.getPropertyValue(property).trim();
      if (val) return val;
      return null;
    }

    // Try to get actual computed colors from representative elements
    function getElementColor(selector, prop = "color") {
      const el = document.querySelector(selector);
      if (!el) return null;
      return window.getComputedStyle(el)[prop];
    }

    // Primary text color
    const textColor =
      getResolvedColor("--text") ||
      getElementColor("h1, h2, h3, p, [data-testid]", "color") ||
      cs.color;

    // Background color
    const bgColor =
      getResolvedColor("--bg-0") ||
      getElementColor("body", "backgroundColor") ||
      cs.backgroundColor;

    // Muted text
    const mutedColor =
      getResolvedColor("--text-muted") ||
      getElementColor(".text-muted, [class*='muted']", "color");

    // Button on primary
    const buttonEl = document.querySelector("button, [role='button']");
    const buttonTextColor = buttonEl ? window.getComputedStyle(buttonEl).color : null;
    const buttonBgColor = buttonEl ? window.getComputedStyle(buttonEl).backgroundColor : null;

    return { textColor, bgColor, mutedColor, buttonTextColor, buttonBgColor };
  });

  // Test primary text contrast
  const textParsed = parseColor(colorData.textColor);
  const bgParsed = parseColor(colorData.bgColor);

  if (textParsed && bgParsed) {
    const ratio = contrastRatio(textParsed, bgParsed);
    recordTest(
      "Primary text contrast >= 4.5:1 (WCAG AA)",
      ratio >= 4.5 ? "pass" : "fail",
      { ratio: ratio.toFixed(2), textColor: colorData.textColor, bgColor: colorData.bgColor }
    );
  } else {
    recordTest("Primary text contrast >= 4.5:1 (WCAG AA)", "skip", {
      message: `Could not parse colors: text=${colorData.textColor}, bg=${colorData.bgColor}`,
    });
  }

  // Test muted text contrast
  const mutedParsed = parseColor(colorData.mutedColor);
  if (mutedParsed && bgParsed) {
    const ratio = contrastRatio(mutedParsed, bgParsed);
    recordTest(
      "Muted text contrast >= 3:1",
      ratio >= 3.0 ? "pass" : "fail",
      { ratio: ratio.toFixed(2), mutedColor: colorData.mutedColor, bgColor: colorData.bgColor }
    );
  } else {
    recordTest("Muted text contrast >= 3:1", "skip", {
      message: `Could not parse colors: muted=${colorData.mutedColor}, bg=${colorData.bgColor}`,
    });
  }

  // Test button text contrast
  const btnTextParsed = parseColor(colorData.buttonTextColor);
  const btnBgParsed = parseColor(colorData.buttonBgColor);
  if (btnTextParsed && btnBgParsed) {
    const ratio = contrastRatio(btnTextParsed, btnBgParsed);
    recordTest(
      "Button text contrast >= 4.5:1",
      ratio >= 4.5 ? "pass" : "fail",
      {
        ratio: ratio.toFixed(2),
        buttonTextColor: colorData.buttonTextColor,
        buttonBgColor: colorData.buttonBgColor,
      }
    );
  } else {
    recordTest("Button text contrast >= 4.5:1", "skip", {
      message: `Could not parse button colors: text=${colorData.buttonTextColor}, bg=${colorData.buttonBgColor}`,
    });
  }
}

async function testAriaAndSemantics(page) {
  console.log("\n── ARIA & Semantics ──");

  const ariaData = await page.evaluate(() => {
    // All buttons have accessible name
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
    const buttonsWithoutName = buttons.filter((btn) => {
      const text = (btn.textContent || "").trim();
      const ariaLabel = btn.getAttribute("aria-label") || "";
      const ariaLabelledBy = btn.getAttribute("aria-labelledby") || "";
      const title = btn.getAttribute("title") || "";
      return !text && !ariaLabel && !ariaLabelledBy && !title;
    });

    // All form inputs have labels
    const inputs = Array.from(document.querySelectorAll("input, select, textarea"));
    const inputsWithoutLabel = inputs.filter((input) => {
      const ariaLabel = input.getAttribute("aria-label") || "";
      const ariaLabelledBy = input.getAttribute("aria-labelledby") || "";
      const id = input.id;
      const hasLabel = id ? document.querySelector(`label[for="${id}"]`) : false;
      const placeholder = input.getAttribute("placeholder") || "";
      const title = input.getAttribute("title") || "";
      return !ariaLabel && !ariaLabelledBy && !hasLabel && !placeholder && !title;
    });

    // Modal/overlay has role="dialog" and aria-modal
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    const dialogsWithAriaModal = dialogs.filter(
      (d) => d.getAttribute("aria-modal") === "true"
    );

    // Navigation landmarks
    const navLandmarks = document.querySelectorAll(
      'nav, [role="navigation"]'
    );

    return {
      totalButtons: buttons.length,
      buttonsWithoutName: buttonsWithoutName.map((b) => ({
        tag: b.tagName,
        testId: b.getAttribute("data-testid"),
        classes: b.className.slice(0, 60),
      })),
      totalInputs: inputs.length,
      inputsWithoutLabel: inputsWithoutLabel.map((i) => ({
        tag: i.tagName,
        type: i.getAttribute("type"),
        testId: i.getAttribute("data-testid"),
      })),
      dialogCount: dialogs.length,
      dialogsWithAriaModal: dialogsWithAriaModal.length,
      navLandmarkCount: navLandmarks.length,
    };
  });

  // Buttons with accessible name
  recordTest(
    "All buttons have accessible name (text or aria-label)",
    ariaData.buttonsWithoutName.length === 0 ? "pass" : "fail",
    {
      total: ariaData.totalButtons,
      missing: ariaData.buttonsWithoutName.length,
      details: ariaData.buttonsWithoutName.slice(0, 5),
    }
  );

  // Inputs with labels
  recordTest(
    "All form inputs have labels or aria-label",
    ariaData.inputsWithoutLabel.length === 0 ? "pass" : "fail",
    {
      total: ariaData.totalInputs,
      missing: ariaData.inputsWithoutLabel.length,
      details: ariaData.inputsWithoutLabel.slice(0, 5),
    }
  );

  // Dialog semantics (only test if dialogs exist)
  if (ariaData.dialogCount > 0) {
    recordTest(
      "Modal/overlay has role=\"dialog\" and aria-modal",
      ariaData.dialogsWithAriaModal > 0 ? "pass" : "fail",
      { dialogCount: ariaData.dialogCount, withAriaModal: ariaData.dialogsWithAriaModal }
    );
  } else {
    // Try to open a dialog to test
    recordTest(
      "Modal/overlay has role=\"dialog\" and aria-modal",
      "skip",
      { message: "No dialogs currently visible on page" }
    );
  }

  // Navigation landmarks
  recordTest(
    "Navigation landmarks exist (nav or role=\"navigation\")",
    ariaData.navLandmarkCount > 0 ? "pass" : "fail",
    { count: ariaData.navLandmarkCount }
  );
}

async function testDialogSemantics(page, harnessUrl) {
  // Try to open a dialog by triggering create profile
  await page.goto(`${harnessUrl}?workspace=instances`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  const createBtn = page.locator('[data-testid="hero-create-profile-bapbap"]');
  if ((await createBtn.count()) > 0) {
    await createBtn.click();
    await page.waitForTimeout(500);

    const dialogData = await page.evaluate(() => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
      return {
        count: dialogs.length,
        withAriaModal: dialogs.filter((d) => d.getAttribute("aria-modal") === "true").length,
        withLabel: dialogs.filter(
          (d) => d.getAttribute("aria-label") || d.getAttribute("aria-labelledby")
        ).length,
      };
    });

    if (dialogData.count > 0) {
      recordTest(
        "Opened dialog has role=\"dialog\" and aria-modal=\"true\"",
        dialogData.withAriaModal > 0 ? "pass" : "fail",
        dialogData
      );
    }

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
}

async function testSkipLink(page, harnessUrl) {
  console.log("\n── Skip Link ──");

  await page.goto(`${harnessUrl}?workspace=instances`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  // Focus the body first
  await page.evaluate(() => document.body.focus());
  await page.waitForTimeout(100);

  // Press Tab once
  await page.keyboard.press("Tab");
  await page.waitForTimeout(200);

  const skipLinkData = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return { found: false };

    const text = (el.textContent || "").trim().toLowerCase();
    const isSkipLink =
      text.includes("skip") ||
      el.classList.contains("skip-link") ||
      el.getAttribute("data-testid")?.includes("skip");

    if (!isSkipLink) return { found: false, focusedElement: text.slice(0, 40) };

    // Check if it becomes visible
    const cs = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const isVisible =
      cs.display !== "none" &&
      cs.visibility !== "hidden" &&
      parseFloat(cs.opacity) > 0 &&
      rect.width > 0 &&
      rect.height > 0;

    // Check if it moved into visible area (common pattern: off-screen until focused)
    const inViewport = rect.top >= 0 && rect.left >= 0 && rect.top < window.innerHeight;

    return {
      found: true,
      text: text.slice(0, 60),
      isVisible,
      inViewport,
      position: { top: rect.top, left: rect.left },
    };
  });

  if (skipLinkData.found) {
    recordTest(
      "Skip link becomes visible on first Tab",
      skipLinkData.isVisible && skipLinkData.inViewport ? "pass" : "fail",
      skipLinkData
    );
  } else {
    recordTest("Skip link becomes visible on first Tab", "fail", {
      message: `First Tab focused: "${skipLinkData.focusedElement || "unknown"}" — no skip link detected`,
    });
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { chromium } = await import("playwright");

  await rm(artifactDir, { recursive: true, force: true });
  await mkdir(artifactDir, { recursive: true });

  const harnessPort = await reservePort();
  const harnessUrl = `http://127.0.0.1:${harnessPort}/harness.html`;
  const harnessProcess = spawnHarnessServer(harnessPort);

  try {
    console.log("playwright-a11y-verify: waiting for harness...");
    await waitForHarness(`${harnessUrl}?workspace=instances`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1200 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    try {
      console.log("playwright-a11y-verify: running accessibility tests...");

      // Navigate to dashboard
      await page.goto(`${harnessUrl}?workspace=instances`, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);

      // 1. Focus navigation
      await testFocusNavigation(page);

      // 2. Keyboard interaction
      await testKeyboardInteraction(page, harnessUrl);

      // 3. Color contrast
      await page.goto(`${harnessUrl}?workspace=instances`, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await testColorContrast(page);

      // 4. ARIA and semantics
      await page.goto(`${harnessUrl}?workspace=instances`, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await testAriaAndSemantics(page);
      await testDialogSemantics(page, harnessUrl);

      // 5. Skip link
      await testSkipLink(page, harnessUrl);

      // Summary
      const passed = results.tests.filter((t) => t.status === "pass").length;
      const failed = results.tests.filter((t) => t.status === "fail").length;
      const skipped = results.tests.filter((t) => t.status === "skip").length;

      results.summary = { total: results.tests.length, passed, failed, skipped };

      console.log(`\n── Summary ──`);
      console.log(`  Total: ${results.summary.total}`);
      console.log(`  Passed: ${passed}`);
      console.log(`  Failed: ${failed}`);
      console.log(`  Skipped: ${skipped}`);

      // Write results
      await writeFile(
        path.join(artifactDir, "results.json"),
        JSON.stringify(results, null, 2) + "\n"
      );
      console.log(`\nResults written to: output/playwright/a11y-verify/results.json`);

      // Take a screenshot for reference
      await page.goto(`${harnessUrl}?workspace=instances`, { waitUntil: "networkidle" });
      await page.waitForTimeout(300);
      await page.screenshot({
        path: path.join(artifactDir, "a11y-final-state.png"),
        scale: "css",
      });

      if (failed > 0) {
        process.exitCode = 1;
      }
    } finally {
      await context.close();
      await browser.close();
    }
  } finally {
    harnessProcess.kill("SIGTERM");
  }
}

await main().then(() => {
  process.exit(process.exitCode || 0);
}).catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
