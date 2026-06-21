import net from "node:net";
import { execSync, spawn } from "node:child_process";
import { access, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { constants as fsConstants } from "node:fs";
import { _electron as electron, chromium } from "playwright";

const appDir = path.resolve(import.meta.dirname, "..");
const artifactDir = path.join(appDir, "output", "playwright");
const packagedExe = path.join(appDir, "release", "build", "win-unpacked", "BAPBAP Launcher.exe");
const packagedSmokeUserDataDir = path.join(appDir, "output", ".tmp", "packaged-smoke-user-data");

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
    });
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
        await page.goto(rebalanceUrl.toString(), {
            waitUntil: "networkidle",
            timeout: 60_000,
        });
        await page.waitForTimeout(1_000);
    } finally {
        await browser.close();
    }
}

async function waitForFxMetrics(page, selector, minimumParticles = 8) {
    await page.waitForFunction(
        ({ targetSelector, particleThreshold }) => {
            const host = document.querySelector(targetSelector);
            if (!(host instanceof HTMLElement)) {
                return false;
            }
            const particleCount = Number(host.dataset.fxMetricParticles || "0");
            const emitterCount = Number(host.dataset.fxMetricEmitters || "0");
            return particleCount >= particleThreshold && emitterCount >= 1;
        },
        { targetSelector: selector, particleThreshold: minimumParticles },
        { timeout: 15_000 }
    );
}

async function waitForStableFxMetrics(page, selector, minimumParticles = 8, sampleCount = 5) {
    await waitForFxMetrics(page, selector, minimumParticles);
    const target = page.locator(selector).first();
    const samples = [];
    for (let index = 0; index < sampleCount; index += 1) {
        const sample = await target.evaluate(node => ({
            particles: Number(node.dataset.fxMetricParticles || "0"),
            emitters: Number(node.dataset.fxMetricEmitters || "0"),
            three: node.dataset.fxMetricThree || "0",
        }));
        samples.push(sample);
        await page.waitForTimeout(500);
    }

    const healthySamples = samples.filter(sample => sample.particles >= minimumParticles && sample.emitters >= 1);
    if (healthySamples.length < Math.max(3, sampleCount - 1)) {
        throw new Error(`Unstable FX metrics for ${selector}: ${JSON.stringify(samples)}`);
    }
}

async function waitForAnyFxSignal(page, selector) {
    await page.waitForFunction(
        targetSelector => {
            const host = document.querySelector(targetSelector);
            if (!(host instanceof HTMLElement)) {
                return false;
            }
            const particleCount = Number(host.dataset.fxMetricParticles || "0");
            const emitterCount = Number(host.dataset.fxMetricEmitters || "0");
            const threeActive = host.dataset.fxMetricThree === "1" || host.dataset.fxThreeActive === "1";
            return particleCount >= 1 || emitterCount >= 1 || threeActive;
        },
        selector,
        { timeout: 6_000 }
    );
}

async function withPackagedPage(pageUrl, callback) {
    const electronApp = await electron.launch({
        executablePath: packagedExe,
        cwd: path.dirname(packagedExe),
        env: {
            ...process.env,
            ELECTRON_RENDERER_URL: pageUrl,
            V2_ALLOW_REMOTE_RENDERER: "1",
            V2_DISABLE_DEVTOOLS: "1",
            V2_USER_DATA_DIR: packagedSmokeUserDataDir,
        },
        timeout: 90_000,
    });

    try {
        const page = await electronApp.firstWindow();
        await page.setViewportSize({ width: 1600, height: 1200 });
        await callback(page);
    } finally {
        await electronApp.close();
    }
}

async function assertPackagedBuild() {
    try {
        await access(packagedExe, fsConstants.F_OK);
    } catch {
        throw new Error(`Packaged launcher not found at ${packagedExe}. Run npm --prefix apps/bapbap-launcher run build:win first.`);
    }
}

async function assertRebalanceEmbedHealthy(page, label) {
    await page.waitForSelector('[data-testid="rebalance-embed-shell"]');
    await page.waitForSelector(".rebalance-embed-shell.is-ready");

    const frame = page;

    const gameModeButton = frame.getByRole("button", { name: "Game Mode" }).first();
    if (await gameModeButton.count()) {
        await gameModeButton.click();
        await frame.waitForTimeout(500);
    }

    const metrics = await frame.evaluate(currentLabel => {
        const root = document.documentElement;
        const sidebar = document.querySelector(".task-sidebar");
        const overflowY =
            sidebar instanceof HTMLElement ? window.getComputedStyle(sidebar).overflowY : "visible";
        return {
            label: currentLabel,
            documentX: root.scrollWidth > root.clientWidth + 4,
            sidebarHasOwnScroll:
                sidebar instanceof HTMLElement
                    ? sidebar.scrollHeight > sidebar.clientHeight + 4 &&
                      overflowY !== "visible" &&
                      overflowY !== "clip"
                    : false,
        };
    }, label);

    if (metrics.documentX || metrics.sidebarHasOwnScroll) {
        throw new Error(`Embedded Rebalance layout is unhealthy for ${label}: ${JSON.stringify(metrics)}`);
    }
}

async function main() {
    await assertPackagedBuild();
    await rm(artifactDir, { recursive: true, force: true });
    await mkdir(artifactDir, { recursive: true });
    await rm(packagedSmokeUserDataDir, { recursive: true, force: true });
    await mkdir(packagedSmokeUserDataDir, { recursive: true });

    const harnessPort = await reservePort();
    const harnessUrl = `http://127.0.0.1:${harnessPort}/harness.html`;
    const harnessProcess = spawnHarnessServer(harnessPort);
    try {
        console.log("packaged-smoke (mock harness): waiting for harness");
        await waitForHarness(`${harnessUrl}?workspace=instances`);
        await prewarmRebalanceRoute(harnessUrl);

        console.log("packaged-smoke (mock harness): capturing instances");
        await withPackagedPage(`${harnessUrl}?workspace=instances`, async page => {
            await page.waitForSelector('[data-testid="instances-workspace"]');
            await screenshot(page, "packaged-exe-instances.png");
        });

        console.log("packaged-smoke (mock harness): capturing launch");
        await withPackagedPage(`${harnessUrl}?workspace=launch`, async page => {
            await page.waitForSelector('[data-testid="launch-workspace"]');
            await page.waitForSelector('[data-testid="launch-overview"]');
            await screenshot(page, "packaged-exe-launch.png");
        });

        console.log("packaged-smoke (mock harness): capturing mods");
        await withPackagedPage(`${harnessUrl}?workspace=mods`, async page => {
            await page.waitForSelector('[data-testid="mods-workspace"]');
            await waitForStableFxMetrics(page, '.mods-content-grid .package-card-wrap', 10);
            await screenshot(page, "packaged-exe-mods.png");

            await page.locator('[data-testid^="mods-card-"]').first().click();
            await page.waitForSelector('[data-testid="mods-detail-panel"]');
            await screenshot(page.locator('[data-testid="mods-detail-panel"]'), "packaged-exe-mods-detail.png");
        });

        console.log("packaged-smoke (mock harness): capturing effect lab");
        await withPackagedPage(`${harnessUrl}?preset=effect-lab`, async page => {
            await page.waitForSelector('[data-testid="effect-lab-panel"]');
            await page.locator('[data-testid="effect-lab-token-select"]').selectOption("inferno");
            await page.waitForSelector('[data-testid^="effect-lab-preview-"]');
            await waitForAnyFxSignal(page, '[data-testid="effect-lab-preview-card-tile"] .package-card-wrap').catch(() => undefined);
            await screenshot(page.locator('[data-testid="effect-lab-panel"]'), "packaged-exe-effect-lab.png");
        });

        console.log("packaged-smoke (mock harness): capturing settings");
        await withPackagedPage(`${harnessUrl}?workspace=settings`, async page => {
            await page.waitForSelector('[data-testid="settings-workspace"]');
            await screenshot(page, "packaged-exe-settings.png");
        });

        console.log("packaged-smoke (mock harness): capturing tools");
        await withPackagedPage(`${harnessUrl}?preset=messy-real&workspace=tools`, async page => {
            let toolsRailButton = page.locator('[data-testid="rail-nav-tools"]');
            const toolsVisible = await toolsRailButton.isVisible().catch(() => false);
            if (!toolsVisible) {
                const settingsRailButton = page.locator('[data-testid="rail-nav-settings"]');
                await settingsRailButton.waitFor({ state: "visible", timeout: 30_000 });
                await settingsRailButton.click();

                const toolsCodeInput = page.locator('input[placeholder="Enter tools code"]');
                await toolsCodeInput.waitFor({ state: "visible", timeout: 30_000 });
                await toolsCodeInput.fill("ItsAMobileGame");
                await page.getByRole("button", { name: /^Unlock$/ }).click();
                await page.waitForFunction(
                    () => Boolean(document.querySelector('[data-testid="rail-nav-tools"]')),
                    { timeout: 30_000 },
                );
                toolsRailButton = page.locator('[data-testid="rail-nav-tools"]');
            }

            await toolsRailButton.waitFor({ state: "visible", timeout: 30_000 });
            await toolsRailButton.click();
            await page.waitForSelector('[data-testid="tools-gallery-view"]');
            await screenshot(page.locator('[data-testid="tools-workspace"]'), "packaged-exe-tools-gallery.png");

            const rebalanceCard = page.locator('[data-testid="tools-card-rebalance-studio"]');
            await rebalanceCard.click();
            await page.waitForSelector('[data-testid="tools-gate-panel"]');
            await screenshot(page.locator('[data-testid="tools-focus-panel"]'), "packaged-exe-tools-gate.png");

            await page.locator('[data-testid="tools-back-button"]').click();
            await page.waitForSelector('[data-testid="tools-gallery-view"]');
            await page.locator(".tools-hero-card select").selectOption("profile-creator-kit");
            await page.waitForFunction(() => document.querySelector('[data-testid="tools-card-rebalance-studio"]')?.getAttribute("data-tool-state") === "ready");
            await rebalanceCard.click();
            await assertRebalanceEmbedHealthy(page, "packaged-tools");
            await screenshot(page.locator('[data-testid="tools-focus-panel"]'), "packaged-exe-tools-rebalance.png");
        });
    } finally {
        await rm(packagedSmokeUserDataDir, { recursive: true, force: true }).catch(() => undefined);
        if (process.platform === "win32" && harnessProcess.pid) {
            try {
                execSync(`cmd.exe /d /s /c "taskkill /PID ${harnessProcess.pid} /T /F >nul 2>nul"`, {
                    cwd: appDir,
                    stdio: "ignore",
                });
            } catch {
                // ignore
            }
        } else {
            harnessProcess.kill("SIGTERM");
        }
    }
}

await main().catch(error => {
    console.error(error?.stack || error);
    process.exit(1);
});
