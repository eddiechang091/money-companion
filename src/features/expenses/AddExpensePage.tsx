import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { useExpenses } from "@/services/expenses/useExpenses";
import { useProfile } from "@/services/profile/useProfile";
import { getRate, fxNote } from "@/services/fx/rates";
import { money } from "@/lib/utils";
import { ExpenseForm } from "./ExpenseForm";

export function AddExpensePage({
  onNavigate,
  initialKind = "expense",
}: {
  onNavigate: (path: string) => void;
  /** Preselects the form's Money out / Money in toggle ("/add-income" uses "income"). */
  initialKind?: "expense" | "income";
}) {
  const { notify } = useToast();
  const { createExpense } = useExpenses();
  const { profile } = useProfile();
  const defaultCurrency = profile.currency || "USD";
  const [saving, setSaving] = useState(false);
  const isIncome = initialKind === "income";

  return (
    <>
      <PageHeader title={isIncome ? "Add income" : "Add expense"} lede={isIncome ? "Money coming in." : "Quick capture."} />
      <Card>
        <ExpenseForm
          initial={{ kind: initialKind }}
          submitLabel={isIncome ? "Save income" : "Save expense"}
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
                  const note = `${fxNote(originalCurrency, defaultCurrency, rate)} — converted ${money(originalAmount, originalCurrency)} to ${money(amount, defaultCurrency)}`;
                  notes = notes ? `${notes}\n${note}` : note;
                } else {
                  notify("Live rate unavailable — saved in original currency.", "error");
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
              notify("Added! \uD83C\uDF89");
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
