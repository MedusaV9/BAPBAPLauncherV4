const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

module.exports = async function afterPack(context) {
    if (context.electronPlatformName !== "win32") {
        return;
    }

    const projectDir = context.packager.projectDir;
    const productFilename = context.packager.appInfo.productFilename;
    const executablePath = path.join(context.appOutDir, `${productFilename}.exe`);
    const iconPath = path.join(projectDir, "build", "icon.ico");
    const rceditPath = resolveRcedit(projectDir);

    if (!fs.existsSync(executablePath)) {
        throw new Error(`[afterPack] Could not find packaged executable: ${executablePath}`);
    }
    if (!fs.existsSync(iconPath)) {
        throw new Error(`[afterPack] Could not find icon asset: ${iconPath}`);
    }
    if (!rceditPath) {
        throw new Error("[afterPack] Could not locate rcedit.exe for Windows icon patching.");
    }

    await runProcess(rceditPath, [executablePath, "--set-icon", iconPath]);
    console.log(`[afterPack] patched Windows executable icon: ${path.basename(executablePath)}`);
};

function resolveRcedit(projectDir) {
    const directCandidate = path.join(projectDir, "node_modules", "electron-winstaller", "vendor", "rcedit.exe");
    if (fs.existsSync(directCandidate)) {
        return directCandidate;
    }

    const cacheRoot = path.join(process.env.LOCALAPPDATA || "", "electron-builder", "Cache", "winCodeSign");
    if (!cacheRoot || !fs.existsSync(cacheRoot)) {
        return null;
    }

    const cacheCandidates = fs.readdirSync(cacheRoot)
        .map(name => path.join(cacheRoot, name, "rcedit-x64.exe"))
        .filter(candidate => fs.existsSync(candidate));

    return cacheCandidates[0] || null;
}

function runProcess(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: "inherit",
            windowsHide: true,
        });

        child.on("error", reject);
        child.on("exit", code => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`Command failed with exit code ${code}: ${command}`));
        });
    });
}
