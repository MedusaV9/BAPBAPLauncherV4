/// <reference types="vite/client" />

import type { V2Api } from "../shared/ipc";
import type { V2HarnessState } from "./harness/types";

declare global {
    interface Window {
        v2Api: V2Api;
        __V2_HARNESS__?: boolean;
        __V2_HARNESS_STATE__?: V2HarnessState;
        __V2_HARNESS_API__?: V2Api;
    }
}

export {};
