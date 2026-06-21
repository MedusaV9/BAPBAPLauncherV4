import net from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(appDir, "output", "shots");

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

async function waitForHarness(url, timeoutMs = 60_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(url);
            if (res.ok) return;
        } catch {}
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error(`Timed out waiting for harness at ${url}`);
}

async function main() {
    await mkdir(outDir, { recursive: true });
    const port = await reservePort();
    const baseUrl = `http://127.0.0.1:${port}/harness.html`;
    const env = { ...process.env, VITE_HARNESS_PORT: `${port}` };
    const server = spawn("cmd.exe", ["/d", "/s", "/c", "npm run dev:harness"], { cwd: appDir, env, stdio: "ignore", shell: false });
    let browser;
    try {
        await waitForHarness(baseUrl);
        browser = await chromium.launch();
        const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
        await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(outDir, "splash.png") });
        console.log("shot: splash (during)");
    } finally {
        if (browser) await browser.close();
        server.kill();
        if (server.pid) { try { spawn("taskkill", ["/pid", `${server.pid}`, "/t", "/f"], { stdio: "ignore" }); } catch {} }
    }
}
main().catch(err => { console.error(err); process.exit(1); });
