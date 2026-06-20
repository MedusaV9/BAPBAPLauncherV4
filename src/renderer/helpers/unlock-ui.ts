import type { TrustedTimeState } from "../../shared/ipc";
import { formatCountdownLabel, resolveUnlockStatus, type UnlockStatus } from "../../shared/unlock-time";

export function isTrustedTimeReady(state: TrustedTimeState | null): boolean {
    return Boolean(state?.available && Number.isFinite(state.trustedEpochMs));
}

export function resolveUnlockUiState(
    unlockAtUtc: string | undefined,
    trustedTimeState: TrustedTimeState | null,
    trustedNowMs?: number | null
): UnlockStatus {
    return resolveUnlockStatus(unlockAtUtc, trustedNowMs, isTrustedTimeReady(trustedTimeState));
}

export function getUnlockCountdownLabel(status: UnlockStatus, trustedNowMs?: number | null): string {
    if (!status.locked || !Number.isFinite(status.unlockMs) || !Number.isFinite(trustedNowMs)) {
        return "00:00:00";
    }
    return formatCountdownLabel((status.unlockMs as number) - (trustedNowMs as number));
}

export function formatUnlockLocal(value?: string): string {
    if (!value) {
        return "-";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleString();
}
