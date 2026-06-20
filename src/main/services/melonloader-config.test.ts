import { describe, expect, it } from "vitest";
import { normalizeLoaderConfigContent, normalizeMelonPreferencesContent } from "./melonloader-config";

describe("normalizeMelonPreferencesContent", () => {
    it("rewrites console preferences into a single enabled section", () => {
        const normalized = normalizeMelonPreferencesContent(`Enabled = false
[General]
Foo = "bar"
[Console]
Enabled = false
`);

        expect(normalized).toBe(`[General]
Foo = "bar"

[Console]
Enabled = true
`);
    });
});

describe("normalizeLoaderConfigContent", () => {
    it("preserves other settings and forces a single visible console section", () => {
        const normalized = normalizeLoaderConfigContent(`hide_console = true
[core]
debug = false
[console]
hide_console = true
color = "blue"
[console]
hide_console = true
`);

        expect(normalized).toBe(`[core]
debug = false
[console]
hide_console = false
color = "blue"
`);
    });
});
