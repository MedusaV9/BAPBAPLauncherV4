import net from "node:net";
import { execSync, spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { _electron as electron } from "playwright";

const appDir = path.resolve(import.meta.dirname, "..");
const artifactDir = path.join(appDir, "output", "playwright");
const mainEntry = path.join(appDir, "dist", "main", "main.cjs");

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

async function waitForStableFxMetrics(page, selector, minimumParticles = 8, sampleCount = 4) {
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
        await page.waitForTimeout(450);
    }

    const healthySamples = samples.filter(sample => sample.particles >= minimumParticles && sample.emitters >= 1);
    if (healthySamples.length < Math.max(2, sampleCount - 1)) {
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

async function withElectronPage(pageUrl, callback) {
    const electronApp = await electron.launch({
        args: [mainEntry],
        cwd: appDir,
        env: {
            ...process.env,
            ELECTRON_RENDERER_URL: pageUrl,
            V2_ALLOW_REMOTE_RENDERER: "1",
            V2_DISABLE_DEVTOOLS: "1",
        },
        timeout: 60_000,
    });

    try {
        const page = await electronApp.firstWindow();
        await page.setViewportSize({ width: 1600, height: 1200 });
        await callback(page);
    } finally {
        await electronApp.close();
    }
}

async function main() {
    await rm(artifactDir, { recursive: true, force: true });
    await mkdir(artifactDir, { recursive: true });

    const harnessPort = await reservePort();
    const harnessUrl = `http://127.0.0.1:${harnessPort}/harness.html`;
    const harnessProcess = spawnHarnessServer(harnessPort);
    try {
        console.log("electron-smoke (mock harness): waiting for harness");
        await waitForHarness(`${harnessUrl}?workspace=instances`);

        console.log("electron-smoke (mock harness): capturing instances");
        await withElectronPage(`${harnessUrl}?workspace=instances`, async page => {
            await page.waitForSelector('[data-testid="instances-workspace"]');
            await screenshot(page, "electron-instances.png");
        });

        console.log("electron-smoke (mock harness): capturing mods");
        await withElectronPage(`${harnessUrl}?workspace=mods`, async page => {
            await page.waitForSelector('[data-testid="mods-workspace"]');
            await waitForStableFxMetrics(page, '.mods-content-grid .package-card-wrap', 10);
            await screenshot(page, "electron-mods.png");

            await page.locator('[data-testid^="mods-card-"]').first().click();
            await page.waitForSelector('[data-testid="mods-detail-panel"]');
            await screenshot(page.locator('[data-testid="mods-detail-panel"]'), "electron-mods-detail.png");
        });

        console.log("electron-smoke (mock harness): capturing effect lab");
        await withElectronPage(`${harnessUrl}?preset=effect-lab`, async page => {
            await page.waitForSelector('[data-testid="effect-lab-panel"]');
            await page.locator('[data-testid="effect-lab-token-select"]').selectOption("inferno");
            await page.waitForSelector('[data-testid^="effect-lab-preview-"]');
            await waitForAnyFxSignal(page, '[data-testid="effect-lab-preview-card-tile"] .package-card-wrap').catch(() => undefined);
            await screenshot(page.locator('[data-testid="effect-lab-panel"]'), "electron-effect-lab.png");
        });
    } finally {
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
