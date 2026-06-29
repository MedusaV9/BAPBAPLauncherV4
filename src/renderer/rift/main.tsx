import React from "react";
import { createRoot } from "react-dom/client";
import { RiftIntro } from "./RiftIntro";

const container = document.getElementById("root");
if (!container) {
    throw new Error("Rift renderer root element not found.");
}

const params = new URLSearchParams(window.location.search);
// Honor only the explicit ?reduced=1 the main process sets from the user's
// uiMotionEnabled setting. We deliberately do NOT auto-detect the OS
// prefers-reduced-motion here: Windows servers/VMs frequently ship with
// system animations disabled, which would silently skip the rift the user
// explicitly turned on.
const reduced = params.get("reduced") === "1";

createRoot(container).render(
    <React.StrictMode>
        <RiftIntro reduced={reduced} />
    </React.StrictMode>
);
