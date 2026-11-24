import type { Expense, RecordKind } from "./types";
import { recordKind } from "./types";
import { UNCATEGORIZED_LABEL } from "./constants";
import { getCategoryById } from "./categories";
import { isValidIsoDate, monthKey } from "./utils";
import { getIntlLocale } from "./i18n";

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

export function filterByYear(expenses: Expense[], year: string): Expense[] {
  if (!/^\d{4}$/.test(year)) return [];
  return expenses.filter((expense) => expense.date.slice(0, 4) === year);
}

/** Records of one money direction. Records written before income support count as expenses. */
export function filterByKind(expenses: Expense[], kind: RecordKind): Expense[] {
  return expenses.filter((expense) => recordKind(expense) === kind);
}

/**
 * Records of one category, by trend key ("uncategorized" = Others, null id).
 * A null/empty key means no filtering.
 */
export function filterByCategory(expenses: Expense[], key: string | null): Expense[] {
  if (!key) return expenses;
  if (key === "uncategorized") return expenses.filter((expense) => expense.categoryId === null);
  return expenses.filter((expense) => expense.categoryId === key);
}

/** Money out only (income records excluded). */
export function sumExpenses(expenses: Expense[]): number {
  return sumByKind(expenses, "expense");
}

/** Money in only. */
export function sumIncome(expenses: Expense[]): number {
  return sumByKind(expenses, "income");
}

export function sumByKind(expenses: Expense[], kind: RecordKind): number {
  let total = 0;
  for (const expense of expenses) {
    if (recordKind(expense) !== kind) continue;
    if (Number.isFinite(expense.amount) && expense.amount >= 0) total += expense.amount;
  }
  return Math.round(total * 100) / 100;
}

/** Totals per category for one kind (default: expenses). */
export function totalsByCategory(expenses: Expense[], kind: RecordKind = "expense"): CategoryTotal[] {
  const map = new Map<string | null, { total: number; count: number }>();
  for (const expense of expenses) {
    if (recordKind(expense) !== kind) continue;
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
  const currentExpenses = filterByKind(filterByMonth(expenses, currentKeyValue), "expense");
  const previousExpenses = filterByKind(filterByMonth(expenses, previous), "expense");
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

/**
 * The month a page should open on: the current month when it has data,
 * otherwise the latest month with data, otherwise the current month
 * (fresh account — the empty state is the right thing to show there).
 * Without this, an empty current month hides every older transaction.
 */
export function defaultMonthKey(expenses: Expense[]): string {
  const now = currentMonthKey();
  const months = availableMonths(expenses);
  return months.includes(now) ? now : months[0] ?? now;
}

/** Same fallback for the year view. */
export function defaultYearKey(expenses: Expense[]): string {
  const now = String(new Date().getFullYear());
  const years = availableYears(expenses);
  return years.includes(now) ? now : years[0] ?? now;
}

/** Per-month expense totals for a year (12 bars, Jan–Dec). */
export function monthlyTotals(
  expenses: Expense[],
  year: string
): Array<{ date: string; label: string; total: number }> {
  if (!/^\d{4}$/.test(year)) return [];
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    if (recordKind(expense) !== "expense") continue;
    if (expense.date.slice(0, 4) !== year) continue;
    if (!Number.isFinite(expense.amount) || expense.amount < 0) continue;
    const key = expense.date.slice(0, 7);
    totals.set(key, (totals.get(key) ?? 0) + expense.amount);
  }
  const months: Array<{ date: string; label: string; total: number }> = [];
  for (let m = 1; m <= 12; m += 1) {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    const label = new Date(Number(year), m - 1, 1).toLocaleString(getIntlLocale(), { month: "short" });
    const raw = totals.get(key) ?? 0;
    months.push({ date: key, label, total: Math.round(raw * 100) / 100 });
  }
  return months;
}

/** Stable chart key for a category id ("uncategorized" for Others). */
export function trendKey(categoryId: string | null): string {
  return categoryId ?? "uncategorized";
}

/**
 * One clicked point on a per-category trend line.
 * `periodKey` is the row's `date` ("2026-11" or "2026").
 */
export interface TrendPointClick {
  periodKey: string;
  categoryId: string;
  value: number;
}

/**
 * Resolve a recharts trend-line dot click into a trend point. The handler
 * lives on the dot object prop (the Line's own onClick is dropped by
 * recharts' filterProps in renderDots); at runtime it is called with the
 * dot's props: dataKey (the series = trend key), value, and payload (the
 * row datum). Every dot navigates — even a $0 point, whose destination
 * list simply shows the empty state.
 */
export function resolveTrendPointClick(data: unknown): TrendPointClick | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { dataKey?: unknown; value?: unknown; payload?: unknown };
  const categoryId = typeof d.dataKey === "string" && d.dataKey.length > 0 ? d.dataKey : null;
  const payload = (d.payload ?? null) as { date?: unknown } | null;
  const periodKey =
    payload && typeof payload.date === "string" && payload.date.length > 0 ? payload.date : null;
  const value = typeof d.value === "number" ? d.value : null;
  // A $0 point has no transactions to show, so it does not navigate.
  // (The tooltip still shows its $0 row.)
  if (!categoryId || !periodKey || value === null || value === 0) return null;
  return { periodKey, categoryId, value };
}

/** One point of a per-category trend line: per-category totals for a month or a year. */
export interface CategoryTrendRow {
  date: string;
  label: string;
  [categoryId: string]: number | string;
}

/** Compact axis label for a YYYY-MM key ("Nov ’25"). */
function shortMonthLabel(key: string): string {
  const parts = key.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  if (!y || !m) return key;
  const month = new Date(y, m - 1, 1).toLocaleString(getIntlLocale(), { month: "short" });
  return `${month} ’${String(y).slice(2)}`;
}

function accumulateCategoryTotals(
  expenses: Expense[],
  kind: RecordKind,
  bucketOf: (expense: Expense) => string | null
): Map<string, Map<string, number>> {
  const buckets = new Map<string, Map<string, number>>();
  for (const expense of expenses) {
    if (recordKind(expense) !== kind) continue;
    if (!Number.isFinite(expense.amount) || expense.amount < 0) continue;
    const bucket = bucketOf(expense);
    if (!bucket) continue;
    const key = trendKey(expense.categoryId);
    const row = buckets.get(bucket) ?? new Map<string, number>();
    row.set(key, (row.get(key) ?? 0) + expense.amount);
    buckets.set(bucket, row);
  }
  return buckets;
}

function trendRows(
  buckets: Map<string, Map<string, number>>,
  keys: string[],
  labelOf: (key: string) => string
): CategoryTrendRow[] {
  // Every category seen anywhere gets a value in every row (0 when absent),
  // so lines stay continuous instead of breaking on empty months.
  const allKeys = new Set<string>();
  for (const totals of buckets.values()) {
    for (const key of totals.keys()) allKeys.add(key);
  }
  return keys.map((key) => {
    const totals = buckets.get(key);
    const row: CategoryTrendRow = { date: key, label: labelOf(key) };
    for (const cat of allKeys) {
      row[cat] = Math.round(((totals?.get(cat)) ?? 0) * 100) / 100;
    }
    return row;
  });
}

/**
 * Per-category totals for each month in `months` (oldest first). Months
 * with no spending still get a row, so lines stay continuous.
 */
export function categoryMonthlySeries(
  expenses: Expense[],
  kind: RecordKind,
  months: string[]
): CategoryTrendRow[] {
  const buckets = accumulateCategoryTotals(expenses, kind, (e) =>
    /^\d{4}-\d{2}$/.test(e.date.slice(0, 7)) ? e.date.slice(0, 7) : null
  );
  return trendRows(buckets, months, shortMonthLabel);
}

/** Per-category totals for each year in `years` (oldest first). */
export function categoryYearlySeries(
  expenses: Expense[],
  kind: RecordKind,
  years: string[]
): CategoryTrendRow[] {
  const buckets = accumulateCategoryTotals(expenses, kind, (e) =>
    /^\d{4}$/.test(e.date.slice(0, 4)) ? e.date.slice(0, 4) : null
  );
  return trendRows(buckets, years, (y) => y);
}

export interface TrendPointChange {
  categoryId: string;
  current: number;
  previous: number;
  delta: number;
  /** Percent change vs the previous point; null when the previous point is 0. */
  deltaPct: number | null;
}

/**
 * Latest point vs the previous point, per category (month-over-month in
 * the month view, year-over-year in the year view). Needs at least two
 * points; otherwise there is nothing to compare against.
 */
export function latestPointChanges(
  rows: CategoryTrendRow[],
  categoryIds: string[]
): TrendPointChange[] {
  if (rows.length < 2) return [];
  const current = rows[rows.length - 1];
  const previous = rows[rows.length - 2];
  return categoryIds.map((id) => {
    const cur = Math.round(((current[id] as number) ?? 0) * 100) / 100;
    const prev = Math.round(((previous[id] as number) ?? 0) * 100) / 100;
    const delta = Math.round((cur - prev) * 100) / 100;
    return {
      categoryId: id,
      current: cur,
      previous: prev,
      delta,
      deltaPct: prev > 0 ? Math.round((delta / prev) * 1000) / 10 : null,
    };
  });
}

export function dailyTotals(expenses: Expense[], key: string): DayTotal[] {
  if (!/^\d{4}-\d{2}$/.test(key)) return [];
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const daysInMonth = new Date(year, month, 0).getDate();
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    if (recordKind(expense) !== "expense") continue;
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

/** One bucket (day or month) with money out and money in side by side. */
export interface FlowDatum {
  date: string;
  label: string;
  expense: number;
  income: number;
}

function accumulateFlow(expenses: Expense[]): Map<string, { expense: number; income: number }> {
  const totals = new Map<string, { expense: number; income: number }>();
  for (const expense of expenses) {
    if (!Number.isFinite(expense.amount) || expense.amount < 0) continue;
    const entry = totals.get(expense.date) ?? { expense: 0, income: 0 };
    if (recordKind(expense) === "income") entry.income += expense.amount;
    else entry.expense += expense.amount;
    totals.set(expense.date, entry);
  }
  return totals;
}

/** Per-day money flow for a month (one entry per calendar day). */
export function dailyFlow(expenses: Expense[], key: string): FlowDatum[] {
  if (!/^\d{4}-\d{2}$/.test(key)) return [];
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const daysInMonth = new Date(year, month, 0).getDate();
  const totals = accumulateFlow(expenses.filter((e) => e.date.slice(0, 7) === key));
  const days: FlowDatum[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${key}-${String(day).padStart(2, "0")}`;
    const raw = totals.get(date) ?? { expense: 0, income: 0 };
    days.push({
      date,
      label: String(day),
      expense: Math.round(raw.expense * 100) / 100,
      income: Math.round(raw.income * 100) / 100,
    });
  }
  return days;
}

/** Per-month money flow for a year (12 entries, Jan–Dec). */
export function monthlyFlow(expenses: Expense[], year: string): FlowDatum[] {
  if (!/^\d{4}$/.test(year)) return [];
  const totals = accumulateFlow(expenses.filter((e) => e.date.slice(0, 4) === year));
  const months: FlowDatum[] = [];
  for (let m = 1; m <= 12; m += 1) {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    const label = new Date(Number(year), m - 1, 1).toLocaleString(getIntlLocale(), { month: "short" });
    let expense = 0;
    let income = 0;
    for (const [date, entry] of totals) {
      if (date.slice(0, 7) !== key) continue;
      expense += entry.expense;
      income += entry.income;
    }
    months.push({
      date: key,
      label,
      expense: Math.round(expense * 100) / 100,
      income: Math.round(income * 100) / 100,
    });
  }
  return months;
}

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

function changeCategoryLabel(categoryId: string | null): string {
  const category = getCategoryById(categoryId);
  if (!category) return UNCATEGORIZED_LABEL;
  return category.name;
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
    if (recordKind(expense) !== "expense") continue;
    if (!Number.isFinite(expense.amount) || expense.amount < 0) continue;
    const key = expense.categoryId ?? null;
    currentByCat.set(key, (currentByCat.get(key) ?? 0) + expense.amount);
  }
  for (const expense of previous) {
    if (recordKind(expense) !== "expense") continue;
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
    if (recordKind(expense) !== "expense") continue;
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
