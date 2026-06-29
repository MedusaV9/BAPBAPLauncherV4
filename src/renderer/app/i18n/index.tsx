import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import en, { type StringKey } from "./en";
import de from "./de";
import ru from "./ru";
import es from "./es";
import { normalizeLanguage, type LanguageCode } from "./languages";
import { useSettings } from "../query/hooks";

type Dict = Partial<Record<StringKey, string>>;

const DICTS: Record<LanguageCode, Dict> = { en, de, ru, es };

export type TranslateFn = (key: StringKey, fallback?: string) => string;

const I18nContext = createContext<{ language: LanguageCode; t: TranslateFn }>({
    language: "en",
    t: (key, fallback) => fallback ?? en[key] ?? key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
    const { data: settings } = useSettings();
    const language = normalizeLanguage(settings?.language);

    const t = useCallback<TranslateFn>(
        (key, fallback) => DICTS[language]?.[key] ?? en[key] ?? fallback ?? key,
        [language]
    );

    const value = useMemo(() => ({ language, t }), [language, t]);
    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): TranslateFn {
    return useContext(I18nContext).t;
}

export function useLanguage(): LanguageCode {
    return useContext(I18nContext).language;
}
