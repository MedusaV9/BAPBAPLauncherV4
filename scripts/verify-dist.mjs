import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { constants as fsConstants } from "node:fs";

const root = process.cwd();
const requiredPaths = [
    "dist/main/main.cjs",
    "dist/main/rebalance-vendor/package.json",
    "dist/main/rebalance-vendor/electron/backend.cjs",
    "dist/main/rebalance-vendor/electron/shared.cjs",
    "dist/main/rebalance-vendor/electron/catalog.cjs",
    "dist/main/rebalance-vendor/electron/packs.cjs",
    "dist/main/rebalance-vendor/default-workspace/_launcher-bundled-workspace.json",
    "dist/main/rebalance-vendor/default-workspace/Library/AllOptions.index.json",
    "dist/main/rebalance-vendor/default-workspace/Runtime/ArenaSettings/GameModes.index.json",
    "dist/main/rebalance-vendor/default-workspace/Custom/Augments/00_Example_Firewave.json",
    "dist/main/bundles/boss-rush/manifest.json",
    "dist/preload/index.cjs",
    "dist/renderer/index.html",
    "dist/renderer/rebalance.html",
];

async function ensurePathExists(relativePath) {
    const absolute = path.join(root, relativePath);
    try {
        await access(absolute, fsConstants.R_OK);
    } catch {
        throw new Error(`Missing build artifact: ${relativePath}`);
    }
}

async function ensureRendererAssets() {
    const assetsDir = path.join(root, "dist/renderer/assets");
    try {
        const entries = await readdir(assetsDir, { withFileTypes: true });
        const files = entries.filter(item => item.isFile());
        if (files.length === 0) {
            throw new Error("Renderer assets folder is empty.");
        }

        const fileNames = files.map(item => item.name.toLowerCase());
        const requiredPatterns = [
            "inspect-card-template",
            "content-border",
            "rewardobtained_bg",
            "archivo-black",
            "archivo-medium",
        ];
        for (const pattern of requiredPatterns) {
            if (!fileNames.some(name => name.includes(pattern))) {
                throw new Error(`Renderer assets are missing ${pattern}.`);
            }
        }
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Renderer assets check failed: ${error.message}`);
        }
        throw new Error("Renderer assets check failed.");
    }
}

async function ensureBundledPreviewAssets() {
    const previewDir = path.join(root, "dist/renderer/rebalance-previews");
    const requiredFiles = [
        "Archivo-Black.ttf",
        "Archivo-Medium.ttf",
        "content-border.png",
        "fractals_option_card.png",
        "inspect-card-template.png",
        "RewardObtained_BG.png",
    ];
    try {
        const entries = await readdir(previewDir, { withFileTypes: true });
        const files = new Set(entries.filter(item => item.isFile()).map(item => item.name));
        if (files.size === 0) {
            throw new Error("Bundled rebalance preview folder is empty.");
        }
        for (const file of requiredFiles) {
            if (!files.has(file)) {
                throw new Error(`Bundled rebalance preview assets are missing ${file}.`);
            }
        }
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Bundled rebalance preview asset check failed: ${error.message}`);
        }
        throw new Error("Bundled rebalance preview asset check failed.");
    }
}

async function run() {
    for (const item of requiredPaths) {
        await ensurePathExists(item);
    }
    await ensureRendererAssets();
    await ensureBundledPreviewAssets();
    console.log("verify-dist: OK");
}

run().catch(error => {
    console.error(`verify-dist: FAILED -> ${error.message}`);
    process.exit(1);
});
