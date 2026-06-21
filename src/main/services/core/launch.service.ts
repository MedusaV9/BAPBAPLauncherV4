import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { ManifestClient } from "../vendored/manifest-client";
import { InstanceService } from "./instance.service";
import { LaunchInput, LaunchRuntimeLogEntry, LaunchRuntimeState } from "../../../shared/ipc";
import { MelonLoaderService } from "../vendored/melonloader.service";
import { SettingsStoreService } from "./settings-store";
import { splitWindowsArgs } from "./launch-args";

const RUNTIME_STATE_EVENT = "runtime-state";
const RUNTIME_LOG_EVENT = "runtime-log";
const MAX_RUNTIME_LOGS = 400;
const FIRST_RUN_MELONLOADER_MESSAGE = "First start can take a bit longer while MelonLoader finishes setting this profile up.";

export class LaunchService {
    private readonly instances: InstanceService;
    private readonly manifests: ManifestClient;
    private readonly settings: SettingsStoreService;
    private readonly melonLoader: MelonLoaderService;
    private readonly runtimeEvents = new EventEmitter();
    private runtimeState: LaunchRuntimeState = {
        status: "idle",
        recentLogs: [],
    };
    private activeChild: ChildProcess | null = null;
    private logSequence = 0;
    private stopRequestedPid: number | null = null;

    constructor(instances: InstanceService, manifests: ManifestClient, settings: SettingsStoreService, melonLoader: MelonLoaderService) {
        this.instances = instances;
        this.manifests = manifests;
        this.settings = settings;
        this.melonLoader = melonLoader;
    }

    getRuntimeState(): LaunchRuntimeState {
        return {
            ...this.runtimeState,
            recentLogs: [...(this.runtimeState.recentLogs || [])],
        };
    }

    onRuntimeStateChanged(listener: (state: LaunchRuntimeState) => void): () => void {
        this.runtimeEvents.on(RUNTIME_STATE_EVENT, listener);
        return () => {
            this.runtimeEvents.off(RUNTIME_STATE_EVENT, listener);
        };
    }

    onRuntimeLog(listener: (entry: LaunchRuntimeLogEntry) => void): () => void {
        this.runtimeEvents.on(RUNTIME_LOG_EVENT, listener);
        return () => {
            this.runtimeEvents.off(RUNTIME_LOG_EVENT, listener);
        };
    }

    async launch(input: LaunchInput): Promise<void> {
        if (this.runtimeState.status === "launching" || this.runtimeState.status === "running" || this.runtimeState.status === "stopping") {
            throw new Error("A launcher-managed game session is already running.");
        }

        const instance = await this.instances.getById(input.instanceId);
        const firstRunPending = Boolean(instance.melonLoaderFirstRunPending);
        const manifestIndex = await this.manifests.getIndex();
        const executable = manifestIndex.game.executable || "bapbap.exe";
        const executablePath = path.join(instance.path, executable);

        const args: string[] = [];
        const showConsole = input.showMelonConsole;
        if (!showConsole) {
            args.push("--melonloader.hideconsole");
        }

        const customArgs = `${input.customArgs || ""}`.trim();
        if (customArgs) {
            args.push(...splitWindowsArgs(customArgs));
        }

        const startedAtUtc = new Date().toISOString();
        this.runtimeState = {
            status: "launching",
            instanceId: instance.id,
            profileName: instance.profileName || instance.name,
            startedAtUtc,
            recentLogs: [],
        };
        this.emitRuntimeState();
        this.pushLog("system", `Checking MelonLoader for ${instance.profileName || instance.name}...`);
        if (firstRunPending) {
            this.pushLog("system", FIRST_RUN_MELONLOADER_MESSAGE);
        }

        try {
            await this.melonLoader.ensureInstalled(instance.path);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.pushLog("system", `Launch failed: ${message}`);
            this.setRuntimeState({
                status: "failed",
                instanceId: instance.id,
                profileName: instance.profileName || instance.name,
                startedAtUtc,
                exitedAtUtc: new Date().toISOString(),
                error: message,
            });
            throw error;
        }

        this.pushLog("system", "MelonLoader ready.");
        this.pushLog("system", `Launching ${instance.profileName || instance.name}...`);

        const child = spawn(executablePath, args, {
            cwd: instance.path,
            detached: true,
            windowsHide: !showConsole,
            stdio: ["ignore", "pipe", "pipe"],
        });
        this.activeChild = child;

        let stdoutBuffer = "";
        let stderrBuffer = "";

        const flushBufferedText = (stream: "stdout" | "stderr", forceBuffer: string) => {
            const message = forceBuffer.trim();
            if (message) {
                this.pushLog(stream, message);
            }
        };

        const consumeStream = (stream: "stdout" | "stderr", buffer: string, chunk: Buffer): string => {
            const nextText = `${buffer}${chunk.toString("utf8")}`.replace(/\r\n/g, "\n");
            const parts = nextText.split("\n");
            const remainder = parts.pop() ?? "";
            for (const line of parts) {
                const message = line.replace(/\r/g, "").trimEnd();
                if (message) {
                    this.pushLog(stream, message);
                }
            }
            return remainder;
        };

        child.once("spawn", () => {
            this.stopRequestedPid = null;
            void this.instances.markMelonLoaderFirstRunCompleted(instance.id).catch(() => {});
            this.setRuntimeState({
                status: "running",
                instanceId: instance.id,
                profileName: instance.profileName || instance.name,
                pid: child.pid,
                startedAtUtc,
            });
            this.pushLog("system", `Process started${child.pid ? ` (PID ${child.pid})` : ""}.`);
        });

        child.stdout.on("data", chunk => {
            stdoutBuffer = consumeStream("stdout", stdoutBuffer, chunk);
        });
        child.stderr.on("data", chunk => {
            stderrBuffer = consumeStream("stderr", stderrBuffer, chunk);
        });

        const finalizeRuntime = (nextState: LaunchRuntimeState) => {
            flushBufferedText("stdout", stdoutBuffer);
            flushBufferedText("stderr", stderrBuffer);
            stdoutBuffer = "";
            stderrBuffer = "";
            this.activeChild = null;
            this.setRuntimeState(nextState);
        };

        child.once("error", error => {
            this.stopRequestedPid = null;
            this.pushLog("system", `Launch failed: ${error.message}`);
            finalizeRuntime({
                status: "failed",
                instanceId: instance.id,
                profileName: instance.profileName || instance.name,
                startedAtUtc,
                exitedAtUtc: new Date().toISOString(),
                error: error.message,
            });
        });

        child.once("exit", code => {
            const stoppedFromLauncher = this.stopRequestedPid === child.pid;
            this.stopRequestedPid = null;
            this.pushLog(
                "system",
                stoppedFromLauncher
                    ? "Game stopped from launcher."
                    : `Process exited${typeof code === "number" ? ` with code ${code}` : ""}.`
            );
            finalizeRuntime({
                status: "exited",
                instanceId: instance.id,
                profileName: instance.profileName || instance.name,
                pid: child.pid,
                startedAtUtc,
                exitedAtUtc: new Date().toISOString(),
                exitCode: code,
            });
        });

        child.unref();
        this.settings.set("launchShowMelonConsole", showConsole);
    }

    async stop(): Promise<void> {
        const pid = this.runtimeState.pid ?? this.activeChild?.pid;
        if (!pid || (this.runtimeState.status !== "running" && this.runtimeState.status !== "stopping")) {
            throw new Error("No launcher-managed game session is running.");
        }
        if (this.runtimeState.status === "stopping") {
            return;
        }

        const previousState = this.getRuntimeState();
        this.stopRequestedPid = pid;
        this.pushLog("system", `Stopping ${this.runtimeState.profileName || "current game"}...`);
        this.setRuntimeState({
            status: "stopping",
            instanceId: this.runtimeState.instanceId,
            profileName: this.runtimeState.profileName,
            pid,
            startedAtUtc: this.runtimeState.startedAtUtc,
        });

        try {
            await this.stopProcessTree(pid);
            this.pushLog("system", "Stop request sent.");
        } catch (error) {
            const currentStatus = this.getRuntimeState().status;
            if (currentStatus === "exited" || currentStatus === "idle") {
                return;
            }
            this.stopRequestedPid = null;
            const message = error instanceof Error ? error.message : String(error);
            this.pushLog("system", `Stop failed: ${message}`);
            this.setRuntimeState({
                status: "running",
                instanceId: previousState.instanceId,
                profileName: previousState.profileName,
                pid: previousState.pid,
                startedAtUtc: previousState.startedAtUtc,
            });
            throw error;
        }
    }

    private setRuntimeState(state: Omit<LaunchRuntimeState, "recentLogs"> & { recentLogs?: LaunchRuntimeLogEntry[] }): void {
        this.runtimeState = {
            ...state,
            recentLogs: state.recentLogs ?? this.runtimeState.recentLogs ?? [],
        };
        this.emitRuntimeState();
    }

    private emitRuntimeState(): void {
        this.runtimeEvents.emit(RUNTIME_STATE_EVENT, this.getRuntimeState());
    }

    private pushLog(stream: LaunchRuntimeLogEntry["stream"], message: string): void {
        const entry: LaunchRuntimeLogEntry = {
            id: `${Date.now()}-${this.logSequence++}`,
            timestampUtc: new Date().toISOString(),
            stream,
            message,
        };
        const nextLogs = [...(this.runtimeState.recentLogs ?? []), entry].slice(-MAX_RUNTIME_LOGS);
        this.runtimeState = {
            ...this.runtimeState,
            recentLogs: nextLogs,
        };
        this.runtimeEvents.emit(RUNTIME_LOG_EVENT, entry);
    }

    private async stopProcessTree(pid: number): Promise<void> {
        if (process.platform === "win32") {
            await new Promise<void>((resolve, reject) => {
                const killer = spawn("taskkill", ["/PID", `${pid}`, "/T", "/F"], {
                    windowsHide: true,
                    stdio: "ignore",
                });
                killer.once("error", reject);
                killer.once("exit", code => {
                    if (code === 0 || this.activeChild === null) {
                        resolve();
                        return;
                    }
                    reject(new Error(`Failed to stop process tree for PID ${pid}.`));
                });
            });
            return;
        }

        if (this.activeChild?.pid === pid) {
            this.activeChild.kill("SIGTERM");
            return;
        }
        process.kill(pid, "SIGTERM");
    }
}
