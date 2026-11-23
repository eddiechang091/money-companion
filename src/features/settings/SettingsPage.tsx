import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { LOCALES, useLanguage } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { currencyDisplayName } from "@/lib/utils";
import { THEMES } from "@/services/theme/themes";
import { useTheme } from "@/services/theme/useTheme";
import { CURRENCIES } from "@/lib/currencies";
import { useProfile } from "@/services/profile/useProfile";
import { useExpenses } from "@/services/expenses/useExpenses";
import { useBudgets } from "@/services/budgets/useBudgets";
import { getRate } from "@/services/fx/rates";
import { convertAllToCurrency } from "@/services/fx/convert";
import { AnnaStatusCard } from "./AnnaStatusCard";

function LanguagePicker() {
  const { locale, setLocale, t } = useLanguage();
  return (
    <div style={{ marginBottom: 24 }}>
      <label
        htmlFor="app-language"
        style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8 }}
      >
        {t("settings.language")}
      </label>
      <select
        id="app-language"
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="input"
        style={{ maxWidth: 320 }}
      >
        {LOCALES.map((l) => (
          <option key={l.id} value={l.id}>
            {l.nativeLabel}
          </option>
        ))}
      </select>
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        {t("settings.languageDescription")}
      </p>
    </div>
  );
}

function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const { t } = useLanguage();
  return (
    <div className="theme-grid" role="group" aria-label={t("settings.theme")}>
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`theme-card${theme === t.id ? " is-selected" : ""}`}
          onClick={() => setTheme(t.id)}
          aria-pressed={theme === t.id}
        >
          <span className="theme-swatch" style={{ background: t.swatch }} aria-hidden="true">
            <span className="theme-emoji">{t.emoji}</span>
          </span>
          <span className="theme-name">{t.name}</span>
          <span className="theme-tagline">{t.tagline}</span>
          {theme === t.id && <span className="theme-check" aria-hidden="true">✓</span>}
        </button>
      ))}
    </div>
  );
}

function CurrencyPicker() {
  const { t } = useLanguage();
  const { profile, update } = useProfile();
  const { notify } = useToast();
  const { expenses, updateExpense } = useExpenses();
  const { budgets, saveBudget } = useBudgets();
  const current = profile.currency || "USD";
  const [pending, setPending] = useState<string | null>(null);
  const [previewRate, setPreviewRate] = useState<number | null>(null);
  const [converting, setConverting] = useState(false);

  const toConvertExpenses = expenses.filter((e) => e.currency.toUpperCase() !== (pending ?? current).toUpperCase()).length;
  const toConvertBudgets = budgets.filter((b) => b.currency.toUpperCase() !== (pending ?? current).toUpperCase()).length;

  async function handleChange(next: string) {
    const from = (profile.currency ?? "USD").toUpperCase();
    const to = next.toUpperCase();
    if (from === to) return;
    // Fetch the rate first so the dialog can show it
    const rate = await getRate(from, to);
    if (rate === null) {
      notify(t("settings.currencyFetchFailed"), "error");
      return;
    }
    setPreviewRate(rate);
    setPending(next);
  }

  async function handleConfirm() {
    if (!pending) return;
    const to = pending.toUpperCase();
    setConverting(true);
    try {
      const plan = await convertAllToCurrency(expenses, budgets, to, updateExpense, saveBudget);
      update({ currency: pending });
      notify(
        t("settings.convertedSummary", {
          expenses: t("settings.expenseCount", { count: plan.expenseCount }),
          budgets: t("settings.budgetCount", { count: plan.budgetCount }),
        })
      );
    } catch {
      notify(t("settings.conversionFailed"), "error");
    } finally {
      setConverting(false);
      setPending(null);
      setPreviewRate(null);
    }
  }

  return (
    <div>
      <label
        htmlFor="default-currency"
        style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8 }}
      >
        {t("settings.defaultCurrency")}
      </label>
      <select
        id="default-currency"
        value={pending ?? current}
        onChange={(e) => void handleChange(e.target.value)}
        className="input"
        style={{ maxWidth: 320 }}
        disabled={converting}
      >
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} — {currencyDisplayName(c.code)} ({c.symbol})
          </option>
        ))}
      </select>
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        {t("settings.currencyDescription")}
      </p>
      <ConfirmDialog
        open={pending !== null}
        title={t("settings.changeCurrencyTitle")}
        body={
          previewRate !== null && pending
            ? t("settings.convertBody", {
                from: current,
                to: pending,
                rate: previewRate.toFixed(4),
                expenses: t("settings.expenseCount", { count: toConvertExpenses }),
                budgets: t("settings.budgetCount", { count: toConvertBudgets }),
              })
            : undefined
        }
        confirmLabel={converting ? t("settings.converting") : t("settings.convertEverything")}
        cancelLabel={t("settings.keepIt")}
        onConfirm={() => void handleConfirm()}
        onCancel={() => {
          setPending(null);
          setPreviewRate(null);
        }}
      />
    </div>
  );
}

export function SettingsPage() {
  const { t } = useLanguage();
  return (
    <>
      <PageHeader title={t("settings.title")} lede={t("settings.lede")} />
      <AnnaStatusCard />
      <Card title={t("settings.preferences")}>
        <LanguagePicker />
        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          {t("settings.themeIntro")}
        </p>
        <ThemePicker />
        <div style={{ marginTop: 24 }}>
          <CurrencyPicker />
        </div>
      </Card>
    </>
  );
}

