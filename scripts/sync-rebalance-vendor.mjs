import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Copy runtime-read main-process resources from src/main/ into dist/main/
 * AFTER electron-vite has finished its build (electron-vite recreates
 * dist/main on every build, so this MUST run as the last step of build:v2).
 *
 * Resources copied:
 *   - src/main/rebalance-vendor/        → dist/main/rebalance-vendor/
 *     (Studio-iframe vendor bundle: default-workspace, electron/*.cjs, …)
 *   - src/main/bundles/                  → dist/main/bundles/
 *     (Bundle Instance fallback content for the third instance type)
 */

const root = process.cwd();

const copyTargets = [
    {
        source: path.join(root, "src", "main", "rebalance-vendor"),
        target: path.join(root, "dist", "main", "rebalance-vendor"),
        label: "rebalance-vendor",
    },
    {
        source: path.join(root, "src", "main", "bundles"),
        target: path.join(root, "dist", "main", "bundles"),
        label: "bundles",
    },
];

async function exists(target) {
    try {
        await stat(target);
        return true;
    } catch {
        return false;
    }
}

async function syncOne(label, source, target) {
    if (!(await exists(source))) {
        // Source missing — silently skip. New repos may not have a Bundle
        // tree yet; that is not an error.
        return;
    }
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    await cp(source, target, { recursive: true, force: true });
    console.log(`sync-rebalance-vendor: ${label} OK`);
}

async function run() {
    for (const item of copyTargets) {
        await syncOne(item.label, item.source, item.target);
    }
    // Backward-compat single-line success marker that build pipeline scripts
    // and tests still grep for ("sync-rebalance-vendor: OK").
    console.log("sync-rebalance-vendor: OK");
}

run().catch(error => {
    console.error(`sync-rebalance-vendor: FAILED -> ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});
