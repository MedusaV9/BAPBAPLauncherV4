import net from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(appDir, "output", "shots");

const WORKSPACES = [
    { id: "instances", label: "Instances" },
    { id: "launch", label: "Start" },
    { id: "mods", label: "Mods" },
    { id: "radio", label: "Radio" },
    { id: "tools", label: "Tools" },
    { id: "settings", label: "Settings" },
];

function reservePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address();
            server.close(err => (err ? reject(err) : resolve(port)));
        });
    });
}

function spawnHarness(port) {
    const env = { ...process.env, VITE_HARNESS_PORT: `${port}` };
    const cmd = process.platform === "win32" ? "cmd.exe" : "npm";
    const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm run dev:harness"] : ["run", "dev:harness"];
    return spawn(cmd, args, { cwd: appDir, env, stdio: "ignore", shell: false });
}

async function waitForHarness(url, timeoutMs = 60_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(url);
            if (res.ok) return;
        } catch {
            // retry
        }
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error(`Timed out waiting for harness at ${url}`);
}

async function main() {
    await mkdir(outDir, { recursive: true });
    const port = await reservePort();
    const baseUrl = `http://127.0.0.1:${port}/harness.html`;
    const server = spawnHarness(port);

    let browser;
    try {
        await waitForHarness(baseUrl);
        browser = await chromium.launch();
        const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
        for (const ws of WORKSPACES) {
            await page.goto(`${baseUrl}?workspace=${ws.id}`, { waitUntil: "domcontentloaded" });
            await page.waitForSelector("nav", { timeout: 30_000 });
            // dismiss setup wizard if present
            const getStarted = page.locator('button:has-text("Get started")');
            if (await getStarted.count()) {
                await getStarted.first().click();
                await page.waitForTimeout(400);
            }
            await page.locator(`nav button:has-text("${ws.label}")`).first().click().catch(() => {});
            await page.waitForTimeout(700);
            await page.screenshot({ path: path.join(outDir, `${ws.id}.png`) });
            console.log(`shot: ${ws.id}`);
        }
    } finally {
        if (browser) await browser.close();
        server.kill();
        if (process.platform === "win32" && server.pid) {
            try {
                spawn("taskkill", ["/pid", `${server.pid}`, "/t", "/f"], { stdio: "ignore" });
            } catch {
                // best effort
            }
        }
    }
    console.log(`\nScreenshots in ${outDir}`);
}

main().catch(err => {
    console.error("Screenshot capture failed:", err);
    process.exit(1);
});
