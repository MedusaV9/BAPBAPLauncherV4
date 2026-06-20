import path from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    main: {
        plugins: [externalizeDepsPlugin()],
        build: {
            outDir: "dist/main",
            lib: {
                entry: "src/main/main.ts",
                formats: ["cjs"],
            },
            rollupOptions: {
                external: ["electron"],
                output: {
                    entryFileNames: "main.cjs",
                },
            },
        },
    },
    preload: {
        plugins: [externalizeDepsPlugin()],
        build: {
            outDir: "dist/preload",
            lib: {
                entry: "src/preload/index.ts",
                formats: ["cjs"],
            },
            rollupOptions: {
                external: ["electron"],
                output: {
                    entryFileNames: "index.cjs",
                },
            },
        },
    },
    renderer: {
        root: "src/renderer",
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "src/renderer"),
            },
        },
        plugins: [react(), tailwindcss()],
        build: {
            outDir: "dist/renderer",
            rollupOptions: {
                input: {
                    main: path.resolve(__dirname, "src/renderer/index.html"),
                    rebalance: path.resolve(__dirname, "src/renderer/rebalance.html"),
                },
            },
        },
    },
});
