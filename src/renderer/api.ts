import type { V2Api } from "../shared/ipc";

function resolveApi(): V2Api {
  const harnessApi = window.__V2_HARNESS__ ? window.__V2_HARNESS_API__ : undefined;
  const resolvedApi = harnessApi ?? window.v2Api;

  if (!resolvedApi) {
    throw new Error("V2 renderer bridge is not available.");
  }

  return resolvedApi;
}

export const api: V2Api = new Proxy({} as V2Api, {
  get(_target, property) {
    const resolvedApi = resolveApi();
    return resolvedApi[property as keyof V2Api];
  },
});
