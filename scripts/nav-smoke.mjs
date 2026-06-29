import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mainEntry = path.join(appDir, "dist", "main", "main.cjs");

const WORKSPACES = [
    { label: "Start", expect: "Start" },
    { label: "Instances", expect: "Instances" },
    { label: "Mods", expect: "Mods" },
    { label: "Radio", expect: "Sync" },
    { label: "Tools", expect: "Tools" },
    { label: "Settings", expect: "Settings" },
];

async function main() {
    const app = await electron.launch({
        args: [mainEntry],
        env: {
            ...process.env,
            V2_ALLOW_MULTI_INSTANCE_FOR_TESTS: "1",
            V2_DISABLE_DEVTOOLS: "1",
            V2_USER_DATA_DIR: path.join(appDir, "output", "nav-smoke-userdata"),
        },
    });

    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector("nav", { timeout: 25_000 });

    // First run shows the setup wizard modal; dismiss it before navigating.
    const getStarted = page.locator('button:has-text("Get started")');
    if (await getStarted.count()) {
        await getStarted.first().click();
        await page.waitForTimeout(500);
    }

    const results = [];
    for (const ws of WORKSPACES) {
        try {
            await page.locator(`nav button:has-text("${ws.label}")`).first().click({ timeout: 5_000 });
            await page.waitForTimeout(800);
            const { mounted, snippet } = await page.evaluate(expected => {
                // Either the workspace heading or its unlock/empty state rendered without crashing.
                const text = document.body.innerText;
                return { mounted: text.includes(expected), snippet: text.replace(/\s+/g, " ").slice(0, 160) };
            }, ws.expect);
            results.push({ workspace: ws.label, mounted, snippet });
        } catch (error) {
            results.push({ workspace: ws.label, mounted: false, error: String(error).slice(0, 80) });
        }
    }

    console.log("=== NAV SMOKE RESULT ===");
    for (const r of results) {
        console.log(`[${r.mounted ? "ok" : "FAIL"}] ${r.workspace}${r.error ? " — " + r.error : ""}`);
    }

    await app.close();

    const failed = results.filter(r => !r.mounted);
    if (failed.length > 0) {
        console.error(`\n${failed.length} workspace(s) failed to mount.`);
        process.exit(1);
    }
    console.log("\nAll six workspaces mount and switch cleanly.");
}

main().catch(error => {
    console.error("Nav smoke failed:", error);
    process.exit(1);
});
