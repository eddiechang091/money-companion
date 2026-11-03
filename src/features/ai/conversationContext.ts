import type { Expense, MonthlyBudget } from "@/lib/types";
import { recordKind } from "@/lib/types";
import type { ExpenseContext, FinancialSummaryContext } from "@/lib/aiContext";
import { getCategoryById } from "@/lib/categories";
import { UNCATEGORIZED_LABEL } from "@/lib/constants";
import {
  calculateBudgetProgress,
  comparePeriods,
  currentMonthKey,
  detectMeaningfulChanges,
  filterByKind,
  filterByMonth,
  sumByKind,
  sumExpenses,
  totalsByCategory,
} from "@/lib/analytics";

const MAX_CATEGORIES = 5;
const MAX_CHANGES = 3;

export interface ConversationContext {
  user: { currency: string };
  currentExpense: ExpenseContext | null;
  financialSummary: FinancialSummaryContext;
  merchantContext: null;
}

export function buildConversationContext(
  allExpenses: Expense[],
  budgets: MonthlyBudget[],
  currency: string,
  activeExpense: Expense | null,
  monthKey?: string
): ConversationContext {
  const month = monthKey ?? currentMonthKey();
  const monthRecords = filterByMonth(allExpenses, month);
  const monthExpenses = filterByKind(monthRecords, "expense");
  const monthTotal = sumExpenses(monthExpenses);
  const monthIncome = sumByKind(monthRecords, "income");
  const catTotals = totalsByCategory(monthExpenses).slice(0, MAX_CATEGORIES);
  const comparison = comparePeriods(allExpenses, month);
  const previousMonthExpenses = comparison ? filterByMonth(allExpenses, comparison.previousKey) : [];
  const changes = detectMeaningfulChanges(monthExpenses, previousMonthExpenses).slice(0, MAX_CHANGES);
  const overallBudget = budgets.find((b) => b.categoryId === null) ?? null;

  let currentExpense: ExpenseContext | null = null;
  if (activeExpense) {
    const cat = getCategoryById(activeExpense.categoryId);
    currentExpense = {
      kind: recordKind(activeExpense),
      amount: activeExpense.amount,
      currency: activeExpense.currency,
      category: cat?.name ?? UNCATEGORIZED_LABEL,
      categoryId: activeExpense.categoryId,
      description: activeExpense.description,
      date: activeExpense.date,
    };
  }

  return {
    user: { currency },
    currentExpense,
    financialSummary: {
      month,
      totalSpent: monthTotal,
      totalIncome: monthIncome,
      balance: Math.round((monthIncome - monthTotal) * 100) / 100,
      topCategories: catTotals.map((t) => ({
        categoryId: t.categoryId,
        category: getCategoryById(t.categoryId)?.name ?? UNCATEGORIZED_LABEL,
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
                  categoryId: t.categoryId,
                  category: getCategoryById(t.categoryId)?.name ?? UNCATEGORIZED_LABEL,
                  total: t.total,
                  count: t.count,
                })),
            }
          : null,
      budget: overallBudget
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
        category: getCategoryById(c.categoryId)?.name ?? UNCATEGORIZED_LABEL,
        delta: c.delta,
      })),
    },
    merchantContext: null,
  };
}
