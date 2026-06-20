import { describe, expect, it } from "vitest";
import { resolveHarnessState } from "./state";

describe("resolveHarnessState", () => {
    it("defaults to instances when no params are present", () => {
        expect(resolveHarnessState("")).toEqual({
            enabled: true,
            workspace: "instances",
            panel: "none",
            preset: "default",
        });
    });

    it("accepts workspace and effect-lab panel presets", () => {
        expect(resolveHarnessState("?workspace=settings&panel=effect-lab")).toEqual({
            enabled: true,
            workspace: "settings",
            panel: "effect-lab",
            preset: "default",
        });
    });

    it("accepts the compact effect-lab preset", () => {
        expect(resolveHarnessState("?preset=effect-lab")).toEqual({
            enabled: true,
            workspace: "settings",
            panel: "effect-lab",
            preset: "default",
        });
    });

    it("accepts the messy-real preset without changing the requested workspace", () => {
        expect(resolveHarnessState("?preset=messy-real&workspace=mods")).toEqual({
            enabled: true,
            workspace: "mods",
            panel: "none",
            preset: "messy-real",
        });
    });

    it("accepts the tools workspace route", () => {
        expect(resolveHarnessState("?workspace=tools")).toEqual({
            enabled: true,
            workspace: "tools",
            panel: "none",
            preset: "default",
        });
    });

    it("ignores unknown values", () => {
        expect(resolveHarnessState("?workspace=bogus&panel=other")).toEqual({
            enabled: true,
            workspace: "instances",
            panel: "none",
            preset: "default",
        });
    });
});
