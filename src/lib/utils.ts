import { getIntlLocale } from "./i18n";

export { getIntlLocale } from "./i18n";

export function money(amount: number, currency = "USD"): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  // The amount is shown in the UI language's number format, with the
  // currency's own symbol (e.g. 1 234,56 $ in fr-CA, $1,234.56 in en-US).
  const locale = getIntlLocale();
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `${currency} ${safe.toFixed(2)}`;
  }
}

/** Short money for axis labels ("$1.1K", "CA$500"). */
export function compactMoney(amount: number, currency = "USD"): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const locale = getIntlLocale();
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(safe);
  } catch {
    return money(safe, currency);
  }
}

/** Localized currency name ("Canadian dollar", "dollar canadien", …) via Intl. */
export function currencyDisplayName(code: string): string {
  try {
    return new Intl.DisplayNames(getIntlLocale(), { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(key: string): string {
  const parts = key.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleString(getIntlLocale(), { month: "long", year: "numeric" });
}

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parts = value.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function parseAmountInput(value: string): number | null {
  // Accept the UI locale's decimal separator: "," is the decimal mark in
  // French/Arabic ("1 234,56"), a grouping mark in English ("1,234.56").
  const decimalComma = getIntlLocale().startsWith("fr") || getIntlLocale() === "ar";
  let cleaned = value.replace(/[$\s\u00a0\u202f]/g, "").trim();
  if (decimalComma) {
    cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }
  if (cleaned === "") return null;
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

export function clampText(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}