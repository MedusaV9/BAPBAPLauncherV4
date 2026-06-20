import { create } from "zustand";

type ToolsState = {
    unlockDialogOpen: boolean;
    revealDialogOpen: boolean;
    secretModsDialogOpen: boolean;

    setUnlockDialogOpen: (open: boolean) => void;
    setRevealDialogOpen: (open: boolean) => void;
    setSecretModsDialogOpen: (open: boolean) => void;
};

export const useToolsStore = create<ToolsState>(set => ({
    unlockDialogOpen: false,
    revealDialogOpen: false,
    secretModsDialogOpen: false,

    setUnlockDialogOpen: open => set({ unlockDialogOpen: open }),
    setRevealDialogOpen: open => set({ revealDialogOpen: open }),
    setSecretModsDialogOpen: open => set({ secretModsDialogOpen: open }),
}));
