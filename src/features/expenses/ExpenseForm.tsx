import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { AmountInput, Field, Select, Textarea, TextInput } from "@/components/ui/Input";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { defaultCategoryIdForKind } from "@/lib/categories";
import { CURRENCIES, currencyLabel } from "@/lib/currencies";
import { todayIso, parseAmountInput } from "@/lib/utils";
import { validateExpenseDraft, type ExpenseFieldErrors } from "@/lib/validation";
import type { RecordKind } from "@/lib/types";

export interface ExpenseFormValues {
  kind: RecordKind;
  amount: number;
  currency: string;
  categoryId: string | null;
  description: string;
  date: string;
  paymentMethod: string;
  notes: string;
}

const PAYMENT_METHODS = ["Card", "Cash", "Transfer", "Other"];

export function ExpenseForm({
  initial,
  defaultCurrency,
  submitLabel,
  saving,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<ExpenseFormValues>;
  /** User's default currency — preselected in the currency dropdown. */
  defaultCurrency: string;
  submitLabel: string;
  saving: boolean;
  onSubmit: (values: ExpenseFormValues) => Promise<void>;
  onCancel?: () => void;
}) {
  const initialKind: RecordKind = initial?.kind === "income" ? "income" : "expense";
  const [kind, setKind] = useState<RecordKind>(initialKind);
  const [amountText, setAmountText] = useState(initial?.amount !== undefined ? String(initial.amount) : "");
  const [currency, setCurrency] = useState(initial?.currency ?? defaultCurrency);
  // Fresh records start on the kind's default category; edits keep the
  // record's own category (null = Others, stored as "").
  const initialCategoryId = initial?.categoryId;
  const [categoryId, setCategoryId] = useState<string>(
    initialCategoryId === undefined
      ? defaultCategoryIdForKind(initialKind)
      : (initialCategoryId ?? "")
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [paymentMethod, setPaymentMethod] = useState(
    initial?.paymentMethod ?? (initialKind === "income" ? "Transfer" : "Card")
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [errors, setErrors] = useState<ExpenseFieldErrors>({});
  const [touched, setTouched] = useState(false);

  function handleKindChange(next: RecordKind) {
    if (next === kind) return;
    setKind(next);
    // Categories differ per kind; restart on the new kind's default.
    setCategoryId(defaultCategoryIdForKind(next));
  }

  useEffect(() => {
    if (!touched) return;
    const result = validateExpenseDraft({
      kind,
      amountText,
      categoryId,
      description,
      date,
      paymentMethod,
      notes,
      currency,
    });
    setErrors(result.errors);
  }, [kind, amountText, categoryId, description, date, paymentMethod, notes, currency, touched]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    const result = validateExpenseDraft({
      kind,
      amountText,
      categoryId,
      description,
      date,
      paymentMethod,
      notes,
      currency,
    });
    setErrors(result.errors);
    if (!result.value) return;
    await onSubmit({ ...result.value, currency: result.value.currency || defaultCurrency });
  }

  const amountPreview = parseAmountInput(amountText);

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate>
      {/* Not wrapped in Field: a <label> ancestor would pollute these
          buttons' accessible names with the whole label text. */}
      <div className="field">
        <span>Type</span>
        <div className="kind-toggle" role="group" aria-label="Record type">
          <button
            type="button"
            aria-pressed={kind === "expense"}
            className={`kind-option${kind === "expense" ? " is-active" : ""}`}
            onClick={() => handleKindChange("expense")}
          >
            Money out
          </button>
          <button
            type="button"
            aria-pressed={kind === "income"}
            className={`kind-option${kind === "income" ? " is-active" : ""}`}
            onClick={() => handleKindChange("income")}
          >
            Money in
          </button>
        </div>
      </div>
      <Field label="Amount" hint={amountPreview !== null ? undefined : "Numbers only, e.g. 12.50"}>
        <AmountInput
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
          placeholder="0.00"
          autoFocus
          aria-invalid={errors.amount ? "true" : undefined}
          aria-describedby={errors.amount ? "expense-amount-error" : undefined}
        />
        {errors.amount ? (
          <span id="expense-amount-error" className="field-error" role="alert">
            {errors.amount}
          </span>
        ) : null}
      </Field>
      <Field label="Currency">
        <Select value={currency} onChange={(event) => setCurrency(event.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {currencyLabel(c.code)} ({c.symbol})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Category">
        <CategoryPicker value={categoryId} onChange={setCategoryId} kind={kind} />
        {errors.category ? (
          <span className="field-error" role="alert">
            {errors.category}
          </span>
        ) : null}
      </Field>
      <Field label="Description" hint="Optional">
        <TextInput
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={kind === "income" ? "Monthly salary" : "Weekly groceries"}
          maxLength={140}
          aria-invalid={errors.description ? "true" : undefined}
        />
        {errors.description ? (
          <span className="field-error" role="alert">
            {errors.description}
          </span>
        ) : null}
      </Field>
      <Field label="Date">
        <TextInput
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          aria-invalid={errors.date ? "true" : undefined}
        />
        {errors.date ? (
          <span className="field-error" role="alert">
            {errors.date}
          </span>
        ) : null}
      </Field>
      <Field label="Payment method" hint="Optional">
        <Select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes" hint="Optional">
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Anything worth remembering"
          rows={2}
          maxLength={500}
        />
        {errors.notes ? (
          <span className="field-error" role="alert">
            {errors.notes}
          </span>
        ) : null}
      </Field>
      <div className="row">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
