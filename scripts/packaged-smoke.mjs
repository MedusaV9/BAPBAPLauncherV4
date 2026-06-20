import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagedExe = path.join(appDir, "release", "build", "win-unpacked", "BAPBAP Launcher.exe");

async function main() {
    const app = await electron.launch({
        executablePath: packagedExe,
        args: [],
        env: {
            ...process.env,
            V2_ALLOW_MULTI_INSTANCE_FOR_TESTS: "1",
            V2_DISABLE_DEVTOOLS: "1",
            V2_USER_DATA_DIR: path.join(appDir, "output", "packaged-smoke-userdata"),
        },
    });

    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    // The shell (or its first-run wizard) must render without a fatal screen.
    await page.waitForSelector("nav", { timeout: 30_000 });

    const snapshot = await page.evaluate(() => ({
        navPresent: Boolean(document.querySelector("nav")),
        hasFatal: document.body.innerText.includes("Startup failed"),
        bodyBg: getComputedStyle(document.body).backgroundColor,
    }));

    console.log("=== PACKAGED SMOKE RESULT ===");
    console.log(JSON.stringify(snapshot, null, 2));

    await app.close();

    if (!snapshot.navPresent || snapshot.hasFatal) {
        console.error("\nPackaged app did not boot cleanly.");
        process.exit(1);
    }
    console.log("\nPackaged exe boots: shell renders from app.asar, no fatal screen.");
}

main().catch(error => {
    console.error("Packaged smoke failed:", error);
    process.exit(1);
});
