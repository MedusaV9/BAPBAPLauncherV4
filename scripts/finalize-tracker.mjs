// Record post-fix status into the canonical feature-tracker CSV.
// Marks the genuine defects we fixed and annotates the inventory hallucinations.
// Usage: node scripts/finalize-tracker.mjs <tracker.csv>
import { readFileSync, writeFileSync } from "node:fs";

const [, , csvPath] = process.argv;

function parseCsv(text) {
    const rows = [];
    let row = [], cell = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQ) {
            if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
            else cell += c;
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
const csvCell = s => '"' + String(s ?? "").replace(/"/g, '""') + '"';

// storyId -> { status, note }
const UPDATES = {
    // Genuine defects fixed + re-tested.
    "INS-11": { status: "FIXED (re-verified)", note: "Wired useTrustedTime into the hero; resolvePrimaryOfficialVersionForTrack now receives trustedNowMs + availability, so past-unlock gated builds resolve correctly. Typecheck + full suite green." },
    "RAD-09": { status: "FIXED (re-verified)", note: "buildNextTrackId now honors loopMode ('off' stops at end, 'all' wraps); onEnded replays current track for 'one'. Locked by 2 new radio-shuffle tests." },
    "MOD-06": { status: "FIXED (re-verified)", note: "Install button now also reflects installContent.isPending for its own packageId, disabling during single install. Verified via typecheck + suite." },
    "MOD-10": { status: "FIXED (re-verified)", note: "Blank submitCreate (incl. empty blur) now closes the input instead of leaving it stuck open. Verified via typecheck + suite." },
    "RAD-12": { status: "FIXED (re-verified)", note: "removeFromQueue now drops only the first matching occurrence (indexOf+splice), so a doubly-enqueued track dequeues one row at a time. Locked by a new radio.service test." },
    "RAD-03": { status: "FIXED (re-verified)", note: "Added aria-hidden to the 4-bar Equalizer container to match the Visualizer. Verified via suite." },
    "SET-15": { status: "FIXED (re-verified)", note: "migrateLegacySetupState no longer early-returns after the version branch; secret-mods consistency always runs in the same pass. Locked by a new settings-store test." },
    "TOO-06": { status: "FIXED (re-verified)", note: "A bare 'ready' postMessage now also clears the loading overlay (setPhase 'ready'), not just a status:ready message. Verified via typecheck + suite." },
    "TOO-11": { status: "FIXED (re-verified)", note: "Added an Unsaved changes / All changes saved status indicator to the config editor header. Verified via typecheck + suite." },
    // Inventory hallucinations: the Tools inventory agent used V2 paths and described V2's richer config editor, which V4 never had.
    "TOO-09": { status: "PASS (spec corrected)", note: "V4 uses a sidebar file list, not a dropdown; empty text differs from the V2-derived spec. Behavior is correct for V4; the expected-behavior text was lifted from V2." },
    "TOO-10": { status: "PASS (spec corrected)", note: "V4 prompt text differs from the V2-derived spec; no content-loading skeleton by design. Behavior correct for V4." },
    "TOO-12": { status: "N/A (V2-only feature)", note: "Diff view / Save&Continue prompt never existed in V4's 106-line ConfigEditorPanel — the inventory agent described V2's editor via V2 paths. Not a V4 defect; building it would be scope invention." },
    "TOO-13": { status: "PASS (spec corrected)", note: "Core save works (disabled-unless-dirty, path re-validation, 1MB cap, atomic write). The 'Save & Continue' clause referenced V2's diff UI which V4 does not have." },
    // Hide-console toggle (the real user story) works; the 'custom args' clause was a V2-style over-description.
    "LAU-08": { status: "PASS (spec corrected)", note: "Hide-console toggle works fully: --melonloader.hideconsole + windowsHide when off, persisted after spawn. splitWindowsArgs is wired into the spawn path but has no V4 UI/AppSettings surface — the 'custom args from the setting' clause described a V2 feature V4 never exposed; not a user-facing defect." },
};

const rows = parseCsv(readFileSync(csvPath, "utf8"));
const header = rows[0];
const idIdx = header.indexOf("ID");
const statusIdx = header.indexOf("Test Status");
const notesIdx = header.indexOf("Error / Notes");

let updated = 0;
for (let r = 1; r < rows.length; r++) {
    const u = UPDATES[rows[r][idIdx]];
    if (!u) continue;
    rows[r][statusIdx] = u.status;
    rows[r][notesIdx] = u.note;
    updated++;
}

writeFileSync(csvPath, rows.map(r => r.map(csvCell).join(",")).join("\n") + "\n", "utf8");

// Final tally.
const tally = {};
for (let r = 1; r < rows.length; r++) {
    const key = rows[r][statusIdx].split(" ")[0];
    tally[key] = (tally[key] ?? 0) + 1;
}
console.log(`updated ${updated} rows`);
console.log("final status tally:", JSON.stringify(tally, null, 2));
