import { describe, expect, it } from "vitest";
import { githubAuthHeaders, isGitHubDownloadHost } from "./github-auth";

describe("github-auth", () => {
    it("recognizes GitHub hosts", () => {
        expect(isGitHubDownloadHost("github.com")).toBe(true);
        expect(isGitHubDownloadHost("raw.githubusercontent.com")).toBe(true);
        expect(isGitHubDownloadHost("objects.githubusercontent.com")).toBe(true);
        expect(isGitHubDownloadHost("example.com")).toBe(false);
    });

    it("only attaches Authorization on GitHub URLs", () => {
        const token = "ghp_testtoken";
        expect(githubAuthHeaders(token, "https://raw.githubusercontent.com/org/repo/main/a.json")).toEqual({
            Authorization: "Bearer ghp_testtoken",
        });
        expect(githubAuthHeaders(token, "https://cdn.example.com/file.zip")).toEqual({});
        expect(githubAuthHeaders("", "https://github.com/org/repo/releases/download/t/a.zip")).toEqual({});
        expect(githubAuthHeaders("  ghp_x  ", "https://github.com/o/r/releases/download/t/a.zip")).toEqual({
            Authorization: "Bearer ghp_x",
        });
    });
});
