import { describe, expect, it, vi } from "vitest";
import {
  bootstrapWithDegradation,
  isCriticalBootstrapFailure,
  retryOptional,
  type BootstrapApi,
} from "./bootstrap";

/* --------------------------------------------------------------------------
   Test helpers
   -------------------------------------------------------------------------- */

function makeApi(overrides: Partial<{
  settings: () => Promise<unknown>;
  buildInfo: () => Promise<unknown>;
  gameVersions: () => Promise<unknown>;
  trustedTime: () => Promise<unknown>;
  instances: () => Promise<unknown>;
  packages: () => Promise<unknown>;
  radio: () => Promise<unknown>;
}> = {}): BootstrapApi {
  return {
    settings: { getAll: (overrides.settings ?? (() => Promise.resolve({ id: "default" }))) as () => Promise<never> },
    diagnostics: { getBuildInfo: (overrides.buildInfo ?? (() => Promise.resolve({ buildId: "test" }))) as () => Promise<never> },
    manifest: {
      getGameVersions: (overrides.gameVersions ?? (() => Promise.resolve({ versions: [] }))) as () => Promise<never>,
      getTrustedTimeState: (overrides.trustedTime ?? (() => Promise.resolve({ state: "ok" }))) as () => Promise<never>,
    },
    instances: { list: (overrides.instances ?? (() => Promise.resolve([]))) as () => Promise<never> },
    content: { listPackages: (overrides.packages ?? (() => Promise.resolve([]))) as () => Promise<never> },
    radio: { getState: (overrides.radio ?? (() => Promise.resolve({ playing: false }))) as () => Promise<never> },
  };
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("bootstrapWithDegradation", () => {
  it("returns no warnings when all dependencies resolve", async () => {
    const api = makeApi();
    const result = await bootstrapWithDegradation(api);
    expect(result.warnings).toEqual([]);
    expect(result.payload.settings).toBeDefined();
    expect(result.payload.instances).toEqual([]);
  });

  it("propagates settings failure as a thrown error (critical)", async () => {
    const api = makeApi({ settings: () => Promise.reject(new Error("settings boom")) });
    await expect(bootstrapWithDegradation(api)).rejects.toThrow("settings boom");
  });

  it("propagates instances failure as a thrown error (critical)", async () => {
    const api = makeApi({ instances: () => Promise.reject(new Error("instances boom")) });
    await expect(bootstrapWithDegradation(api)).rejects.toThrow("instances boom");
  });

  it("degrades trusted time failure to a warning", async () => {
    const api = makeApi({ trustedTime: () => Promise.reject(new Error("ntp unavailable")) });
    const result = await bootstrapWithDegradation(api);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].id).toBe("trusted-time");
    expect(result.warnings[0].technical).toContain("ntp unavailable");
    expect(result.payload.trustedTimeState).toBeNull();
  });

  it("degrades package-catalog failure to a warning and yields empty packages array", async () => {
    const api = makeApi({ packages: () => Promise.reject(new Error("network timeout")) });
    const result = await bootstrapWithDegradation(api);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].id).toBe("package-catalog");
    expect(result.payload.packages).toEqual([]);
  });

  it("collects multiple optional failures into the warnings array", async () => {
    const api = makeApi({
      radio: () => Promise.reject(new Error("radio failed")),
      trustedTime: () => Promise.reject(new Error("time failed")),
      buildInfo: () => Promise.reject(new Error("build failed")),
    });
    const result = await bootstrapWithDegradation(api);
    expect(result.warnings).toHaveLength(3);
    const ids = result.warnings.map(w => w.id).sort();
    expect(ids).toEqual(["build-info", "radio", "trusted-time"]);
  });

  it("provides a user-facing label and detail for each warning", async () => {
    const api = makeApi({ radio: () => Promise.reject(new Error("nope")) });
    const result = await bootstrapWithDegradation(api);
    const warning = result.warnings[0];
    expect(warning.label).toBe("Radio unavailable");
    expect(warning.detail.length).toBeGreaterThan(10);
    expect(warning.detail.endsWith(".")).toBe(true);
  });

  it("preserves successful payload data alongside optional failures", async () => {
    const api = makeApi({
      settings: () => Promise.resolve({ id: "real-settings", launchDefaultProfileId: "abc" }),
      instances: () => Promise.resolve([{ id: "i1" }, { id: "i2" }]),
      radio: () => Promise.reject(new Error("offline")),
    });
    const result = await bootstrapWithDegradation(api);
    expect(result.warnings).toHaveLength(1);
    expect(result.payload.settings).toEqual({ id: "real-settings", launchDefaultProfileId: "abc" });
    expect(result.payload.instances).toEqual([{ id: "i1" }, { id: "i2" }]);
    expect(result.payload.radioState).toBeNull();
  });

  it("respects force option for manifest endpoints", async () => {
    const gv = vi.fn().mockResolvedValue({ versions: [] });
    const tt = vi.fn().mockResolvedValue({ state: "ok" });
    const pkg = vi.fn().mockResolvedValue([]);
    const api = makeApi();
    api.manifest.getGameVersions = gv as unknown as typeof api.manifest.getGameVersions;
    api.manifest.getTrustedTimeState = tt as unknown as typeof api.manifest.getTrustedTimeState;
    api.content.listPackages = pkg as unknown as typeof api.content.listPackages;

    await bootstrapWithDegradation(api, { force: true });
    expect(gv).toHaveBeenCalledWith(true);
    expect(tt).toHaveBeenCalledWith(true);
    expect(pkg).toHaveBeenCalledWith("release", true);
  });

  it("does not refetch successful endpoints after degradation", async () => {
    const settings = vi.fn().mockResolvedValue({ id: "x" });
    const radio = vi.fn().mockRejectedValue(new Error("nope"));
    const api = makeApi();
    api.settings.getAll = settings as unknown as typeof api.settings.getAll;
    api.radio.getState = radio as unknown as typeof api.radio.getState;

    await bootstrapWithDegradation(api);
    expect(settings).toHaveBeenCalledTimes(1);
    expect(radio).toHaveBeenCalledTimes(1);
  });
});

describe("retryOptional", () => {
  it("returns ok=true when the optional task succeeds", async () => {
    const api = makeApi();
    const outcome = await retryOptional(api, "radio");
    expect(outcome).toEqual({ id: "radio", ok: true });
  });

  it("returns ok=false with technical detail when the optional task fails", async () => {
    const api = makeApi({ radio: () => Promise.reject(new Error("still offline")) });
    const outcome = await retryOptional(api, "radio");
    expect(outcome.ok).toBe(false);
    if (outcome.ok === false) {
      expect(outcome.technical).toContain("still offline");
    }
  });

  it("rejects unknown warning ids", async () => {
    const api = makeApi();
    const outcome = await retryOptional(api, "made-up" as never);
    expect(outcome.ok).toBe(false);
  });
});

describe("isCriticalBootstrapFailure", () => {
  it("flags preload bridge errors as critical", () => {
    expect(isCriticalBootstrapFailure(new Error("Preload bridge missing"))).toBe(true);
    expect(isCriticalBootstrapFailure(new Error("window.v2Api is undefined"))).toBe(true);
  });

  it("flags settings errors as critical", () => {
    expect(isCriticalBootstrapFailure(new Error("Failed to read settings"))).toBe(true);
  });

  it("does not flag radio failures as critical", () => {
    expect(isCriticalBootstrapFailure(new Error("radio offline"))).toBe(false);
  });

  it("handles non-Error inputs", () => {
    expect(isCriticalBootstrapFailure("preload missing")).toBe(true);
    expect(isCriticalBootstrapFailure({ message: "unknown" })).toBe(false);
    expect(isCriticalBootstrapFailure(null)).toBe(false);
  });
});
