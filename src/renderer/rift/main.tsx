import React from "react";
import { createRoot } from "react-dom/client";
import { RiftIntro } from "./RiftIntro";

const container = document.getElementById("root");
if (!container) {
    throw new Error("Rift renderer root element not found.");
}

const params = new URLSearchParams(window.location.search);
const reduced =
    params.get("reduced") === "1" ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

createRoot(container).render(
    <React.StrictMode>
        <RiftIntro reduced={reduced} />
    </React.StrictMode>
);
