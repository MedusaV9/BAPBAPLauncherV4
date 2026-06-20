/**
 * Playwright Responsive Layout Verification
 *
 * Tests the dashboard layout at multiple viewport sizes verifying:
 * 1. Grid expansion — launcher grid tiles fill available width
 * 2. No horizontal overflow
 * 3. Sidebar behavior at different breakpoints
 * 4. Content scaling
 * 5. Card scaling
 * 6. Button sizes
 * 7. No elements cut off
 *
 * Usage: npm run playwright:responsive-verify
 */
import net from "node:net";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const appDir = path.resolve(import.meta.dirname, "..");
const artifactDir = path.join(appDir, "output", "playwright", "responsive-verify");

const viewports = [
  { id: "800x600", width: 800, height: 600 },
  { id: "1024x768", width: 1024, height: 768 },
  { id: "1280x720", width: 1280, height: 720 },
  { id: "1440x900", width: 1440, height: 900 },
  { id: "1600x1000", width: 1600, height: 1000 },
  { id: "1920x1080", width: 1920, height: 1080 },
  { id: "2560x1440", width: 2560, height: 1440 },
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

function rebalanceUrl(baseUrl) {
  const url = new URL("/rebalance.html", baseUrl);
  url.searchParams.set("embedded", "1");
  url.searchParams.set("initialPage", "home");
  url.searchParams.set("workspaceRoot", "C:/Harness/Creator Kit Tools");
  url.searchParams.set("profileLabel", "Creator Kit Tools / build-2025-08-19-750068");
  url.searchParams.set("track", "bapbap");
  url.searchParams.set("instanceSource", "official-managed");
  return url.toString();
}

/**
 * Run all responsive checks for a given viewport.
 * Returns an object with pass/fail per check.
 */
async function runChecks(page, viewport) {
  const results = {};

  // 1. Grid expansion
  results["grid-expansion"] = await page.evaluate(() => {
    const grid = document.querySelector(".rebalance-home-launcher-grid");
    if (!grid) return { pass: false, reason: "Grid container not found" };
    const gridRect = grid.getBoundingClientRect();
    const children = Array.from(grid.querySelectorAll(":scope > *"));
    if (children.length === 0) return { pass: false, reason: "No grid children found" };

    const childRects = children.map((el) => el.getBoundingClientRect());
    const minLeft = Math.min(...childRects.map((r) => r.left));
    const maxRight = Math.max(...childRects.map((r) => r.right));
    const totalChildrenWidth = maxRight - minLeft;
    const widthDiff = Math.abs(gridRect.width - totalChildrenWidth);
    const tooNarrow = childRects.filter((r) => r.width < 160);

    if (tooNarrow.length > 0) {
      return { pass: false, reason: `${tooNarrow.length} tile(s) narrower than 160px (min: ${Math.round(Math.min(...tooNarrow.map((r) => r.width)))}px)` };
    }
    if (widthDiff > 20) {
      return { pass: false, reason: `Grid children width (${Math.round(totalChildrenWidth)}px) differs from container (${Math.round(gridRect.width)}px) by ${Math.round(widthDiff)}px` };
    }
    return { pass: true };
  });

  // 2. No horizontal overflow
  results["no-horizontal-overflow"] = await page.evaluate(() => {
    const { scrollWidth, clientWidth } = document.documentElement;
    if (scrollWidth <= clientWidth + 4) {
      return { pass: true };
    }
    return { pass: false, reason: `scrollWidth (${scrollWidth}) > clientWidth (${clientWidth}) + 4` };
  });

  // 3. Sidebar behavior
  results["sidebar-behavior"] = await page.evaluate((vp) => {
    const sidebar = document.querySelector(".rebalance-sidebar, [data-testid='rebalance-sidebar']");
    if (!sidebar) return { pass: true, reason: "No sidebar element found — acceptable" };

    const style = window.getComputedStyle(sidebar);
    const rect = sidebar.getBoundingClientRect();
    const isHidden = style.display === "none" || style.visibility === "hidden" || rect.width === 0;
    const isOverlay = style.position === "absolute" || style.position === "fixed";

    if (vp.width >= 900) {
      // Sidebar can be visible, content should still fit
      const content = document.querySelector(".rebalance-page-content");
      if (content) {
        const contentRect = content.getBoundingClientRect();
        if (contentRect.right > window.innerWidth + 4) {
          return { pass: false, reason: `Sidebar visible but content overflows (right: ${Math.round(contentRect.right)}px > viewport: ${window.innerWidth}px)` };
        }
      }
      return { pass: true };
    } else {
      // < 900px: sidebar should be hidden or overlaying
      if (isHidden || isOverlay) {
        return { pass: true };
      }
      return { pass: false, reason: `Sidebar is visible and in flow at ${vp.width}px width (display: ${style.display}, position: ${style.position})` };
    }
  }, viewport);

  // 4. Content scaling
  results["content-scaling"] = await page.evaluate((vp) => {
    const content = document.querySelector(".rebalance-page-content");
    if (!content) return { pass: false, reason: ".rebalance-page-content not found" };
    const rect = content.getBoundingClientRect();
    const ratio = rect.width / vp.width;
    if (ratio >= 0.6) {
      return { pass: true, detail: `${Math.round(ratio * 100)}% of viewport` };
    }
    return { pass: false, reason: `Content width (${Math.round(rect.width)}px) is only ${Math.round(ratio * 100)}% of viewport (${vp.width}px), expected >= 60%` };
  }, viewport);

  // 5. Card scaling
  results["card-scaling"] = await page.evaluate((vp) => {
    const cards = Array.from(document.querySelectorAll(".v2-card"));
    if (cards.length === 0) return { pass: true, reason: "No .v2-card elements found" };

    const issues = [];
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      if (rect.width <= 100) {
        issues.push(`Card too narrow: ${Math.round(rect.width)}px`);
      }
      if (rect.width > vp.width) {
        issues.push(`Card exceeds viewport: ${Math.round(rect.width)}px > ${vp.width}px`);
      }
    }
    if (issues.length > 0) {
      return { pass: false, reason: issues.slice(0, 5).join("; ") };
    }
    return { pass: true, detail: `${cards.length} cards checked` };
  }, viewport);

  // 6. Button sizes
  results["button-sizes"] = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll(".v2-button"));
    if (buttons.length === 0) return { pass: true, reason: "No .v2-button elements found" };

    const tooSmall = buttons.filter((btn) => {
      const rect = btn.getBoundingClientRect();
      return rect.height < 38;
    });
    if (tooSmall.length > 0) {
      const minHeight = Math.min(...tooSmall.map((b) => b.getBoundingClientRect().height));
      return { pass: false, reason: `${tooSmall.length} button(s) shorter than 38px (min: ${Math.round(minHeight)}px)` };
    }
    return { pass: true, detail: `${buttons.length} buttons checked` };
  });

  // 7. No elements cut off
  results["no-elements-cut-off"] = await page.evaluate((vp) => {
    const interactiveSelectors = "a, button, input, select, textarea, [role='button'], [tabindex]";
    const elements = Array.from(document.querySelectorAll(interactiveSelectors));
    const cutOff = elements.filter((el) => {
      const rect = el.getBoundingClientRect();
      // Skip hidden or zero-size elements
      if (rect.width === 0 || rect.height === 0) return false;
      // Allow up to 16px tolerance for narrow viewports (subpixel and minimum-width constraints)
      const tolerance = vp.width < 1100 ? 16 : 2;
      return rect.right > vp.width + tolerance;
    });
    if (cutOff.length > 0) {
      const worst = Math.max(...cutOff.map((el) => el.getBoundingClientRect().right));
      const details = cutOff.map(el => `${el.tagName.toLowerCase()}${el.className ? '.' + el.className.trim().split(/\s+/).join('.') : ''} (right: ${Math.round(el.getBoundingClientRect().right)}px)`).join(', ');
      return { pass: false, reason: `${cutOff.length} interactive element(s) extend beyond viewport (max right: ${Math.round(worst)}px, viewport: ${vp.width}px): ${details}` };
    }
    return { pass: true };
  }, viewport);

  return results;
}

async function main() {
  await mkdir(artifactDir, { recursive: true });

  const harnessPort = await reservePort();
  const baseUrl = `http://127.0.0.1:${harnessPort}`;
  const harnessProcess = spawnHarnessServer(harnessPort);

  const allResults = {};
  let exitCode = 0;

  try {
    console.log("responsive-verify: waiting for harness...");
    await waitForHarness(`${baseUrl}/rebalance.html?embedded=1&initialPage=home&workspaceRoot=C:/Harness&track=bapbap&instanceSource=official-managed`);

    const browser = await chromium.launch({ headless: true });

    try {
      for (const viewport of viewports) {
        console.log(`responsive-verify: testing ${viewport.id} (${viewport.width}x${viewport.height})`);

        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
        });
        const page = await context.newPage();

        try {
          const dashboardUrl = rebalanceUrl(baseUrl);
          await page.goto(dashboardUrl, { waitUntil: "networkidle" });
          await page.waitForSelector('[data-testid="rebalance-page-dashboard"]', { timeout: 15_000 });
          await page.waitForTimeout(500);

          // Take screenshot
          await page.screenshot({
            path: path.join(artifactDir, `dashboard-${viewport.id}.png`),
            scale: "css",
          });

          // Run checks
          const checks = await runChecks(page, viewport);
          allResults[viewport.id] = checks;

          // Log per-viewport summary
          const passed = Object.values(checks).filter((c) => c.pass).length;
          const total = Object.keys(checks).length;
          const status = passed === total ? "PASS" : "FAIL";
          console.log(`  ${status} (${passed}/${total} checks passed)`);

          if (passed < total) {
            exitCode = 1;
            for (const [name, result] of Object.entries(checks)) {
              if (!result.pass) {
                console.log(`    ✗ ${name}: ${result.reason}`);
              }
            }
          }
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }

    // Write results
    await writeFile(
      path.join(artifactDir, "results.json"),
      JSON.stringify(allResults, null, 2) + "\n"
    );
    console.log(`\nresults written to output/playwright/responsive-verify/results.json`);
  } finally {
    harnessProcess.kill("SIGTERM");
  }

  if (exitCode !== 0) {
    console.error("\nResponsive verification FAILED — see results.json for details.");
    process.exit(1);
  } else {
    console.log("\nAll responsive checks PASSED.");
  }
}

await main().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
