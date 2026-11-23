import { useLanguage } from "@/lib/i18n";
import type { TranslateVars } from "@/lib/i18n";
import { categoryName } from "@/lib/categories";
import { useState } from "react";
import type { FormEvent } from "react";
import type { MonthlyBudget } from "@/lib/types";
import type { BudgetInput } from "@/services/budgets/repository";
import { BudgetProgress } from "@/components/ui/BudgetProgress";
import { Button } from "@/components/ui/Button";
import { AmountInput, Field, Select } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getCategoryById } from "@/lib/categories";

import { calculateBudgetProgress } from "@/lib/analytics";
import { money, parseAmountInput } from "@/lib/utils";
import { CURRENCIES, currencyLabel } from "@/lib/currencies";

type T = (key: string, vars?: TranslateVars) => string;

function budgetStatusLabel(t: T, spent: number, limit: number, currency: string): string {
  const info = calculateBudgetProgress(spent, limit);
  if (info.status === "over") return t("budgets.overBy", { amount: money(spent - limit, currency) });
  if (info.status === "watch") return t("budgets.leftClose", { amount: money(info.remaining, currency) });
  return t("budgets.remainingBy", { amount: money(info.remaining, currency) });
}

export function BudgetRow({
  budget,
  spent,
  onSave,
  onDelete,
}: {
  budget: MonthlyBudget;
  spent: number;
  onSave: (input: BudgetInput) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [amountText, setAmountText] = useState(String(budget.amount));
  const [currency, setCurrency] = useState(budget.currency);
  const [amountError, setAmountError] = useState("");

  const cat = getCategoryById(budget.categoryId);
  const isOverall = budget.categoryId === null;
  const label = isOverall ? t("budgets.monthlyTotal") : categoryName(budget.categoryId);
  const icon = isOverall ? "🐷" : cat?.icon ?? "📦";
  const statusLabel = budgetStatusLabel(t, spent, budget.amount, budget.currency);
  const info = calculateBudgetProgress(spent, budget.amount);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    const amount = parseAmountInput(amountText);
    if (amount === null || amount <= 0) {
      setAmountError(t("validation.amountZero"));
      return;
    }
    setAmountError("");
    setSaving(true);
    try {
      await onSave({ categoryId: budget.categoryId, amount, currency });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <form className="budget-edit-form" onSubmit={handleSave} noValidate>
        <div className="budget-item-header">
          <span className="budget-item-icon" aria-hidden="true">{icon}</span>
          <span className="budget-item-name">{label}</span>
        </div>
        <Field label={t("budgets.monthlyLimit")}>
          <AmountInput
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            autoFocus
            aria-invalid={amountError ? "true" : undefined}
          />
          {amountError ? <span className="field-error" role="alert">{amountError}</span> : null}
        </Field>
        <Field label={t("form.currency")}>
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {currencyLabel(c.code)} ({c.symbol})
              </option>
            ))}
          </Select>
        </Field>
        <div className="row" style={{ marginTop: 10 }}>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? t("form.saving") : t("common.save")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(false); setAmountText(String(budget.amount)); }} disabled={saving}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <>
      <div className="budget-item-header">
        <span className="budget-item-icon" aria-hidden="true">{icon}</span>
        <span className="budget-item-name">{label}</span>
        <span className="budget-item-amount">{money(budget.amount, budget.currency)}</span>
      </div>
      <BudgetProgress spent={spent} limit={budget.amount} currency={budget.currency} />
      <div className={`budget-item-meta${info.over ? " is-over" : ""}`}>
        <span>{statusLabel}</span>
        <div className="row" style={{ gap: 4 }}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            disabled={deleting}
          >
            {t("common.edit")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={deleting}
          >
            {deleting ? t("budgets.removing") : t("common.remove")}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title={t("budgets.removeTitle", { label })}
        body={t("budgets.removeBody")}
        confirmLabel={deleting ? t("budgets.removing") : t("common.remove")}
        cancelLabel={t("settings.keepIt")}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await onDelete();
          } finally {
            setDeleting(false);
            setConfirmOpen(false);
          }
        }}
      />
    </>
  );
}
