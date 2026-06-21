import net from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Real-browser click test for the radio queue-drain fix (commit b173544).
// Reaches Radio by CLICKING the nav button (the proven nav-smoke path), not a
// ?workspace= URL param (which never reliably rendered the audio workspace).
// Then clicks enqueue twice + Next, asserting up-next drains 2 -> 1 -> 0.

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

const results = [];
function record(step, ok, detail = "") {
    results.push({ step, ok, detail });
}

async function upNextCount(page) {
    const header = page.locator("text=/Up next \\(\\d+\\)/");
    if ((await header.count()) === 0) return 0;
    const txt = await header.first().innerText();
    const m = txt.match(/\((\d+)\)/);
    return m ? Number(m[1]) : 0;
}

async function main() {
    const port = await reservePort();
    const baseUrl = `http://127.0.0.1:${port}/harness.html`;
    const server = spawnHarness(port);

    let browser;
    try {
        await waitForHarness(baseUrl);
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

        await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("nav", { timeout: 30_000 });

        // First run may show the setup wizard; dismiss it (nav-smoke pattern).
        const getStarted = page.locator('button:has-text("Get started")');
        if (await getStarted.count()) {
            await getStarted.first().click();
            await page.waitForTimeout(500);
        }

        // Navigate by clicking the Radio nav button — the proven reliable path.
        await page.locator('nav button:has-text("Radio")').first().click({ timeout: 10_000 });
        await page.waitForTimeout(800);

        const enqueueButtons = page.locator('button[aria-label="Add to queue"]');
        await enqueueButtons.first().waitFor({ state: "visible", timeout: 30_000 });
        const trackCount = await enqueueButtons.count();
        record("radio workspace renders track rows with enqueue buttons", trackCount >= 2, `${trackCount} tracks`);

        await enqueueButtons.nth(0).click();
        await page.waitForTimeout(300);
        await enqueueButtons.nth(1).click();
        await page.waitForTimeout(300);
        const afterEnqueue = await upNextCount(page);
        record("clicking 'Add to queue' twice fills the up-next panel", afterEnqueue === 2, `up-next=${afterEnqueue}`);

        const nextButton = page.locator('button[aria-label="Next track"]');
        await nextButton.click();
        await page.waitForTimeout(400);
        const afterNext = await upNextCount(page);
        record("Next drains one queued track (the b173544 fix)", afterNext === 1, `up-next ${afterEnqueue} -> ${afterNext}`);

        await nextButton.click();
        await page.waitForTimeout(400);
        const afterSecondNext = await upNextCount(page);
        record("a second Next empties the queue (no infinite replay)", afterSecondNext === 0, `up-next -> ${afterSecondNext}`);

        const nothingPlaying = await page.locator("text=/Nothing playing/").count();
        record("advance set a current track (player bar not empty)", nothingPlaying === 0, nothingPlaying === 0 ? "playing" : "nothing playing");

        console.log("=== RADIO BROWSER CLICK SMOKE RESULT ===");
        for (const r of results) {
            console.log(`[${r.ok ? "ok" : "FAIL"}] ${r.step}${r.detail ? " — " + r.detail : ""}`);
        }
        const failed = results.filter(r => !r.ok);
        if (failed.length > 0) {
            console.error(`\n${failed.length} radio interaction step(s) failed.`);
            process.exitCode = 1;
        } else {
            console.log("\nRadio queue enqueue + drain verified via real browser clicks.");
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
}

main().catch(err => {
    console.error("Radio browser click smoke failed:", err);
    process.exit(1);
});
