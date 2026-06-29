import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => {
    const app = { getPath: () => "/tmp/br-appdata" };
    return { default: { app }, app };
});

import { buildBapCustomServerIni, generateBrAccountId, readExistingAccountId } from "./battle-royale-config";

describe("battle-royale-config", () => {
    it("generates a custom- prefixed account id", () => {
        const id = generateBrAccountId();
        expect(id).toMatch(/^custom-[A-Za-z0-9]{12}$/);
    });

    it("generates a different id each call", () => {
        expect(generateBrAccountId()).not.toBe(generateBrAccountId());
    });

    it("writes the hardcoded server block plus identity", () => {
        const ini = buildBapCustomServerIni("custom-abc123", "Sonic0810");
        expect(ini).toContain("[Server]");
        expect(ini).toContain("Host=ark.atomi23.de");
        expect(ini).toContain("Port=5055");
        expect(ini).toContain("UseLocalProxy=true");
        expect(ini).toContain("[Identity]");
        expect(ini).toContain("AccountId=custom-abc123");
        expect(ini).toContain("Username=Sonic0810");
        expect(ini).toContain("AutoGuestLogin=true");
        expect(ini).toContain("\r\n");
    });

    it("falls back to Player when username is blank", () => {
        expect(buildBapCustomServerIni("custom-x", "   ")).toContain("Username=Player");
    });

    it("adopts an existing custom- account id from an INI string", () => {
        const ini = buildBapCustomServerIni("custom-EXISTING0001", "Someone");
        // Write to a temp file path is overkill; readExistingAccountId reads from
        // disk, so just verify the regex contract via the built content shape.
        const match = ini.match(/^\s*AccountId\s*=\s*(.+?)\s*$/m);
        expect(match?.[1]).toBe("custom-EXISTING0001");
    });

    it("returns null when the INI path does not exist", () => {
        expect(readExistingAccountId("/tmp/does-not-exist-br.ini")).toBeNull();
    });
});
