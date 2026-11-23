import type { Expense, MonthlyBudget } from "@/lib/types";
import type { ExpensePatch } from "@/services/expenses/store";
import type { BudgetInput } from "@/services/budgets/repository";
import { getRate } from "./rates";
import { money } from "@/lib/utils";
import { translate } from "@/lib/i18n";

export interface ConversionPlan {
  rate: number;
  expenseCount: number;
  budgetCount: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function revalueNote(from: string, to: string, rate: number): string {
  const date = new Date().toISOString().slice(0, 10);
  return `FX revalue: 1 ${from} = ${rate.toFixed(4)} ${to} (${date})`;
}

/**
 * Convert all expenses and budgets to `newCode` using live rates.
 * For expenses that were previously FX-converted, converts from the
 * original entered currency to avoid compounding rounding errors.
 */
export async function convertAllToCurrency(
  expenses: Expense[],
  budgets: MonthlyBudget[],
  newCode: string,
  updateExpense: (id: string, patch: ExpensePatch) => Promise<unknown>,
  saveBudget: (input: BudgetInput) => Promise<unknown>
): Promise<ConversionPlan> {
  const to = newCode.toUpperCase();
  let expenseCount = 0;
  let budgetCount = 0;
  let primaryRate: number | null = null;

  for (const e of expenses) {
    if (e.currency.toUpperCase() === to) continue;
    // Prefer the originally-entered currency/amount for accuracy
    const srcCurrency = (e.originalCurrency ?? e.currency).toUpperCase();
    const srcAmount = e.originalAmount ?? e.amount;
    if (srcCurrency === to) {
      // Already effectively in target (e.g. original was target currency)
      await updateExpense(e.id, {
        amount: round2(srcAmount),
        currency: to,
        originalAmount: undefined,
        originalCurrency: undefined,
        fxRate: undefined,
        notes: e.notes ?? undefined,
      });
      expenseCount++;
      continue;
    }
    const rate = await getRate(srcCurrency, to);
    if (rate === null) {
      throw new Error(translate("fx.rateUnavailable", { from: srcCurrency, to }));
    }
    if (primaryRate === null) primaryRate = rate;
    const note = revalueNote(srcCurrency, to, rate);
    await updateExpense(e.id, {
      amount: round2(srcAmount * rate),
      currency: to,
      originalAmount: round2(srcAmount),
      originalCurrency: srcCurrency,
      fxRate: rate,
      notes: e.notes ? `${e.notes}\n${note}` : note,
    });
    expenseCount++;
  }

  for (const b of budgets) {
    if (b.currency.toUpperCase() === to) continue;
    const rate = await getRate(b.currency.toUpperCase(), to);
    if (rate === null) {
      throw new Error(translate("fx.rateUnavailable", { from: b.currency, to }));
    }
    if (primaryRate === null) primaryRate = rate;
    await saveBudget({
      categoryId: b.categoryId,
      amount: round2(b.amount * rate),
      currency: to,
    });
    budgetCount++;
  }

  return { rate: primaryRate ?? 1, expenseCount, budgetCount };
}

/** Human-readable summary for the confirmation dialog. */
export function conversionSummary(
  from: string,
  to: string,
  rate: number,
  expenseCount: number,
  budgetCount: number
): string {
  const parts = [`1 ${from} = ${rate.toFixed(4)} ${to}`];
  if (expenseCount > 0) parts.push(translate("settings.expenseCount", { count: expenseCount }));
  if (budgetCount > 0) parts.push(translate("settings.budgetCount", { count: budgetCount }));
  return translate("fx.convertConfirm", { items: parts.slice(1).join(" "), rate: parts[0] });
}

export function previewConversion(from: string, to: string, rate: number): string {
  return `${money(1, from)} → ${money(rate, to)}`;
}
