import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

// Real end-to-end interaction smoke: launches the packaged-style dist in actual
// Electron and drives genuine user actions — mouse clicks on toggles (verifying
// the state flips AND persists through the backend IPC round-trip) and keyboard
// typing into the mods search box. Goes beyond nav-smoke, which only switches
// workspaces without exercising any control.

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mainEntry = path.join(appDir, "dist", "main", "main.cjs");

const results = [];
function record(step, ok, detail = "") {
    results.push({ step, ok, detail });
}

async function gotoWorkspace(page, label) {
    await page.locator(`nav button:has-text("${label}")`).first().click({ timeout: 5_000 });
    await page.waitForTimeout(600);
}

async function main() {
    const app = await electron.launch({
        args: [mainEntry],
        env: {
            ...process.env,
            V2_ALLOW_MULTI_INSTANCE_FOR_TESTS: "1",
            V2_DISABLE_DEVTOOLS: "1",
            V2_USER_DATA_DIR: path.join(appDir, "output", "interaction-smoke-userdata"),
        },
    });

    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector("nav", { timeout: 25_000 });

    const getStarted = page.locator('button:has-text("Get started")');
    if (await getStarted.count()) {
        await getStarted.first().click();
        await page.waitForTimeout(500);
    }

    // ── 1. Click a Settings toggle and verify the state actually flips ──
    await gotoWorkspace(page, "Settings");
    const firstSwitch = page.locator('button[role="switch"]').first();
    await firstSwitch.waitFor({ timeout: 5_000 });
    const before = await firstSwitch.getAttribute("aria-checked");
    await firstSwitch.click();
    await page.waitForTimeout(400);
    const after = await firstSwitch.getAttribute("aria-checked");
    record("settings toggle flips on click", before !== null && after !== null && before !== after, `${before} -> ${after}`);

    // ── 2. Verify the new value PERSISTED through the backend IPC round-trip ──
    // Leave Settings, come back; a fresh mount re-reads from the settings store.
    await gotoWorkspace(page, "Start");
    await gotoWorkspace(page, "Settings");
    const persisted = await page.locator('button[role="switch"]').first().getAttribute("aria-checked");
    record("settings toggle persists across remount", persisted === after, `expected ${after}, got ${persisted}`);

    // Flip it back so repeat runs start clean.
    await page.locator('button[role="switch"]').first().click();
    await page.waitForTimeout(300);

    // ── 3. Keyboard-type into the mods search and verify the input updates ──
    await gotoWorkspace(page, "Mods");
    const search = page.locator('input[aria-label="Search mods"]');
    if (await search.count()) {
        await search.click();
        await page.keyboard.type("zephyr");
        await page.waitForTimeout(300);
        const typed = await search.inputValue();
        record("mods search accepts keyboard input", typed === "zephyr", `value="${typed}"`);

        // Backspace clears one char — verifies real key events, not just .fill().
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(150);
        const afterBksp = await search.inputValue();
        record("mods search handles Backspace key", afterBksp === "zephy", `value="${afterBksp}"`);
    } else {
        record("mods search accepts keyboard input", false, "search input not found");
    }

    // ── 4. Tab focus reaches an interactive control (keyboard a11y) ──
    await gotoWorkspace(page, "Settings");
    await page.keyboard.press("Tab");
    const activeRole = await page.evaluate(() => document.activeElement?.getAttribute("role") || document.activeElement?.tagName || "none");
    record("Tab moves focus to an interactive element", activeRole !== "none" && activeRole !== "BODY", `focus=${activeRole}`);

    console.log("=== INTERACTION SMOKE RESULT ===");
    for (const r of results) {
        console.log(`[${r.ok ? "ok" : "FAIL"}] ${r.step}${r.detail ? " — " + r.detail : ""}`);
    }

    await app.close();

    const failed = results.filter(r => !r.ok);
    if (failed.length > 0) {
        console.error(`\n${failed.length} interaction step(s) failed.`);
        process.exit(1);
    }
    console.log("\nAll user interactions (click, persist, keyboard, focus) verified end-to-end.");
}

main().catch(error => {
    console.error("Interaction smoke failed:", error);
    process.exit(1);
});
