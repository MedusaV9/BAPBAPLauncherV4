/**
 * Scan GameFilesVersions/All into archive-source-data.ts
 * Maps Demo (2551761), Playtest (2700952), Release (2226283) via .DepotDownloader
 * Manifest IDs; FilteredByBlog → blog rows (manifest from matching Playtest folder).
 *
 * Usage:
 *   node scripts/scan-archive-folders.mjs
 *   node scripts/scan-archive-folders.mjs "D:/path/to/GameFilesVersions/All"
 */
import fs from "node:fs";
import path from "node:path";

const DEFAULT_ROOT =
    "C:/Users/Administrator/Downloads/CustomServer/Rewrite/GameFilesVersions/All";
const root = path.resolve(process.argv[2] ?? DEFAULT_ROOT);
const outPath = path.resolve("src/renderer/app/workspaces/archive-source-data.ts");

const DEPOT_BY_KIND = {
    demo: "2551761",
    playtest: "2700952",
    release: "2226283",
};

function parseStamp(name) {
    const m = name.match(/^(\d{4})-(\d{2})-(\d{2})(?:_(\d{2})-(\d{2})-(\d{2}))?$/);
    if (!m) return null;
    return {
        stamp: name,
        year: Number(m[1]),
        month: Number(m[2]),
        day: Number(m[3]),
        hour: m[4] ? Number(m[4]) : 0,
        minute: m[5] ? Number(m[5]) : 0,
        second: m[6] ? Number(m[6]) : 0,
    };
}

function listDir(dir) {
    try {
        return fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return [];
    }
}

function readManifestId(versionDir, depotId) {
    const dd = path.join(versionDir, ".DepotDownloader");
    for (const ent of listDir(dd)) {
        if (!ent.isFile()) continue;
        const m = ent.name.match(new RegExp(`^${depotId}_(\\d+)\\.manifest$`));
        if (m) return m[1];
    }
    return null;
}

const rows = [];
const seen = new Set();

function pushRow(row) {
    const key = `${row.kind}|${row.stamp}|${row.blog ?? ""}|${row.manifestId ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
}

// Demo + Playtest folders
for (const [kind, folderName] of [
    ["demo", "Demo"],
    ["playtest", "Playtest"],
]) {
    const depot = DEPOT_BY_KIND[kind];
    const base = path.join(root, folderName);
    for (const ent of listDir(base)) {
        if (!ent.isDirectory()) continue;
        const p = parseStamp(ent.name);
        if (!p) continue;
        const versionDir = path.join(base, ent.name);
        const manifestId = readManifestId(versionDir, depot);
        if (!manifestId) {
            console.warn(`skip ${kind}/${ent.name}: no ${depot} manifest`);
            continue;
        }
        pushRow({
            kind,
            ...p,
            depot,
            manifestId,
            blog: null,
        });
    }
}

// Release: any dated folder under root that has 2226283 depot (not Demo/Playtest)
function walkForRelease(dir, depth = 0) {
    if (depth > 4) return;
    for (const ent of listDir(dir)) {
        if (!ent.isDirectory()) continue;
        if (ent.name === "Demo" || ent.name === "Playtest" || ent.name === "FilteredByBlog") {
            continue;
        }
        if (ent.name === ".DepotDownloader") continue;
        const full = path.join(dir, ent.name);
        const p = parseStamp(ent.name);
        if (p) {
            const mid = readManifestId(full, DEPOT_BY_KIND.release);
            if (mid) {
                pushRow({
                    kind: "release",
                    ...p,
                    depot: DEPOT_BY_KIND.release,
                    manifestId: mid,
                    blog: null,
                });
            }
        }
        walkForRelease(full, depth + 1);
    }
}
walkForRelease(root);

// Blog: FilteredByBlog/*/Playtest/<stamp>
const blogRoot = path.join(root, "FilteredByBlog");
for (const blogEnt of listDir(blogRoot)) {
    if (!blogEnt.isDirectory()) continue;
    const blog = blogEnt.name;
    const playtestDir = path.join(blogRoot, blog, "Playtest");
    for (const ent of listDir(playtestDir)) {
        const p = parseStamp(ent.name);
        if (!p) continue;
        // Resolve manifest from matching Playtest game folder when present
        const playDir = path.join(root, "Playtest", ent.name);
        const mid = readManifestId(playDir, DEPOT_BY_KIND.playtest);
        pushRow({
            kind: "blog",
            ...p,
            depot: DEPOT_BY_KIND.playtest,
            manifestId: mid,
            blog,
        });
    }
}

// Newest first by full datetime
rows.sort((a, b) => {
    const ta = Date.UTC(a.year, a.month - 1, a.day, a.hour, a.minute, a.second);
    const tb = Date.UTC(b.year, b.month - 1, b.day, b.hour, b.minute, b.second);
    if (tb !== ta) return tb - ta;
    const rank = { playtest: 0, demo: 1, release: 2, blog: 3, features: 4 };
    return (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9);
});

const lines = rows.map(e => {
    const blog = e.blog == null ? "null" : JSON.stringify(e.blog);
    const mid = e.manifestId == null ? "null" : JSON.stringify(e.manifestId);
    return `    { kind: "${e.kind}", stamp: ${JSON.stringify(e.stamp)}, year: ${e.year}, month: ${e.month}, day: ${e.day}, hour: ${e.hour}, minute: ${e.minute}, second: ${e.second}, depot: ${JSON.stringify(e.depot)}, manifestId: ${mid}, blog: ${blog} }`;
});

const byKind = {};
for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;

const file = `/** Auto-generated from GameFilesVersions/All + .DepotDownloader manifests.
 * Depots: Demo 2551761 · Playtest 2700952 · Release 2226283
 * Source: ${root.replace(/\\/g, "/")}
 * Re-scan: node scripts/scan-archive-folders.mjs
 *
 * Counts: ${Object.entries(byKind)
     .map(([k, v]) => `${k}=${v}`)
     .join(", ")}
 */
export type ArchiveSourceRow = {
    kind: "playtest" | "demo" | "blog" | "features" | "release";
    stamp: string;
    year: number;
    month: number; // 1-12
    day: number;
    hour: number;
    minute: number;
    second: number;
    depot: string;
    /** Steam depot Manifest ID — display name for mock builds */
    manifestId: string | null;
    blog: string | null;
};

export const ARCHIVE_SOURCE_ROWS: ArchiveSourceRow[] = [
${lines.join(",\n")}
];
`;

fs.writeFileSync(outPath, file, "utf8");
console.log(
    `Wrote ${rows.length} rows → ${outPath}\n` +
        Object.entries(byKind)
            .map(([k, v]) => `  ${k}: ${v}`)
            .join("\n") +
        `\n  with manifestId: ${rows.filter(r => r.manifestId).length}` +
        `\n  newest: ${rows[0]?.stamp} (${rows[0]?.kind}) mid=${rows[0]?.manifestId}` +
        `\n  oldest: ${rows.at(-1)?.stamp} (${rows.at(-1)?.kind})`
);
