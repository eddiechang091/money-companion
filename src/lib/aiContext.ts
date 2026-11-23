import type { Expense, MonthlyBudget, RecordKind } from "./types";
import { recordKind } from "./types";
import { categoryName, getCategoryById } from "./categories";
import {
  calculateBudgetProgress,
  comparePeriods,
  currentMonthKey,
  detectMeaningfulChanges,
  filterByKind,
  filterByMonth,
  latestPointChanges,
  sumByKind,
  sumExpenses,
  totalsByCategory,
  trendKey,
  type BudgetStatus,
  type CategoryTrendRow,
} from "./analytics";

export interface ExpenseContext {
  kind: RecordKind;
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
  totalIncome: number;
  /** Money in minus money out for the month. */
  balance: number;
  topCategories: Array<{ categoryId: string | null; category: string; total: number; count: number }>;
  previousMonth: {
    totalSpent: number;
    delta: number;
    deltaPct: number | null;
    topCategories: Array<{ categoryId: string | null; category: string; total: number; count: number }>;
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

export interface TrendPeriodPoint {
  label: string;
  totalIn: number;
  totalOut: number;
  net: number;
}

export interface TrendCategorySummary {
  categoryId: string;
  category: string;
  /** Total over the visible range, for the selected kind. */
  total: number;
  latest: number;
  previous: number;
  deltaPct: number | null;
}

export interface TrendBudgetStatus {
  category: string;
  limit: number;
  /** That category's spend in the latest month with data. */
  spent: number;
  pct: number;
  status: BudgetStatus;
}

/**
 * Aggregates only — the trend insight never sees individual transactions.
 * Built from what the Trends page already shows: the visible range,
 * the selected categories, and the budgets.
 */
export interface TrendInsightContext {
  user: { currency: string };
  granularity: "month" | "year";
  kind: RecordKind;
  rangeLabel: string;
  periods: TrendPeriodPoint[];
  categories: TrendCategorySummary[];
  totals: { totalIn: number; totalOut: number; net: number };
  /** Overall monthly budget vs the latest month's spending. */
  overallBudget: { limit: number; latestMonthSpent: number; pct: number; status: BudgetStatus } | null;
  categoryBudgets: TrendBudgetStatus[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Build the trend insight context from the chart's own inputs.
 * `series` supplies the period order + labels; `visibleIds` the
 * categories the user is looking at; `rangeRecords` all records
 * inside the visible range (both kinds).
 */
export function buildTrendInsightContext(
  rangeRecords: Expense[],
  series: CategoryTrendRow[],
  visibleIds: string[],
  kind: RecordKind,
  granularity: "month" | "year",
  currency: string,
  budgets: MonthlyBudget[]
): TrendInsightContext {
  const keyOf = (date: string) =>
    granularity === "month" ? date.slice(0, 7) : date.slice(0, 4);

  const periods: TrendPeriodPoint[] = series.map((row) => {
    const inRange = rangeRecords.filter((e) => keyOf(e.date) === row.date);
    const totalIn = round2(sumByKind(inRange, "income"));
    const totalOut = round2(sumByKind(inRange, "expense"));
    return { label: row.label, totalIn, totalOut, net: round2(totalIn - totalOut) };
  });

  const scoped = filterByKind(rangeRecords, kind);
  const catTotals = new Map<string, number>();
  for (const t of totalsByCategory(scoped)) catTotals.set(trendKey(t.categoryId), t.total);
  const changes = new Map(
    latestPointChanges(series, visibleIds).map((c) => [c.categoryId, c])
  );
  const categories: TrendCategorySummary[] = visibleIds.map((id) => {
    const change = changes.get(id);
    return {
      categoryId: id,
      category: categoryName(id === "uncategorized" ? null : id),
      total: round2(catTotals.get(id) ?? 0),
      latest: change?.current ?? 0,
      previous: change?.previous ?? 0,
      deltaPct: change?.deltaPct ?? null,
    };
  });

  const totalIn = round2(sumByKind(rangeRecords, "income"));
  const totalOut = round2(sumByKind(rangeRecords, "expense"));

  // Budgets are monthly: compare them against the latest month with data.
  const latestMonthKey = rangeRecords
    .map((e) => e.date.slice(0, 7))
    .sort()
    .at(-1);
  const latestMonthRecords = latestMonthKey
    ? filterByMonth(rangeRecords, latestMonthKey)
    : [];
  const overall = budgets.find((b) => b.categoryId === null) ?? null;
  const latestMonthSpent = round2(sumByKind(latestMonthRecords, "expense"));
  const overallBudget = overall
    ? (() => {
        const info = calculateBudgetProgress(latestMonthSpent, overall.amount);
        return {
          limit: overall.amount,
          latestMonthSpent,
          pct: info.pct,
          status: info.status,
        };
      })()
    : null;
  const categoryBudgets: TrendBudgetStatus[] = visibleIds
    .filter((id) => id !== "uncategorized")
    .map((id) => {
      const budget = budgets.find((b) => b.categoryId === id);
      if (!budget) return null;
      const spent = round2(
        sumExpenses(
          latestMonthRecords.filter(
            (e) => recordKind(e) === "expense" && e.categoryId === id
          )
        )
      );
      const info = calculateBudgetProgress(spent, budget.amount);
      return {
        category: categoryName(id),
        limit: budget.amount,
        spent,
        pct: info.pct,
        status: info.status,
      };
    })
    .filter((b): b is TrendBudgetStatus => b !== null);

  const rangeLabel =
    series.length > 1
      ? `${series[0].label} – ${series[series.length - 1].label}`
      : series[0]?.label ?? "";

  return {
    user: { currency },
    granularity,
    kind,
    rangeLabel,
    periods,
    categories,
    totals: { totalIn, totalOut, net: round2(totalIn - totalOut) },
    overallBudget,
    categoryBudgets,
  };
}

export function buildInsightContext(
  expense: Expense,
  allExpenses: Expense[],
  budgets: MonthlyBudget[],
  monthKey?: string
): InsightContext {
  const currency = expense.currency;
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

  const cat = getCategoryById(expense.categoryId);

  return {
    user: { currency },
    currentExpense: {
      kind: recordKind(expense),
      amount: expense.amount,
      currency: expense.currency,
      category: categoryName(cat?.id ?? null),
      categoryId: expense.categoryId,
      description: expense.description,
      date: expense.date,
    },
    financialSummary: {
      month,
      totalSpent: monthTotal,
      totalIncome: monthIncome,
      balance: Math.round((monthIncome - monthTotal) * 100) / 100,
      topCategories: catTotals.map((t) => ({
        categoryId: t.categoryId,
        category: categoryName(t.categoryId),
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
                  category: categoryName(t.categoryId),
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
        category: categoryName(c.categoryId),
        delta: c.delta,
      })),
    },
    merchantContext: null,
  };
}
