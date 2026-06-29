// Converts the feature-inventory workflow JSON into the canonical feature-tracker CSV.
// Usage: node scripts/build-feature-tracker.mjs <inventory.json> <out.csv>
import { readFileSync, writeFileSync } from "node:fs";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
    console.error("usage: build-feature-tracker.mjs <inventory.json> <out.csv>");
    process.exit(2);
}

const raw = JSON.parse(readFileSync(inPath, "utf8"));
const areas = Array.isArray(raw) ? raw : raw.result;
if (!Array.isArray(areas)) {
    console.error("could not find areas array in input");
    process.exit(1);
}

// Normalize the area label to a short canonical name.
function canonArea(label) {
    // Every agent label starts with "V4 Launcher ...", so strip the word
    // "launcher" before keyword-matching or the greedy "launch" check below
    // would swallow Mods/Radio/Tools/Settings.
    const l = label.toLowerCase().replace(/launcher/g, "");
    if (l.includes("shell") || l.includes("boot") || l.includes("navigation")) return "Shell & Nav";
    if (l.includes("instance")) return "Instances";
    if (l.includes("mod")) return "Mods";
    if (l.includes("radio")) return "Radio";
    if (l.includes("tool")) return "Tools";
    if (l.includes("setting") || l.includes("control panel")) return "Settings";
    if (l.includes("launch")) return "Launch";
    return label;
}

// V2 path leaked from one inventory agent; rewrite to V4 layout.
function normalizeRef(ref) {
    return ref.replace(/apps[\\/]bapbap-launcher[\\/]/g, "").replace(/^C:\\\\Users\\\\Administrator\\\\Downloads\\\\BAPBAPLauncherV4\\\\/i, "").replace(/\\/g, "/");
}

function csvCell(s) {
    const v = String(s ?? "");
    return '"' + v.replace(/"/g, '""') + '"';
}

const header = ["ID", "Area", "Feature", "User Story", "Expected Behavior", "Code Refs", "Test Status", "Error / Notes"];
const rows = [header.map(csvCell).join(",")];

const areaCounts = {};
for (const a of areas) {
    const area = canonArea(a.area);
    const prefix = area.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
    for (const s of a.stories ?? []) {
        areaCounts[prefix] = (areaCounts[prefix] ?? 0) + 1;
        const id = `${prefix}-${String(areaCounts[prefix]).padStart(2, "0")}`;
        const refs = (s.codeRefs ?? []).map(normalizeRef).join(" ; ");
        rows.push([
            id,
            area,
            s.feature ?? "",
            s.userStory ?? "",
            s.expectedBehavior ?? "",
            refs,
            "NOT TESTED",
            "",
        ].map(csvCell).join(","));
    }
}

writeFileSync(outPath, rows.join("\n") + "\n", "utf8");
console.log(`wrote ${rows.length - 1} feature rows to ${outPath}`);
