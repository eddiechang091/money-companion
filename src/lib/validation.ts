import { translate } from "./i18n";
import { isValidIsoDate, parseAmountInput } from "./utils";
import { getCategoryById, normalizeCategoryId } from "./categories";
import { DEFAULT_CURRENCY } from "./constants";
import type { RecordKind } from "./types";

export interface ExpenseDraft {
  /** Money direction; defaults to "expense" when omitted. */
  kind?: RecordKind;
  amountText: string;
  categoryId: string;
  description: string;
  date: string;
  paymentMethod: string;
  notes: string;
  currency?: string;
}

export interface ValidExpenseInput {
  kind: RecordKind;
  amount: number;
  currency: string;
  categoryId: string | null;
  description: string;
  date: string;
  paymentMethod: string;
  notes: string;
}

export interface ExpenseFieldErrors {
  amount?: string;
  category?: string;
  description?: string;
  date?: string;
  paymentMethod?: string;
  notes?: string;
}

const MAX_AMOUNT = 100_000_000;
const MAX_DESCRIPTION = 140;
const MAX_PAYMENT_METHOD = 40;
const MAX_NOTES = 500;

export function validateExpenseDraft(draft: ExpenseDraft): {
  value: ValidExpenseInput | null;
  errors: ExpenseFieldErrors;
} {
  const errors: ExpenseFieldErrors = {};

  const amount = parseAmountInput(draft.amountText);
  if (amount === null || amount <= 0) {
    errors.amount = translate("validation.amountZero");
  } else if (amount > MAX_AMOUNT) {
    errors.amount = translate("validation.amountTooLarge");
  }

  const categoryId = draft.categoryId ? draft.categoryId.trim() : "";
  const kind: RecordKind = draft.kind === "income" ? "income" : "expense";
  if (categoryId !== "") {
    const normalized = normalizeCategoryId(categoryId);
    const category = getCategoryById(normalized);
    if (!category || category.kind !== kind) {
      errors.category = translate("validation.pickCategory");
    }
  }

  const description = draft.description.trim();
  if (description.length > MAX_DESCRIPTION) {
    errors.description = translate("validation.descTooLong", { max: MAX_DESCRIPTION });
  }

  if (!draft.date || !isValidIsoDate(draft.date)) {
    errors.date = translate("validation.validDate");
  }

  const paymentMethod = draft.paymentMethod.trim();
  if (paymentMethod.length > MAX_PAYMENT_METHOD) {
    errors.paymentMethod = translate("validation.descTooLong", { max: MAX_PAYMENT_METHOD });
  }

  const notes = draft.notes.trim();
  if (notes.length > MAX_NOTES) {
    errors.notes = translate("validation.notesTooLong", { max: MAX_NOTES });
  }

  if (Object.keys(errors).length > 0) return { value: null, errors };

  const currency = (draft.currency ?? DEFAULT_CURRENCY).trim().toUpperCase() || DEFAULT_CURRENCY;

  return {
    value: {
      kind,
      amount: amount as number,
      currency,
      categoryId: categoryId === "" ? null : categoryId,
      description,
      date: draft.date,
      paymentMethod,
      notes,
    },
    errors: {},
  };
}
