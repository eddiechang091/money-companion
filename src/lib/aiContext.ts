import type { Expense, MonthlyBudget } from "./types";
import { getCategoryById } from "./categories";
import {
  calculateBudgetProgress,
  comparePeriods,
  currentMonthKey,
  detectMeaningfulChanges,
  filterByMonth,
  sumExpenses,
  totalsByCategory,
} from "./analytics";

export interface ExpenseContext {
  amount: number;
  currency: string;
  category: string;
  categoryId: string | null;
  description: string;
  date: string;
}

export interface FinancialSummaryContext {
  month: string;
  totalSpent: number;
  topCategories: Array<{ category: string; total: number; count: number }>;
  previousMonth: {
    totalSpent: number;
    delta: number;
    deltaPct: number | null;
    topCategories: Array<{ category: string; total: number; count: number }>;
  } | null;
  budget: { limit: number; remaining: number; pct: number; status: string } | null;
  changes: Array<{ kind: string; category: string; delta: number }>;
}

export interface InsightContext {
  user: { currency: string };
  currentExpense: ExpenseContext;
  financialSummary: FinancialSummaryContext;
  merchantContext: null;
}

const MAX_CATEGORIES = 5;
const MAX_CHANGES = 3;

export function buildInsightContext(
  expense: Expense,
  allExpenses: Expense[],
  budgets: MonthlyBudget[],
  monthKey?: string
): InsightContext {
  const currency = expense.currency;
  const month = monthKey ?? currentMonthKey();
  const monthExpenses = filterByMonth(allExpenses, month);
  const monthTotal = sumExpenses(monthExpenses);
  const catTotals = totalsByCategory(monthExpenses).slice(0, MAX_CATEGORIES);
  const comparison = comparePeriods(allExpenses, month);
  const previousMonthExpenses = comparison ? filterByMonth(allExpenses, comparison.previousKey) : [];
  const changes = detectMeaningfulChanges(monthExpenses, previousMonthExpenses).slice(0, MAX_CHANGES);
  const overallBudget = budgets.find((b) => b.categoryId === null) ?? null;

  const cat = getCategoryById(expense.categoryId);

  return {
    user: { currency },
    currentExpense: {
      amount: expense.amount,
      currency: expense.currency,
      category: cat?.name ?? "Uncategorized",
      categoryId: expense.categoryId,
      description: expense.description,
      date: expense.date,
    },
    financialSummary: {
      month,
      totalSpent: monthTotal,
      topCategories: catTotals.map((t) => ({
        category: getCategoryById(t.categoryId)?.name ?? "Uncategorized",
        total: t.total,
        count: t.count,
      })),
      previousMonth:
        comparison && comparison.previousTotal > 0
          ? {
              totalSpent: comparison.previousTotal,
              delta: comparison.delta,
              deltaPct: comparison.deltaPct,
              topCategories: totalsByCategory(previousMonthExpenses)
                .slice(0, MAX_CATEGORIES)
                .map((t) => ({
                  category: getCategoryById(t.categoryId)?.name ?? "Uncategorized",
                  total: t.total,
                  count: t.count,
                })),
            }
          : null,
      budget:
        overallBudget
          ? (() => {
              const info = calculateBudgetProgress(monthTotal, overallBudget.amount);
              return {
                limit: overallBudget.amount,
                remaining: info.remaining,
                pct: info.pct,
                status: info.status,
              };
            })()
          : null,
      changes: changes.map((c) => ({
        kind: c.kind,
        category: getCategoryById(c.categoryId)?.name ?? "Uncategorized",
        delta: c.delta,
      })),
    },
    merchantContext: null,
  };
}
