import { describe, expect, it } from "vitest";
import type { LauncherUpdaterState } from "../../shared/ipc";
import {
    formatBytes,
    getLauncherUpdatePrimaryAction,
    getLauncherUpdateStatusLabel,
    shouldShowLauncherUpdateBanner,
} from "./launcher-update-ui";

function createState(overrides: Partial<LauncherUpdaterState>): LauncherUpdaterState {
    return {
        status: "idle",
        configured: true,
        currentVersion: "0.1.0",
        updateAvailable: false,
        ...overrides,
    };
}

describe("launcher update ui helpers", () => {
    it("surfaces a download action when an update is available", () => {
        const action = getLauncherUpdatePrimaryAction(
            createState({
                status: "available",
                updateAvailable: true,
                latestVersion: "0.2.0",
            })
        );

        expect(action).toEqual({
            kind: "download",
            label: "Download now",
            disabled: false,
        });
    });

    it("surfaces an install action when an update is ready", () => {
        const action = getLauncherUpdatePrimaryAction(
            createState({
                status: "readyToInstall",
                updateAvailable: true,
                latestVersion: "0.2.0",
            })
        );

        expect(action).toEqual({
            kind: "install",
            label: "Install now",
            disabled: false,
        });
    });

    it("shows banners only for actionable updater states", () => {
        expect(shouldShowLauncherUpdateBanner(createState({ status: "available", updateAvailable: true }))).toBe(true);
        expect(shouldShowLauncherUpdateBanner(createState({ status: "downloading", updateAvailable: true }))).toBe(true);
        expect(shouldShowLauncherUpdateBanner(createState({ status: "upToDate" }))).toBe(false);
        expect(shouldShowLauncherUpdateBanner(createState({ status: "error", error: "boom" }))).toBe(false);
    });

    it("formats updater status labels and byte counts", () => {
        expect(getLauncherUpdateStatusLabel(createState({ status: "downloading" }))).toBe("Downloading");
        expect(formatBytes(1024)).toBe("1.0 KB");
        expect(formatBytes(undefined)).toBe("-");
    });
});
