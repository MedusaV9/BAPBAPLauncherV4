import type { OfficialVersionEntry, PackageCard, PackageManifest, PackageVisual } from "../../shared/manifest";
import { FX_TOKENS, type FxResolvedToken, type FxToken, type RibbonResolved, type RibbonTag } from "./fx-types";
import { LEGACY_TOKEN_ALIASES } from "./fx-profiles";

const TOKEN_SET = new Set<string>(FX_TOKENS);

const RIBBON_ALIASES: Record<string, RibbonTag> = {
    recommended: "recommended",
    sneakpeek: "sneakpeek",
    sneakpeak: "sneakpeek",
    hot: "hot",
    beta: "beta",
    new: "new",
    experimental: "experimental",
    featured: "featured",
    secret: "secret",
    hostonly: "hostonly",
    "host-only": "hostonly",
    host_only: "hostonly",
    updateavailable: "updateavailable",
    "update-available": "updateavailable",
    update_available: "updateavailable",
};

const RIBBON_PRIORITY: Record<RibbonTag, number> = {
    updateavailable: 110,
    hostonly: 95,
    sneakpeek: 100,
    hot: 90,
    featured: 85,
    secret: 84,
    beta: 80,
    new: 70,
    experimental: 60,
    recommended: 50,
};

function normalizeTag(value: string): string {
    return `${value || ""}`.trim().toLowerCase();
}

function canonicalizeToken(rawTag: string): FxToken | null {
    const normalized = normalizeTag(rawTag);
    if (!normalized) {
        return null;
    }
    const unhidden = normalized.startsWith("hidden_") ? normalized.slice(7) : normalized;
    if (TOKEN_SET.has(unhidden)) {
        return unhidden as FxToken;
    }
    const alias = LEGACY_TOKEN_ALIASES[unhidden];
    return alias || null;
}

export function resolveVisualToken(input: {
    visual?: PackageVisual;
    tags?: string[];
}): FxResolvedToken | null {
    const candidates = [
        ...(input.visual?.tags || []),
        ...(input.tags || []),
        input.visual?.preset || "",
    ];
    for (const raw of candidates) {
        const normalized = normalizeTag(raw);
        if (!normalized) {
            continue;
        }
        const token = canonicalizeToken(normalized);
        if (!token) {
            continue;
        }
        return {
            token,
            hidden: normalized.startsWith("hidden_"),
            rawTag: normalized,
        };
    }
    return null;
}

export function resolveVisibleTags(input: {
    tags?: string[];
    visual?: PackageVisual;
}): string[] {
    const tags = [...(input.tags || []), ...(input.visual?.tags || [])];
    const normalized = tags
        .map(tag => normalizeTag(tag))
        .filter(Boolean)
        .filter(tag => !tag.startsWith("hidden_"));
    return Array.from(new Set(normalized));
}

export function resolveEffectTag(rawTag: string): FxResolvedToken | null {
    const normalized = normalizeTag(rawTag);
    if (!normalized || normalized.startsWith("hidden_")) {
        return null;
    }
    const token = canonicalizeToken(normalized);
    if (!token) {
        return null;
    }
    return {
        token,
        hidden: false,
        rawTag: normalized,
    };
}

function normalizeRibbonTag(rawTag: string): RibbonTag | null {
    const normalized = normalizeTag(rawTag);
    if (!normalized) {
        return null;
    }
    return RIBBON_ALIASES[normalized] || null;
}

function ribbonLabel(tag: RibbonTag): string {
    switch (tag) {
        case "hostonly":
            return "HOST ONLY";
        case "sneakpeek":
            return "SNEAKPEEK";
        case "featured":
            return "FEATURED";
        case "secret":
            return "SECRET";
        case "updateavailable":
            return "UPDATE";
        case "recommended":
            return "RECOMMENDED";
        case "experimental":
            return "EXPERIMENTAL";
        case "new":
            return "NEW";
        case "hot":
            return "HOT";
        case "beta":
            return "BETA";
        default:
            return `${tag}`.toUpperCase();
    }
}

export function resolveRibbon(input: {
    tags?: string[];
    visual?: PackageVisual;
    recommended?: boolean;
}): RibbonResolved | null {
    const tagCandidates = [...(input.visual?.ribbonTags || []), ...(input.tags || [])];
    if (input.recommended) {
        tagCandidates.push("recommended");
    }
    const ribbons = tagCandidates
        .map(candidate => normalizeRibbonTag(candidate))
        .filter(Boolean) as RibbonTag[];

    if (!ribbons.length) {
        return null;
    }
    const unique = Array.from(new Set(ribbons));
    unique.sort((a, b) => RIBBON_PRIORITY[b] - RIBBON_PRIORITY[a]);
    const winner = unique[0];
    return {
        tag: winner,
        label: ribbonLabel(winner),
        priority: RIBBON_PRIORITY[winner],
    };
}

export function resolveTokenForPackage(pkg: PackageCard | PackageManifest): FxResolvedToken | null {
    return resolveVisualToken({
        visual: pkg.visual,
        tags: pkg.tags,
    });
}

export function resolveTokenForOfficialVersion(version: OfficialVersionEntry): FxResolvedToken | null {
    return resolveVisualToken({
        visual: version.visual,
        tags: version.tags,
    });
}
