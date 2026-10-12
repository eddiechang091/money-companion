import type { Expense } from "./types";
import { isValidIsoDate, monthKey } from "./utils";

export interface CategoryTotal {
  categoryId: string | null;
  total: number;
  count: number;
}

export interface PeriodComparison {
  currentKey: string;
  previousKey: string;
  currentTotal: number;
  previousTotal: number;
  currentCount: number;
  previousCount: number;
  delta: number;
  deltaPct: number | null;
  direction: "up" | "down" | "flat";
}

export function monthKeyOfIsoDate(iso: string): string | null {
  if (!isValidIsoDate(iso)) return null;
  return iso.slice(0, 7);
}

export function filterByMonth(expenses: Expense[], key: string): Expense[] {
  if (!/^\d{4}-\d{2}$/.test(key)) return [];
  return expenses.filter((expense) => expense.date.slice(0, 7) === key);
}

export function sumExpenses(expenses: Expense[]): number {
  let total = 0;
  for (const expense of expenses) {
    if (Number.isFinite(expense.amount) && expense.amount >= 0) total += expense.amount;
  }
  return Math.round(total * 100) / 100;
}

export function totalsByCategory(expenses: Expense[]): CategoryTotal[] {
  const map = new Map<string | null, { total: number; count: number }>();
  for (const expense of expenses) {
    if (!Number.isFinite(expense.amount) || expense.amount < 0) continue;
    const key = expense.categoryId ?? null;
    const entry = map.get(key) ?? { total: 0, count: 0 };
    entry.total += expense.amount;
    entry.count += 1;
    map.set(key, entry);
  }
  return [...map.entries()]
    .map(([categoryId, { total, count }]) => ({
      categoryId,
      total: Math.round(total * 100) / 100,
      count,
    }))
    .sort((a, b) => b.total - a.total);
}

export function previousMonthKey(key: string): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const date = new Date(year, month - 1, 1);
  date.setMonth(date.getMonth() - 1);
  return monthKey(date);
}

export function currentMonthKey(now: Date = new Date()): string {
  return monthKey(now);
}

export function comparePeriods(
  expenses: Expense[],
  currentKeyValue: string,
  previousKeyValue?: string
): PeriodComparison | null {
  const previous = previousKeyValue ?? previousMonthKey(currentKeyValue);
  if (!previous) return null;
  const currentExpenses = filterByMonth(expenses, currentKeyValue);
  const previousExpenses = filterByMonth(expenses, previous);
  const currentTotal = sumExpenses(currentExpenses);
  const previousTotal = sumExpenses(previousExpenses);
  const delta = Math.round((currentTotal - previousTotal) * 100) / 100;
  const deltaPct =
    previousTotal > 0 ? Math.round(((currentTotal - previousTotal) / previousTotal) * 1000) / 10 : null;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return {
    currentKey: currentKeyValue,
    previousKey: previous,
    currentTotal,
    previousTotal,
    currentCount: currentExpenses.length,
    previousCount: previousExpenses.length,
    delta,
    deltaPct,
    direction,
  };
}

export interface DayTotal {
  date: string;
  label: string;
  total: number;
}

/** Distinct YYYY-MM keys that have expenses, newest first. */
export function availableMonths(expenses: Expense[]): string[] {
  const keys = new Set<string>();
  for (const expense of expenses) {
    const key = expense.date.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(key)) keys.add(key);
  }
  return [...keys].sort().reverse();
}

/** Distinct years that have expenses, newest first. */
export function availableYears(expenses: Expense[]): string[] {
  const years = new Set<string>();
  for (const expense of expenses) {
    const year = expense.date.slice(0, 4);
    if (/^\d{4}$/.test(year)) years.add(year);
  }
  return [...years].sort().reverse();
}

/** Per-month totals for a year (12 bars, Jan–Dec). */
export function monthlyTotals(
  expenses: Expense[],
  year: string
): Array<{ date: string; label: string; total: number }> {
  if (!/^\d{4}$/.test(year)) return [];
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    if (expense.date.slice(0, 4) !== year) continue;
    if (!Number.isFinite(expense.amount) || expense.amount < 0) continue;
    const key = expense.date.slice(0, 7);
    totals.set(key, (totals.get(key) ?? 0) + expense.amount);
  }
  const months: Array<{ date: string; label: string; total: number }> = [];
  for (let m = 1; m <= 12; m += 1) {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    const label = new Date(Number(year), m - 1, 1).toLocaleString("en", { month: "short" });
    const raw = totals.get(key) ?? 0;
    months.push({ date: key, label, total: Math.round(raw * 100) / 100 });
  }
  return months;
}

export function dailyTotals(expenses: Expense[], key: string): DayTotal[] {
  if (!/^\d{4}-\d{2}$/.test(key)) return [];
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const daysInMonth = new Date(year, month, 0).getDate();
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    if (expense.date.slice(0, 7) !== key) continue;
    if (!Number.isFinite(expense.amount) || expense.amount < 0) continue;
    totals.set(expense.date, (totals.get(expense.date) ?? 0) + expense.amount);
  }
  const days: DayTotal[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${key}-${String(day).padStart(2, "0")}`;
    const raw = totals.get(date) ?? 0;
    days.push({ date, label: String(day), total: Math.round(raw * 100) / 100 });
  }
  return days;
}

export type BudgetStatus = "none" | "on-track" | "watch" | "over";

export interface BudgetProgressInfo {
  limit: number;
  spent: number;
  remaining: number;
  pct: number;
  over: boolean;
  status: BudgetStatus;
}

export type SpendingChangeKind = "increase" | "decrease" | "new" | "gone";

export interface SpendingChange {
  id: string;
  kind: SpendingChangeKind;
  categoryId: string | null;
  currentTotal: number;
  previousTotal: number;
  delta: number;
  deltaPct: number | null;
  message: string;
}

export interface MeaningfulChangesOptions {
  minAbsolute?: number;
  minPct?: number;
  minNewOrGone?: number;
  maxResults?: number;
}

const CHANGE_CATEGORY_LABELS: Record<string, string> = {
  food: "Food",
  transport: "Transport",
  shopping: "Shopping",
  bills: "Bills",
  fun: "Fun",
  health: "Health",
  other: "Other",
};

function changeCategoryLabel(categoryId: string | null): string {
  if (!categoryId) return "Uncategorized";
  return CHANGE_CATEGORY_LABELS[categoryId] ?? "Uncategorized";
}

/**
 * Deterministic "what changed" detector. Only surfaces changes that clear
 * both an absolute and a relative bar, so tiny wobbles stay quiet.
 */
export function detectMeaningfulChanges(
  current: Expense[],
  previous: Expense[],
  options: MeaningfulChangesOptions = {}
): SpendingChange[] {
  const minAbsolute = options.minAbsolute ?? 20;
  const minPct = options.minPct ?? 0.3;
  const minNewOrGone = options.minNewOrGone ?? 50;
  const maxResults = options.maxResults ?? 5;

  const currentByCat = new Map<string | null, number>();
  const previousByCat = new Map<string | null, number>();
  for (const expense of current) {
    if (!Number.isFinite(expense.amount) || expense.amount < 0) continue;
    const key = expense.categoryId ?? null;
    currentByCat.set(key, (currentByCat.get(key) ?? 0) + expense.amount);
  }
  for (const expense of previous) {
    if (!Number.isFinite(expense.amount) || expense.amount < 0) continue;
    const key = expense.categoryId ?? null;
    previousByCat.set(key, (previousByCat.get(key) ?? 0) + expense.amount);
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  const changes: SpendingChange[] = [];
  const categories = new Set<string | null>([...currentByCat.keys(), ...previousByCat.keys()]);
  for (const categoryId of categories) {
    const currentTotal = round(currentByCat.get(categoryId) ?? 0);
    const previousTotal = round(previousByCat.get(categoryId) ?? 0);
    const delta = round(currentTotal - previousTotal);
    const key = categoryId ?? "uncategorized";
    if (previousTotal === 0 && currentTotal >= minNewOrGone) {
      changes.push({
        id: `new:${key}`,
        kind: "new",
        categoryId,
        currentTotal,
        previousTotal,
        delta: currentTotal,
        deltaPct: null,
        message: `New spending on ${changeCategoryLabel(categoryId)} this month.`,
      });
      continue;
    }
    if (currentTotal === 0 && previousTotal >= minNewOrGone) {
      changes.push({
        id: `gone:${key}`,
        kind: "gone",
        categoryId,
        currentTotal,
        previousTotal,
        delta: -previousTotal,
        deltaPct: -100,
        message: `No spending on ${changeCategoryLabel(categoryId)} this month.`,
      });
      continue;
    }
    if (previousTotal === 0) continue;
    const abs = Math.abs(delta);
    const pct = abs / previousTotal;
    if (abs >= minAbsolute && pct >= minPct) {
      const deltaPct = Math.round((delta / previousTotal) * 1000) / 10;
      changes.push({
        id: `${delta > 0 ? "up" : "down"}:${key}`,
        kind: delta > 0 ? "increase" : "decrease",
        categoryId,
        currentTotal,
        previousTotal,
        delta,
        deltaPct,
        message:
          delta > 0
            ? `${changeCategoryLabel(categoryId)} is up ${deltaPct}%.`
            : `${changeCategoryLabel(categoryId)} is down ${Math.abs(deltaPct)}%.`,
      });
    }
  }

  changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return changes.slice(0, Math.max(0, maxResults));
}

export interface RecurringExpense {
  key: string;
  description: string;
  categoryId: string | null;
  amount: number;
  occurrences: number;
  months: string[];
  firstDate: string;
  lastDate: string;
  total: number;
}

export interface RecurringOptions {
  minOccurrences?: number;
}

/**
 * Deterministic recurring-expense detector: same normalized description +
 * same rounded amount appearing across at least `minOccurrences` expenses
 * in 2+ distinct months. No LLM, no guessing.
 */
export function detectRecurringExpenses(
  expenses: Expense[],
  options: RecurringOptions = {}
): RecurringExpense[] {
  const minOccurrences = options.minOccurrences ?? 3;
  const groups = new Map<string, Expense[]>();
  for (const expense of expenses) {
    const description = expense.description.trim().replace(/\s+/g, " ").toLowerCase();
    if (!description) continue;
    if (!Number.isFinite(expense.amount) || expense.amount <= 0) continue;
    if (!isValidIsoDate(expense.date)) continue;
    const key = `${description}|${expense.amount.toFixed(2)}|${expense.categoryId ?? ""}`;
    const group = groups.get(key);
    if (group) group.push(expense);
    else groups.set(key, [expense]);
  }

  const recurring: RecurringExpense[] = [];
  for (const [key, group] of groups) {
    if (group.length < minOccurrences) continue;
    const months = [...new Set(group.map((e) => e.date.slice(0, 7)))].sort();
    if (months.length < 2) continue;
    const sorted = [...group].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const first = sorted[0];
    const total = Math.round(group.reduce((sum, e) => sum + e.amount, 0) * 100) / 100;
    recurring.push({
      key,
      description: first.description.trim(),
      categoryId: first.categoryId,
      amount: Math.round(first.amount * 100) / 100,
      occurrences: group.length,
      months,
      firstDate: sorted[0].date,
      lastDate: sorted[sorted.length - 1].date,
      total,
    });
  }

  recurring.sort((a, b) => b.occurrences - a.occurrences || b.total - a.total);
  return recurring;
}

export function calculateBudgetProgress(spent: number, limit: number): BudgetProgressInfo {
  const safeLimit = Math.max(0, limit);
  const safeSpent = Math.max(0, spent);
  const remaining = Math.max(0, safeLimit - safeSpent);
  const pct = safeLimit > 0 ? Math.min(100, Math.round((safeSpent / safeLimit) * 100)) : 0;
  const over = safeLimit > 0 && safeSpent > safeLimit;
  let status: BudgetStatus;
  if (safeLimit === 0) status = "none";
  else if (over) status = "over";
  else if (pct >= 80) status = "watch";
  else status = "on-track";
  return {
    limit: safeLimit,
    spent: Math.round(safeSpent * 100) / 100,
    remaining: Math.round(remaining * 100) / 100,
    pct,
    over,
    status,
  };
}
