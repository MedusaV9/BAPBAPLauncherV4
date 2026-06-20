import path from "node:path";
import electron from "electron";
import { registerIpcHandlers } from "./ipc/register-ipc";
import { SettingsStoreService } from "./services/settings-store";
import { ManifestClient } from "./services/manifest-client";
import { ArchiveDownloadService } from "./services/archive-download.service";
import { InstanceService } from "./services/instance.service";
import { ContentService } from "./services/content.service";
import { LaunchService } from "./services/launch.service";
import { LauncherUpdaterService } from "./services/launcher-updater.service";
import { ConfigEditorService } from "./services/config-editor.service";
import { MelonLoaderService } from "./services/melonloader.service";
import { TrustedTimeService } from "./services/trusted-time.service";
import { RadioService } from "./services/radio.service";
import { RebalanceBackendService } from "./services/rebalance-backend.service";
import { BundleService } from "./services/bundle.service";
import { BundleUpdateService } from "./services/bundle-update.service";
import { ManifestClientBundleFetcher } from "./services/manifest-client-bundle-fetcher";

const { app, BrowserWindow, dialog, screen, shell } = electron;

let mainWindow: Electron.BrowserWindow | null = null;
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
        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }
        mainWindow.focus();
        return;
    }
    if (app.isReady()) {
        createMainWindow();
    }
});

function createMainWindow(): void {
    const windowIcon = resolveWindowIconPath();
    const { width, height, minWidth, minHeight } = getInitialWindowMetrics();
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
        title: "BAPBAP Launcher V2",
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

    mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
        if (fallbackToLocalRenderer(`did-fail-load (${errorCode}: ${errorDescription})`)) {
            return;
        }
        requestFatalExit(
            "BAPBAP Launcher V2 - Renderer Load Error",
            `Failed to load renderer (${errorCode}: ${errorDescription}).\nURL: ${validatedURL || "n/a"}`
        );
    });

    mainWindow.webContents.on("did-finish-load", () => {
        const activeUrl = mainWindow?.webContents.getURL() || "";
        if (activeUrl.startsWith("chrome-error://") && fallbackToLocalRenderer(`chrome-error-shell (${activeUrl})`)) {
            return;
        }
    });

    mainWindow.webContents.on("render-process-gone", (_event, details) => {
        requestFatalExit(
            "BAPBAP Launcher V2 - Renderer Crashed",
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

    mainWindow.on("closed", () => {
        mainWindow = null;
    });

    mainWindow.center();
}

app.whenReady().then(async () => {
    try {
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

        createMainWindow();
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

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

function assertRuntimeGuards(): void {
    if (process.env.ELECTRON_RUN_AS_NODE === "1") {
        requestFatalExit(
            "BAPBAP Launcher V2 - Invalid Runtime",
            "ELECTRON_RUN_AS_NODE=1 was detected. Please clear this environment variable before starting the launcher."
        );
    }

    if (!app || typeof app.whenReady !== "function" || typeof BrowserWindow !== "function") {
        requestFatalExit(
            "BAPBAP Launcher V2 - Electron API Error",
            "Electron runtime APIs are unavailable. The launcher cannot start."
        );
    }
}

function reportMainProcessError(type: "uncaughtException" | "unhandledRejection", error: unknown): void {
    const formatted = formatMainError(error);
    const context = formatted.context ? `\nContext: ${JSON.stringify(formatted.context)}` : "";
    const message = `[${type}] ${formatted.code}: ${formatted.message}${context}`;
    console.error(message, error);
    requestFatalExit("BAPBAP Launcher V2 - Main Process Error", message);
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
