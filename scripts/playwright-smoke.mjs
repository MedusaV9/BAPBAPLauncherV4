import net from "node:net";
import { execSync, spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const appDir = path.resolve(import.meta.dirname, "..");
const artifactDir = path.join(appDir, "output", "playwright");
const responsiveReview = process.env.V2_REVIEW_RESPONSIVE === "1";
const reviewViewports = responsiveReview
    ? [
          { id: "wide", width: 1600, height: 1200 },
          { id: "laptop", width: 1366, height: 900 },
          { id: "compact", width: 1180, height: 820 },
          { id: "narrow", width: 1024, height: 768 },
      ]
    : [{ id: "wide", width: 1600, height: 1200 }];

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
            server.close(error => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(port);
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
            if (response.ok) {
                return;
            }
        } catch {
            // retry
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for harness at ${url}`);
}

async function screenshot(target, fileName) {
    await target.screenshot({
        path: path.join(artifactDir, fileName),
        scale: "css",
    });
}

function withViewportSuffix(fileName, viewport) {
    if (!responsiveReview || viewport.id === "wide") {
        return fileName;
    }
    const extension = path.extname(fileName);
    const baseName = fileName.slice(0, -extension.length);
    return `${baseName}-${viewport.id}-${viewport.width}x${viewport.height}${extension}`;
}

async function resizePage(page, viewport) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(250);
}

async function captureLayoutMetrics(page, label, viewport) {
    return await page.evaluate(
        ({ currentLabel, currentViewport }) => {
            const workspace = document.querySelector(".v2-workspace");
            const root = document.documentElement;
            const regionSelectors = [
                ["topbar", ".v2-topbar"],
                ["workspace", ".v2-workspace"],
                ["instances-current", '[data-testid="instances-current-grid"]'],
                ["launch-toolbar", ".launch-profile-toolbar-card"],
                ["launch-overview", '[data-testid="launch-overview"]'],
                ["mods-grid", '[data-testid="mods-grid"]'],
                ["settings-grid", ".settings-grid"],
                ["radio-hero", ".radio-hero-card"],
                ["tools-gallery", '[data-testid="tools-gallery-view"]'],
                ["tools-focus", '[data-testid="tools-focus-panel"]'],
                ["tools-embed", '[data-testid="rebalance-embed-shell"]'],
            ];
            const regions = Object.fromEntries(
                regionSelectors.flatMap(([key, selector]) => {
                    const node = document.querySelector(selector);
                    if (!(node instanceof HTMLElement)) {
                        return [];
                    }
                    const rect = node.getBoundingClientRect();
                    return [[key, {
                        clientWidth: node.clientWidth,
                        clientHeight: node.clientHeight,
                        scrollWidth: node.scrollWidth,
                        scrollHeight: node.scrollHeight,
                        offscreenRight: Math.max(0, rect.right - window.innerWidth),
                        offscreenBottom: Math.max(0, rect.bottom - window.innerHeight),
                    }]];
                })
            );
            return {
                label: currentLabel,
                viewport: currentViewport,
                window: {
                    innerWidth: window.innerWidth,
                    innerHeight: window.innerHeight,
                    devicePixelRatio: window.devicePixelRatio,
                },
                document: {
                    clientWidth: root.clientWidth,
                    clientHeight: root.clientHeight,
                    scrollWidth: root.scrollWidth,
                    scrollHeight: root.scrollHeight,
                },
                workspace: workspace
                    ? {
                          clientWidth: workspace.clientWidth,
                          clientHeight: workspace.clientHeight,
                          scrollWidth: workspace.scrollWidth,
                          scrollHeight: workspace.scrollHeight,
                      }
                    : null,
                overflow: {
                    documentX: root.scrollWidth > root.clientWidth + 4,
                    documentY: root.scrollHeight > root.clientHeight + 4,
                    workspaceX: workspace ? workspace.scrollWidth > workspace.clientWidth + 4 : false,
                    workspaceY: workspace ? workspace.scrollHeight > workspace.clientHeight + 4 : false,
                },
                regions,
            };
        },
        { currentLabel: label, currentViewport: viewport }
    );
}

function assertLayoutMetric(metric) {
    if (metric.overflow?.documentX || metric.overflow?.workspaceX) {
        throw new Error(
            `Responsive overflow in ${metric.label} @ ${metric.viewport.width}x${metric.viewport.height} (documentX=${metric.overflow.documentX}, workspaceX=${metric.overflow.workspaceX}).`
        );
    }
}

async function assertRebalanceEmbedHealthy(page, label) {
    const hostMetrics = await page.evaluate(currentLabel => {
        const focusPanel = document.querySelector('[data-testid="tools-focus-panel"]');
        const shell = document.querySelector('[data-testid="rebalance-embed-shell"]');
        const embeddedRoot = document.querySelector('[data-testid="rebalance-embedded-root"]');
        if (!(focusPanel instanceof HTMLElement) || !(shell instanceof HTMLElement) || !(embeddedRoot instanceof HTMLElement)) {
            return {
                label: currentLabel,
                hasEmbed: false,
            };
        }
        const focusRect = focusPanel.getBoundingClientRect();
        const shellRect = shell.getBoundingClientRect();
        const embeddedRootRect = embeddedRoot.getBoundingClientRect();
        return {
            label: currentLabel,
            hasEmbed: true,
            shellWidth: shell.clientWidth,
            shellHeight: shell.clientHeight,
            clippedRight: shellRect.right > focusRect.right + 1 || embeddedRootRect.right > focusRect.right + 1,
            clippedBottom: shellRect.bottom > focusRect.bottom + 1 || embeddedRootRect.bottom > focusRect.bottom + 1,
        };
    }, label);

    if (!hostMetrics.hasEmbed) {
        throw new Error(`Missing embedded Rebalance shell for ${label}.`);
    }
    if (hostMetrics.clippedRight || hostMetrics.clippedBottom) {
        throw new Error(`Embedded Rebalance shell is clipped for ${label}: ${JSON.stringify(hostMetrics)}`);
    }

    const embedded = page;

    const gameModeButton = embedded.getByRole("button", { name: "Game Mode" }).first();
    if (await gameModeButton.count()) {
        await gameModeButton.click();
        await embedded.waitForTimeout(500);
    }

    const innerMetrics = await embedded.evaluate(currentLabel => {
        const root = document.documentElement;
        const sidebar = document.querySelector(".task-sidebar");
        const sidebarOverflowY =
            sidebar instanceof HTMLElement ? window.getComputedStyle(sidebar).overflowY : "visible";
        return {
            label: currentLabel,
            documentX: root.scrollWidth > root.clientWidth + 4,
            sidebarHasOwnScroll:
                sidebar instanceof HTMLElement
                    ? sidebar.scrollHeight > sidebar.clientHeight + 4 &&
                      sidebarOverflowY !== "visible" &&
                      sidebarOverflowY !== "clip"
                    : false,
        };
    }, label);

    if (innerMetrics.documentX || innerMetrics.sidebarHasOwnScroll) {
        throw new Error(`Embedded Rebalance layout is unhealthy for ${label}: ${JSON.stringify(innerMetrics)}`);
    }
}

async function main() {
    const { chromium } = await import("playwright");
    const layoutMetrics = [];

    await rm(artifactDir, { recursive: true, force: true });
    await mkdir(artifactDir, { recursive: true });

    const harnessPort = await reservePort();
    const harnessUrl = `http://127.0.0.1:${harnessPort}/harness.html`;
    const harnessProcess = spawnHarnessServer(harnessPort);

    try {
        console.log("playwright-smoke (mock harness): waiting for harness");
        await waitForHarness(`${harnessUrl}?workspace=instances`);

        const browser = await chromium.launch({ headless: false });
        const context = await browser.newContext({ viewport: { width: reviewViewports[0].width, height: reviewViewports[0].height }, deviceScaleFactor: 1 });
        const page = await context.newPage();

        try {
            console.log("playwright-smoke (mock harness): instances");
            await page.goto(`${harnessUrl}?workspace=instances`, { waitUntil: "networkidle" });
            await page.waitForSelector('[data-testid="instances-workspace"]');
            await page.locator('[data-testid="hero-create-profile-bapbap"]').scrollIntoViewIfNeeded();
            {
                const metric = await captureLayoutMetrics(page, "instances-curated", reviewViewports[0]);
                layoutMetrics.push(metric);
                assertLayoutMetric(metric);
            }
            await screenshot(page, withViewportSuffix("instances-overview.png", reviewViewports[0]));

            await page.goto(`${harnessUrl}?preset=messy-real&workspace=instances`, { waitUntil: "networkidle" });
            await page.waitForSelector('[data-testid="instances-workspace"]');
            {
                const metric = await captureLayoutMetrics(page, "instances-messy-real", reviewViewports[0]);
                layoutMetrics.push(metric);
                assertLayoutMetric(metric);
            }
            await screenshot(page, withViewportSuffix("instances-overview-messy-real.png", reviewViewports[0]));

            if (responsiveReview) {
                for (const viewport of reviewViewports.slice(1)) {
                    await resizePage(page, viewport);
                    await page.goto(`${harnessUrl}?preset=messy-real&workspace=instances`, { waitUntil: "networkidle" });
                    await page.waitForSelector('[data-testid="instances-workspace"]');
                    {
                        const metric = await captureLayoutMetrics(page, "instances-messy-real", viewport);
                        layoutMetrics.push(metric);
                        assertLayoutMetric(metric);
                    }
                    await screenshot(page, withViewportSuffix("instances-overview-messy-real.png", viewport));
                }
                await resizePage(page, reviewViewports[0]);
                await page.goto(`${harnessUrl}?preset=messy-real&workspace=instances`, { waitUntil: "networkidle" });
                await page.waitForSelector('[data-testid="instances-workspace"]');
            }

            await page.locator('[data-testid="hero-create-profile-bapbap"]').click();
            await page.waitForSelector('[data-testid="profile-create-sheet"]');
            await screenshot(page, "instances-create-profile-modal.png");
            await page.keyboard.press("Escape");

            console.log("playwright-smoke (mock harness): launch");
            await page.goto(`${harnessUrl}?workspace=launch`, { waitUntil: "networkidle" });
            await page.waitForSelector('[data-testid="launch-overview"]');
            {
                const metric = await captureLayoutMetrics(page, "launch-curated", reviewViewports[0]);
                layoutMetrics.push(metric);
                assertLayoutMetric(metric);
            }
            await screenshot(page.locator('[data-testid="launch-overview"]'), withViewportSuffix("launch-overview.png", reviewViewports[0]));

            await page.goto(`${harnessUrl}?preset=messy-real&workspace=launch`, { waitUntil: "networkidle" });
            await page.waitForSelector('[data-testid="launch-overview"]');
            {
                const metric = await captureLayoutMetrics(page, "launch-messy-real", reviewViewports[0]);
                layoutMetrics.push(metric);
                assertLayoutMetric(metric);
            }
            await screenshot(page.locator('[data-testid="launch-overview"]'), withViewportSuffix("launch-overview-messy-real.png", reviewViewports[0]));

            if (responsiveReview) {
                for (const viewport of reviewViewports.slice(1)) {
                    await resizePage(page, viewport);
                    await page.goto(`${harnessUrl}?preset=messy-real&workspace=launch`, { waitUntil: "networkidle" });
                    await page.waitForSelector('[data-testid="launch-overview"]');
                    {
                        const metric = await captureLayoutMetrics(page, "launch-messy-real", viewport);
                        layoutMetrics.push(metric);
                        assertLayoutMetric(metric);
                    }
                    await screenshot(page.locator('[data-testid="launch-overview"]'), withViewportSuffix("launch-overview-messy-real.png", viewport));
                }
                await resizePage(page, reviewViewports[0]);
                await page.goto(`${harnessUrl}?preset=messy-real&workspace=launch`, { waitUntil: "networkidle" });
                await page.waitForSelector('[data-testid="launch-overview"]');
            }

            await page.locator('[data-testid="launch-primary-button"]').click();
            await page.locator('[data-testid="launch-tab-console"]').click();
            await page.waitForSelector('[data-testid="launch-console"]');
            await screenshot(page.locator('[data-testid="launch-console"]'), "launch-console.png");

            await page.locator('[data-testid="launch-tab-configs"]').click();
            await page.waitForSelector('[data-testid="launch-configs"]');
            await screenshot(page.locator('[data-testid="launch-configs"]'), "launch-configs.png");

            await page.locator('[data-testid="launch-tab-mods"]').click();
            await page.waitForSelector('[data-testid="launch-mods"]');
            await screenshot(page.locator('[data-testid="launch-mods"]'), "launch-mods.png");

            console.log("playwright-smoke (mock harness): mods");
            await page.goto(`${harnessUrl}?workspace=mods`, { waitUntil: "networkidle" });
            await page.waitForSelector('[data-testid="mods-target-banner"]');
            {
                const metric = await captureLayoutMetrics(page, "mods-curated", reviewViewports[0]);
                layoutMetrics.push(metric);
                assertLayoutMetric(metric);
            }
            await screenshot(page.locator('[data-testid="mods-workspace"]'), withViewportSuffix("mods-overview.png", reviewViewports[0]));

            await page.goto(`${harnessUrl}?preset=messy-real&workspace=mods`, { waitUntil: "networkidle" });
            await page.waitForSelector('[data-testid="mods-target-banner"]');
            {
                const metric = await captureLayoutMetrics(page, "mods-messy-real", reviewViewports[0]);
                layoutMetrics.push(metric);
                assertLayoutMetric(metric);
            }
            await screenshot(page.locator('[data-testid="mods-workspace"]'), withViewportSuffix("mods-overview-messy-real.png", reviewViewports[0]));

            if (responsiveReview) {
                for (const viewport of reviewViewports.slice(1)) {
                    await resizePage(page, viewport);
                    await page.goto(`${harnessUrl}?preset=messy-real&workspace=mods`, { waitUntil: "networkidle" });
                    await page.waitForSelector('[data-testid="mods-target-banner"]');
                    {
                        const metric = await captureLayoutMetrics(page, "mods-messy-real", viewport);
                        layoutMetrics.push(metric);
                        assertLayoutMetric(metric);
                    }
                    await screenshot(page.locator('[data-testid="mods-workspace"]'), withViewportSuffix("mods-overview-messy-real.png", viewport));
                }
                await resizePage(page, reviewViewports[0]);
                await page.goto(`${harnessUrl}?preset=messy-real&workspace=mods`, { waitUntil: "networkidle" });
                await page.waitForSelector('[data-testid="mods-target-banner"]');
            }

            const firstCheckbox = page.locator('[data-testid^="mods-checkbox-"]').first();
            await firstCheckbox.click();
            await page.waitForSelector('[data-testid="mods-bulk-bar"]');
            await screenshot(page.locator('[data-testid="mods-workspace"]'), "mods-bulk-bar.png");

            await page.locator('[data-testid^="mods-card-"]').first().click();
            await page.waitForSelector('[data-testid="mods-detail-panel"]');
            await screenshot(page.locator('[data-testid="mods-detail-panel"]'), "mods-detail.png");
            await page.keyboard.press("Escape");

            console.log("playwright-smoke (mock harness): ribbon demo");
            await page.goto(`${harnessUrl}?preset=ribbon-demo&workspace=mods`, { waitUntil: "networkidle" });
            await page.waitForSelector('[data-testid="mods-target-banner"]');
            {
                const metric = await captureLayoutMetrics(page, "mods-ribbon-demo", reviewViewports[0]);
                layoutMetrics.push(metric);
                assertLayoutMetric(metric);
            }
            await screenshot(page.locator('[data-testid="mods-workspace"]'), withViewportSuffix("mods-ribbon-demo.png", reviewViewports[0]));

            await page.locator('[data-testid="mods-card-sonic.bapbap.arena-random-chars"]').click();
            await page.waitForSelector('[data-testid="mods-detail-panel"]');
            await screenshot(page.locator('[data-testid="mods-detail-panel"]'), "mods-ribbon-demo-detail-update-host.png");
            await page.keyboard.press("Escape");

            await page.locator('[data-testid="mods-card-sonic.bapbap.fps-camera"]').click();
            await page.waitForSelector('[data-testid="mods-detail-panel"]');
            await screenshot(page.locator('[data-testid="mods-detail-panel"]'), "mods-ribbon-demo-detail-host.png");
            await page.keyboard.press("Escape");

            console.log("playwright-smoke (mock harness): effect-lab");
            await page.goto(`${harnessUrl}?preset=effect-lab`, { waitUntil: "networkidle" });
            await page.waitForSelector('[data-testid="effect-lab-panel"]');
            await page.locator('[data-testid="effect-lab-token-select"]').selectOption("inferno");
            await page.locator('[data-testid="effect-lab-hidden-toggle"]').uncheck();
            await page.locator('[data-testid="effect-lab-ribbon-select"]').selectOption("hot");
            await page.waitForFunction(() =>
                Array.from(document.querySelectorAll('[data-testid^="effect-lab-preview-"]')).some(panel =>
                    /Particles\s*([1-9]\d*)/i.test((panel.textContent || "").replace(/\s+/g, ""))
                )
            );
            await page.locator('[data-testid="effect-lab-panel"]').scrollIntoViewIfNeeded();
            await screenshot(page.locator('[data-testid="effect-lab-panel"]'), "effect-lab.png");

            console.log("playwright-smoke (mock harness): tools");
            await page.goto(`${harnessUrl}?preset=messy-real&workspace=tools`, { waitUntil: "networkidle" });
            await page.waitForSelector('[data-testid="tools-gallery-view"]');
            {
                const metric = await captureLayoutMetrics(page, "tools-messy-real-gallery", reviewViewports[0]);
                layoutMetrics.push(metric);
                assertLayoutMetric(metric);
            }
            await screenshot(page.locator('[data-testid="tools-workspace"]'), "tools-gallery.png");

            const rebalanceCard = page.locator('[data-testid="tools-card-rebalance-studio"]');
            await rebalanceCard.click();
            await page.waitForSelector('[data-testid="tools-focus-view"]');
            await page.waitForSelector('[data-testid="tools-gate-panel"]');
            await screenshot(page.locator('[data-testid="tools-focus-panel"]'), "tools-rebalance-gate.png");

            await page.locator('[data-testid="tools-back-button"]').click();
            await page.waitForSelector('[data-testid="tools-gallery-view"]');
            await page.locator(".tools-hero-card select").selectOption("profile-creator-kit");
            await page.waitForFunction(() => document.querySelector('[data-testid="tools-card-rebalance-studio"]')?.getAttribute("data-tool-state") === "ready");

            await rebalanceCard.click();
            await page.waitForSelector('[data-testid="rebalance-embed-shell"]');
            await page.waitForSelector(".rebalance-embed-shell.is-ready");
            await assertRebalanceEmbedHealthy(page, "tools-messy-real-embed");
            await screenshot(page.locator('[data-testid="tools-focus-panel"]'), "tools-rebalance-embed.png");
            await writeFile(path.join(artifactDir, "mock-harness-layout-metrics.json"), `${JSON.stringify(layoutMetrics, null, 2)}\n`);
        } finally {
            await context.close();
            await browser.close();
        }
    } finally {
        harnessProcess.kill("SIGTERM");
    }
}

await main().catch(error => {
    console.error(error?.stack || error);
    process.exit(1);
});
