import { describe, expect, it } from "vitest";
import { splitWindowsArgs } from "./launch-args";

describe("splitWindowsArgs", () => {
    it("returns an empty array for blank input", () => {
        expect(splitWindowsArgs("")).toEqual([]);
        expect(splitWindowsArgs("   ")).toEqual([]);
    });

    it("splits simple whitespace-separated arguments", () => {
        expect(splitWindowsArgs("--debug --melonloader.hideconsole")).toEqual(["--debug", "--melonloader.hideconsole"]);
    });

    it("preserves quoted arguments with spaces", () => {
        expect(splitWindowsArgs('--profile "Boss Rush Test" --env production')).toEqual([
            "--profile",
            "Boss Rush Test",
            "--env",
            "production",
        ]);
    });

    it("preserves escaped quotes inside quoted arguments", () => {
        expect(splitWindowsArgs('--label "Boss \\"Rush\\" Profile"')).toEqual([
            "--label",
            'Boss "Rush" Profile',
        ]);
    });

    it("preserves escaped trailing backslashes before a quote", () => {
        expect(splitWindowsArgs('--path "C:\\Games\\BAPBAP\\\\"')).toEqual([
            "--path",
            "C:\\Games\\BAPBAP\\",
        ]);
    });

    it("supports empty quoted arguments", () => {
        expect(splitWindowsArgs('--tag "" --next value')).toEqual(["--tag", "", "--next", "value"]);
    });
});
