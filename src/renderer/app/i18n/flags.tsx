import type { LanguageCode } from "./languages";

type FlagProps = { className?: string };

// Simple inline SVG flags — emoji country flags do not render on Windows.
// Rounded 20x14 viewBox, suitable for inline use before a label.

function Frame({ children }: { children: React.ReactNode }) {
    return (
        <svg
            viewBox="0 0 20 14"
            width="20"
            height="14"
            className="inline-block shrink-0 rounded-[2px] ring-1 ring-black/20"
            aria-hidden="true"
        >
            {children}
        </svg>
    );
}

function FlagEN(_: FlagProps) {
    return (
        <Frame>
            <rect width="20" height="14" fill="#012169" />
            <path d="M0 0L20 14M20 0L0 14" stroke="#fff" strokeWidth="2.6" />
            <path d="M0 0L20 14M20 0L0 14" stroke="#C8102E" strokeWidth="1.2" />
            <path d="M10 0V14M0 7H20" stroke="#fff" strokeWidth="3.4" />
            <path d="M10 0V14M0 7H20" stroke="#C8102E" strokeWidth="1.8" />
        </Frame>
    );
}

function FlagDE(_: FlagProps) {
    return (
        <Frame>
            <rect width="20" height="4.67" y="0" fill="#000" />
            <rect width="20" height="4.67" y="4.67" fill="#DD0000" />
            <rect width="20" height="4.67" y="9.33" fill="#FFCE00" />
        </Frame>
    );
}

function FlagRU(_: FlagProps) {
    return (
        <Frame>
            <rect width="20" height="4.67" y="0" fill="#fff" />
            <rect width="20" height="4.67" y="4.67" fill="#0039A6" />
            <rect width="20" height="4.67" y="9.33" fill="#D52B1E" />
        </Frame>
    );
}

function FlagES(_: FlagProps) {
    return (
        <Frame>
            <rect width="20" height="14" fill="#AA151B" />
            <rect width="20" height="7" y="3.5" fill="#F1BF00" />
        </Frame>
    );
}

function FlagFR(_: FlagProps) {
    return (
        <Frame>
            <rect width="6.67" height="14" x="0" fill="#0055A4" />
            <rect width="6.67" height="14" x="6.67" fill="#fff" />
            <rect width="6.66" height="14" x="13.33" fill="#EF4135" />
        </Frame>
    );
}

function FlagNL(_: FlagProps) {
    return (
        <Frame>
            <rect width="20" height="4.67" y="0" fill="#AE1C28" />
            <rect width="20" height="4.67" y="4.67" fill="#fff" />
            <rect width="20" height="4.67" y="9.33" fill="#21468B" />
        </Frame>
    );
}

function FlagPT(_: FlagProps) {
    return (
        <Frame>
            <rect width="8" height="14" x="0" fill="#006600" />
            <rect width="12" height="14" x="8" fill="#FF0000" />
            <circle cx="8" cy="7" r="2.6" fill="#FFCC00" stroke="#fff" strokeWidth="0.5" />
        </Frame>
    );
}

function FlagTR(_: FlagProps) {
    return (
        <Frame>
            <rect width="20" height="14" fill="#E30A17" />
            <circle cx="8" cy="7" r="3" fill="#fff" />
            <circle cx="9" cy="7" r="2.4" fill="#E30A17" />
            <path d="M11 7l2.3-.75-1.42 1.96V5.79l1.42 1.96z" fill="#fff" />
        </Frame>
    );
}

function FlagZH(_: FlagProps) {
    return (
        <Frame>
            <rect width="20" height="14" fill="#DE2910" />
            <path d="M3.4 2.2l.62 1.9 1.62-1.18H3.64l1.62 1.18z" fill="#FFDE00" />
            <circle cx="7.6" cy="1.6" r="0.5" fill="#FFDE00" />
            <circle cx="8.8" cy="3" r="0.5" fill="#FFDE00" />
            <circle cx="8.8" cy="5" r="0.5" fill="#FFDE00" />
            <circle cx="7.6" cy="6.2" r="0.5" fill="#FFDE00" />
        </Frame>
    );
}

function FlagJA(_: FlagProps) {
    return (
        <Frame>
            <rect width="20" height="14" fill="#fff" />
            <circle cx="10" cy="7" r="4.2" fill="#BC002D" />
        </Frame>
    );
}

const FLAG_BY_CODE: Record<LanguageCode, (p: FlagProps) => React.JSX.Element> = {
    en: FlagEN,
    de: FlagDE,
    ru: FlagRU,
    es: FlagES,
    fr: FlagFR,
    nl: FlagNL,
    pt: FlagPT,
    tr: FlagTR,
    zh: FlagZH,
    ja: FlagJA,
};

export function LanguageFlag({ code, className }: { code: LanguageCode; className?: string }) {
    const Flag = FLAG_BY_CODE[code] ?? FlagEN;
    return <Flag className={className} />;
}
