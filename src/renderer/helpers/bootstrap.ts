/**
 * Phase 3 Task 1 — Bootstrap Fault-Tolerance Split.
 *
 * Replaces the all-or-nothing `Promise.all` in App.tsx (lines 754-805 of the
 * pre-Phase-3 implementation) with a degradation-aware bootstrap that:
 *
 *   - **Always** awaits critical dependencies (settings, instances) — without
 *     these the app cannot meaningfully start.
 *   - Awaits optional dependencies (radio, trusted time, package catalog,
 *     game versions manifest, build info) but converts any failure into a
 *     `BootstrapWarning` instead of bubbling up a fatal startup error.
 *
 * Consumers receive `{ payload, warnings }`. The warnings array drives a
 * banner row in the App shell with retry actions.
 *
 * Critical failures still throw — the splash/fatal screen takes over. We keep
 * `V2_BOOTSTRAP_FAILED` semantics for that case.
 *
 * The helper is intentionally type-generic on its payload so it does not
 * couple to specific shared types — callers infer their own shapes from
 * `api.settings.getAll()` / `api.instances.list()` etc.
 */

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export type BootstrapWarningId =
  | "trusted-time"
  | "package-catalog"
  | "game-versions"
  | "radio"
  | "build-info";

export interface BootstrapWarning {
  id: BootstrapWarningId;
  /** Plain user-facing label. */
  label: string;
  /** Plain user-facing detail (one sentence). */
  detail: string;
  /** Original error message for diagnostics — surfaced behind a disclosure. */
  technical?: string;
}

/**
 * Generic payload shape: the helper does not assume specific shared types.
 * Each field is `unknown` (callers cast based on their api shape).
 */
export interface BootstrapPayload {
  settings: unknown;
  buildInfo: unknown | null;
  gameVersions: unknown | null;
  trustedTimeState: unknown | null;
  instances: unknown[];
  packages: unknown[];
  radioState: unknown | null;
}

export interface BootstrapResult {
  payload: BootstrapPayload;
  warnings: BootstrapWarning[];
}

/**
 * Subset of the v2Api surface that bootstrap actually calls. Defined as a
 * minimal interface so the helper is testable with simple mock objects.
 */
export interface BootstrapApi {
  settings: { getAll: () => Promise<unknown> };
  diagnostics: { getBuildInfo: () => Promise<unknown> };
  manifest: {
    getGameVersions: (force?: boolean) => Promise<unknown>;
    getTrustedTimeState: (force?: boolean) => Promise<unknown>;
  };
  instances: { list: () => Promise<unknown[]> };
  content: { listPackages: (channel: string, force?: boolean) => Promise<unknown[]> };
  radio: { getState: () => Promise<unknown> };
}

export interface BootstrapOptions {
  force?: boolean;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Resolve to `value` if `task` succeeds, otherwise to `null` plus push a
 * warning into the warnings array. Critical failures should NOT use this.
 */
async function tryOptional<T>(
  task: () => Promise<T>,
  warning: Omit<BootstrapWarning, "technical">,
  warnings: BootstrapWarning[],
): Promise<T | null> {
  try {
    return await task();
  } catch (error) {
    warnings.push({ ...warning, technical: describeError(error) });
    return null;
  }
}

/* --------------------------------------------------------------------------
   Public API
   -------------------------------------------------------------------------- */

/**
 * Bootstrap with graceful degradation.
 *
 * Critical failures (settings, instances) still throw and the caller is
 * expected to dispatch the existing `V2_BOOTSTRAP_FAILED` fatal screen.
 *
 * Optional failures degrade to non-blocking warnings.
 */
export async function bootstrapWithDegradation(
  api: BootstrapApi,
  options: BootstrapOptions = {},
): Promise<BootstrapResult> {
  const { force = false } = options;
  const warnings: BootstrapWarning[] = [];

  // Critical: kick these off in parallel with the optional ones, but await
  // them as required. If either rejects the whole bootstrap fails.
  const settingsPromise = api.settings.getAll();
  const instancesPromise = api.instances.list();

  // Optional dependencies — tryOptional swallows the rejection.
  const buildInfoPromise = tryOptional(
    () => api.diagnostics.getBuildInfo(),
    {
      id: "build-info",
      label: "Build info unavailable",
      detail: "We could not read this launcher's build metadata. The app still works.",
    },
    warnings,
  );

  const gameVersionsPromise = tryOptional(
    () => api.manifest.getGameVersions(force),
    {
      id: "game-versions",
      label: "Game versions unavailable",
      detail: "Could not load the game versions manifest. Reinstall and import flows may be limited.",
    },
    warnings,
  );

  const trustedTimePromise = tryOptional(
    () => api.manifest.getTrustedTimeState(force),
    {
      id: "trusted-time",
      label: "Trusted time unavailable",
      detail: "Could not verify trusted time. Sign-in dependent flows may be unavailable.",
    },
    warnings,
  );

  const packagesPromise = tryOptional(
    () => api.content.listPackages("release", force),
    {
      id: "package-catalog",
      label: "Package catalog unavailable",
      detail: "The release catalog did not load. Mod and content flows may be limited.",
    },
    warnings,
  );

  const radioPromise = tryOptional(
    () => api.radio.getState(),
    {
      id: "radio",
      label: "Radio unavailable",
      detail: "Could not load the radio state. The radio panel will retry on demand.",
    },
    warnings,
  );

  // Await critical first.
  const [settings, instances] = await Promise.all([settingsPromise, instancesPromise]);

  // Then collect optional outcomes.
  const [buildInfo, gameVersions, trustedTimeState, packages, radioState] = await Promise.all([
    buildInfoPromise,
    gameVersionsPromise,
    trustedTimePromise,
    packagesPromise,
    radioPromise,
  ]);

  return {
    payload: {
      settings,
      buildInfo,
      gameVersions,
      trustedTimeState,
      instances,
      packages: packages ?? [],
      radioState,
    },
    warnings,
  };
}

/**
 * Retry a single optional dependency. Returns the new payload field plus the
 * cleared warning, so the caller can update React state.
 */
export async function retryOptional(
  api: BootstrapApi,
  id: BootstrapWarningId,
  options: BootstrapOptions = {},
): Promise<{ id: BootstrapWarningId; ok: true } | { id: BootstrapWarningId; ok: false; technical: string }> {
  try {
    switch (id) {
      case "build-info":
        await api.diagnostics.getBuildInfo();
        break;
      case "game-versions":
        await api.manifest.getGameVersions(options.force ?? false);
        break;
      case "trusted-time":
        await api.manifest.getTrustedTimeState(options.force ?? false);
        break;
      case "package-catalog":
        await api.content.listPackages("release", options.force ?? false);
        break;
      case "radio":
        await api.radio.getState();
        break;
      default:
        return { id, ok: false, technical: `Unknown warning id: ${String(id)}` };
    }
    return { id, ok: true };
  } catch (error) {
    return { id, ok: false, technical: describeError(error) };
  }
}

/* --------------------------------------------------------------------------
   Critical failure detection
   -------------------------------------------------------------------------- */

/**
 * Returns true if the given error message describes a fatal bootstrap
 * failure (preload bridge missing or settings unreachable). Critical
 * failures should still surface the V2_BOOTSTRAP_FAILED fatal screen.
 */
export function isCriticalBootstrapFailure(error: unknown): boolean {
  const message = describeError(error).toLowerCase();
  return (
    message.includes("preload") ||
    message.includes("v2api") ||
    message.includes("v2_bootstrap_failed") ||
    message.includes("settings")
  );
}
