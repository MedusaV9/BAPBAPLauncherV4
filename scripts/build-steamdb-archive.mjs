/**
 * Build archive-source-data.ts from SteamDB paste (Demo / Playtest / Release).
 * Blog rows are re-attached from FilteredByBlog folder stamps when they match a playtest date.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, ".."));

const MONTHS = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
};

/** Parse lines like: "10 November 2024 – 15:14:53 UTCyears ago    5225772663507521064" */
function parseSteamDbBlock(text, kind, depot) {
    const rows = [];
    const re =
        /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\s+[–-]\s+(\d{1,2}):(\d{2}):(\d{2})\s+UTC\S*\s+(\d{6,})/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
        const day = Number(m[1]);
        const month = MONTHS[m[2].toLowerCase()];
        const year = Number(m[3]);
        const hour = Number(m[4]);
        const minute = Number(m[5]);
        const second = Number(m[6]);
        const manifestId = m[7];
        const stamp = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}_${String(hour).padStart(2, "0")}-${String(minute).padStart(2, "0")}-${String(second).padStart(2, "0")}`;
        rows.push({
            kind,
            stamp,
            year,
            month,
            day,
            hour,
            minute,
            second,
            depot,
            manifestId,
            blog: null,
        });
    }
    return rows;
}

const DEMO = `
10 November 2024 – 15:14:53 UTC  5225772663507521064
8 November 2024 – 13:58:22 UTC  5639197386564460265
7 November 2024 – 21:22:51 UTC  6621782998844436196
7 November 2024 – 18:57:55 UTC  1737130912345245089
6 November 2024 – 23:15:34 UTC  65257022826402212
5 November 2024 – 21:54:24 UTC  7347229305847923052
4 November 2024 – 23:38:09 UTC  4936845210448155726
4 November 2024 – 19:53:20 UTC  6870276373903159686
11 November 2023 – 21:18:35 UTC  6271145396814076985
14 October 2023 – 15:42:48 UTC  6805081843506975603
12 October 2023 – 23:21:29 UTC  657989240081983105
12 October 2023 – 15:24:48 UTC  3161763973928399001
10 October 2023 – 17:33:36 UTC  9059143778468705166
7 October 2023 – 04:26:02 UTC  4768740349678842502
6 October 2023 – 18:52:03 UTC  2637908737969716309
5 October 2023 – 18:10:11 UTC  5026202489768529100
`;

const PLAYTEST = `
12 March 2025 – 04:27:50 UTC  2482172920427151158
11 March 2025 – 04:18:10 UTC  7221874904486011239
11 March 2025 – 00:37:29 UTC  6516148944901760477
10 March 2025 – 19:05:15 UTC  2055477215405021586
9 March 2025 – 21:17:24 UTC  8580288720791588387
8 March 2025 – 06:16:18 UTC  7735251795619613716
7 March 2025 – 23:37:19 UTC  5339883407374182400
6 March 2025 – 21:48:17 UTC  369145449607412238
4 March 2025 – 19:27:40 UTC  6179391947104220262
3 March 2025 – 20:55:48 UTC  6505121561311759954
28 February 2025 – 20:44:53 UTC  1472928464212205590
26 February 2025 – 22:13:47 UTC  3247633633759052671
25 February 2025 – 19:37:02 UTC  8448745039932440886
25 February 2025 – 04:04:43 UTC  2989863679015446406
25 February 2025 – 02:22:41 UTC  7519591291535828963
23 February 2025 – 01:24:19 UTC  1037459486198751684
21 February 2025 – 23:10:08 UTC  2013577937455248179
21 February 2025 – 01:17:48 UTC  8337371381688713133
21 February 2025 – 01:02:18 UTC  2597117468828801628
20 February 2025 – 20:41:54 UTC  7671228425853045913
19 February 2025 – 23:07:26 UTC  4944914528243629856
19 February 2025 – 18:40:10 UTC  2701468875228314473
19 February 2025 – 01:18:59 UTC  5543881312782635021
18 February 2025 – 21:11:13 UTC  9112665886145866277
7 December 2024 – 16:25:47 UTC  351735428217559710
6 December 2024 – 23:34:12 UTC  3632518455567032027
4 December 2024 – 19:50:20 UTC  2137432669185976382
4 December 2024 – 18:41:54 UTC  5897473218384426794
4 December 2024 – 17:12:00 UTC  7283325403431925071
3 December 2024 – 22:01:44 UTC  6439395459103607606
10 November 2024 – 15:14:24 UTC  3621351971980737009
8 November 2024 – 13:57:23 UTC  1538723578061233827
7 November 2024 – 21:21:58 UTC  8565576492938221834
7 November 2024 – 18:56:45 UTC  28249778154562304
6 November 2024 – 23:15:01 UTC  4172964092703775082
5 November 2024 – 21:48:18 UTC  809218713169169257
4 November 2024 – 23:23:37 UTC  2842898163008064061
1 November 2024 – 16:31:15 UTC  5826199537761365325
31 October 2024 – 23:08:01 UTC  112654954995262996
31 October 2024 – 18:32:25 UTC  7438709344299665800
30 October 2024 – 18:33:58 UTC  3639741255619062886
29 October 2024 – 18:43:18 UTC  8466118830656814451
28 October 2024 – 17:26:57 UTC  3238118128302473892
28 September 2024 – 15:29:40 UTC  8109337356298773607
27 September 2024 – 16:25:09 UTC  8134975682728973834
27 September 2024 – 04:36:49 UTC  5367483104322914601
27 September 2024 – 01:39:16 UTC  8120649025448578822
27 September 2024 – 00:43:29 UTC  6547435719831422124
24 August 2024 – 11:50:03 UTC  5039588148176998800
23 August 2024 – 16:15:04 UTC  8958336937588670284
23 August 2024 – 14:52:46 UTC  6768373031693828132
22 August 2024 – 23:36:02 UTC  8199350347284607089
22 August 2024 – 20:03:16 UTC  2106232295486580528
22 August 2024 – 04:01:56 UTC  7156139490000646350
21 August 2024 – 21:46:03 UTC  1134344976544170190
24 July 2024 – 16:54:10 UTC  7522159285794857203
14 July 2024 – 16:56:17 UTC  432254082118518548
14 July 2024 – 07:42:00 UTC  6795230109498983180
11 July 2024 – 20:32:55 UTC  7930760510916469244
11 July 2024 – 18:26:55 UTC  1457737658827944458
11 July 2024 – 02:34:53 UTC  1757217959829865689
11 July 2024 – 00:05:52 UTC  6443219766818679780
10 July 2024 – 16:58:42 UTC  5433616578716366123
10 July 2024 – 01:16:10 UTC  8882462694417687840
16 February 2024 – 20:06:24 UTC  6384137890424313308
16 February 2024 – 19:10:23 UTC  501798312228523069
16 February 2024 – 17:36:38 UTC  1833713463442136425
16 February 2024 – 04:38:10 UTC  8197101931544772835
16 February 2024 – 02:12:20 UTC  7731739724510760580
15 February 2024 – 22:14:18 UTC  2061760284391231113
`;

const RELEASE = `
19 August 2025 – 18:14:42 UTC  3691247073315750068
14 August 2025 – 19:21:19 UTC  1667107872466291867
13 August 2025 – 19:06:42 UTC  5084162501424859386
10 June 2025 – 17:58:43 UTC  9199065605303375081
2 June 2025 – 17:20:23 UTC  2817238071018487176
26 May 2025 – 21:23:38 UTC  8755208936006757139
26 May 2025 – 19:34:23 UTC  7313060452487972838
13 May 2025 – 17:16:55 UTC  616116375838942956
1 May 2025 – 16:21:05 UTC  3820145233746744008
22 April 2025 – 19:32:13 UTC  2118764693225205523
8 April 2025 – 19:35:11 UTC  3125320727188286140
31 March 2025 – 20:12:37 UTC  3073143511279508865
24 March 2025 – 20:02:31 UTC  8805840805666017543
19 March 2025 – 19:47:05 UTC  1994674268312034889
17 March 2025 – 23:06:45 UTC  1053438146760668318
12 March 2025 – 17:49:40 UTC  8493449361872033888
`;

const rows = [
    ...parseSteamDbBlock(DEMO, "demo", "2551761"),
    ...parseSteamDbBlock(PLAYTEST, "playtest", "2700952"),
    ...parseSteamDbBlock(RELEASE, "release", "2226283"),
];

// Attach blog drops from FilteredByBlog when stamp prefix matches a playtest build
const blogRoot =
    "C:/Users/Administrator/Downloads/CustomServer/Rewrite/GameFilesVersions/All/FilteredByBlog";
function listDir(dir) {
    try {
        return fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return [];
    }
}
const playtestByDatePrefix = new Map();
for (const r of rows) {
    if (r.kind !== "playtest") continue;
    const dayKey = `${r.year}-${String(r.month).padStart(2, "0")}-${String(r.day).padStart(2, "0")}`;
    const list = playtestByDatePrefix.get(dayKey) ?? [];
    list.push(r);
    playtestByDatePrefix.set(dayKey, list);
}

for (const blogEnt of listDir(blogRoot)) {
    if (!blogEnt.isDirectory()) continue;
    const blog = blogEnt.name;
    const pt = path.join(blogRoot, blog, "Playtest");
    for (const ent of listDir(pt)) {
        const name = ent.name;
        const m = name.match(/^(\d{4})-(\d{2})-(\d{2})(?:_(\d{2})-(\d{2})-(\d{2}))?$/);
        if (!m) continue;
        const dayKey = `${m[1]}-${m[2]}-${m[3]}`;
        // Prefer exact stamp match on playtest, else same calendar day closest
        let match =
            rows.find(r => r.kind === "playtest" && r.stamp.startsWith(name)) ??
            rows.find(r => r.kind === "playtest" && r.stamp.startsWith(dayKey));
        if (!match && playtestByDatePrefix.has(dayKey)) {
            match = playtestByDatePrefix.get(dayKey)[0];
        }
        if (!match) continue;
        rows.push({
            kind: "blog",
            stamp: match.stamp,
            year: match.year,
            month: match.month,
            day: match.day,
            hour: match.hour,
            minute: match.minute,
            second: match.second,
            depot: match.depot,
            manifestId: match.manifestId,
            blog,
        });
    }
}

// Single sort: newest first by datetime
rows.sort((a, b) => {
    const ta = Date.UTC(a.year, a.month - 1, a.day, a.hour, a.minute, a.second);
    const tb = Date.UTC(b.year, b.month - 1, b.day, b.hour, b.minute, b.second);
    if (tb !== ta) return tb - ta;
    const rank = { playtest: 0, demo: 1, release: 2, blog: 3, features: 4 };
    return (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9);
});

const byKind = {};
for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;

const lines = rows.map(e => {
    const blog = e.blog == null ? "null" : JSON.stringify(e.blog);
    return `    { kind: "${e.kind}", stamp: ${JSON.stringify(e.stamp)}, year: ${e.year}, month: ${e.month}, day: ${e.day}, hour: ${e.hour}, minute: ${e.minute}, second: ${e.second}, depot: ${JSON.stringify(e.depot)}, manifestId: ${JSON.stringify(e.manifestId)}, blog: ${blog} }`;
});

const outPath = path.resolve("src/renderer/app/workspaces/archive-source-data.ts");
const file = `/** SteamDB manifest catalog for Archive prototype.
 * Demo depot 2551761 · Playtest 2700952 · Release 2226283
 * Features: empty (versions TBD)
 * Re-build: node scripts/build-steamdb-archive.mjs
 *
 * Counts: ${Object.entries(byKind)
     .map(([k, v]) => `${k}=${v}`)
     .join(", ")}
 * Newest: ${rows[0]?.stamp} (${rows[0]?.kind}) mid=${rows[0]?.manifestId}
 * Oldest: ${rows.at(-1)?.stamp} (${rows.at(-1)?.kind})
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
    /** Steam Manifest ID — card display name */
    manifestId: string | null;
    blog: string | null;
};

export const ARCHIVE_SOURCE_ROWS: ArchiveSourceRow[] = [
${lines.join(",\n")}
];
`;

fs.writeFileSync(outPath, file, "utf8");
console.log(
    `Wrote ${rows.length} rows\n` +
        Object.entries(byKind)
            .map(([k, v]) => `  ${k}: ${v}`)
            .join("\n")
);
