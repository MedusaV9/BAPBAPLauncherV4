export {};

import type { V2Api } from "../../../shared/ipc";

declare global {
  interface Window {
    electronAPI?: {
      invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
      fileSrc(targetPath: string): Promise<string>;
    };
    v2Api?: V2Api;
  }
}
