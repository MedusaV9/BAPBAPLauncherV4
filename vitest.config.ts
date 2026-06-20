import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    root: path.resolve(__dirname),
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src/renderer"),
            react: path.resolve(__dirname, "node_modules/react"),
            "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
        },
        dedupe: ["react", "react-dom"],
    },
    test: {
        environment: "jsdom",
        include: ["src/**/*.{test,spec}.{ts,tsx}"],
        exclude: ["dist/**", "build/**", "node_modules/**"],
        setupFiles: ["./vitest.setup.ts"],
    },
});
