import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { en } from "./locales/en";
import { fr } from "./locales/fr";
import { es } from "./locales/es";
import { ar } from "./locales/ar";
import { zhCN } from "./locales/zh-CN";

export type Locale = "en" | "fr" | "es" | "ar" | "zh-CN";

export const LOCALES: { id: Locale; nativeLabel: string; dir: "ltr" | "rtl" }[] = [
  { id: "en", nativeLabel: "English", dir: "ltr" },
  { id: "fr", nativeLabel: "Français", dir: "ltr" },
  { id: "es", nativeLabel: "Español", dir: "ltr" },
  { id: "ar", nativeLabel: "العربية", dir: "rtl" },
  { id: "zh-CN", nativeLabel: "简体中文", dir: "ltr" },
];

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" &&
    (value === "en" || value === "fr" || value === "es" || value === "ar" || value === "zh-CN")
  );
}

/** BCP 47 tag used for Intl formatting of the UI language. */
export function intlLocaleFor(locale: Locale): string {
  switch (locale) {
    case "fr":
      return "fr-CA";
    case "es":
      return "es-ES";
    case "ar":
      return "ar";
    case "zh-CN":
      return "zh-CN";
    default:
      return "en-US";
  }
}

export interface PluralForms {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

export type DictValue = string | PluralForms;
export type Dict = Record<string, DictValue>;

const dictionaries: Record<Locale, Partial<Dict>> = {
  en,
  fr,
  es,
  ar,
  "zh-CN": zhCN,
};

export type TranslateVars = Record<string, string | number>;

/**
 * Looks a key up in the given locale, falling back to English, then to the
 * key itself. Supports {named} interpolation and, when the value is a
 * plural-forms object and vars.count is a number, Intl.PluralRules selection
 * (French treats 0 as singular, Arabic has six forms, Chinese has none —
 * all handled by the runtime, not by English `count === 1 ? "" : "s"` logic).
 */
export function translate(key: string, vars?: TranslateVars, locale: Locale = currentLocale): string {
  const value: DictValue | undefined = dictionaries[locale]?.[key] ?? dictionaries.en[key];
  if (value === undefined) return key;
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else {
    const count = typeof vars?.count === "number" ? vars.count : 0;
    const form = new Intl.PluralRules(intlLocaleFor(locale)).select(count);
    text = value[form] ?? value.other;
  }
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : `{${name}}`
  );
}

/**
 * Instruction appended to LLM system prompts so Lucky Cat replies in the
 * UI language. Empty for English (the prompts are already English).
 * JSON keys and enum values (mode, tone) stay in English.
 */
export function replyLanguageInstruction(): string {
  switch (getLocale()) {
    case "fr":
      return "Reply in French. All JSON field values (headline, smallTalk, context, financialObservation, suggestion, followUpQuestion) must be in French. JSON keys and enum values (mode, tone) stay in English.";
    case "es":
      return "Reply in Spanish. All JSON field values (headline, smallTalk, context, financialObservation, suggestion, followUpQuestion) must be in Spanish. JSON keys and enum values (mode, tone) stay in English.";
    case "ar":
      return "Reply in Arabic. All JSON field values (headline, smallTalk, context, financialObservation, suggestion, followUpQuestion) must be in Arabic. JSON keys and enum values (mode, tone) stay in English.";
    case "zh-CN":
      return "Reply in Simplified Chinese. All JSON field values (headline, smallTalk, context, financialObservation, suggestion, followUpQuestion) must be in Simplified Chinese. JSON keys and enum values (mode, tone) stay in English.";
    default:
      return "";
  }
}

/** Language name for prompts that need it as a plain word ("Write it in French."). */
export function replyLanguageName(): string {
  switch (getLocale()) {
    case "fr":
      return "French";
    case "es":
      return "Spanish";
    case "ar":
      return "Arabic";
    case "zh-CN":
      return "Simplified Chinese";
    default:
      return "";
  }
}

/** Display name of a stored payment-method value ("Card" -> "Carte"). */
export function paymentMethodDisplayName(method: string): string {
  switch (method) {
    case "Card":
      return translate("form.card");
    case "Cash":
      return translate("form.cash");
    case "Transfer":
      return translate("form.transfer");
    case "Bank import":
      return translate("import.bankImport");
    default:
      return translate("form.other");
  }
}

// Module-level locale for code outside React (money/date formatting,
// category names, LLM fallback text). The provider keeps it in sync.
let currentLocale: Locale = "en";

export function getLocale(): Locale {
  return currentLocale;
}

export function getIntlLocale(): string {
  return intlLocaleFor(currentLocale);
}

const LANGUAGE_KEY = "expense-tracker:settings:language";

function readStoredLocale(): Locale {
  try {
    const raw = localStorage.getItem(LANGUAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isLocale(parsed)) return parsed;
    }
  } catch {
    // Corrupt storage — fall through to English.
  }
  return "en";
}

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: TranslateVars) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale());

  useEffect(() => {
    currentLocale = locale;
    try {
      localStorage.setItem(LANGUAGE_KEY, JSON.stringify(locale));
    } catch {
      // Storage unavailable — the choice still applies for this session.
    }
    document.documentElement.lang = locale;
    document.documentElement.dir = LOCALES.find((l) => l.id === locale)?.dir ?? "ltr";
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    currentLocale = next;
    setLocaleState(next);
  }, []);

  const t = useCallback(
    (key: string, vars?: TranslateVars) => translate(key, vars, locale),
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside LanguageProvider");
  return ctx;
}
