/**
 * UI prototype: BAPBAP Files Archive
 * Always-visible catalog under the Instances hero.
 * Hero-style cards · month groups · polished timeline with drag scrub.
 */
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
} from "react";
import { Archive, ChevronLeft, ChevronRight, Download, Info, Play, RefreshCw, Search, X } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { ARCHIVE_SOURCE_ROWS } from "./archive-source-data";

export type DummyArchiveStatus = "available" | "installed" | "update";
/** featured = curated front row (versions TBD / hand-picked). */
export type DummyArchiveKind = "playtest" | "demo" | "blog" | "featured" | "release";

export type DummyArchiveEntry = {
    id: string;
    name: string;
    version: string;
    summary: string;
    description: string;
    accent: string;
    accent2: string;
    glyph: string;
    status: DummyArchiveStatus;
    kind: DummyArchiveKind;
    sizeLabel: string;
    publishedLabel: string;
    yearMonth: string;
    year: number;
    month: number;
    /** Steam depot id when known (2551761 demo, 2700952 playtest, 2226283 release). */
    depot?: string;
    /** Steam manifest id used as display name for game-file mocks. */
    manifestId?: string;
    /** Folder / steam date stamp (YYYY-MM-DD[_HH-MM-SS]). */
    stamp?: string;
    imageUrl?: string;
};

/** Per-kind identity — softer tones (muted for badges, still readable on CTAs). */
const KIND_META: Record<
    DummyArchiveKind,
    { label: string; tone: string; accent: string; accent2: string }
> = {
    playtest: { label: "BAPBAP Playtest", tone: "#67e8f9", accent: "#22d3ee", accent2: "#164e63" },
    demo: { label: "BAPBAP Demo", tone: "#c4b5fd", accent: "#a78bfa", accent2: "#4c1d95" },
    blog: { label: "Blog", tone: "#6ee7b7", accent: "#34d399", accent2: "#065f46" },
    featured: { label: "Featured", tone: "#f9a8d4", accent: "#f472b6", accent2: "#9d174d" },
    // Gold — clear from purple Demo / pink Featured
    release: { label: "BAPBAP", tone: "#fcd34d", accent: "#f59e0b", accent2: "#78350f" },
};

/** Kind tags only — Featured is on the timeline; Blog is not filterable as a chip. */
const KIND_FILTERS: Array<"all" | DummyArchiveKind> = [
    "all",
    "release",
    "playtest",
    "demo",
];

/** Preferred order when auto-building kind tracks (only kinds with items appear). Blog is excluded. */
const KIND_ROW_ORDER: DummyArchiveKind[] = ["release", "playtest", "demo"];

/** Catalog kinds shown in the archive (Blog source rows stay out of the UI). */
const CATALOG_KINDS = new Set<DummyArchiveKind>(["playtest", "demo", "release", "featured"]);

/** Pseudo month key for the Featured rail on the timeline. */
const FEATURED_KEY = "__featured__";

/** Which kind tracks to show for a set of entries (1–N, skips empty sorts). */
function kindTracksForEntries(
    entries: DummyArchiveEntry[],
    kindFilter: "all" | DummyArchiveKind
): DummyArchiveKind[] {
    if (kindFilter !== "all" && kindFilter !== "featured") {
        return entries.some(e => e.kind === kindFilter) ? [kindFilter] : [];
    }
    const present = new Set(entries.map(e => e.kind));
    // KIND_ROW_ORDER has no "featured" — Featured is its own stage, not a month rail
    return KIND_ROW_ORDER.filter(k => present.has(k));
}

/**
 * Stage always reserves ~3-row height so fewer kinds expand into the space.
 * Featured fills the same frame as a dedicated 2-row shelf.
 * User can scroll the Instances page further into the archive.
 */
const STAGE_HEIGHT = "min(78vh, 760px)";
/** Curated shelf size — final product targets ~3 hand-picked builds. */
const FEATURED_COUNT = 3;

const SAMPLE_COVERS = [
    "https://raw.githubusercontent.com/Sonic0810/BAPBAPLauncher/main/manifest/assets/instances/latest.png",
    "https://raw.githubusercontent.com/Sonic0810/BAPBAPLauncher/main/manifest/assets/instances/boss-rush.png",
];

const MANIFEST_IMAGE_CACHE = "bapbap-manifest-images-v1";
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function getCachedImageUrl(remoteUrl: string): Promise<string> {
    if (typeof caches === "undefined") return remoteUrl;
    try {
        const cache = await caches.open(MANIFEST_IMAGE_CACHE);
        const hit = await cache.match(remoteUrl);
        if (hit) return URL.createObjectURL(await hit.blob());
        const res = await fetch(remoteUrl, { mode: "cors", credentials: "omit" });
        if (!res.ok) return remoteUrl;
        await cache.put(remoteUrl, res.clone());
        return URL.createObjectURL(await res.blob());
    } catch {
        return remoteUrl;
    }
}

function CachedCoverImage({ url, className }: { url: string; className?: string }) {
    const [src, setSrc] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let revoked: string | null = null;
        let cancelled = false;
        setFailed(false);
        setSrc(null);
        getCachedImageUrl(url).then(resolved => {
            if (cancelled) {
                if (resolved.startsWith("blob:")) URL.revokeObjectURL(resolved);
                return;
            }
            if (resolved.startsWith("blob:")) revoked = resolved;
            setSrc(resolved);
        });
        return () => {
            cancelled = true;
            if (revoked) URL.revokeObjectURL(revoked);
        };
    }, [url]);

    if (failed || !src) return null;
    return (
        <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className={className}
        />
    );
}

/** Kind order when timestamps tie (playtest before demo before blog …). */
const KIND_SORT_RANK: Record<DummyArchiveKind, number> = {
    featured: 0,
    playtest: 1,
    demo: 2,
    release: 3,
    blog: 4,
};

function rowTimestampMs(row: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
}): number {
    // month on source rows is 1-12
    return Date.UTC(row.year, row.month - 1, row.day, row.hour, row.minute, row.second);
}

/**
 * Build catalog entries from real GameFilesVersions/All folders
 * (Demo, Playtest, FilteredByBlog) — scanned into ARCHIVE_SOURCE_ROWS.
 * Always sorted newest → oldest by full datetime.
 */
function mapSourceRowToEntry(
    row: (typeof ARCHIVE_SOURCE_ROWS)[number],
    kind: DummyArchiveKind,
    chronoIndex: number,
    count: number,
    displayIndex: number
): DummyArchiveEntry {
    const meta = KIND_META[kind] ?? KIND_META.release;
    const monthIndex = row.month - 1;
    const mm = String(row.month).padStart(2, "0");
    const dd = String(row.day).padStart(2, "0");
    const d = new Date(rowTimestampMs(row));
    const major = 1 + Math.floor(chronoIndex / 30);
    const minor = Math.floor((chronoIndex % 30) / 5);
    const patch = chronoIndex % 5;
    const statusRoll = displayIndex % 11;
    const status: DummyArchiveStatus =
        statusRoll === 0 ? "update" : statusRoll === 1 || statusRoll === 2 ? "installed" : "available";
    const timeSuffix =
        row.hour || row.minute || row.second
            ? ` ${String(row.hour).padStart(2, "0")}:${String(row.minute).padStart(2, "0")}`
            : "";
    const manifestId = row.manifestId ?? null;
    const name = manifestId ?? `BAPBAP ${row.stamp.slice(0, 10)}`;

    return {
        id: `archive-${kind}-${manifestId ?? row.stamp}-${chronoIndex}`,
        name,
        version: `${major}.${minor}.${patch}`,
        summary:
            kind === "blog" && row.blog
                ? `${row.blog} · ${row.stamp}`
                : kind === "featured"
                  ? `Featured · ${row.stamp}`
                  : `${meta.label} · ${row.stamp}`,
        description: [
            manifestId ? `Steam Manifest ${manifestId}` : null,
            row.depot ? `Depot ${row.depot}` : null,
            kind === "blog" && row.blog ? `Blog “${row.blog}”` : meta.label,
            `Folder ${row.stamp}`,
            `(${chronoIndex + 1}/${count})`,
        ]
            .filter(Boolean)
            .join(" · "),
        accent: meta.accent,
        accent2: meta.accent2,
        glyph: dd,
        status,
        kind,
        sizeLabel: `${520 + (chronoIndex % 40)} MB`,
        publishedLabel:
            d.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
            }) + timeSuffix,
        yearMonth: `${row.year}-${mm}`,
        year: row.year,
        month: monthIndex,
        depot: row.depot,
        manifestId: manifestId ?? undefined,
        stamp: row.stamp,
        imageUrl: chronoIndex % 3 === 0 ? SAMPLE_COVERS[chronoIndex % SAMPLE_COVERS.length] : undefined,
    };
}

export function buildDummyArchiveEntries(): DummyArchiveEntry[] {
    // Single pass: newest → oldest by full datetime only (kind is tie-break)
    const newestFirst = [...ARCHIVE_SOURCE_ROWS].sort((a, b) => {
        const dt = rowTimestampMs(b) - rowTimestampMs(a);
        if (dt !== 0) return dt;
        const ka = KIND_SORT_RANK[a.kind as DummyArchiveKind] ?? 9;
        const kb = KIND_SORT_RANK[b.kind as DummyArchiveKind] ?? 9;
        if (ka !== kb) return ka - kb;
        if (a.stamp !== b.stamp) return b.stamp.localeCompare(a.stamp);
        return (b.blog ?? "").localeCompare(a.blog ?? "");
    });

    const count = newestFirst.length;
    const ageByKey = new Map<string, number>();
    [...newestFirst].reverse().forEach((row, age) => {
        ageByKey.set(`${row.kind}|${row.stamp}|${row.blog ?? ""}|${row.manifestId ?? ""}`, age);
    });

    const entries = newestFirst.map((row, displayIndex) => {
        const ageKey = `${row.kind}|${row.stamp}|${row.blog ?? ""}|${row.manifestId ?? ""}`;
        const chronoIndex = ageByKey.get(ageKey) ?? displayIndex;
        return mapSourceRowToEntry(row, row.kind as DummyArchiveKind, chronoIndex, count, displayIndex);
    });

    // Featured = newest releases (placeholder until curated list is provided) — 2-row shelf
    const featuredSeeds = newestFirst.filter(r => r.kind === "release").slice(0, FEATURED_COUNT);
    const featured = featuredSeeds.map((row, i) => {
        const ageKey = `${row.kind}|${row.stamp}|${row.blog ?? ""}|${row.manifestId ?? ""}`;
        const chronoIndex = ageByKey.get(ageKey) ?? i;
        return mapSourceRowToEntry(row, "featured", chronoIndex, count, i);
    });

    // Featured first, then the rest (still newest-first within each kind cluster via global date)
    return [...featured, ...entries].sort((a, b) => {
        // Keep featured entries only as their own kind; global list still newest-first by stamp
        const tb = entryTimestampMs(b);
        const ta = entryTimestampMs(a);
        if (tb !== ta) return tb - ta;
        return (KIND_SORT_RANK[a.kind] ?? 9) - (KIND_SORT_RANK[b.kind] ?? 9);
    });
}

const DUMMY_ARCHIVE_ENTRIES = buildDummyArchiveEntries();

type MonthGroup = {
    key: string;
    year: number;
    month: number;
    label: string;
    yearLabel: string;
    entries: DummyArchiveEntry[];
};

function entryTimestampMs(e: DummyArchiveEntry): number {
    const stamp = e.stamp ?? "";
    const m = stamp.match(/^(\d{4})-(\d{2})-(\d{2})(?:_(\d{2})-(\d{2})-(\d{2}))?/);
    if (!m) return 0;
    return Date.UTC(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        m[4] ? Number(m[4]) : 0,
        m[5] ? Number(m[5]) : 0,
        m[6] ? Number(m[6]) : 0
    );
}

function groupByYearMonth(entries: DummyArchiveEntry[]): MonthGroup[] {
    const map = new Map<string, MonthGroup>();
    for (const e of entries) {
        let g = map.get(e.yearMonth);
        if (!g) {
            g = {
                key: e.yearMonth,
                year: e.year,
                month: e.month,
                label: MONTH_SHORT[e.month],
                yearLabel: String(e.year),
                entries: [],
            };
            map.set(e.yearMonth, g);
        }
        g.entries.push(e);
    }
    // Newest month first; within month: newest datetime first, then kind rank
    for (const g of map.values()) {
        g.entries.sort((a, b) => {
            const tb = entryTimestampMs(b);
            const ta = entryTimestampMs(a);
            if (tb !== ta) return tb - ta;
            const ka = KIND_SORT_RANK[a.kind] ?? 9;
            const kb = KIND_SORT_RANK[b.kind] ?? 9;
            if (ka !== kb) return ka - kb;
            return (b.stamp ?? "").localeCompare(a.stamp ?? "");
        });
    }
    return Array.from(map.values()).sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
    });
}

/** Static cover art for the card top (Mods-tab style 16/10). */
function ArchiveArtwork({ entry }: { entry: DummyArchiveEntry }) {
    return (
        <div
            className="relative h-full w-full overflow-hidden"
            style={{
                background: `linear-gradient(145deg, color-mix(in oklab, ${entry.accent} 28%, transparent) 0%, ${entry.accent2} 52%, #0a0b10 100%)`,
            }}
        >
            {entry.imageUrl ? (
                <CachedCoverImage
                    url={entry.imageUrl}
                    className="absolute inset-0 h-full w-full object-cover opacity-50 mix-blend-luminosity transition-transform duration-500 ease-pop group-hover:scale-105"
                />
            ) : (
                <span
                    className="pointer-events-none absolute bottom-[-12%] left-[-4%] select-none font-display leading-none text-white/[0.08]"
                    style={{ fontSize: "5.5rem" }}
                >
                    {entry.glyph}
                </span>
            )}
        </div>
    );
}

/**
 * Flexible-width card in a hero-style flex row:
 * equal share of space when idle; hovered card grows (flex 1.7), siblings shrink (0.72).
 */
const CARD_SPRING = { type: "spring" as const, stiffness: 380, damping: 32, mass: 0.85 };
const TICK_EASE = [0.22, 1, 0.36, 1] as const;

const ArchiveCard = memo(function ArchiveCard({
    entry,
    expanded,
    anyExpanded,
    onHover,
    onHoverEnd,
    onOpen,
    rail = false,
    railIndex = 0,
    dense = false,
    reduceMotion = false,
}: {
    entry: DummyArchiveEntry;
    expanded: boolean;
    anyExpanded: boolean;
    onHover: () => void;
    onHoverEnd: () => void;
    onOpen: () => void;
    /** Horizontal kind-rail card — width flexes with siblings */
    rail?: boolean;
    railIndex?: number;
    /** Compact tiles when many items share a track */
    dense?: boolean;
    reduceMotion?: boolean | null;
}) {
    // Rail: always fill parent (flex row or grid cell). Non-rail: hero flex grow.
    const flexClass = rail
        ? "h-full w-full min-w-0"
        : expanded
          ? "flex-[1.7]"
          : anyExpanded
            ? "flex-[0.72]"
            : "flex-1";

    // Stable 1px border (no scale/filter on the outer shell — those break edges).
    // Accent is drawn with an inset ring so corners stay crisp.
    const borderStyle = expanded
        ? {
              borderColor: entry.accent,
              boxShadow: `0 20px 32px -14px rgba(0,0,0,0.7), inset 0 0 0 1px color-mix(in oklab, ${entry.accent} 40%, transparent)`,
          }
        : undefined;

    return (
        <motion.div
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen();
                }
            }}
            onPointerEnter={onHover}
            onPointerLeave={onHoverEnd}
            onFocus={onHover}
            onBlur={onHoverEnd}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
                reduceMotion
                    ? { duration: 0 }
                    : {
                          ...CARD_SPRING,
                          delay: rail ? Math.min(railIndex, 10) * 0.02 : 0,
                      }
            }
            className={cn(
                "bap-grain group relative h-full min-w-0 cursor-pointer overflow-hidden rounded-[1.125rem]",
                // Always-on 1px frame — never transparent, never scaled
                "border border-solid border-border bg-[#0a0b10]",
                "transition-[border-color,box-shadow] duration-200 ease-pop",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                flexClass,
                expanded ? "z-20" : "z-10 hover:border-white/14",
                // Sibling dim without CSS filter on this element (avoids broken edges)
                anyExpanded && !expanded && "opacity-80"
            )}
            style={borderStyle}
        >
            <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
                <ArchiveArtwork entry={entry} />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(10,11,16,0.94)] via-[rgba(10,11,16,0.42)] to-transparent" />
            </div>

            {/* Top accent hairline on hover / expanded */}
            <div
                className={cn(
                    "pointer-events-none absolute inset-x-0 top-0 z-[3] h-[2px] transition-opacity duration-200",
                    expanded ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
                style={{ background: entry.accent }}
            />

            <div
                className={cn(
                    "absolute inset-x-0 bottom-0 z-10 flex flex-col",
                    dense ? "gap-0.5 p-2.5" : "gap-1 p-3 sm:gap-1.5 sm:p-3.5"
                )}
            >
                {/* Same type stack as Instances hero: body eyebrow + display title.
                    Click opens the detail modal — no inline Install/Play CTA. */}
                <div className="flex flex-col gap-0.5">
                    <span
                        className={cn(
                            "font-body font-semibold uppercase tracking-[0.14em] transition-colors duration-[280ms]",
                            dense ? "text-[0.58rem]" : "text-[0.6875rem]"
                        )}
                        style={{ color: expanded ? entry.accent : "#969cab" }}
                    >
                        v{entry.version}
                        {!dense && <> · {entry.publishedLabel}</>}
                    </span>
                    <h2
                        className={cn(
                            "font-display leading-[0.95] text-foreground",
                            entry.manifestId ? "normal-case tracking-tight" : "uppercase"
                        )}
                        style={{
                            fontSize: dense
                                ? "clamp(0.72rem, 0.9vw, 0.9rem)"
                                : "clamp(0.95rem, 1.15vw, 1.25rem)",
                            wordBreak: entry.manifestId ? "break-all" : undefined,
                        }}
                        title={entry.name}
                    >
                        {entry.name}
                    </h2>
                </div>
                {!dense && (
                    <p
                        className={cn(
                            "font-body text-[0.75rem] leading-snug text-white/65 transition-all duration-[280ms]",
                            expanded ? "line-clamp-2 opacity-100" : "line-clamp-1 opacity-75"
                        )}
                    >
                        {entry.summary}
                    </p>
                )}
            </div>
        </motion.div>
    );
});

/**
 * Kind track: few items → single growing row; many / forced → 2-row column-flow grid.
 * Featured always uses forceTwoRows so the stage is a proper dual-row shelf.
 */
const KindScrollRow = memo(function KindScrollRow({
    kind,
    entries,
    hoveredId,
    onHover,
    onHoverEnd,
    onOpen,
    reduceMotion = false,
    forceTwoRows = false,
}: {
    kind: DummyArchiveKind;
    entries: DummyArchiveEntry[];
    hoveredId: string | null;
    onHover: (id: string) => void;
    onHoverEnd: (id: string) => void;
    onOpen: (id: string) => void;
    reduceMotion?: boolean | null;
    /** Always use 2-row grid (Featured shelf). */
    forceTwoRows?: boolean;
}) {
    const meta = KIND_META[kind];
    if (entries.length === 0) return null;

    // Featured / crowded → fixed 2-row shelf; otherwise a single flex row
    const twoRows = forceTwoRows || entries.length > 6;
    // Featured keeps readable labels; only auto-crowded tracks go dense
    const dense = twoRows && !forceTwoRows && entries.length > 8;
    // Featured: wider tiles that scroll; crowded month tracks: tighter auto-fill
    const colClass = forceTwoRows
        ? "auto-cols-[minmax(13.5rem,16rem)]"
        : entries.length > 10
          ? "auto-cols-[minmax(10.5rem,12.5rem)]"
          : "auto-cols-[minmax(12rem,1fr)]";

    return (
        <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.26, ease: TICK_EASE }}
            className={cn(
                "flex min-h-0 min-w-0 flex-1 flex-col",
                forceTwoRows ? "gap-2" : "gap-1.5"
            )}
        >
            {/* Label + count centered between hairlines */}
            <div className="flex h-6 shrink-0 items-center gap-2.5 px-0.5">
                <span className="h-px min-w-4 flex-1 bg-border/70" />
                <div className="flex shrink-0 items-center gap-1.5">
                    <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: meta.tone }}
                    />
                    <span className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {meta.label}
                    </span>
                    <span className="font-mono text-[0.62rem] tabular-nums text-muted-foreground/55">
                        {entries.length}
                    </span>
                </div>
                <span className="h-px min-w-4 flex-1 bg-border/70" />
            </div>
            <div
                className={cn(
                    "h-full min-h-0 flex-1 overflow-x-auto overflow-y-hidden",
                    twoRows
                        ? // Column-flow: top→bottom per column, then scroll sideways
                          cn("grid grid-flow-col grid-rows-2 gap-2.5 sm:gap-3", colClass)
                        : cn(
                          "flex flex-nowrap items-stretch gap-2.5 sm:gap-3",
                          // Single-row: cards share width, grow on hover via parent flex
                          entries.length <= 4
                              ? "[&>*]:min-w-[13rem] [&>*]:flex-1 [&>*]:basis-[14rem]"
                              : "[&>*]:min-w-[12rem] [&>*]:max-w-[20rem] [&>*]:flex-1 [&>*]:basis-[13rem] [&>*]:shrink-0"
                      ),
                    "[scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.15)_transparent]",
                    "[&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15"
                )}
                style={twoRows ? { gridAutoRows: "minmax(0, 1fr)" } : undefined}
            >
                {entries.map((entry, i) => (
                    <div key={entry.id} className="h-full min-h-0 min-w-0">
                        <ArchiveCard
                            entry={entry}
                            rail
                            dense={dense}
                            railIndex={i}
                            reduceMotion={reduceMotion}
                            expanded={hoveredId === entry.id}
                            anyExpanded={hoveredId !== null}
                            onHover={() => onHover(entry.id)}
                            onHoverEnd={() => onHoverEnd(entry.id)}
                            onOpen={() => onOpen(entry.id)}
                        />
                    </div>
                ))}
            </div>
        </motion.div>
    );
});

/** Shared L/R stage chrome so Featured and month rails match. */
function StageNavButton({
    direction,
    label,
    disabled,
    onClick,
}: {
    direction: "left" | "right";
    label: string;
    disabled: boolean;
    onClick: () => void;
}) {
    const Icon = direction === "left" ? ChevronLeft : ChevronRight;
    return (
        <button
            type="button"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                "group/nav flex h-full w-12 shrink-0 flex-col items-center justify-center rounded-2xl border border-solid transition-[border-color,background-color,color] duration-150 sm:w-14",
                "focus-visible:outline-none focus-visible:border-white/25",
                disabled
                    ? "pointer-events-none border-border/40 bg-transparent text-muted-foreground/20"
                    : "cursor-pointer border-border bg-white/[0.03] text-muted-foreground hover:border-white/15 hover:bg-white/[0.07] hover:text-foreground"
            )}
        >
            <Icon
                size={22}
                className={cn(
                    "transition-transform duration-150",
                    direction === "left"
                        ? "group-hover/nav:-translate-x-0.5"
                        : "group-hover/nav:translate-x-0.5"
                )}
            />
        </button>
    );
}

/** Timeline months from catalog builds (Featured pin + Blog excluded). */
const ALL_TIMELINE_GROUPS = groupByYearMonth(
    DUMMY_ARCHIVE_ENTRIES.filter(e => e.kind !== "featured" && e.kind !== "blog")
);

const KIND_PILL_SPRING = { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.8 };
/** Same chrome as TimelineBar: bap-card radius (--radius 1.125rem) + shared height. */
const TOOLBAR_SHELL = "bap-card h-11";
const TIMELINE_SHELL = "bap-card h-11";
const TOOLBAR_INNER_RADIUS = "rounded-[calc(var(--radius)-4px)]";

/**
 * Compact month strip (content width) with Featured pin at the start.
 * Drag-scrub months.
 */
function TimelineBar({
    allGroups,
    availableKeys,
    activeKey,
    onJump,
    reduceMotion,
    featuredActive,
    onFeatured,
}: {
    allGroups: MonthGroup[];
    availableKeys: ReadonlySet<string>;
    activeKey: string | null;
    onJump: (key: string, opts?: { instant?: boolean }) => void;
    reduceMotion: boolean | null;
    featuredActive: boolean;
    onFeatured: () => void;
}) {
    const navRef = useRef<HTMLElement | null>(null);
    const tickRefs = useRef(new Map<string, HTMLElement>());
    const dragging = useRef(false);
    const lastKey = useRef<string | null>(null);
    const rafPick = useRef(0);
    const [isDragging, setIsDragging] = useState(false);

    const years = useMemo(() => {
        const map = new Map<number, MonthGroup[]>();
        for (const g of allGroups) {
            const list = map.get(g.year) ?? [];
            list.push(g);
            map.set(g.year, list);
        }
        return Array.from(map.entries());
    }, [allGroups]);

    const pickFromClientX = useCallback(
        (clientX: number) => {
            // Featured pin is leftmost — skip if closer to it (handled by its button)
            let bestKey: string | null = null;
            let bestDist = Infinity;
            for (const g of allGroups) {
                if (!availableKeys.has(g.key)) continue;
                const el = tickRefs.current.get(g.key);
                if (!el) continue;
                const r = el.getBoundingClientRect();
                const mid = r.left + r.width / 2;
                const d = Math.abs(mid - clientX);
                if (d < bestDist) {
                    bestDist = d;
                    bestKey = g.key;
                }
            }
            if (!bestKey || bestKey === lastKey.current) return;
            lastKey.current = bestKey;
            onJump(bestKey, { instant: true });
        },
        [allGroups, availableKeys, onJump]
    );

    const schedulePick = useCallback(
        (clientX: number) => {
            cancelAnimationFrame(rafPick.current);
            rafPick.current = requestAnimationFrame(() => pickFromClientX(clientX));
        },
        [pickFromClientX]
    );

    const endDrag = (e: ReactPointerEvent) => {
        if (!dragging.current) return;
        dragging.current = false;
        setIsDragging(false);
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
            /* ok */
        }
    };

    const onPointerDown = (e: ReactPointerEvent) => {
        if (e.button !== 0) return;
        // Month buttons handle their own click; still allow drag from empty rail / year labels
        dragging.current = true;
        setIsDragging(true);
        lastKey.current = null;
        try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
            /* ok */
        }
        pickFromClientX(e.clientX);
    };

    const onPointerMove = (e: ReactPointerEvent) => {
        if (!dragging.current) return;
        schedulePick(e.clientX);
    };

    let tickIndex = 0;

    const tickTransition = (i: number, appearing: boolean) =>
        reduceMotion
            ? { duration: 0 }
            : {
                  duration: appearing ? 0.38 : 0.45,
                  ease: TICK_EASE,
                  delay: appearing ? i * 0.012 : i * 0.018,
              };

    return (
        <nav
            ref={navRef}
            aria-label="Archive timeline"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className={cn(
                TIMELINE_SHELL,
                "inline-flex w-max max-w-full select-none items-center overflow-x-auto px-2",
                "touch-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                isDragging ? "cursor-ew-resize" : "cursor-grab"
            )}
        >
            <div className="flex w-max items-center gap-0.5">
                {/* Featured lives on the timeline, not as a kind tag */}
                <button
                    type="button"
                    onClick={e => {
                        e.stopPropagation();
                        onFeatured();
                    }}
                    onPointerDown={e => e.stopPropagation()}
                    className={cn(
                        "relative mr-1 flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5",
                        "font-mono text-[0.6rem] font-semibold uppercase tracking-[0.1em] transition-colors duration-150",
                        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20",
                        featuredActive
                            ? "bg-secondary text-foreground"
                            : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                    )}
                    style={
                        featuredActive
                            ? {
                                  boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${KIND_META.featured.tone} 35%, transparent)`,
                              }
                            : undefined
                    }
                    title="Featured builds"
                >
                    <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                            background: KIND_META.featured.tone,
                            opacity: featuredActive ? 1 : 0.55,
                        }}
                    />
                    Featured
                </button>
                <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-border" />

                {years.map(([year, months], yi) => {
                    const yearHasAny = months.some(m => availableKeys.has(m.key));
                    const yearIdx = tickIndex++;
                    return (
                        <div key={year} className="flex items-center gap-0.5">
                            {yi > 0 && (
                                <span
                                    aria-hidden
                                    className={cn(
                                        "mx-1 h-4 w-px shrink-0 bg-border transition-opacity duration-300",
                                        yearHasAny ? "opacity-100" : "opacity-25"
                                    )}
                                />
                            )}
                            <motion.span
                                initial={false}
                                animate={{
                                    opacity: yearHasAny ? 1 : 0.28,
                                    y: 0,
                                }}
                                transition={tickTransition(yearIdx, yearHasAny)}
                                className="inline-block w-7 shrink-0 text-center font-mono text-[0.55rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                            >
                                {String(year).slice(-2)}
                            </motion.span>
                            {months.map(m => {
                                const available = availableKeys.has(m.key);
                                const active = available && m.key === activeKey && !featuredActive;
                                const i = tickIndex++;
                                return (
                                    <div
                                        key={m.key}
                                        ref={el => {
                                            if (el) tickRefs.current.set(m.key, el);
                                            else tickRefs.current.delete(m.key);
                                        }}
                                        className="relative flex h-8 w-[2.15rem] shrink-0 items-center justify-center"
                                    >
                                        <motion.button
                                            type="button"
                                            disabled={!available}
                                            tabIndex={available ? 0 : -1}
                                            aria-hidden={!available}
                                            initial={false}
                                            animate={{
                                                opacity: available ? 1 : 0,
                                                y: available ? 0 : 5,
                                                scale: available ? 1 : 0.94,
                                            }}
                                            transition={tickTransition(i, available)}
                                            onClick={e => {
                                                e.stopPropagation();
                                                if (available) onJump(m.key);
                                            }}
                                            onPointerDown={e => {
                                                // Allow drag-scrub starting on a tick too
                                                e.stopPropagation();
                                                if (!available) return;
                                                dragging.current = true;
                                                setIsDragging(true);
                                                lastKey.current = null;
                                                try {
                                                    navRef.current?.setPointerCapture(e.pointerId);
                                                } catch {
                                                    /* ok */
                                                }
                                                pickFromClientX(e.clientX);
                                            }}
                                            title={available ? `${m.label} ${m.year}` : undefined}
                                            className={cn(
                                                "absolute inset-0.5 flex items-center justify-center rounded-md font-mono text-[0.65rem] uppercase tracking-[0.08em]",
                                                "transition-colors duration-150",
                                                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20",
                                                !available && "pointer-events-none",
                                                available &&
                                                    (active
                                                        ? "bg-secondary text-foreground"
                                                        : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground")
                                            )}
                                        >
                                            {m.label}
                                        </motion.button>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </nav>
    );
}

export function ArchiveSectionPrototype() {
    const reduceMotion = useReducedMotion();
    const [detailId, setDetailId] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [kindFilter, setKindFilter] = useState<"all" | DummyArchiveKind>("all");
    /** Month key, or FEATURED_KEY when Featured pin is selected on the timeline. */
    const [activeMonthKey, setActiveMonthKey] = useState<string | null>(FEATURED_KEY);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    /** Search-tips tooltip (hover / keyboard focus) */
    const [searchTipsOpen, setSearchTipsOpen] = useState(false);
    /** Soft train when filters wrap / rebuild */
    const [filterTrain, setFilterTrain] = useState(false);

    const rootSectionRef = useRef<HTMLElement | null>(null);
    const monthIndexRef = useRef(0);
    const filterSigRef = useRef(`${kindFilter}|${query}`);
    const filterTrainTimer = useRef(0);

    const matchesQuery = useCallback(
        (e: DummyArchiveEntry) => {
            const q = query.trim().toLowerCase();
            if (!q) return true;
            return (
                e.name.toLowerCase().includes(q) ||
                e.version.includes(q) ||
                e.id.toLowerCase().includes(q) ||
                e.kind.includes(q) ||
                e.summary.toLowerCase().includes(q) ||
                (e.stamp?.toLowerCase().includes(q) ?? false) ||
                (e.manifestId?.includes(q) ?? false)
            );
        },
        [query]
    );

    // Featured entries only via timeline pin (not a kind tag) — newest first for the 2-row shelf
    const featuredEntries = useMemo(() => {
        return DUMMY_ARCHIVE_ENTRIES.filter(e => e.kind === "featured" && matchesQuery(e)).sort(
            (a, b) => entryTimestampMs(b) - entryTimestampMs(a)
        );
    }, [matchesQuery]);

    // Month catalog: Playtest / Demo / Release only (no Featured pin, no Blog)
    const filtered = useMemo(() => {
        return DUMMY_ARCHIVE_ENTRIES.filter(e => {
            if (e.kind === "featured" || e.kind === "blog") return false;
            if (!CATALOG_KINDS.has(e.kind)) return false;
            if (kindFilter !== "all" && e.kind !== kindFilter) return false;
            return matchesQuery(e);
        });
    }, [query, kindFilter, matchesQuery]);

    const groups = useMemo(() => groupByYearMonth(filtered), [filtered]);

    const availableMonthKeys = useMemo(
        () => new Set(groups.map(g => g.key)),
        [groups]
    );

    const featuredActive = activeMonthKey === FEATURED_KEY;

    // Keep active month valid when filters change; slow train on filter rebuild
    useEffect(() => {
        const sig = `${kindFilter}|${query}`;
        const filterChanged = filterSigRef.current !== sig;
        filterSigRef.current = sig;

        if (filterChanged) {
            setFilterTrain(true);
            window.clearTimeout(filterTrainTimer.current);
            filterTrainTimer.current = window.setTimeout(() => setFilterTrain(false), 900);
        }

        // Stay on Featured pin if selected and still has content
        if (activeMonthKey === FEATURED_KEY) {
            if (featuredEntries.length === 0 && groups.length > 0) {
                monthIndexRef.current = 0;
                setActiveMonthKey(groups[0].key);
            }
            return () => window.clearTimeout(filterTrainTimer.current);
        }

        if (groups.length === 0) {
            if (featuredEntries.length > 0) {
                setActiveMonthKey(FEATURED_KEY);
                monthIndexRef.current = -1;
            } else {
                setActiveMonthKey(null);
                monthIndexRef.current = 0;
            }
            return () => window.clearTimeout(filterTrainTimer.current);
        }

        setActiveMonthKey(prev => {
            if (prev === FEATURED_KEY) return prev;
            const idx = prev ? groups.findIndex(g => g.key === prev) : -1;
            if (idx >= 0) {
                monthIndexRef.current = idx;
                return prev;
            }
            monthIndexRef.current = 0;
            return groups[0].key;
        });

        return () => window.clearTimeout(filterTrainTimer.current);
    }, [groups, kindFilter, query, featuredEntries.length, activeMonthKey]);

    const jumpToMonth = useCallback(
        (key: string, opts?: { instant?: boolean; soft?: boolean }) => {
            if (key === FEATURED_KEY) {
                monthIndexRef.current = -1;
                setActiveMonthKey(FEATURED_KEY);
                setHoveredId(null);
                if (!opts?.soft) setFilterTrain(false);
                return;
            }
            let nextIdx = groups.findIndex(g => g.key === key);
            if (nextIdx < 0) {
                nextIdx = groups.findIndex(g => g.key <= key);
                if (nextIdx < 0) nextIdx = 0;
            }
            if (!groups[nextIdx]) return;
            monthIndexRef.current = nextIdx;
            setActiveMonthKey(groups[nextIdx].key);
            setHoveredId(null);
            if (!opts?.soft) setFilterTrain(false);
        },
        [groups]
    );

    const jumpToFeatured = useCallback(() => {
        jumpToMonth(FEATURED_KEY);
    }, [jumpToMonth]);

    const detail = DUMMY_ARCHIVE_ENTRIES.find(e => e.id === detailId) ?? null;

    const activeIndex = useMemo(() => {
        if (activeMonthKey === FEATURED_KEY) return -1;
        const i = groups.findIndex(g => g.key === activeMonthKey);
        return i >= 0 ? i : 0;
    }, [groups, activeMonthKey]);

    const canPage = groups.length > 0 || featuredEntries.length > 0;

    // Wrap: Featured ↔ months; past newest → oldest, past oldest → Featured/newest
    const goNewer = useCallback(() => {
        if (featuredActive) {
            if (groups.length > 0) jumpToMonth(groups[groups.length - 1].key); // to oldest
            return;
        }
        if (groups.length === 0) {
            if (featuredEntries.length > 0) jumpToFeatured();
            return;
        }
        if (activeIndex <= 0) {
            if (featuredEntries.length > 0) {
                jumpToFeatured();
                return;
            }
            setFilterTrain(true);
            window.clearTimeout(filterTrainTimer.current);
            filterTrainTimer.current = window.setTimeout(() => setFilterTrain(false), 900);
            jumpToMonth(groups[groups.length - 1].key, { soft: true });
            return;
        }
        jumpToMonth(groups[activeIndex - 1].key);
    }, [
        featuredActive,
        groups,
        activeIndex,
        featuredEntries.length,
        jumpToMonth,
        jumpToFeatured,
    ]);

    const goOlder = useCallback(() => {
        if (featuredActive) {
            if (groups.length > 0) jumpToMonth(groups[0].key); // to newest month
            return;
        }
        if (groups.length === 0) {
            if (featuredEntries.length > 0) jumpToFeatured();
            return;
        }
        if (activeIndex >= groups.length - 1) {
            if (featuredEntries.length > 0) {
                jumpToFeatured();
                return;
            }
            setFilterTrain(true);
            window.clearTimeout(filterTrainTimer.current);
            filterTrainTimer.current = window.setTimeout(() => setFilterTrain(false), 900);
            jumpToMonth(groups[0].key, { soft: true });
            return;
        }
        jumpToMonth(groups[activeIndex + 1].key);
    }, [
        featuredActive,
        groups,
        activeIndex,
        featuredEntries.length,
        jumpToMonth,
        jumpToFeatured,
    ]);

    // Unified train: [Featured?, ...months] so Featured ↔ month animates like month ↔ month
    const hasFeaturedSlide = featuredEntries.length > 0;
    const monthCount = groups.length;
    const slideCount = Math.max(1, monthCount + (hasFeaturedSlide ? 1 : 0));
    const trainIndex = featuredActive
        ? 0
        : hasFeaturedSlide
          ? Math.max(0, activeIndex) + 1
          : Math.max(0, activeIndex);
    const trainTransition = reduceMotion
        ? { duration: 0 }
        : filterTrain
          ? { type: "tween" as const, duration: 0.55, ease: TICK_EASE }
          : { type: "spring" as const, stiffness: 260, damping: 34, mass: 0.9 };

    return (
        <section
            id="bapbap-files-archive"
            ref={rootSectionRef}
            className="mb-24 scroll-mt-28 pb-32"
            aria-label="BAPBAP Version Archive"
        >
            {/* Header — same quiet style as other workspaces */}
            <div className="mb-4 flex items-center gap-2">
                <Archive size={14} className="text-muted-foreground" />
                <h2 className="font-display text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    BAPBAP Version Archive
                </h2>
                <span className="ml-1 h-px flex-1 bg-border" />
            </div>

            {/* Compact search + tags; timeline content-width with Featured pin */}
            <div className="mb-5 flex w-full flex-col gap-2.5">
                <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
                    <div
                        className={cn(
                            TOOLBAR_SHELL,
                            // overflow-visible so the info tooltip is not clipped
                            "relative z-20 w-full min-w-[12rem] max-w-xs overflow-visible sm:w-64"
                        )}
                    >
                        <Search
                            size={15}
                            className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-muted-foreground"
                        />
                        <input
                            type="search"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search"
                            aria-label="Search archive builds"
                            className={cn(
                                "box-border h-full w-full border-0 bg-transparent pl-9 pr-16 text-sm text-foreground",
                                "placeholder:text-muted-foreground outline-none",
                                "[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden",
                                "focus-visible:outline-none focus-visible:ring-0"
                            )}
                        />
                        <div className="absolute right-1 top-1/2 z-[1] flex -translate-y-1/2 items-center gap-0.5">
                            {query ? (
                                <button
                                    type="button"
                                    onClick={() => setQuery("")}
                                    aria-label="Clear search"
                                    className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                >
                                    <X size={13} />
                                </button>
                            ) : null}
                            <div
                                className="relative"
                                onPointerEnter={() => setSearchTipsOpen(true)}
                                onPointerLeave={() => setSearchTipsOpen(false)}
                            >
                                <button
                                    type="button"
                                    aria-label="Search tips"
                                    aria-describedby={searchTipsOpen ? "archive-search-tips" : undefined}
                                    aria-expanded={searchTipsOpen}
                                    onFocus={() => setSearchTipsOpen(true)}
                                    onBlur={() => setSearchTipsOpen(false)}
                                    className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:bg-secondary"
                                >
                                    <Info size={13} strokeWidth={2} />
                                </button>
                                <div
                                    id="archive-search-tips"
                                    role="tooltip"
                                    className={cn(
                                        "absolute right-0 top-[calc(100%+8px)] z-50 w-60 rounded-xl border border-solid border-border bg-card px-3 py-2.5 text-left shadow-lg",
                                        "transition-opacity duration-150",
                                        searchTipsOpen
                                            ? "pointer-events-auto opacity-100"
                                            : "pointer-events-none opacity-0"
                                    )}
                                >
                                    <p className="font-body text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-foreground/85">
                                        Search tips
                                    </p>
                                    <ul className="mt-1.5 space-y-1 font-body text-[0.72rem] leading-relaxed text-muted-foreground">
                                        <li>Manifest ID (Steam build id)</li>
                                        <li>Date stamp (e.g. 2025-08-14)</li>
                                        <li>Kind: playtest, demo, release</li>
                                        <li>Summary or version number</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Compact kind tags (no Featured — that sits on the timeline) */}
                    <LayoutGroup id="archive-kind-filters">
                        <div
                            className={cn(
                                TOOLBAR_SHELL,
                                "inline-flex w-fit max-w-full items-center gap-0.5 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                            )}
                            role="tablist"
                            aria-label="Version kind"
                        >
                            {KIND_FILTERS.map(key => {
                                const active = kindFilter === key;
                                const label = key === "all" ? "All" : KIND_META[key].label;
                                const tone = key === "all" ? "#a1a1aa" : KIND_META[key].tone;
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        role="tab"
                                        aria-selected={active}
                                        onClick={() => setKindFilter(key)}
                                        className={cn(
                                            TOOLBAR_INNER_RADIUS,
                                            "relative flex h-full shrink-0 items-center gap-1.5 px-2.5",
                                            "font-mono text-[0.62rem] uppercase tracking-[0.1em] transition-colors duration-150",
                                            "focus-visible:outline-none",
                                            active
                                                ? "text-foreground"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        {active && (
                                            <motion.span
                                                layoutId="archive-kind-outline"
                                                className={cn(
                                                    TOOLBAR_INNER_RADIUS,
                                                    "absolute inset-0 border border-white/15 bg-secondary/80"
                                                )}
                                                style={{
                                                    boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${tone} 30%, transparent)`,
                                                }}
                                                transition={
                                                    reduceMotion ? { duration: 0 } : KIND_PILL_SPRING
                                                }
                                            />
                                        )}
                                        <span className="relative z-[1] flex items-center gap-1.5">
                                            {key !== "all" && (
                                                <span
                                                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                                                    style={{
                                                        background: tone,
                                                        opacity: active ? 1 : 0.55,
                                                    }}
                                                />
                                            )}
                                            {label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </LayoutGroup>
                </div>

                {/* Compact timeline with Featured pin at the start */}
                <TimelineBar
                    allGroups={ALL_TIMELINE_GROUPS}
                    availableKeys={availableMonthKeys}
                    activeKey={featuredActive ? null : activeMonthKey}
                    onJump={jumpToMonth}
                    reduceMotion={reduceMotion}
                    featuredActive={featuredActive}
                    onFeatured={jumpToFeatured}
                />
            </div>

            {/* Stage — one train: Featured (optional first slide) + months */}
            <div className="relative w-full">
                {!hasFeaturedSlide && groups.length === 0 ? (
                    <div className="bap-card p-6 text-sm text-muted-foreground">
                        No archive builds match your filters.
                    </div>
                ) : (
                    <div
                        className="flex w-full items-stretch gap-1.5 sm:gap-2"
                        style={{ height: STAGE_HEIGHT }}
                    >
                        <StageNavButton
                            direction="left"
                            label="Newer"
                            disabled={!canPage}
                            onClick={goNewer}
                        />

                        <div className="relative h-full min-w-0 flex-1 overflow-hidden">
                            <motion.div
                                className="flex h-full will-change-transform"
                                initial={false}
                                animate={{
                                    // % of full train width → one viewport per step (Featured + months)
                                    x: `${(-trainIndex * 100) / slideCount}%`,
                                }}
                                style={{ width: `${slideCount * 100}%` }}
                                transition={trainTransition}
                            >
                                {hasFeaturedSlide && (
                                    <div
                                        key={FEATURED_KEY}
                                        className={cn(
                                            "flex h-full shrink-0 flex-col",
                                            !featuredActive && "pointer-events-none"
                                        )}
                                        style={{ width: `${100 / slideCount}%` }}
                                        aria-hidden={!featuredActive}
                                    >
                                        <KindScrollRow
                                            kind="featured"
                                            entries={featuredEntries}
                                            hoveredId={featuredActive ? hoveredId : null}
                                            reduceMotion={reduceMotion}
                                            onHover={id => {
                                                if (featuredActive) setHoveredId(id);
                                            }}
                                            onHoverEnd={id =>
                                                setHoveredId(prev => (prev === id ? null : prev))
                                            }
                                            onOpen={id => {
                                                if (featuredActive) setDetailId(id);
                                            }}
                                        />
                                    </div>
                                )}

                                {groups.map((group, gi) => {
                                    const isActive = !featuredActive && gi === activeIndex;
                                    const byKind = (k: DummyArchiveKind) =>
                                        group.entries.filter(e => e.kind === k);
                                    const rowKinds = kindTracksForEntries(
                                        group.entries,
                                        kindFilter
                                    );
                                    const trackGap =
                                        rowKinds.length <= 1
                                            ? "gap-0"
                                            : rowKinds.length === 2
                                              ? "gap-3"
                                              : "gap-2";

                                    return (
                                        <div
                                            key={group.key}
                                            className={cn(
                                                "flex h-full shrink-0 flex-col",
                                                trackGap,
                                                !isActive && "pointer-events-none"
                                            )}
                                            style={{ width: `${100 / slideCount}%` }}
                                            aria-hidden={!isActive}
                                        >
                                            <AnimatePresence mode="popLayout" initial={false}>
                                                {rowKinds.map(k => (
                                                    <KindScrollRow
                                                        key={k}
                                                        kind={k}
                                                        entries={byKind(k)}
                                                        hoveredId={isActive ? hoveredId : null}
                                                        reduceMotion={reduceMotion}
                                                        onHover={id => {
                                                            if (isActive) setHoveredId(id);
                                                        }}
                                                        onHoverEnd={id =>
                                                            setHoveredId(prev =>
                                                                prev === id ? null : prev
                                                            )
                                                        }
                                                        onOpen={id => {
                                                            if (isActive) setDetailId(id);
                                                        }}
                                                    />
                                                ))}
                                            </AnimatePresence>
                                        </div>
                                    );
                                })}
                            </motion.div>
                        </div>

                        <StageNavButton
                            direction="right"
                            label="Older"
                            disabled={!canPage}
                            onClick={goOlder}
                        />
                    </div>
                )}
            </div>

            <Dialog open={Boolean(detail)} onOpenChange={o => !o && setDetailId(null)}>
                <DialogContent className="max-w-lg gap-0 overflow-hidden border border-solid border-border p-0">
                    {detail && (
                        <>
                            <div className="relative h-44 w-full overflow-hidden">
                                <ArchiveArtwork entry={detail} />
                                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
                                <button
                                    type="button"
                                    onClick={() => setDetailId(null)}
                                    className="focus-ring absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-solid border-white/15 bg-black/50 text-white/80 backdrop-blur hover:bg-black/70"
                                    aria-label="Close"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                            <div className="flex flex-col gap-4 p-6">
                                <DialogHeader>
                                    <DialogTitle className="font-display text-base uppercase tracking-wide">
                                        {detail.name}
                                    </DialogTitle>
                                </DialogHeader>
                                <div className="flex flex-wrap gap-2 font-mono text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                                    <span
                                        className="rounded-md px-2 py-1"
                                        style={{
                                            background: `color-mix(in oklab, ${KIND_META[detail.kind].tone} 12%, var(--surface-inset))`,
                                            color: KIND_META[detail.kind].tone,
                                            opacity: 0.9,
                                        }}
                                    >
                                        {KIND_META[detail.kind].label}
                                    </span>
                                    <span className="rounded-md bg-[var(--surface-inset)] px-2 py-1">
                                        v{detail.version}
                                    </span>
                                    <span className="rounded-md bg-[var(--surface-inset)] px-2 py-1">
                                        {detail.sizeLabel}
                                    </span>
                                    <span className="rounded-md bg-[var(--surface-inset)] px-2 py-1">
                                        {detail.publishedLabel}
                                    </span>
                                </div>
                                <p className="text-sm leading-relaxed text-muted-foreground">{detail.description}</p>
                                <div className="flex gap-2 pt-1">
                                    <button
                                        type="button"
                                        disabled
                                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-[0.625rem] px-6 py-3 font-body text-sm font-semibold uppercase tracking-[0.08em] opacity-60"
                                        style={{
                                            background: `color-mix(in oklab, ${detail.accent} 78%, #1a1e26)`,
                                            color: "#f1f0ea",
                                        }}
                                        title="Prototype only"
                                    >
                                        {detail.status === "update" ? (
                                            <>
                                                <RefreshCw size={15} /> Update
                                            </>
                                        ) : detail.status === "installed" ? (
                                            <>
                                                <Play size={15} /> Play
                                            </>
                                        ) : (
                                            <>
                                                <Download size={15} /> Install
                                            </>
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDetailId(null)}
                                        className="inline-flex items-center justify-center gap-2 rounded-[0.625rem] border border-solid border-border bg-white/[0.06] px-5 py-3 font-body text-sm font-semibold uppercase tracking-[0.08em] text-foreground transition-[filter,transform,border-color] duration-150 ease-pop hover:-translate-y-px hover:border-white/20 hover:bg-white/[0.1]"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </section>
    );
}
