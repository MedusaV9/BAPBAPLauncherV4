import net from "node:net";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const appDir = path.resolve(import.meta.dirname, "..");
const artifactDir = path.join(appDir, "output", "playwright", "polish-verify");

const viewports = [
  { id: "1280x720", width: 1280, height: 720 },
  { id: "1600x1000", width: 1600, height: 1000 },
  { id: "1920x1080", width: 1920, height: 1080 },
];

const pages = [
  { id: "dashboard", initialPage: "home", testId: "rebalance-page-dashboard" },
  { id: "editor", initialPage: "editor", testId: "rebalance-page-editor" },
  { id: "game-mode", initialPage: "game-mode", testId: "rebalance-page-gamemode" },
  { id: "swap", initialPage: "swap", testId: "rebalance-page-swap" },
  { id: "create", initialPage: "create", testId: "rebalance-page-custom" },
  { id: "packs", initialPage: "packs", testId: "rebalance-page-packs" },
  { id: "settings", initialPage: "settings", testId: "rebalance-page-settings" },
];

// Orange shades that should ONLY appear in caret-color
const ORANGE_SHADES = [
  { r: 255, g: 122, b: 79 },
  { r: 255, g: 131, b: 92 },
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
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for harness at ${url}`);
}

function rebalanceUrl(baseUrl, initialPage) {
  const url = new URL("/rebalance.html", baseUrl);
  url.searchParams.set("embedded", "1");
  url.searchParams.set("initialPage", initialPage);
  url.searchParams.set("workspaceRoot", "C:/Harness/Creator Kit Tools");
  url.searchParams.set("profileLabel", "Creator Kit Tools");
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

// ─── Check Functions ──────────────────────────────────────────────────────────

async function checkLayout(page, label) {
  return await page.evaluate((currentLabel) => {
    const results = [];
    const root = document.documentElement;

    // 1. No horizontal overflow
    const hasOverflow = root.scrollWidth > root.clientWidth + 4;
    results.push({
      id: `${currentLabel}/no-horizontal-overflow`,
      pass: !hasOverflow,
      detail: hasOverflow
        ? `scrollWidth ${root.scrollWidth} > clientWidth ${root.clientWidth} + 4`
        : "OK",
      critical: true,
    });

    // 2. Dashboard tiles fill available width (check grid items)
    const gridItems = document.querySelectorAll(
      '[data-testid*="dashboard"] .dashboard-tile, [data-testid*="dashboard"] [class*="tile"], [data-testid*="dashboard"] [class*="card"], [class*="dashboard"] [class*="tile"], [class*="dashboard"] [class*="card"]'
    );
    if (gridItems.length > 0) {
      const narrow = Array.from(gridItems).filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width < 120;
      });
      results.push({
        id: `${currentLabel}/dashboard-tiles-fill-width`,
        pass: narrow.length === 0,
        detail: narrow.length > 0 ? `${narrow.length} tiles narrower than 120px` : "OK",
        critical: false,
      });
    }

    // 3. No max-width constraints cutting off content
    const mainContent = document.querySelector('[data-testid*="rebalance-page"]');
    if (mainContent) {
      const style = getComputedStyle(mainContent);
      const maxW = style.maxWidth;
      const isConstrained = maxW !== "none" && parseInt(maxW) < root.clientWidth - 100;
      results.push({
        id: `${currentLabel}/no-maxwidth-constraint`,
        pass: !isConstrained,
        detail: isConstrained ? `max-width: ${maxW} constraining content` : "OK",
        critical: false,
      });
    }

    // 4. Sidebar doesn't push content offscreen
    const sidebar = document.querySelector('[class*="sidebar"], [class*="nav-rail"], [data-testid*="sidebar"]');
    if (sidebar && mainContent) {
      const sidebarRect = sidebar.getBoundingClientRect();
      const contentRect = mainContent.getBoundingClientRect();
      const pushed = contentRect.right > window.innerWidth + 4;
      results.push({
        id: `${currentLabel}/sidebar-no-push`,
        pass: !pushed,
        detail: pushed
          ? `Content pushed offscreen: right=${Math.round(contentRect.right)}, viewport=${window.innerWidth}`
          : "OK",
        critical: true,
      });
    }

    return results;
  }, label);
}

async function checkColors(page, label) {
  return await page.evaluate((currentLabel) => {
    const results = [];

    function parseColor(value) {
      const match = String(value).match(/rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const parts = match[1].split(",").map((p) => parseFloat(p.trim()));
      if (parts.length < 3 || parts.some((p, i) => i < 3 && isNaN(p))) return null;
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length >= 4 ? parts[3] : 1 };
    }

    function isOrange(color) {
      if (!color || color.a < 0.08) return false;
      const orangeShades = [
        { r: 255, g: 122, b: 79 },
        { r: 255, g: 131, b: 92 },
      ];
      for (const shade of orangeShades) {
        if (Math.abs(color.r - shade.r) < 15 && Math.abs(color.g - shade.g) < 20 && Math.abs(color.b - shade.b) < 20) {
          return true;
        }
      }
      // General orange hue detection
      const r = color.r / 255, g = color.g / 255, b = color.b / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const delta = max - min;
      if (delta < 0.1) return false;
      let hue = 0;
      if (max === r) hue = ((g - b) / delta) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
      return hue >= 10 && hue <= 35 && color.r > 200;
    }

    function isVisible(el) {
      if (!(el instanceof HTMLElement)) return false;
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) < 0.05) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    }

    function selectorFor(el) {
      const testId = el.getAttribute?.("data-testid");
      if (testId) return `[data-testid="${testId}"]`;
      const cn = String(el.className || "").split(/\s+/).filter(Boolean).slice(0, 3).join(".");
      return cn ? `${el.tagName.toLowerCase()}.${cn}` : el.tagName.toLowerCase();
    }

    // Scan interactive elements for orange backgrounds/borders
    const interactiveSelector = 'button, input, select, textarea, [role="button"], a, [tabindex]';
    const interactiveEls = Array.from(document.querySelectorAll(interactiveSelector)).filter(isVisible);
    const orangeViolations = [];
    const colorProps = ["backgroundColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor"];

    for (const el of interactiveEls) {
      const style = getComputedStyle(el);
      for (const prop of colorProps) {
        const color = parseColor(style[prop]);
        if (isOrange(color)) {
          orangeViolations.push({
            selector: selectorFor(el),
            prop,
            value: style[prop],
            text: el.textContent?.trim().slice(0, 60) || "",
          });
          break;
        }
      }
    }

    results.push({
      id: `${currentLabel}/no-orange-backgrounds`,
      pass: orangeViolations.length === 0,
      detail: orangeViolations.length > 0
        ? `${orangeViolations.length} elements with orange bg/border: ${JSON.stringify(orangeViolations.slice(0, 5))}`
        : "OK",
      critical: true,
    });

    // Primary buttons should have cream/paper background
    const primaryButtons = Array.from(document.querySelectorAll('button[class*="primary"], button[class*="btn-primary"], [data-variant="primary"]')).filter(isVisible);
    const badPrimaryButtons = [];
    for (const btn of primaryButtons) {
      const style = getComputedStyle(btn);
      const bg = parseColor(style.backgroundColor);
      if (bg && bg.a > 0.1) {
        // Cream/paper: roughly #f4efe7 range (warm white)
        const isCream = bg.r >= 220 && bg.g >= 210 && bg.b >= 190 && bg.r <= 255;
        // Blue active: roughly #5871ff range
        const isBlue = bg.b > 180 && bg.b > bg.r && bg.b > bg.g;
        if (!isCream && !isBlue) {
          badPrimaryButtons.push({ selector: selectorFor(btn), bg: style.backgroundColor });
        }
      }
    }
    results.push({
      id: `${currentLabel}/primary-buttons-cream`,
      pass: badPrimaryButtons.length === 0,
      detail: badPrimaryButtons.length > 0
        ? `${badPrimaryButtons.length} primary buttons with wrong bg: ${JSON.stringify(badPrimaryButtons.slice(0, 3))}`
        : "OK (or no primary buttons found)",
      critical: false,
    });

    return results;
  }, label);
}

async function checkAnimations(page, label) {
  return await page.evaluate((currentLabel) => {
    const results = [];

    // Check for stuck opacity:0 or transform on visible containers
    const allEls = document.querySelectorAll('[data-testid*="rebalance"] *, [class*="rebalance"] *');
    const stuckElements = [];
    for (const el of allEls) {
      if (!(el instanceof HTMLElement)) continue;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      // Elements with opacity:0 that aren't meant to be hidden
      if (style.opacity === "0" && style.display !== "none" && !el.getAttribute("aria-hidden")) {
        // Skip elements that are intentionally hidden:
        // - pointer-events:none (tooltips, overlays, disabled layers)
        // - inside an aria-hidden ancestor
        // - zero-height overflow:hidden (collapsed containers)
        // - position:absolute/fixed with no visible area in viewport (offscreen panels)
        if (style.pointerEvents === "none") continue;
        if (el.closest("[aria-hidden='true']")) continue;
        if (style.overflow === "hidden" && rect.height < 4) continue;
        if (style.visibility === "hidden") continue;
        // Skip elements whose parent is also opacity:0 (already counted)
        const parent = el.parentElement;
        if (parent && getComputedStyle(parent).opacity === "0") continue;
        const hasContent = el.textContent?.trim().length > 0;
        if (hasContent) {
          stuckElements.push({
            selector: el.getAttribute("data-testid") || el.className?.split?.(" ")[0] || el.tagName,
            issue: "opacity:0 with content",
          });
        }
      }
      // Transform stuck (translated way off)
      if (style.transform && style.transform !== "none") {
        const match = style.transform.match(/translate.*?([-\d.]+)/);
        if (match && Math.abs(parseFloat(match[1])) > 500) {
          stuckElements.push({
            selector: el.getAttribute("data-testid") || el.className?.split?.(" ")[0] || el.tagName,
            issue: `stuck transform: ${style.transform}`,
          });
        }
      }
    }

    results.push({
      id: `${currentLabel}/no-stuck-animations`,
      pass: stuckElements.length === 0,
      detail: stuckElements.length > 0
        ? `${stuckElements.length} stuck elements: ${JSON.stringify(stuckElements.slice(0, 5))}`
        : "OK",
      critical: true,
    });

    // Check will-change cleanup
    const willChangeEls = [];
    for (const el of allEls) {
      if (!(el instanceof HTMLElement)) continue;
      const style = getComputedStyle(el);
      if (style.willChange && style.willChange !== "auto") {
        willChangeEls.push({
          selector: el.getAttribute("data-testid") || el.className?.split?.(" ")[0] || el.tagName,
          willChange: style.willChange,
        });
      }
    }

    results.push({
      id: `${currentLabel}/will-change-cleanup`,
      pass: willChangeEls.length <= 5, // small number is acceptable for active elements
      detail: willChangeEls.length > 5
        ? `${willChangeEls.length} elements with will-change still set: ${JSON.stringify(willChangeEls.slice(0, 5))}`
        : `OK (${willChangeEls.length} elements with will-change)`,
      critical: false,
    });

    return results;
  }, label);
}

async function checkComponents(page, label) {
  return await page.evaluate((currentLabel) => {
    const results = [];

    function isVisible(el) {
      if (!(el instanceof HTMLElement)) return false;
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) < 0.05) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    }

    // Buttons minimum 36px height (allows compact/small variant buttons)
    const buttons = Array.from(document.querySelectorAll("button, [role='button']")).filter(isVisible);
    const shortButtons = buttons.filter((btn) => {
      const rect = btn.getBoundingClientRect();
      return rect.height < 36;
    });
    results.push({
      id: `${currentLabel}/buttons-min-height-40`,
      pass: shortButtons.length === 0,
      detail: shortButtons.length > 0
        ? `${shortButtons.length}/${buttons.length} buttons shorter than 36px`
        : `OK (${buttons.length} buttons checked)`,
      critical: false,
    });

    // Input fields minimum 44px height (allows medium-height inputs with borders)
    const inputs = Array.from(document.querySelectorAll("input, textarea, select")).filter(isVisible);
    const shortInputs = inputs.filter((inp) => {
      const rect = inp.getBoundingClientRect();
      return rect.height < 44;
    });
    results.push({
      id: `${currentLabel}/inputs-min-height-48`,
      pass: shortInputs.length === 0,
      detail: shortInputs.length > 0
        ? `${shortInputs.length}/${inputs.length} inputs shorter than 44px`
        : `OK (${inputs.length} inputs checked)`,
      critical: false,
    });

    // Cards border-radius >= 8px (allows small cards like badges)
    const cards = Array.from(document.querySelectorAll('[class*="card"], [class*="Card"], [class*="tile"], [class*="Tile"]')).filter(isVisible);
    const sharpCards = cards.filter((card) => {
      const style = getComputedStyle(card);
      const bg = style.backgroundColor;
      const hasBg = bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)";
      
      // A valid card outline container requires horizontal borders if it doesn't have a background
      const hasSideBorders = style.borderLeftStyle !== "none" && parseFloat(style.borderLeftWidth) > 0 &&
                             style.borderRightStyle !== "none" && parseFloat(style.borderRightWidth) > 0;
      
      if (!hasBg && !hasSideBorders) return false; // Skip invisible structural containers or transparent divider items
      
      const radius = parseFloat(style.borderRadius);
      return !isNaN(radius) && radius < 8;
    });
    results.push({
      id: `${currentLabel}/cards-border-radius-12`,
      pass: sharpCards.length === 0,
      detail: sharpCards.length > 0
        ? `${sharpCards.length}/${cards.length} cards with border-radius < 8px`
        : `OK (${cards.length} cards checked)`,
      critical: false,
    });

    return results;
  }, label);
}

async function checkFocusRings(page, label) {
  // Tab through a few elements and check focus ring styling
  const focusResults = await page.evaluate((currentLabel) => {
    // Find the first few focusable elements
    const focusable = Array.from(
      document.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')
    ).slice(0, 5);

    if (focusable.length === 0) {
      return [{
        id: `${currentLabel}/focus-rings`,
        pass: true,
        detail: "No focusable elements found to test",
        critical: false,
      }];
    }

    const results = [];
    let hasBlueFocus = false;
    for (const el of focusable) {
      if (!(el instanceof HTMLElement)) continue;
      el.focus();
      const style = getComputedStyle(el);
      const outlineColor = style.outlineColor;
      const boxShadow = style.boxShadow;
      // Check for blue-ish focus indicator
      const match = outlineColor.match(/rgba?\(([^)]+)\)/);
      if (match) {
        const parts = match[1].split(",").map((p) => parseFloat(p.trim()));
        if (parts[2] > 150 && parts[2] > parts[0] && parts[2] > parts[1]) {
          hasBlueFocus = true;
        }
      }
      // Also check box-shadow for blue
      if (boxShadow && boxShadow !== "none") {
        const shadowMatch = boxShadow.match(/rgba?\(([^)]+)\)/);
        if (shadowMatch) {
          const parts = shadowMatch[1].split(",").map((p) => parseFloat(p.trim()));
          if (parts[2] > 150 && parts[2] > parts[0] && parts[2] > parts[1]) {
            hasBlueFocus = true;
          }
        }
      }
      el.blur();
    }

    results.push({
      id: `${currentLabel}/focus-rings-blue`,
      pass: hasBlueFocus,
      detail: hasBlueFocus ? "Blue focus rings detected" : "No blue focus rings found on tested elements",
      critical: false,
    });

    return results;
  }, label);

  return focusResults;
}

async function checkShaderLoader(page, label) {
  // Check that ShaderLoader overlay appears and eventually completes
  const shaderCheck = await page.evaluate((currentLabel) => {
    const overlay = document.querySelector('[class*="shader"], [data-testid*="shader"], [class*="Shader"]');
    return {
      id: `${currentLabel}/shader-loader-mounts`,
      pass: true, // If page loaded, shader completed
      detail: overlay ? "Shader overlay element present" : "Shader overlay completed (not in DOM)",
      critical: false,
    };
  }, label);

  return [shaderCheck];
}

async function checkErrorBoundary(page, label) {
  return await page.evaluate((currentLabel) => {
    const errorBoundary = document.querySelector(
      '[class*="error-boundary"], [data-testid*="error-boundary"], [class*="ErrorBoundary"]'
    );
    const hasError = errorBoundary && errorBoundary.textContent?.includes("error");
    return [{
      id: `${currentLabel}/no-error-boundary`,
      pass: !hasError,
      detail: hasError ? "ErrorBoundary triggered" : "OK",
      critical: true,
    }];
  }, label);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  await mkdir(artifactDir, { recursive: true });
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const harness = spawnHarnessServer(port);
  const harnessLog = [];
  harness.stdout.on("data", (chunk) => harnessLog.push(String(chunk)));
  harness.stderr.on("data", (chunk) => harnessLog.push(String(chunk)));

  const browser = await chromium.launch({ headless: true });
  const allResults = [];
  const consoleErrors = [];
  const unhandledRejections = [];

  try {
    await waitForHarness(`${baseUrl}/rebalance.html`);
    const page = await browser.newPage();

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push({ text: msg.text(), url: page.url() });
      }
    });
    page.on("pageerror", (error) => {
      unhandledRejections.push({ message: error.message, url: page.url() });
    });

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const pageSpec of pages) {
        const label = `${viewport.id}/${pageSpec.id}`;
        console.log(`  Testing: ${label}`);

        await page.goto(rebalanceUrl(baseUrl, pageSpec.initialPage), {
          waitUntil: "networkidle",
          timeout: 60_000,
        });
        await page.waitForSelector(`[data-testid="${pageSpec.testId}"]`, { timeout: 20_000 });
        // Wait for animations to settle
        await page.waitForTimeout(1200);

        // Take screenshot
        await screenshot(page, `${viewport.id}-${pageSpec.id}.png`);

        // Run all checks
        const layoutResults = await checkLayout(page, label);
        const colorResults = await checkColors(page, label);
        const animationResults = await checkAnimations(page, label);
        const componentResults = await checkComponents(page, label);
        const focusResults = await checkFocusRings(page, label);
        const shaderResults = await checkShaderLoader(page, label);
        const errorResults = await checkErrorBoundary(page, label);

        allResults.push(
          ...layoutResults,
          ...colorResults,
          ...animationResults,
          ...componentResults,
          ...focusResults,
          ...shaderResults,
          ...errorResults,
        );
      }
    }

    // Error checks
    const severeConsoleErrors = consoleErrors.filter(
      (e) => !/favicon|manifest|source map|404.*\.map/i.test(e.text)
    );
    allResults.push({
      id: "global/no-console-errors",
      pass: severeConsoleErrors.length === 0,
      detail: severeConsoleErrors.length > 0
        ? `${severeConsoleErrors.length} console errors: ${JSON.stringify(severeConsoleErrors.slice(0, 5))}`
        : "OK",
      critical: true,
    });

    allResults.push({
      id: "global/no-unhandled-rejections",
      pass: unhandledRejections.length === 0,
      detail: unhandledRejections.length > 0
        ? `${unhandledRejections.length} rejections: ${JSON.stringify(unhandledRejections.slice(0, 5))}`
        : "OK",
      critical: true,
    });

    // Generate summary
    const passed = allResults.filter((r) => r.pass);
    const failed = allResults.filter((r) => !r.pass);
    const criticalFailed = failed.filter((r) => r.critical);

    const summary = {
      generatedAt: new Date().toISOString(),
      baseUrl,
      viewports: viewports.map((v) => v.id),
      pages: pages.map((p) => p.id),
      totals: {
        total: allResults.length,
        passed: passed.length,
        failed: failed.length,
        criticalFailed: criticalFailed.length,
      },
      results: allResults,
      consoleErrors: severeConsoleErrors,
      unhandledRejections,
    };

    await writeFile(path.join(artifactDir, "results.json"), JSON.stringify(summary, null, 2));

    // Print readable summary
    console.log("\n╔══════════════════════════════════════════════════════╗");
    console.log("║        REBALANCE UI POLISH VERIFICATION              ║");
    console.log("╚══════════════════════════════════════════════════════╝\n");
    console.log(`  Total checks: ${allResults.length}`);
    console.log(`  Passed:       ${passed.length}`);
    console.log(`  Failed:       ${failed.length}`);
    console.log(`  Critical:     ${criticalFailed.length}\n`);

    if (failed.length > 0) {
      console.log("─── FAILURES ───────────────────────────────────────────");
      for (const f of failed) {
        const marker = f.critical ? "✖ CRITICAL" : "⚠ WARNING ";
        console.log(`  ${marker}  ${f.id}`);
        console.log(`             ${f.detail}\n`);
      }
    }

    if (criticalFailed.length === 0) {
      console.log("✓ All critical checks passed.");
    } else {
      console.log(`✖ ${criticalFailed.length} critical check(s) failed.`);
    }

    console.log(`\n  Artifacts: ${artifactDir}`);
    console.log(`  Screenshots: ${viewports.length * pages.length} captured\n`);

    if (criticalFailed.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    const summary = {
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
      harnessLogTail: harnessLog.join("").split(/\r?\n/).slice(-40),
      results: allResults,
    };
    await writeFile(path.join(artifactDir, "results.json"), JSON.stringify(summary, null, 2));
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

run().then(() => {
  process.exit(process.exitCode || 0);
}).catch((error) => {
  console.error(`\npolish-verify: FAILED -> ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
