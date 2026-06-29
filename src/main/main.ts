/**
 * BAPBAP Nexus — the next-generation BAPBAP modding suite.
 *
 * Built on the legacy of Sonic0810's BAPBAP Launcher.
 * Original author: Sonic0810 (https://github.com/Sonic0810)
 * License: MIT
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import electron from "electron";
import { registerIpcHandlers } from "./ipc/register-ipc";
import { IPC_CHANNELS } from "../shared/ipc";
import { SettingsStoreService } from "./services/core/settings-store";
import { ManifestClient } from "./services/vendored/manifest-client";
import { ArchiveDownloadService } from "./services/vendored/archive-download.service";
import { InstanceService } from "./services/core/instance.service";
import { ContentService } from "./services/core/content.service";
import { LaunchService } from "./services/core/launch.service";
import { LauncherUpdaterService } from "./services/core/launcher-updater.service";
import { ConfigEditorService } from "./services/core/config-editor.service";
import { MelonLoaderService } from "./services/vendored/melonloader.service";
import { TrustedTimeService } from "./services/vendored/trusted-time.service";
import { RadioService } from "./services/core/radio.service";
import { RebalanceBackendService } from "./services/vendored/rebalance-backend.service";
import { BundleService } from "./services/vendored/bundle.service";
import { BundleUpdateService } from "./services/vendored/bundle-update.service";
import { ManifestClientBundleFetcher } from "./services/vendored/manifest-client-bundle-fetcher";

const { app, BrowserWindow, Menu, Tray, dialog, screen, shell, protocol, net, nativeImage, ipcMain } = electron;

protocol.registerSchemesAsPrivileged([
    {
        scheme: "bap-audio",
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
            stream: true,
        },
    },
]);

let mainWindow: Electron.BrowserWindow | null = null;
let riftWindow: Electron.BrowserWindow | null = null;
let tray: Electron.Tray | null = null;
let isQuitting = false;
let pendingReveal = false;
let mainWindowReady = false;
let settingsRef: SettingsStoreService | null = null;
let trayBalloonShown = false;
const buildTimestamp = process.env.V2_BUILD_TIMESTAMP?.trim() || "development";
let fatalExitRequested = false;
let rendererFallbackAttempted = false;
const WINDOW_ICON_CANDIDATES = [
    path.resolve(process.cwd(), "build", "icon.ico"),
    path.resolve(process.cwd(), "assets", "favicon.ico"),
];
const requestedUserDataDir = process.env.V2_USER_DATA_DIR?.trim();
const allowTestMultiInstance = process.env.V2_ALLOW_MULTI_INSTANCE_FOR_TESTS === "1";

if (requestedUserDataDir) {
    app.setPath("userData", path.resolve(requestedUserDataDir));
}

// When packaged, inherit V2's userData directory so that settings,
// instances, radio cache, and MelonLoader state from V2 are picked up
// automatically — no migration step needed. The NSIS installer uses the
// same appId (com.bapbap.launcher.v2), so it replaces V2 in-place.
if (!requestedUserDataDir && app.isPackaged) {
    const parentDir = path.dirname(app.getPath("userData"));
    app.setPath("userData", path.join(parentDir, "bapbap-launcher-v2"));
}

const hasSingleInstanceLock = allowTestMultiInstance ? true : app.requestSingleInstanceLock();
if (!allowTestMultiInstance && !hasSingleInstanceLock) {
    app.quit();
}

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

assertRuntimeGuards();

process.on("uncaughtException", error => {
    reportMainProcessError("uncaughtException", error);
});

process.on("unhandledRejection", reason => {
    reportMainProcessError("unhandledRejection", reason);
});

app.on("second-instance", () => {
    if (mainWindow) {
        showMainWindow();
        return;
    }
    if (app.isReady()) {
        createMainWindow();
    }
});

function createMainWindow(options?: { initialScale?: number; show?: boolean }): void {
    const windowIcon = resolveWindowIconPath();
    const { width, height, minWidth, minHeight } = getInitialWindowMetrics();
    const initialScale = options?.initialScale ?? 1;
    const showOnReady = options?.show ?? true;
    const allowExternalRenderer = !app.isPackaged || process.env.V2_ALLOW_REMOTE_RENDERER === "1";
    const rendererUrl = allowExternalRenderer ? process.env.ELECTRON_RENDERER_URL?.trim() : undefined;
    const rendererFile = path.join(__dirname, "../renderer/index.html");
    rendererFallbackAttempted = false;
    mainWindow = new BrowserWindow({
        width,
        height,
        useContentSize: true,
        minWidth,
        minHeight,
        backgroundColor: "#0c1220",
        autoHideMenuBar: true,
        show: showOnReady,
        title: "BAPBAP Nexus",
        icon: windowIcon,
        webPreferences: {
            preload: path.join(__dirname, "../preload/index.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            devTools: !app.isPackaged,
        },
    });

    const fallbackToLocalRenderer = (reason: string): boolean => {
        if (!mainWindow || rendererFallbackAttempted || !rendererUrl || !shouldFallbackRendererUrl(rendererUrl)) {
            return false;
        }
        rendererFallbackAttempted = true;
        console.warn(`[renderer-fallback] ${reason} -> ${rendererUrl} -> local file renderer`);
        mainWindow.loadFile(rendererFile).catch(error => {
            reportMainProcessError("uncaughtException", error);
        });
        return true;
    };

    mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame) {
            return;
        }
        if (fallbackToLocalRenderer(`did-fail-load (${errorCode}: ${errorDescription})`)) {
            return;
        }
        requestFatalExit(
            "BAPBAP Nexus - Renderer Load Error",
            `Failed to load renderer (${errorCode}: ${errorDescription}).\nURL: ${validatedURL || "n/a"}`
        );
    });

    mainWindow.webContents.on("did-finish-load", () => {
        const activeUrl = mainWindow?.webContents.getURL() || "";
        if (activeUrl.startsWith("chrome-error://") && fallbackToLocalRenderer(`chrome-error-shell (${activeUrl})`)) {
            return;
        }
        // Reset to the user's saved UI scale on every navigation so
        // accidental Ctrl+Scroll / pinch-zoom doesn't persist.
        mainWindow?.webContents.setZoomFactor(initialScale);
        mainWindowReady = true;
        if (pendingReveal) {
            pendingReveal = false;
            revealMainFromRift();
        }
    });

    mainWindow.webContents.on("render-process-gone", (_event, details) => {
        requestFatalExit(
            "BAPBAP Nexus - Renderer Crashed",
            `Renderer process exited unexpectedly.\nReason: ${details.reason}\nExit code: ${details.exitCode}`
        );
    });

    if (rendererUrl) {
        mainWindow.loadURL(rendererUrl).catch(error => {
            if (fallbackToLocalRenderer(`loadURL rejected: ${formatMainError(error).message}`)) {
                return;
            }
            reportMainProcessError("uncaughtException", error);
        });
    } else {
        mainWindow.loadFile(rendererFile).catch(error => {
            reportMainProcessError("uncaughtException", error);
        });
    }

    if (!app.isPackaged && process.env.V2_DISABLE_DEVTOOLS !== "1") {
        mainWindow.webContents.openDevTools({ mode: "detach" });
    }

    mainWindow.on("close", event => {
        if (isQuitting) {
            return;
        }
        if (settingsRef?.getCloseToTrayEnabled() && tray) {
            event.preventDefault();
            mainWindow?.hide();
            if (!trayBalloonShown) {
                trayBalloonShown = true;
                try {
                    tray.displayBalloon?.({
                        title: "BAPBAP Nexus",
                        content: "Still running in the tray. Right-click the icon to quit.",
                    });
                } catch {
                    // displayBalloon is Windows-only and can throw on some shells.
                }
            }
        }
    });

    mainWindow.on("closed", () => {
        mainWindow = null;
        mainWindowReady = false;
    });

    // Route external window.open calls to the system browser (fallback
    // for shell.openExternal when the preload bridge is not available).
    mainWindow.webContents.setWindowOpenHandler(details => {
        const url = details.url;
        if (url.startsWith("https://") || url.startsWith("http://")) {
            shell.openExternal(url);
        }
        return { action: "deny" };
    });

    mainWindow.center();
}

function showMainWindow(): void {
    if (!mainWindow) {
        createMainWindow({ initialScale: settingsRef?.getUiScale() ?? 1 });
        return;
    }
    if (mainWindow.isMinimized()) {
        mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
}

function createTray(): void {
    if (tray) {
        return;
    }
    const iconPath = resolveWindowIconPath();
    const image = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
    try {
        tray = new Tray(image);
    } catch (error) {
        console.warn("[tray] failed to create tray", error);
        return;
    }
    tray.setToolTip("BAPBAP Nexus");
    const menu = Menu.buildFromTemplate([
        { label: "Open BAPBAP Nexus", click: () => showMainWindow() },
        { type: "separator" },
        {
            label: "Quit",
            click: () => {
                isQuitting = true;
                app.quit();
            },
        },
    ]);
    tray.setContextMenu(menu);
    tray.on("click", () => showMainWindow());
}

function createRiftWindow(): void {
    const display = screen.getPrimaryDisplay();
    const { x, y, width, height } = display.bounds;
    riftWindow = new BrowserWindow({
        x,
        y,
        width,
        height,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        hasShadow: false,
        focusable: false,
        fullscreenable: false,
        backgroundColor: "#00000000",
        webPreferences: {
            preload: path.join(__dirname, "../preload/index.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            devTools: !app.isPackaged,
        },
    });
    riftWindow.setIgnoreMouseEvents(true);
    riftWindow.setAlwaysOnTop(true, "screen-saver");

    riftWindow.webContents.on("did-finish-load", () => {
        console.log("[rift] overlay loaded");
    });
    riftWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
        console.warn(`[rift] overlay failed to load (${code}: ${desc}) ${url} — revealing main directly`);
        revealMainFromRift();
        closeRiftWindow();
    });

    const reduced = settingsRef?.getAll().uiMotionEnabled === false ? "?reduced=1" : "";
    const allowExternalRenderer = !app.isPackaged || process.env.V2_ALLOW_REMOTE_RENDERER === "1";
    const rendererUrl = allowExternalRenderer ? process.env.ELECTRON_RENDERER_URL?.trim() : undefined;
    if (rendererUrl) {
        void riftWindow.loadURL(`${rendererUrl}/rift.html${reduced}`);
    } else {
        void riftWindow.loadFile(path.join(__dirname, "../renderer/rift.html"), {
            search: reduced ? "reduced=1" : undefined,
        });
    }

    riftWindow.on("closed", () => {
        riftWindow = null;
    });

    // Safety net: if the rift renderer never signals, reveal the main window anyway.
    setTimeout(() => {
        if (riftWindow || !mainWindow?.isVisible()) {
            revealMainFromRift();
            closeRiftWindow();
        }
    }, 8000);
}

function revealMainFromRift(): void {
    if (!mainWindow) {
        return;
    }
    if (!mainWindowReady) {
        pendingReveal = true;
        return;
    }
    if (mainWindow.isVisible()) {
        mainWindow.focus();
        return;
    }
    // Reduced motion: skip the grow animation, just show.
    if (settingsRef?.getAll().uiMotionEnabled === false) {
        mainWindow.show();
        mainWindow.focus();
        return;
    }
    growWindowFromRift(mainWindow);
}

// Animate the window emerging from the rift: start as a small rect at the
// screen center (where the portal opened) and grow to its final bounds.
function growWindowFromRift(win: Electron.BrowserWindow): void {
    const finalBounds = win.getBounds();
    const display = screen.getPrimaryDisplay();
    const center = {
        x: display.bounds.x + display.bounds.width / 2,
        y: display.bounds.y + display.bounds.height / 2,
    };

    const steps = 18;
    const stepMs = 16;
    const startScale = 0.18;
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    const boundsAt = (scale: number): Electron.Rectangle => {
        const w = Math.max(120, Math.round(finalBounds.width * scale));
        const h = Math.max(90, Math.round(finalBounds.height * scale));
        return {
            width: w,
            height: h,
            x: Math.round(center.x - w / 2),
            y: Math.round(center.y - h / 2),
        };
    };

    try {
        win.setOpacity(0);
        win.setBounds(boundsAt(startScale));
        win.show();
    } catch {
        win.show();
        win.focus();
        return;
    }

    let i = 0;
    const tick = () => {
        if (!mainWindow || mainWindow.isDestroyed()) {
            return;
        }
        i += 1;
        const t = easeOut(i / steps);
        const scale = startScale + (1 - startScale) * t;
        try {
            mainWindow.setOpacity(Math.min(1, t * 1.4));
            if (i >= steps) {
                mainWindow.setBounds(finalBounds);
                mainWindow.setOpacity(1);
                mainWindow.focus();
                return;
            }
            mainWindow.setBounds(boundsAt(scale));
        } catch {
            mainWindow.setBounds(finalBounds);
            mainWindow.setOpacity(1);
            mainWindow.focus();
            return;
        }
        setTimeout(tick, stepMs);
    };
    setTimeout(tick, stepMs);
}

function closeRiftWindow(): void {
    if (riftWindow && !riftWindow.isDestroyed()) {
        riftWindow.close();
    }
    riftWindow = null;
}


app.whenReady().then(async () => {
    try {
        protocol.handle("bap-audio", request => {
            let filePath = decodeURIComponent(request.url.slice("bap-audio://".length));
            // Strip any leading slashes
            filePath = filePath.replace(/^\/+/, "");
            // Restore Windows drive letter colon if normalized away by Chromium standard URL parsing
            if (/^[a-zA-Z]\//.test(filePath)) {
                filePath = filePath[0] + ":" + filePath.slice(1);
            }
            return net.fetch(pathToFileURL(filePath).toString());
        });

        if (process.platform === "win32") {
            app.setAppUserModelId("com.bapbap.launcher.v2");
        }
        const settings = new SettingsStoreService();
        const manifests = new ManifestClient(settings);
        const trustedTime = new TrustedTimeService(manifests);
        const downloader = new ArchiveDownloadService();
        const melonLoader = new MelonLoaderService(manifests, downloader);
        const instances = new InstanceService(settings, manifests, downloader, trustedTime, melonLoader);
        const content = new ContentService(manifests, instances, downloader, trustedTime);
        const launch = new LaunchService(instances, manifests, settings, melonLoader);
        const updater = new LauncherUpdaterService(manifests, downloader, settings);
        const config = new ConfigEditorService(instances);
        const radio = new RadioService(manifests, downloader, settings);
        const rebalance = new RebalanceBackendService(app, dialog, shell, instances, launch, settings);
        const bundle = new BundleService(settings, instances, manifests, downloader, melonLoader);
        // Production Bundle update fetcher reuses the existing manifest tree
        // (manifest/index.json → manifest/bundles.json) so Bundle updates
        // share the same GitHub infrastructure as game versions, mod
        // channels, launcher self-updates, MelonLoader, and radio.
        const bundleUpdateFetcher = new ManifestClientBundleFetcher(manifests, downloader);
        const bundleUpdate = new BundleUpdateService(settings, downloader, instances, bundleUpdateFetcher);
        // Recover orphan staging dirs from a previous interrupted apply.
        void bundleUpdate.boot().catch(error => {
            console.warn("[bundle-update] boot recovery failed", error);
        });
        trustedTime.start();

        const startupInstall = await updater.initialize();
        if (startupInstall?.started) {
            return;
        }

        registerIpcHandlers({
            settings,
            manifests,
            instances,
            content,
            launch,
            updater,
            trustedTime,
            config,
            radio,
            rebalance,
            bundle,
            bundleUpdate,
            buildTimestamp,
        });

        settingsRef = settings;
        createTray();

        ipcMain.on(IPC_CHANNELS.riftRevealMain, () => {
            revealMainFromRift();
        });
        ipcMain.on(IPC_CHANNELS.riftDone, () => {
            closeRiftWindow();
        });

        const riftEnabled = settings.getRiftIntroEnabled();
        if (riftEnabled) {
            // Warm the main window hidden, then let it emerge from the rift.
            createMainWindow({ initialScale: settings.getUiScale(), show: false });
            createRiftWindow();
        } else {
            createMainWindow({ initialScale: settings.getUiScale() });
        }
        void radio.sync(false).catch(error => {
            console.warn("[radio-sync] initial sync failed", error);
        });
    } catch (error) {
        reportMainProcessError("uncaughtException", error);
    }
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("before-quit", () => {
    isQuitting = true;
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    } else {
        showMainWindow();
    }
});

function assertRuntimeGuards(): void {
    if (process.env.ELECTRON_RUN_AS_NODE === "1") {
        requestFatalExit(
            "BAPBAP Nexus - Invalid Runtime",
            "ELECTRON_RUN_AS_NODE=1 was detected. Please clear this environment variable before starting the launcher."
        );
    }

    if (!app || typeof app.whenReady !== "function" || typeof BrowserWindow !== "function") {
        requestFatalExit(
            "BAPBAP Nexus - Electron API Error",
            "Electron runtime APIs are unavailable. The launcher cannot start."
        );
    }
}

function reportMainProcessError(type: "uncaughtException" | "unhandledRejection", error: unknown): void {
    const formatted = formatMainError(error);
    const context = formatted.context ? `\nContext: ${JSON.stringify(formatted.context)}` : "";
    const message = `[${type}] ${formatted.code}: ${formatted.message}${context}`;
    console.error(message, error);
    requestFatalExit("BAPBAP Nexus - Main Process Error", message);
}

function formatMainError(error: unknown): { code: string; message: string; context?: Record<string, unknown> } {
    if (error instanceof Error) {
        const typed = error as Error & { code?: string; context?: Record<string, unknown> };
        return {
            code: typed.code || "V2_MAIN_ERROR",
            message: typed.message || "Unexpected main-process failure.",
            context: typed.context,
        };
    }
    return {
        code: "V2_MAIN_ERROR",
        message: String(error),
    };
}

function requestFatalExit(title: string, message: string): never {
    if (fatalExitRequested) {
        process.exit(1);
    }
    fatalExitRequested = true;
    try {
        dialog.showErrorBox(title, message);
    } catch {
        // no-op: dialog can fail during early startup teardown.
    }
    try {
        if (app && typeof app.exit === "function") {
            app.exit(1);
        }
    } catch {
        // no-op
    }
    process.exit(1);
}

function resolveWindowIconPath(): string | undefined {
    const packagedCandidate = path.join(process.resourcesPath, "icon.ico");
    if (app.isPackaged && fileExists(packagedCandidate)) {
        return packagedCandidate;
    }

    for (const candidate of WINDOW_ICON_CANDIDATES) {
        if (fileExists(candidate)) {
            return candidate;
        }
    }

    return undefined;
}

function getInitialWindowMetrics(): { width: number; height: number; minWidth: number; minHeight: number } {
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workAreaSize;
    const desiredWidth = 1560;
    const desiredHeight = 1040;
    const safeWidth = Math.max(1080, workArea.width - 48);
    const safeHeight = Math.max(760, workArea.height - 64);
    const width = Math.min(desiredWidth, safeWidth);
    const height = Math.min(desiredHeight, safeHeight);

    return {
        width,
        height,
        minWidth: Math.min(width, 1180),
        minHeight: Math.min(height, 760),
    };
}

function fileExists(target: string): boolean {
    try {
        return electron.nativeImage.createFromPath(target).isEmpty() === false;
    } catch {
        return false;
    }
}

function shouldFallbackRendererUrl(value: string): boolean {
    try {
        const parsed = new URL(value);
        return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    } catch {
        return false;
    }
}
