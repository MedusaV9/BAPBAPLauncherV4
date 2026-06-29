export type LanguageCode = "en" | "de" | "ru" | "es";

export type LanguageMeta = {
    code: LanguageCode;
    /** Native name shown in the selector. */
    name: string;
};

// Order is the order shown in the Settings selector.
export const LANGUAGES: LanguageMeta[] = [
    { code: "en", name: "English" },
    { code: "de", name: "Deutsch" },
    { code: "ru", name: "Русский" },
    { code: "es", name: "Español" },
];

export const DEFAULT_LANGUAGE: LanguageCode = "en";

export function isLanguageCode(value: unknown): value is LanguageCode {
    return typeof value === "string" && LANGUAGES.some(l => l.code === value);
}

export function normalizeLanguage(value: unknown): LanguageCode {
    return isLanguageCode(value) ? value : DEFAULT_LANGUAGE;
}
