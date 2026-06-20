import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { LaunchInput } from "../../shared/ipc";
import { InstanceService } from "./instance.service";
import { LaunchService } from "./launch.service";
import { SettingsStoreService } from "./settings-store";
import { assertInside, assertSafeExtension, DOCUMENT_ALLOWED_EXTENSIONS, FILESRC_ALLOWED_EXTENSIONS } from "../utils/path-containment";

const require = createRequire(import.meta.url);

/**
 * Static allowlist of Rebalance IPC commands permitted to reach the vendor backend.
 * Any command not in this set is rejected before forwarding.
 */
export const REBALANCE_ALLOWED_COMMANDS: ReadonlySet<string> = new Set([
    "bootstrap",
    "pick_workspace_root",
    "save_workspace_root",
    "open_document",
    "save_document",
    "create_custom_draft",
    "create_workspace_snapshot",
    "repair_workspace_support_files",
    "launch_game",
    "open_in_explorer",
    "pick_pack_export_path",
    "pick_pack_import_path",
    "export_pack_preview",
    "export_pack",
    "import_pack_preview",
    "import_pack",
    "drop_pack_to_mod",
    "list_import_receipts",
    "list_installed_packs",
    "set_active_content_pack",
    "read_game_mode_index",
    "refresh_game_mode_probe",
    "read_operation_capabilities",
    "read_library_metadata",
    "list_library_entries",
]);

function assertAllowed(command: string): void {
    if (!REBALANCE_ALLOWED_COMMANDS.has(command)) {
        console.warn(`[RebalanceBackendService] Rejected disallowed command: ${command}`);
        throw new Error(`Command not allowed: ${command}`);
    }
}

type RebalanceBackend = {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    fileSrc(targetPath: string): string;
};

type RebalanceBackendFactory = (input: {
    app: Electron.App;
    dialog: Electron.Dialog;
    shell: Electron.Shell;
}) => RebalanceBackend;

function resolveBackendModulePath(): string {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
        path.resolve(process.cwd(), "dist/main/rebalance-vendor/electron/backend.cjs"),
        path.resolve(process.cwd(), "src/main/rebalance-vendor/electron/backend.cjs"),
        path.resolve(currentDir, "./rebalance-vendor/electron/backend.cjs"),
        path.resolve(currentDir, "../rebalance-vendor/electron/backend.cjs"),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    throw new Error("Could not locate the embedded Rebalance backend module.");
}

/** Commands that establish or change the active workspace root. */
const WORKSPACE_SETTING_COMMANDS = new Set(["bootstrap", "save_workspace_root"]);

export class RebalanceBackendService {
    private readonly app: Electron.App;
    private readonly dialog: Electron.Dialog;
    private readonly shell: Electron.Shell;
    private readonly instances: InstanceService;
    private readonly launch: LaunchService;
    private readonly settings: SettingsStoreService;
    private backend: RebalanceBackend | null = null;
    private activeWorkspaceRoot: string | null = null;

    constructor(
        app: Electron.App,
        dialog: Electron.Dialog,
        shell: Electron.Shell,
        instances: InstanceService,
        launch: LaunchService,
        settings: SettingsStoreService,
    ) {
        this.app = app;
        this.dialog = dialog;
        this.shell = shell;
        this.instances = instances;
        this.launch = launch;
        this.settings = settings;
    }

    private getBackend(): RebalanceBackend {
        if (this.backend) {
            return this.backend;
        }
        const backendModulePath = resolveBackendModulePath();
        const { createBackend } = require(backendModulePath) as { createBackend: RebalanceBackendFactory };
        this.backend = createBackend({
            app: this.app,
            dialog: this.dialog,
            shell: this.shell,
        });
        return this.backend;
    }

    async invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
        assertAllowed(command);

        // Path traversal validation: ensure any absolutePath argument is within the workspace root
        this.validatePathArgs(command, args);

        if (command === "launch_game") {
            const launched = await this.tryLaunchThroughLauncher(args);
            if (launched) {
                return null;
            }
        }
        const result = await this.getBackend().invoke(command, args);

        // Track workspace root when it's established or changed
        if (WORKSPACE_SETTING_COMMANDS.has(command) && result && typeof result === "object") {
            const payload = result as Record<string, unknown>;
            const workspace = payload.workspace as Record<string, unknown> | null | undefined;
            if (workspace && typeof workspace.workspaceRoot === "string") {
                this.activeWorkspaceRoot = workspace.workspaceRoot;
            }
        }

        return result;
    }

    /**
     * Validate that any path arguments in the IPC command are contained within the workspace root.
     * Defence-in-depth: prevents path traversal attacks at the IPC boundary.
     */
    private validatePathArgs(command: string, args?: Record<string, unknown>): void {
        if (!args) return;

        // Determine the workspace root to validate against
        const workspaceRoot = this.resolveWorkspaceRootFromArgs(args);
        if (!workspaceRoot) return;

        // Commands with a top-level absolutePath
        if (typeof args.absolutePath === "string") {
            assertInside(workspaceRoot, args.absolutePath, command);
            assertSafeExtension(args.absolutePath, DOCUMENT_ALLOWED_EXTENSIONS);
        }

        // Commands with a nested request object (e.g. save_document, create_custom_draft)
        if (args.request && typeof args.request === "object") {
            const request = args.request as Record<string, unknown>;
            const reqWorkspace = typeof request.workspaceRoot === "string" ? request.workspaceRoot : workspaceRoot;
            if (typeof request.absolutePath === "string") {
                assertInside(reqWorkspace, request.absolutePath, command);
                assertSafeExtension(request.absolutePath, DOCUMENT_ALLOWED_EXTENSIONS);
            }
        }
    }

    private resolveWorkspaceRootFromArgs(args: Record<string, unknown>): string | null {
        // The containment boundary must be the TRUSTED active workspace root,
        // never a caller-supplied one — otherwise a caller could pass
        // { workspaceRoot, absolutePath } both inside an attacker-chosen tree
        // and assertInside would pass trivially, defeating the traversal guard.
        // Only fall back to the args-supplied root before a workspace has been
        // established (first run, pre-bootstrap), where no trusted root exists yet.
        if (this.activeWorkspaceRoot) {
            return this.activeWorkspaceRoot;
        }
        if (typeof args.workspaceRoot === "string" && args.workspaceRoot.trim()) {
            return args.workspaceRoot;
        }
        if (args.request && typeof args.request === "object") {
            const request = args.request as Record<string, unknown>;
            if (typeof request.workspaceRoot === "string" && request.workspaceRoot.trim()) {
                return request.workspaceRoot;
            }
        }
        return null;
    }

    fileSrc(targetPath: string): string {
        // Path containment: ensure the requested path is inside the active workspace
        if (!this.activeWorkspaceRoot) {
            throw new Error("Cannot serve fileSrc: no active workspace root has been established.");
        }
        assertInside(this.activeWorkspaceRoot, targetPath, "fileSrc");
        assertSafeExtension(targetPath, FILESRC_ALLOWED_EXTENSIONS);

        return this.getBackend().fileSrc(targetPath);
    }

    private async tryLaunchThroughLauncher(args?: Record<string, unknown>): Promise<boolean> {
        const workspaceRoot = typeof args?.workspaceRoot === "string" ? args.workspaceRoot.trim() : "";
        if (!workspaceRoot) {
            return false;
        }

        const normalizedWorkspaceRoot = path.resolve(workspaceRoot).toLowerCase();
        const instances = await this.instances.list();
        const matchingInstance = instances.find(instance => path.resolve(instance.path).toLowerCase() === normalizedWorkspaceRoot);
        if (!matchingInstance) {
            return false;
        }

        const settings = await this.settings.getAll();
        const launchInput: LaunchInput = {
            instanceId: matchingInstance.id,
            showMelonConsole: settings.launchShowMelonConsole,
        };
        await this.launch.launch(launchInput);
        return true;
    }
}
