import { getIntlLocale, useLanguage } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { Expense, MonthlyBudget } from "@/lib/types";
import { currentMonthKey, filterByMonth, monthKeyOfIsoDate } from "@/lib/analytics";
import { exportExpensesExcel } from "@/services/export/excel";
import { exportMonthlyStatement } from "@/services/export/pdf";
import { useProfile } from "@/services/profile/useProfile";
import { awardBadge } from "@/features/gamification/awardBadges";
import { useTheme } from "@/services/theme/useTheme";

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(getIntlLocale(), { month: "long", year: "numeric" });
}

/** Distinct months present in the data, newest first. */
function availableMonths(expenses: Expense[]): string[] {
  const set = new Set<string>();
  for (const e of expenses) {
    const k = monthKeyOfIsoDate(e.date);
    if (k) set.add(k);
  }
  set.add(currentMonthKey());
  return [...set].sort().reverse();
}

export function ExportDialog({
  open,
  onClose,
  expenses,
  budgets,
}: {
  open: boolean;
  onClose: () => void;
  expenses: Expense[];
  budgets: MonthlyBudget[];
}) {
  const { notify } = useToast();
  const { t } = useLanguage();
  const { profile } = useProfile();
  const { theme } = useTheme();
  const months = availableMonths(expenses);
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [format, setFormat] = useState<"excel" | "pdf">("excel");

  useEffect(() => {
    if (open) {
      setMonthKey(currentMonthKey());
      setFormat("excel");
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") onClose();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [open, onClose]);

  if (!open) return null;

  const currency = profile.currency ?? "USD";
  const monthExpenses = filterByMonth(expenses, monthKey);

  function handleExport() {
    if (monthExpenses.length === 0) {
      notify(t("export.emptyMonth"), "error");
      return;
    }
    if (format === "excel") {
      exportExpensesExcel({ expenses: monthExpenses, monthKey, currency });
      notify(t("export.excelDone"));
    } else {
      exportMonthlyStatement({
        expenses: monthExpenses,
        budgets,
        monthKey,
        monthLabel: monthLabel(monthKey),
        currency,
        theme,
      });
      notify(t("export.pdfDone"));
    }
    // Celebrate the first export immediately.
    void awardBadge("first-export");
    onClose();
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("export.title")}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="dialog-title">{t("export.title")}</p>
        <div className="stack" style={{ margin: "12px 0" }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>
            {t("common.month")}
            <select
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
              className="input"
              style={{ width: "100%", marginTop: 6 }}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {t("export.format")}
            <div className="row" style={{ marginTop: 6, gap: 8 }}>
              <label style={{ fontWeight: 400, display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="radio"
                  name="export-format"
                  checked={format === "excel"}
                  onChange={() => setFormat("excel")}
                />
                Excel (.xlsx)
              </label>
              <label style={{ fontWeight: 400, display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="radio"
                  name="export-format"
                  checked={format === "pdf"}
                  onChange={() => setFormat("pdf")}
                />
                {t("export.pdfFormat")}
              </label>
            </div>
          </div>
          <span className="muted" style={{ fontSize: 12 }}>
            {t("export.countInMonth", { count: monthExpenses.length, month: monthLabel(monthKey) })}
          </span>
        </div>
        <div className="row dialog-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={handleExport}>
            {t("expenses.export")}
          </Button>
        </div>
      </div>
    </div>
  );
}
