import net from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
    const args =
        process.platform === "win32"
            ? ["/d", "/s", "/c", "npm run dev:harness"]
            : ["run", "dev:harness"];
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
    const port = await reservePort();
    const baseUrl = `http://127.0.0.1:${port}/harness.html`;
    const server = spawnHarness(port);

    let browser;
    try {
        await waitForHarness(baseUrl);
        browser = await chromium.launch();
        const page = await browser.newPage();
        await page.goto(`${baseUrl}?workspace=instances`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("nav", { timeout: 30_000 });

        const snapshot = await page.evaluate(() => ({
            navPresent: Boolean(document.querySelector("nav")),
            harnessFlag: Boolean(window.__V2_HARNESS__),
            hasFatal: document.body.innerText.includes("Startup failed"),
            railButtons: document.querySelector("nav")?.querySelectorAll("button").length ?? 0,
        }));

        console.log("=== HARNESS SMOKE RESULT ===");
        console.log(JSON.stringify(snapshot, null, 2));

        const ok = snapshot.navPresent && snapshot.harnessFlag && !snapshot.hasFatal && snapshot.railButtons >= 6;
        if (!ok) {
            console.error("\nHarness did not render the shell against the mock API.");
            process.exitCode = 1;
        } else {
            console.log("\nHarness renders the shell against the mock API (no Electron).");
        }
    } finally {
        if (browser) await browser.close();
        server.kill();
        // On Windows the cmd.exe wrapper may leave the vite child; kill the tree.
        if (process.platform === "win32" && server.pid) {
            try {
                spawn("taskkill", ["/pid", `${server.pid}`, "/t", "/f"], { stdio: "ignore" });
            } catch {
                // best effort
            }
        }
    }
}

main().catch(err => {
    console.error("Harness smoke failed:", err);
    process.exit(1);
});
