import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { useExpenses } from "@/services/expenses/useExpenses";
import { useProfile } from "@/services/profile/useProfile";
import { getRate, fxNote } from "@/services/fx/rates";
import { money } from "@/lib/utils";
import { ExpenseForm } from "./ExpenseForm";
import { useLanguage } from "@/lib/i18n";

export function AddExpensePage({
  onNavigate,
  initialKind = "expense",
}: {
  onNavigate: (path: string) => void;
  /** Preselects the form's Money out / Money in toggle ("/add-income" uses "income"). */
  initialKind?: "expense" | "income";
}) {
  const { t } = useLanguage();
  const { notify } = useToast();
  const { createExpense } = useExpenses();
  const { profile } = useProfile();
  const defaultCurrency = profile.currency || "USD";
  const [saving, setSaving] = useState(false);
  return (
    <>
      <PageHeader title={t("nav.addTransaction")} lede={t("add.lede")} />
      <Card>
        <ExpenseForm
          initial={{ kind: initialKind }}
          submitLabel={t("common.save")}
          saving={saving}
          defaultCurrency={defaultCurrency}
          onCancel={() => onNavigate("/expenses")}
          onSubmit={async (values) => {
            setSaving(true);
            try {
              let amount = values.amount;
              let currency = values.currency.toUpperCase();
              let originalAmount: number | undefined;
              let originalCurrency: string | undefined;
              let fxRate: number | undefined;
              let notes = values.notes || undefined;

              // Convert to default currency when a different currency was chosen
              if (currency !== defaultCurrency) {
                const rate = await getRate(currency, defaultCurrency);
                if (rate !== null) {
                  originalAmount = values.amount;
                  originalCurrency = currency;
                  fxRate = rate;
                  amount = Math.round(values.amount * rate * 100) / 100;
                  currency = defaultCurrency;
                  const note = t("add.converted", {
                    rateNote: fxNote(originalCurrency, defaultCurrency, rate),
                    fromAmount: money(originalAmount, originalCurrency),
                    toAmount: money(amount, defaultCurrency),
                  });
                  notes = notes ? `${notes}\n${note}` : note;
                } else {
                  notify(t("add.rateUnavailable"), "error");
                }
              }

              await createExpense({
                kind: values.kind,
                amount,
                currency,
                categoryId: values.categoryId,
                description: values.description,
                date: values.date,
                paymentMethod: values.paymentMethod || undefined,
                notes,
                originalAmount,
                originalCurrency,
                fxRate,
              });
              notify(t("add.added"));
              onNavigate("/expenses");
            } finally {
              setSaving(false);
            }
          }}
        />
      </Card>
    </>
  );
}
