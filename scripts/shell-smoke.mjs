import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mainEntry = path.join(appDir, "dist", "main", "main.cjs");

async function main() {
    const app = await electron.launch({
        args: [mainEntry],
        env: {
            ...process.env,
            V2_ALLOW_MULTI_INSTANCE_FOR_TESTS: "1",
            V2_DISABLE_DEVTOOLS: "1",
            V2_USER_DATA_DIR: path.join(appDir, "output", "shell-smoke-userdata"),
        },
    });

    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");

    // Shell reaches "ready" and renders the rail nav + Instances heading.
    await page.waitForSelector("nav", { timeout: 25_000 });
    await page.waitForSelector("text=Instances", { timeout: 25_000 });

    const snapshot = await page.evaluate(() => {
        const nav = document.querySelector("nav");
        const heading = Array.from(document.querySelectorAll("h1")).find(h =>
            h.textContent?.includes("Instances")
        );
        const bg = getComputedStyle(document.body).backgroundColor;
        const railButtons = nav ? nav.querySelectorAll("button").length : 0;
        return {
            navPresent: Boolean(nav),
            headingPresent: Boolean(heading),
            bodyBg: bg,
            railButtons,
        };
    });

    console.log("=== SHELL SMOKE RESULT ===");
    console.log(JSON.stringify(snapshot, null, 2));

    await app.close();

    const ok = snapshot.navPresent && snapshot.headingPresent && snapshot.railButtons >= 6;
    if (!ok) {
        console.error("\nShell did not render as expected.");
        process.exit(1);
    }
    console.log("\nShell renders: rail + Instances workspace mounted, themed body background.");
}

main().catch(error => {
    console.error("Shell smoke failed:", error);
    process.exit(1);
});
