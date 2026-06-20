import path from "node:path";
import { chromium } from "playwright";

const targetUrl = process.argv[2] ?? "http://127.0.0.1:4173/";
const outputPath =
  process.argv[3] ??
  path.resolve(process.cwd(), "output/playwright/harness-root-debug.png");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 734, height: 990 },
  });
  const errors = [];

  page.on("console", (message) => {
    const type = message.type();
    if (type === "error" || type === "warning") {
      errors.push(`[${type}] ${message.text()}`);
    }
  });

  page.on("pageerror", (error) => {
    errors.push(`[pageerror] ${error.stack || error.message}`);
  });

  await page.goto(targetUrl, { waitUntil: "networkidle" });
  await page.screenshot({ path: outputPath, fullPage: true });
  const bridgeState = await page.evaluate(() => ({
    harness: Boolean(window.__V2_HARNESS__),
    harnessApi: Boolean(window.__V2_HARNESS_API__),
    preloadApi: Boolean(window.v2Api),
    search: window.location.search,
  }));

  console.log(`BRIDGE ${JSON.stringify(bridgeState)}`);
  if (errors.length) {
    console.log(errors.join("\n"));
  } else {
    console.log("NO_ERRORS");
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
