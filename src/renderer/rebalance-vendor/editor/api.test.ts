// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MutableWindow = Window & {
  electronAPI?: unknown;
  v2Api?: any;
};

const mockBootstrapPayload = {
  workspace: {
    workspaceRoot: "C:/Profiles/Selected/UserData/BalanceMod",
  },
  catalog: [],
} as const;

const mockInvoke = vi.fn(async (command: string) => {
  if (command === "bootstrap") {
    return mockBootstrapPayload;
  }
  throw new Error(`Unexpected command: ${command}`);
});

const tauriInvokeMock = vi.fn();
const tauriConvertFileSrcMock = vi.fn((target: string) => `asset://${target}`);
const mockBootstrapFallback = vi.fn(async () => ({
  workspace: {
    workspaceRoot: "C:/Mock/BapBapRebalnce",
  },
  catalog: [],
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriInvokeMock,
  convertFileSrc: tauriConvertFileSrcMock,
}));

vi.mock("./mockApi", () => ({
  mockApi: {
    bootstrap: mockBootstrapFallback,
  },
}));

describe("launcherApi electron bridge detection", () => {
  beforeEach(() => {
    vi.resetModules();
    mockInvoke.mockClear();
    tauriInvokeMock.mockReset();
    mockBootstrapFallback.mockClear();
    (window as MutableWindow).electronAPI = undefined;
    (window as MutableWindow).v2Api = undefined;
  });

  afterEach(() => {
    (window as MutableWindow).electronAPI = undefined;
    (window as MutableWindow).v2Api = undefined;
  });

  it("uses the v2Api rebalance bridge before falling back to mock data", async () => {
    (window as MutableWindow).v2Api = {
      rebalance: {
        invoke: mockInvoke,
        fileSrc: async (targetPath: string) => `asset://${targetPath}`,
      },
    };

    const { launcherApi } = await import("./api");
    const payload = await launcherApi.bootstrap();

    expect(mockInvoke).toHaveBeenCalledWith("bootstrap", undefined);
    expect(mockBootstrapFallback).not.toHaveBeenCalled();
    expect(payload.workspace?.workspaceRoot).toBe("C:/Profiles/Selected/UserData/BalanceMod");
  });
});
