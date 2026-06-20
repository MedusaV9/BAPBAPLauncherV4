import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const harnessPort = Number(process.env.VITE_HARNESS_PORT || "4174");

export default defineConfig({
    root: path.resolve(__dirname, "src/renderer"),
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src/renderer"),
        },
    },
    plugins: [react(), tailwindcss()],
    server: {
        host: "127.0.0.1",
        port: harnessPort,
        strictPort: true,
    },
    preview: {
        host: "127.0.0.1",
        port: harnessPort,
        strictPort: true,
    },
    build: {
        outDir: path.resolve(__dirname, "dist/harness"),
        emptyOutDir: true,
        rollupOptions: {
            input: path.resolve(__dirname, "src/renderer/harness.html"),
        },
    },
});
