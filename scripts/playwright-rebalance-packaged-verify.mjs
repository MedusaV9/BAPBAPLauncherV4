import net from "node:net";
import { execSync, spawn } from "node:child_process";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { constants as fsConstants } from "node:fs";
import { _electron as electron, chromium } from "playwright";

const appDir = path.resolve(import.meta.dirname, "..");
const artifactDir = path.join(appDir, "output", "playwright", "rebalance-packaged-verify");
const packagedExe = path.join(appDir, "release", "build", "win-unpacked", "BAPBAP Launcher V2.exe");
const userDataDir = path.join(appDir, "output", ".tmp", "rebalance-verify-user-data");

// --- Report ---
const report = {
    timestamp: new Date().toISOString(),
    critical: [],
    visual: [],
    navigation: [],
    passed: true,
};

function recordResult(category, name, passed, detail = "") {
    const entry = { name, passed, detail };
    report[category].push(entry);
    if (!passed) {
        report.passed = false;
        console.error(`  ✗ [${category}] ${name}: ${detail}`);
    } else {
        console.log(`  ✓ [${category}] ${name}`);
    }
}

// --- Utility ---
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
            server.close(error => (error ? reject(error) : resolve(port)));
        });
    });
}

function spawnHarnessServer(port) {
    const env = { ...process.env, VITE_HARNESS_PORT: `${port}` };
    if (process.platform === "win32") {
        return spawn("cmd.exe", ["/d", "/s", "/c", "npm run dev:harness"], {
            cwd: appDir,
            env,
            stdio: "inherit",
            shell: false,
        });
    }
    return spawn("npm", ["run", "dev:harness"], {
        cwd: appDir,
        env,
        stdio: "inherit",
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
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for harness at ${url}`);
}

async function prewarmRebalanceRoute(harnessBaseUrl) {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const rebalanceUrl = new URL("/rebalance.html", harnessBaseUrl);
        rebalanceUrl.searchParams.set("embedded", "1");
        rebalanceUrl.searchParams.set("initialPage", "dashboard");
        rebalanceUrl.searchParams.set("workspaceRoot", "C:/Harness/Creator Kit Tools");
        rebalanceUrl.searchParams.set("profileLabel", "Creator Kit Tools / build-2025-08-19-750068");
        rebalanceUrl.searchParams.set("track", "bapbap");
        rebalanceUrl.searchParams.set("instanceSource", "official-managed");
        await page.goto(rebalanceUrl.toString(), { waitUntil: "networkidle", timeout: 60_000 });
        await page.waitForTimeout(1_000);
    } finally {
        await browser.close();
    }
}

async function screenshot(target, fileName) {
    const fullPath = path.join(artifactDir, fileName);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await target.screenshot({ path: fullPath });
}

async function launchApp(pageUrl) {
    return electron.launch({
        executablePath: packagedExe,
        cwd: path.dirname(packagedExe),
        env: {
            ...process.env,
            ELECTRON_RENDERER_URL: pageUrl,
            V2_ALLOW_REMOTE_RENDERER: "1",
            V2_DISABLE_DEVTOOLS: "1",
            V2_USER_DATA_DIR: userDataDir,
        },
        timeout: 90_000,
    });
}

async function assertPackagedBuild() {
    try {
        await access(packagedExe, fsConstants.F_OK);
    } catch {
        throw new Error(`Packaged launcher not found at ${packagedExe}. Run npm --prefix apps/bapbap-launcher run build:win first.`);
    }
}

// --- Noise filter for console errors ---
const NOISE_PATTERNS = [
    /favicon/i,
    /source.?map/i,
    /ERR_FILE_NOT_FOUND/i,
    /DevTools/i,
    /net::ERR_/i,
    /\.map\b/,
];

function isNoise(text) {
    return NOISE_PATTERNS.some(pattern => pattern.test(text));
}

// --- Navigate to Rebalance Studio ---
async function navigateToRebalanceStudio(page) {
    // Unlock tools via settings
    const toolsRailButton = page.locator('[data-testid="rail-nav-tools"]');
    const toolsVisible = await toolsRailButton.isVisible().catch(() => false);

    if (!toolsVisible) {
        const settingsRailButton = page.locator('[data-testid="rail-nav-settings"]');
        await settingsRailButton.waitFor({ state: "visible", timeout: 30_000 });
        await settingsRailButton.click();

        const toolsCodeInput = page.locator('input[placeholder="Enter tools code"]');
        await toolsCodeInput.waitFor({ state: "visible", timeout: 30_000 });
        await toolsCodeInput.fill("ItsAMobileGame");
        const unlockButton = page.locator('.settings-card-tools-unlock button').first();
        await unlockButton.waitFor({ state: "visible", timeout: 30_000 });
        await unlockButton.click();
        await page.waitForFunction(
            () => Boolean(document.querySelector('[data-testid="rail-nav-tools"]')),
            { timeout: 30_000 },
        );
    }

    // Click Tools rail
    await page.locator('[data-testid="rail-nav-tools"]').waitFor({ state: "visible", timeout: 30_000 });
    await page.locator('[data-testid="rail-nav-tools"]').click();
    await page.waitForSelector('[data-testid="tools-gallery-view"]');

    // Select profile so rebalance is ready
    await page.locator(".tools-hero-card select").selectOption("profile-creator-kit");
    await page.waitForFunction(
        () => document.querySelector('[data-testid="tools-card-rebalance-studio"]')?.getAttribute("data-tool-state") === "ready",
        { timeout: 30_000 },
    );

    // Click rebalance studio card
    const rebalanceCard = page.locator('[data-testid="tools-card-rebalance-studio"]');
    await rebalanceCard.click();

    // Wait for the rebalance embed shell to be ready
    await page.waitForSelector('[data-testid="rebalance-embed-shell"]', { timeout: 30_000 });
    await page.waitForSelector(".rebalance-embed-shell.is-ready", { timeout: 60_000 });
}

// --- Critical Checks ---
async function runCriticalChecks(page, frame, iframe, consoleErrors) {
    console.log("\n── Critical Checks ──");

    // 1. RebalanceUI renders (has content, not blank)
    try {
        const hasContent = await page.evaluate(() => {
            const shell = document.querySelector('[data-testid="rebalance-embed-shell"]');
            if (!shell) return false;
            return shell.innerHTML.trim().length > 100;
        });
        recordResult("critical", "RebalanceUI renders (has content)", hasContent, hasContent ? "" : "Shell is blank or nearly empty");
    } catch (err) {
        recordResult("critical", "RebalanceUI renders (has content)", false, err.message);
    }

    // 2. No JS errors in console
    const realErrors = consoleErrors.filter(msg => !isNoise(msg));
    recordResult("critical", "No JavaScript errors in console", realErrors.length === 0,
        realErrors.length > 0 ? `${realErrors.length} error(s): ${realErrors.slice(0, 3).join(" | ")}` : "");

    // 3. Dashboard shows action tiles
    try {
        const tiles = await frame.evaluate(() => {
            const text = document.body?.innerText || "";
            const hasChange = /\bChange\b/i.test(text);
            const hasCreate = /\bCreate\b/i.test(text);
            const hasSwap = /\bSwap\b/i.test(text);
            return { hasChange, hasCreate, hasSwap };
        });
        const allPresent = tiles.hasChange && tiles.hasCreate && tiles.hasSwap;
        recordResult("critical", "Dashboard shows action tiles (Change, Create, Swap)", allPresent,
            allPresent ? "" : `Change=${tiles.hasChange} Create=${tiles.hasCreate} Swap=${tiles.hasSwap}`);
    } catch (err) {
        recordResult("critical", "Dashboard shows action tiles (Change, Create, Swap)", false, err.message);
    }

    // 4. Layout doesn't overflow horizontally
    try {
        const overflow = await page.evaluate(() => {
            const root = document.documentElement;
            return root.scrollWidth > root.clientWidth + 4;
        });
        recordResult("critical", "Layout doesn't overflow horizontally", !overflow,
            overflow ? `scrollWidth exceeds clientWidth` : "");
    } catch (err) {
        recordResult("critical", "Layout doesn't overflow horizontally", false, err.message);
    }

    // 5. No elements stuck at opacity:0
    try {
        const stuckElements = await frame.evaluate(() => {
            const all = document.querySelectorAll("*");
            const stuck = [];
            for (const el of all) {
                const style = window.getComputedStyle(el);
                if (style.opacity === "0" && el.offsetWidth > 0 && el.offsetHeight > 0) {
                    // Ignore intentionally hidden elements
                    if (el.getAttribute("aria-hidden") === "true") continue;
                    if (el.closest("[aria-hidden='true']")) continue;
                    if (el.classList.contains("sr-only")) continue;
                    stuck.push(el.tagName + (el.className ? `.${el.className.split(" ")[0]}` : ""));
                }
            }
            return stuck.slice(0, 5);
        });
        recordResult("critical", "No elements stuck at opacity:0", stuckElements.length === 0,
            stuckElements.length > 0 ? `Found: ${stuckElements.join(", ")}` : "");
    } catch (err) {
        recordResult("critical", "No elements stuck at opacity:0", false, err.message);
    }
}

// --- Visual Checks ---
async function runVisualChecks(page, frame, iframe) {
    console.log("\n── Visual Checks ──");

    // Screenshot dashboard
    try {
        await screenshot(page, "dashboard.png");
        recordResult("visual", "Screenshot dashboard", true);
    } catch (err) {
        recordResult("visual", "Screenshot dashboard", false, err.message);
    }

    // Navigate to Change and screenshot editor
    try {
        const changeBtn = iframe.locator('button, a, [role="button"]').filter({ hasText: /^Change$/i }).first();
        if (await changeBtn.count()) {
            await changeBtn.click();
            await page.waitForTimeout(2000);
        }
        await screenshot(page, "editor-change.png");
        recordResult("visual", "Screenshot editor (Change page)", true);
    } catch (err) {
        recordResult("visual", "Screenshot editor (Change page)", false, err.message);
    }

    // Multiple viewport sizes
    const viewports = [
        { width: 1920, height: 1080, label: "1920x1080" },
        { width: 1280, height: 720, label: "1280x720" },
        { width: 1024, height: 768, label: "1024x768" },
    ];

    for (const vp of viewports) {
        try {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.waitForTimeout(500);
            await screenshot(page, `viewport-${vp.label}.png`);
            recordResult("visual", `Screenshot at ${vp.label}`, true);
        } catch (err) {
            recordResult("visual", `Screenshot at ${vp.label}`, false, err.message);
        }
    }

    // Reset viewport
    await page.setViewportSize({ width: 1600, height: 1200 });
}

// --- Navigation Checks ---
async function runNavigationChecks(page, frame, iframe) {
    console.log("\n── Navigation Checks ──");

    const pages = ["Home", "Change", "Swap", "Create", "Game Mode", "Packs", "Settings"];

    for (const pageName of pages) {
        try {
            // Ensure drawer is open in embedded mode
            const drawerToggle = iframe.locator('[data-testid="rebalance-embedded-focus-toggle"], [data-testid="rebalance-shell-focus-toggle"]').first();
            if (await drawerToggle.count()) {
                const label = await drawerToggle.getAttribute("aria-label");
                if (label === "Tools") {
                    // Robust scroll to top and click
                    await frame.evaluate(() => {
                        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
                    }).catch(() => undefined);
                    await page.waitForTimeout(150);
                    
                    await drawerToggle.evaluate((element) => {
                        (element instanceof HTMLElement ? element : element.parentElement)?.click();
                    });
                    
                    await frame.waitForFunction(() => {
                        const root = document.querySelector('[data-testid="rebalance-embedded-root"]');
                        return root instanceof HTMLElement && root.dataset.toolRailExpanded === "true";
                    }, { timeout: 15_000 }).catch(() => undefined);
                    
                    await page.waitForTimeout(800); // Wait for open animation transition
                }
            }

            // Try sidebar nav buttons / links
            const navItem = iframe.locator('button, a, [role="button"]')
                .filter({ hasText: new RegExp(`^${pageName}$`, "i") }).first();

            // Fallback: look anywhere for nav text
            const fallbackNav = iframe.getByRole("button", { name: new RegExp(`^${pageName}$`, "i") }).first();
            
            // Wait for either locator to be attached to DOM (handles animation latency)
            try {
                await navItem.waitFor({ state: "attached", timeout: 4000 });
            } catch {
                try {
                    await fallbackNav.waitFor({ state: "attached", timeout: 1000 });
                } catch {
                    // Let count check handle it
                }
            }

            const target = (await navItem.count()) ? navItem : fallbackNav;

            if (await target.count()) {
                await target.click({ force: true });
                await page.waitForTimeout(1500);

                // Check page has content
                const hasContent = await frame.evaluate(() => {
                    return document.body?.innerText.trim().length > 20;
                });
                recordResult("navigation", `Navigate to ${pageName} - renders content`, hasContent,
                    hasContent ? "" : "Page appears blank");

                await screenshot(page, `nav-${pageName.toLowerCase().replace(/\s+/g, "-")}.png`);
            } else {
                recordResult("navigation", `Navigate to ${pageName} - renders content`, false, "Nav button not found");
            }
        } catch (err) {
            recordResult("navigation", `Navigate to ${pageName} - renders content`, false, err.message);
        }
    }

    // Sidebar drawer open/close check
    try {
        const drawerToggle = iframe.locator('[data-testid="rebalance-embedded-focus-toggle"], [data-testid="rebalance-shell-focus-toggle"], [data-testid="sidebar-toggle"], [data-testid="drawer-toggle"], button[aria-label*="menu" i], button[aria-label*="sidebar" i]').first();
        if (await drawerToggle.count()) {
            const initialLabel = await drawerToggle.getAttribute("aria-label");
            
            // Ensure drawer starts open or closed, then toggle it
            if (initialLabel === "Tools") {
                // Open it first
                await drawerToggle.click({ force: true });
                await page.waitForTimeout(800);
            }
            
            // Close
            await drawerToggle.click({ force: true });
            await page.waitForTimeout(800);
            const noOverflowClosed = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 4);

            // Open
            await drawerToggle.click({ force: true });
            await page.waitForTimeout(800);
            const noOverflowOpen = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 4);

            const ok = noOverflowClosed && noOverflowOpen;
            recordResult("navigation", "Sidebar drawer opens/closes without layout breaks", ok,
                ok ? "" : `overflow closed=${!noOverflowClosed} open=${!noOverflowOpen}`);
        } else {
            recordResult("navigation", "Sidebar drawer opens/closes without layout breaks", true, "No drawer toggle found (may not apply)");
        }
    } catch (err) {
        recordResult("navigation", "Sidebar drawer opens/closes without layout breaks", false, err.message);
    }
}

// --- Main ---
async function main() {
    await assertPackagedBuild();
    await rm(artifactDir, { recursive: true, force: true });
    await mkdir(artifactDir, { recursive: true });
    await rm(userDataDir, { recursive: true, force: true });
    await mkdir(userDataDir, { recursive: true });

    const harnessPort = await reservePort();
    const harnessBaseUrl = `http://127.0.0.1:${harnessPort}`;
    const harnessUrl = `${harnessBaseUrl}/harness.html`;
    const harnessProcess = spawnHarnessServer(harnessPort);

    try {
        console.log("rebalance-verify: waiting for harness...");
        await waitForHarness(`${harnessUrl}?workspace=instances`);
        await prewarmRebalanceRoute(harnessBaseUrl);

        console.log("rebalance-verify: launching packaged app...");
        const electronApp = await launchApp(`${harnessUrl}?preset=messy-real&workspace=tools`);

        try {
            const page = await electronApp.firstWindow();
            await page.setViewportSize({ width: 1600, height: 1200 });

            // Collect console errors
            const consoleErrors = [];
            page.on("console", msg => {
                if (msg.type() === "error") {
                    consoleErrors.push(msg.text());
                }
            });
            page.on("pageerror", err => {
                consoleErrors.push(err.message || String(err));
            });

            console.log("rebalance-verify: navigating to Rebalance Studio...");
            await navigateToRebalanceStudio(page);
            console.log("rebalance-verify: Rebalance Studio loaded.");

            // Wait a moment for any late-loading content
            await page.waitForTimeout(3000);

            const iframeSelector = 'iframe.rebalance-embed-iframe';
            const iframeElement = await page.waitForSelector(iframeSelector, { timeout: 30_000 });
            const frame = await iframeElement.contentFrame();
            const iframe = page.frameLocator(iframeSelector);

            // Run all check suites
            await runCriticalChecks(page, frame, iframe, consoleErrors);
            await runVisualChecks(page, frame, iframe);
            await runNavigationChecks(page, frame, iframe);
        } finally {
            await electronApp.close();
        }
    } finally {
        await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
        if (process.platform === "win32" && harnessProcess.pid) {
            try {
                execSync(`cmd.exe /d /s /c "taskkill /PID ${harnessProcess.pid} /T /F >nul 2>nul"`, {
                    cwd: appDir,
                    stdio: "ignore",
                });
            } catch { /* ignore */ }
        } else {
            harnessProcess.kill("SIGTERM");
        }
    }

    // Write report
    const reportPath = path.join(artifactDir, "report.json");
    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`\nReport saved to: ${reportPath}`);

    // Summary
    const totalChecks = [...report.critical, ...report.visual, ...report.navigation];
    const passed = totalChecks.filter(c => c.passed).length;
    const failed = totalChecks.filter(c => !c.passed).length;
    console.log(`\n══ Summary: ${passed} passed, ${failed} failed ══`);

    if (!report.passed) {
        console.error("\n✗ VERIFICATION FAILED");
        process.exit(1);
    }
    console.log("\n✓ ALL CHECKS PASSED");
}

await main().catch(error => {
    console.error(error?.stack || error);
    process.exit(1);
});
