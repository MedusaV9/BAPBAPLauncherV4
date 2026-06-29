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

const FLAG_BY_CODE: Record<LanguageCode, (p: FlagProps) => React.JSX.Element> = {
    en: FlagEN,
    de: FlagDE,
    ru: FlagRU,
    es: FlagES,
};

export function LanguageFlag({ code, className }: { code: LanguageCode; className?: string }) {
    const Flag = FLAG_BY_CODE[code] ?? FlagEN;
    return <Flag className={className} />;
}
