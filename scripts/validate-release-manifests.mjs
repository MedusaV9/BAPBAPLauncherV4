import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const appDir = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appDir, "..", "..");
const releaseDir = path.join(repoRoot, "manifest", "channels", "release");
const packagesIndexPath = path.join(releaseDir, "packages.json");

async function readJson(filePath) {
    return JSON.parse(await readFile(filePath, "utf8"));
}

function warn(message) {
    console.warn(`warning: ${message}`);
}

function validatePackageCard(pkg, detail) {
    if (!pkg.latestVersion) {
        warn(`${pkg.id}: packages.json is missing latestVersion.`);
    }

    const heroImagePath = detail.heroImagePath || "";
    if (!heroImagePath && detail.imagePath && detail.thumbnailPath && detail.imagePath === detail.thumbnailPath) {
        warn(`${pkg.id}: imagePath and thumbnailPath reuse the same asset; detail page will fall back to compact art.`);
    }
    if (heroImagePath && detail.thumbnailPath && heroImagePath === detail.thumbnailPath) {
        warn(`${pkg.id}: heroImagePath reuses thumbnailPath. Prefer a dedicated hero image.`);
    }
    if (heroImagePath && detail.imagePath && heroImagePath === detail.imagePath && detail.imagePath === detail.thumbnailPath) {
        warn(`${pkg.id}: heroImagePath, imagePath and thumbnailPath all point to the same asset.`);
    }
}

async function main() {
    const index = await readJson(packagesIndexPath);
    let packageCount = 0;

    for (const pkg of index.packages || []) {
        packageCount += 1;
        const detailPath = path.join(releaseDir, pkg.id, "package.json");
        const detail = await readJson(detailPath);
        validatePackageCard(pkg, detail);
    }

    console.log(`Validated ${packageCount} release package manifest(s).`);
}

await main().catch(error => {
    console.error(error?.stack || error);
    process.exit(1);
});
