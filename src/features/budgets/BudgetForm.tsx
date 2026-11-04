import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { AmountInput, Field, Select } from "@/components/ui/Input";
import { DEFAULT_CATEGORIES } from "@/lib/constants";
import { CURRENCIES, currencyLabel } from "@/lib/currencies";
import { parseAmountInput } from "@/lib/utils";
import { useProfile } from "@/services/profile/useProfile";
import type { MonthlyBudget } from "@/lib/types";
import type { BudgetInput } from "@/services/budgets/repository";

export function BudgetForm({
  existingBudgets,
  onSubmit,
  onCancel,
  saving,
}: {
  existingBudgets: MonthlyBudget[];
  onSubmit: (input: BudgetInput) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const { profile } = useProfile();
  const defaultCurrency = profile.currency || "USD";
  const takenCategories = new Set(existingBudgets.map((b) => b.categoryId ?? "__overall__"));
  const overallTaken = takenCategories.has("__overall__");

  const availableOptions: Array<{ value: string; label: string }> = [];
  if (!overallTaken) {
    availableOptions.push({ value: "", label: "Overall monthly total" });
  }
  for (const cat of DEFAULT_CATEGORIES) {
    // Budgets cap spending — income categories are not budgetable.
    if (cat.kind !== "expense") continue;
    if (!takenCategories.has(cat.id)) {
      availableOptions.push({ value: cat.id, label: `${cat.icon} ${cat.name}` });
    }
  }

  const [categoryValue, setCategoryValue] = useState(availableOptions[0]?.value ?? "");
  const [amountText, setAmountText] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [amountError, setAmountError] = useState("");

  if (availableOptions.length === 0) {
    return (
      <p className="muted" style={{ fontSize: 14 }}>
        You already have a budget for every category. Edit or remove one to add a new one.
      </p>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const amount = parseAmountInput(amountText);
    if (amount === null || amount <= 0) {
      setAmountError("Enter an amount greater than zero.");
      return;
    }
    setAmountError("");
    await onSubmit({
      categoryId: categoryValue === "" ? null : categoryValue,
      amount,
      currency,
    });
  }

  return (
    <form className="budget-add-form" onSubmit={handleSubmit} noValidate>
      <Field label="Category">
        <Select value={categoryValue} onChange={(e) => setCategoryValue(e.target.value)}>
          {availableOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Monthly limit">
        <AmountInput
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          placeholder="0.00"
          autoFocus
          aria-invalid={amountError ? "true" : undefined}
          aria-describedby={amountError ? "budget-amount-error" : undefined}
        />
        {amountError ? (
          <span id="budget-amount-error" className="field-error" role="alert">
            {amountError}
          </span>
        ) : null}
      </Field>
      <Field label="Currency">
        <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {currencyLabel(c.code)} ({c.symbol})
            </option>
          ))}
        </Select>
      </Field>
      <div className="row">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save budget"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
