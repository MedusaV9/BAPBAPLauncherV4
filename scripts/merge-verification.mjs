// Merge story-verification findings into the canonical feature-tracker CSV.
// Updates the "Test Status" and "Error / Notes" columns by matching storyId -> ID.
// Usage: node scripts/merge-verification.mjs <findings.json> <tracker.csv>
import { readFileSync, writeFileSync } from "node:fs";

const [, , inPath, csvPath] = process.argv;
const raw = JSON.parse(readFileSync(inPath, "utf8"));
const areas = Array.isArray(raw) ? raw : raw.result;

// Build storyId -> {verdict, severity, detail}
const byId = new Map();
for (const a of areas ?? []) {
    for (const f of a.findings ?? []) {
        byId.set(f.storyId, f);
    }
}

// Minimal CSV parser (handles quoted fields with embedded commas/quotes).
function parseCsv(text) {
    const rows = [];
    let row = [], cell = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQ) {
            if (c === '"') {
                if (text[i + 1] === '"') { cell += '"'; i++; }
                else inQ = false;
            } else cell += c;
        } else {
            if (c === '"') inQ = true;
            else if (c === ",") { row.push(cell); cell = ""; }
            else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
            else if (c === "\r") { /* skip */ }
            else cell += c;
        }
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ""));
}

function csvCell(s) {
    return '"' + String(s ?? "").replace(/"/g, '""') + '"';
}

const rows = parseCsv(readFileSync(csvPath, "utf8"));
const header = rows[0];
const idIdx = header.indexOf("ID");
const statusIdx = header.indexOf("Test Status");
const notesIdx = header.indexOf("Error / Notes");

let matched = 0, fails = 0, runtime = 0;
for (let r = 1; r < rows.length; r++) {
    const id = rows[r][idIdx];
    const f = byId.get(id);
    if (!f) continue;
    matched++;
    const sev = f.severity && f.severity !== "none" ? ` [${f.severity}]` : "";
    rows[r][statusIdx] = `${f.verdict}${sev}`;
    rows[r][notesIdx] = f.detail ?? "";
    if (f.verdict === "FAIL") fails++;
    if (f.verdict === "NEEDS-RUNTIME") runtime++;
}

const out = rows.map(r => r.map(csvCell).join(",")).join("\n") + "\n";
writeFileSync(csvPath, out, "utf8");
console.log(`matched ${matched} rows; FAIL=${fails}, NEEDS-RUNTIME=${runtime}`);

// Print the FAIL/NEEDS-RUNTIME rows for triage.
for (let r = 1; r < rows.length; r++) {
    const st = rows[r][statusIdx];
    if (st.startsWith("FAIL") || st.startsWith("NEEDS-RUNTIME")) {
        console.log(`\n${rows[r][idIdx]} (${rows[r][1]}) ${st} — ${rows[r][2]}`);
        console.log(`   ${rows[r][notesIdx]}`);
    }
}
