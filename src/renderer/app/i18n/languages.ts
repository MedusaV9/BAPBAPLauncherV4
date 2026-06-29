export type LanguageCode =
    | "de"
    | "en"
    | "es"
    | "fr"
    | "nl"
    | "pt"
    | "ru"
    | "tr"
    | "zh"
    | "ja";

export type LanguageMeta = {
    code: LanguageCode;
    /** Native name shown in the selector. */
    name: string;
};

// Order is the order shown in the Settings selector.
export const LANGUAGES: LanguageMeta[] = [
    { code: "de", name: "Deutsch" },
    { code: "en", name: "English" },
    { code: "es", name: "Español" },
    { code: "fr", name: "Français" },
    { code: "nl", name: "Nederlands" },
    { code: "pt", name: "Português" },
    { code: "ru", name: "Русский" },
    { code: "tr", name: "Türkçe" },
    { code: "zh", name: "简体中文" },
    { code: "ja", name: "日本語" },
];

export const DEFAULT_LANGUAGE: LanguageCode = "en";

export function isLanguageCode(value: unknown): value is LanguageCode {
    return typeof value === "string" && LANGUAGES.some(l => l.code === value);
}

export function normalizeLanguage(value: unknown): LanguageCode {
    return isLanguageCode(value) ? value : DEFAULT_LANGUAGE;
}
