/**
 * Optional GitHub auth for private lab manifests / release assets.
 * Token is only attached to known GitHub hosts — never to third-party URLs.
 */

const GITHUB_HOST_SUFFIXES = [".githubusercontent.com"] as const;
const GITHUB_HOSTS = new Set([
    "github.com",
    "raw.githubusercontent.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
    "codeload.github.com",
    "api.github.com",
]);

export function isGitHubDownloadHost(hostname: string): boolean {
    const host = hostname.trim().toLowerCase();
    if (!host) return false;
    if (GITHUB_HOSTS.has(host)) return true;
    return GITHUB_HOST_SUFFIXES.some(suffix => host.endsWith(suffix));
}

/** Bearer works for classic PATs (ghp_…) and fine-grained (github_pat_…). */
export function githubAuthHeaders(token: string | null | undefined, url: string): Record<string, string> {
    const trimmed = `${token ?? ""}`.trim();
    if (!trimmed) return {};
    try {
        const host = new URL(url).hostname;
        if (!isGitHubDownloadHost(host)) return {};
    } catch {
        return {};
    }
    return {
        Authorization: `Bearer ${trimmed}`,
    };
}
