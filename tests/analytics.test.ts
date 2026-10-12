import { describe, expect, it } from "vitest";
import {
  calculateBudgetProgress,
  comparePeriods,
  dailyTotals,
  detectMeaningfulChanges,
  detectRecurringExpenses,
  filterByMonth,
  sumExpenses,
  totalsByCategory,
  availableMonths,
  availableYears,
  monthlyTotals,
} from "@/lib/analytics";
import type { Expense } from "@/lib/types";

function makeExpense(partial: Partial<Expense> & { id: string; date: string; amount: number }): Expense {
  return {
    currency: "CAD",
    categoryId: "food",
    description: "Test",
    createdAt: `${partial.date}T00:00:00.000Z`,
    updatedAt: `${partial.date}T00:00:00.000Z`,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// sumExpenses
// ---------------------------------------------------------------------------
describe("sumExpenses", () => {
  it("returns 0 for an empty list", () => {
    expect(sumExpenses([])).toBe(0);
  });

  it("sums amounts and rounds to 2 decimal places", () => {
    const expenses = [
      makeExpense({ id: "a", date: "2026-09-01", amount: 10.1 }),
      makeExpense({ id: "b", date: "2026-09-02", amount: 20.2 }),
      makeExpense({ id: "c", date: "2026-09-03", amount: 0.05 }),
    ];
    expect(sumExpenses(expenses)).toBe(30.35);
  });

  it("ignores negative amounts", () => {
    const expenses = [
      makeExpense({ id: "a", date: "2026-09-01", amount: 50 }),
      makeExpense({ id: "b", date: "2026-09-02", amount: -10 }),
    ];
    expect(sumExpenses(expenses)).toBe(50);
  });

  it("ignores non-finite amounts", () => {
    const expenses = [
      makeExpense({ id: "a", date: "2026-09-01", amount: 100 }),
      { ...makeExpense({ id: "b", date: "2026-09-01", amount: 0 }), amount: Number.NaN },
      { ...makeExpense({ id: "c", date: "2026-09-01", amount: 0 }), amount: Infinity },
    ];
    expect(sumExpenses(expenses)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// totalsByCategory
// ---------------------------------------------------------------------------
describe("totalsByCategory", () => {
  it("returns an empty array for no expenses", () => {
    expect(totalsByCategory([])).toEqual([]);
  });

  it("groups by category and sorts by total descending", () => {
    const expenses = [
      makeExpense({ id: "a", date: "2026-09-01", amount: 30, categoryId: "food" }),
      makeExpense({ id: "b", date: "2026-09-01", amount: 80, categoryId: "transport" }),
      makeExpense({ id: "c", date: "2026-09-01", amount: 20, categoryId: "food" }),
    ];
    const result = totalsByCategory(expenses);
    expect(result[0]).toMatchObject({ categoryId: "transport", total: 80, count: 1 });
    expect(result[1]).toMatchObject({ categoryId: "food", total: 50, count: 2 });
  });

  it("treats null categoryId as its own group", () => {
    const expenses = [
      makeExpense({ id: "a", date: "2026-09-01", amount: 15, categoryId: null }),
      makeExpense({ id: "b", date: "2026-09-01", amount: 10, categoryId: "bills" }),
    ];
    const result = totalsByCategory(expenses);
    const uncategorized = result.find((r) => r.categoryId === null);
    expect(uncategorized).toMatchObject({ total: 15, count: 1 });
  });

  it("ignores negative and non-finite amounts", () => {
    const expenses = [
      makeExpense({ id: "a", date: "2026-09-01", amount: 40, categoryId: "fun" }),
      makeExpense({ id: "b", date: "2026-09-01", amount: -5, categoryId: "fun" }),
    ];
    const result = totalsByCategory(expenses);
    expect(result).toHaveLength(1);
    expect(result[0].total).toBe(40);
  });

  it("rounds totals to 2 decimal places", () => {
    const expenses = [
      makeExpense({ id: "a", date: "2026-09-01", amount: 0.1, categoryId: "other" }),
      makeExpense({ id: "b", date: "2026-09-01", amount: 0.2, categoryId: "other" }),
    ];
    const result = totalsByCategory(expenses);
    expect(result[0].total).toBe(0.3);
  });
});

// ---------------------------------------------------------------------------
// filterByMonth
// ---------------------------------------------------------------------------
describe("filterByMonth", () => {
  it("returns only expenses in the given month", () => {
    const expenses = [
      makeExpense({ id: "a", date: "2026-09-15", amount: 10 }),
      makeExpense({ id: "b", date: "2026-10-01", amount: 20 }),
    ];
    expect(filterByMonth(expenses, "2026-09")).toHaveLength(1);
    expect(filterByMonth(expenses, "2026-10")).toHaveLength(1);
  });

  it("returns empty for an invalid key format", () => {
    expect(filterByMonth([], "invalid")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// comparePeriods
// ---------------------------------------------------------------------------
describe("comparePeriods", () => {
  it("calculates delta and direction correctly (up)", () => {
    const expenses = [
      makeExpense({ id: "a", date: "2026-09-01", amount: 200 }),
      makeExpense({ id: "b", date: "2026-08-01", amount: 100 }),
    ];
    const result = comparePeriods(expenses, "2026-09");
    expect(result).not.toBeNull();
    expect(result!.currentTotal).toBe(200);
    expect(result!.previousTotal).toBe(100);
    expect(result!.delta).toBe(100);
    expect(result!.direction).toBe("up");
    expect(result!.deltaPct).toBe(100);
  });

  it("reports direction down when current < previous", () => {
    const expenses = [
      makeExpense({ id: "a", date: "2026-09-01", amount: 80 }),
      makeExpense({ id: "b", date: "2026-08-01", amount: 200 }),
    ];
    const result = comparePeriods(expenses, "2026-09");
    expect(result!.direction).toBe("down");
    expect(result!.delta).toBe(-120);
  });

  it("reports flat when totals are equal", () => {
    const expenses = [
      makeExpense({ id: "a", date: "2026-09-01", amount: 100 }),
      makeExpense({ id: "b", date: "2026-08-01", amount: 100 }),
    ];
    expect(comparePeriods(expenses, "2026-09")!.direction).toBe("flat");
  });

  it("returns null deltaPct when previous total is zero", () => {
    const expenses = [makeExpense({ id: "a", date: "2026-09-01", amount: 50 })];
    const result = comparePeriods(expenses, "2026-09");
    expect(result!.deltaPct).toBeNull();
    expect(result!.previousTotal).toBe(0);
  });

  it("uses explicit previousKeyValue when supplied", () => {
    const expenses = [
      makeExpense({ id: "a", date: "2026-09-01", amount: 150 }),
      makeExpense({ id: "b", date: "2026-07-01", amount: 100 }),
    ];
    const result = comparePeriods(expenses, "2026-09", "2026-07");
    expect(result!.previousKey).toBe("2026-07");
    expect(result!.previousTotal).toBe(100);
  });

  it("returns null for an invalid current key", () => {
    expect(comparePeriods([], "bad-key")).toBeNull();
  });

  it("records the correct expense counts", () => {
    const expenses = [
      makeExpense({ id: "a", date: "2026-09-01", amount: 10 }),
      makeExpense({ id: "b", date: "2026-09-15", amount: 20 }),
      makeExpense({ id: "c", date: "2026-08-10", amount: 30 }),
    ];
    const result = comparePeriods(expenses, "2026-09");
    expect(result!.currentCount).toBe(2);
    expect(result!.previousCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// dailyTotals
// ---------------------------------------------------------------------------
describe("dailyTotals", () => {
  it("returns one entry per day in the month", () => {
    const result = dailyTotals([], "2026-09");
    expect(result).toHaveLength(30);
    expect(result[0]).toMatchObject({ date: "2026-09-01", label: "1", total: 0 });
    expect(result[29]).toMatchObject({ date: "2026-09-30", label: "30", total: 0 });
  });

  it("accumulates multiple expenses on the same day", () => {
    const expenses = [
      makeExpense({ id: "a", date: "2026-09-05", amount: 15 }),
      makeExpense({ id: "b", date: "2026-09-05", amount: 10 }),
    ];
    const result = dailyTotals(expenses, "2026-09");
    expect(result[4]).toMatchObject({ date: "2026-09-05", total: 25 });
  });

  it("excludes expenses outside the requested month", () => {
    const expenses = [makeExpense({ id: "a", date: "2026-10-01", amount: 99 })];
    const result = dailyTotals(expenses, "2026-09");
    expect(result.every((d) => d.total === 0)).toBe(true);
  });

  it("handles February correctly (non-leap year has 28 days)", () => {
    expect(dailyTotals([], "2026-02")).toHaveLength(28);
  });

  it("handles February correctly (leap year has 29 days)", () => {
    expect(dailyTotals([], "2024-02")).toHaveLength(29);
  });

  it("returns empty for an invalid key", () => {
    expect(dailyTotals([], "not-a-key")).toEqual([]);
  });

  it("ignores negative amounts", () => {
    const expenses = [makeExpense({ id: "a", date: "2026-09-10", amount: -20 })];
    const result = dailyTotals(expenses, "2026-09");
    expect(result[9].total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// detectMeaningfulChanges
// ---------------------------------------------------------------------------
describe("detectMeaningfulChanges", () => {
  function makeMonthExpenses(categoryId: string, amount: number, date: string): Expense {
    return makeExpense({ id: `${categoryId}-${date}`, date, amount, categoryId });
  }

  it("returns empty for identical periods", () => {
    const expenses = [makeMonthExpenses("food", 100, "2026-09-01")];
    expect(detectMeaningfulChanges(expenses, expenses)).toEqual([]);
  });

  it("surfaces a significant increase", () => {
    const previous = [makeMonthExpenses("food", 100, "2026-08-01")];
    const current = [makeMonthExpenses("food", 200, "2026-09-01")];
    const changes = detectMeaningfulChanges(current, previous);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("increase");
    expect(changes[0].categoryId).toBe("food");
    expect(changes[0].delta).toBe(100);
  });

  it("surfaces a significant decrease", () => {
    const previous = [makeMonthExpenses("transport", 200, "2026-08-01")];
    const current = [makeMonthExpenses("transport", 60, "2026-09-01")];
    const changes = detectMeaningfulChanges(current, previous);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("decrease");
    expect(changes[0].delta).toBeLessThan(0);
  });

  it("suppresses changes below the absolute threshold", () => {
    const previous = [makeMonthExpenses("fun", 100, "2026-08-01")];
    const current = [makeMonthExpenses("fun", 110, "2026-09-01")];
    // delta = 10, default minAbsolute = 20 → suppressed
    expect(detectMeaningfulChanges(current, previous)).toEqual([]);
  });

  it("suppresses changes below the percentage threshold", () => {
    const previous = [makeMonthExpenses("bills", 1000, "2026-08-01")];
    const current = [makeMonthExpenses("bills", 1025, "2026-09-01")];
    // delta = 25 (clears absolute), pct = 2.5% (below default 30%) → suppressed
    expect(detectMeaningfulChanges(current, previous)).toEqual([]);
  });

  it("detects 'new' category above threshold", () => {
    const current = [makeMonthExpenses("health", 80, "2026-09-01")];
    const changes = detectMeaningfulChanges(current, [], { minNewOrGone: 50 });
    expect(changes[0].kind).toBe("new");
    expect(changes[0].categoryId).toBe("health");
    expect(changes[0].deltaPct).toBeNull();
  });

  it("detects 'gone' category above threshold", () => {
    const previous = [makeMonthExpenses("shopping", 120, "2026-08-01")];
    const changes = detectMeaningfulChanges([], previous, { minNewOrGone: 50 });
    expect(changes[0].kind).toBe("gone");
    expect(changes[0].deltaPct).toBe(-100);
  });

  it("does not flag 'new' category below threshold", () => {
    const current = [makeMonthExpenses("health", 30, "2026-09-01")];
    // minNewOrGone = 50, 30 < 50 → not flagged
    expect(detectMeaningfulChanges(current, [])).toEqual([]);
  });

  it("respects maxResults", () => {
    const previous = [
      makeMonthExpenses("food", 100, "2026-08-01"),
      makeMonthExpenses("transport", 100, "2026-08-01"),
      makeMonthExpenses("shopping", 100, "2026-08-01"),
    ];
    const current = [
      makeMonthExpenses("food", 300, "2026-09-01"),
      makeMonthExpenses("transport", 300, "2026-09-01"),
      makeMonthExpenses("shopping", 300, "2026-09-01"),
    ];
    const changes = detectMeaningfulChanges(current, previous, { maxResults: 2 });
    expect(changes.length).toBeLessThanOrEqual(2);
  });

  it("returns empty for empty inputs", () => {
    expect(detectMeaningfulChanges([], [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// detectRecurringExpenses
// ---------------------------------------------------------------------------
describe("detectRecurringExpenses", () => {
  function makeRecurring(id: string, date: string): Expense {
    return makeExpense({ id, date, amount: 9.99, description: "Netflix", categoryId: "fun" });
  }

  it("detects a recurring expense across 3+ months", () => {
    const expenses = [
      makeRecurring("a", "2026-07-01"),
      makeRecurring("b", "2026-08-01"),
      makeRecurring("c", "2026-09-01"),
    ];
    const result = detectRecurringExpenses(expenses);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("Netflix");
    expect(result[0].occurrences).toBe(3);
    expect(result[0].months).toHaveLength(3);
  });

  it("does not flag expenses with only one distinct month", () => {
    const expenses = [
      makeRecurring("a", "2026-09-01"),
      makeRecurring("b", "2026-09-15"),
      makeRecurring("c", "2026-09-20"),
    ];
    // 3 occurrences but all in the same month
    expect(detectRecurringExpenses(expenses)).toHaveLength(0);
  });

  it("ignores groups below minOccurrences", () => {
    const expenses = [
      makeRecurring("a", "2026-08-01"),
      makeRecurring("b", "2026-09-01"),
    ];
    // Only 2 occurrences, default minimum is 3
    expect(detectRecurringExpenses(expenses)).toHaveLength(0);
  });

  it("respects a custom minOccurrences option", () => {
    const expenses = [
      makeRecurring("a", "2026-08-01"),
      makeRecurring("b", "2026-09-01"),
    ];
    expect(detectRecurringExpenses(expenses, { minOccurrences: 2 })).toHaveLength(1);
  });

  it("normalizes description (case and extra whitespace)", () => {
    const expenses = [
      makeExpense({ id: "a", date: "2026-07-01", amount: 15, description: "  Gym  ", categoryId: "health" }),
      makeExpense({ id: "b", date: "2026-08-01", amount: 15, description: "GYM", categoryId: "health" }),
      makeExpense({ id: "c", date: "2026-09-01", amount: 15, description: "gym", categoryId: "health" }),
    ];
    const result = detectRecurringExpenses(expenses, { minOccurrences: 3 });
    expect(result).toHaveLength(1);
    expect(result[0].occurrences).toBe(3);
  });

  it("excludes expenses with blank descriptions", () => {
    const expenses = [
      makeExpense({ id: "a", date: "2026-07-01", amount: 10, description: "" }),
      makeExpense({ id: "b", date: "2026-08-01", amount: 10, description: "" }),
      makeExpense({ id: "c", date: "2026-09-01", amount: 10, description: "" }),
    ];
    expect(detectRecurringExpenses(expenses)).toHaveLength(0);
  });

  it("excludes expenses with zero amount", () => {
    const expenses = [
      makeExpense({ id: "a", date: "2026-07-01", amount: 0, description: "Free" }),
      makeExpense({ id: "b", date: "2026-08-01", amount: 0, description: "Free" }),
      makeExpense({ id: "c", date: "2026-09-01", amount: 0, description: "Free" }),
    ];
    expect(detectRecurringExpenses(expenses)).toHaveLength(0);
  });

  it("returns correct total, firstDate, and lastDate", () => {
    const expenses = [
      makeRecurring("a", "2026-07-05"),
      makeRecurring("b", "2026-08-12"),
      makeRecurring("c", "2026-09-03"),
    ];
    const result = detectRecurringExpenses(expenses, { minOccurrences: 3 });
    expect(result[0].total).toBeCloseTo(29.97, 2);
    expect(result[0].firstDate).toBe("2026-07-05");
    expect(result[0].lastDate).toBe("2026-09-03");
  });
});

// ---------------------------------------------------------------------------
// calculateBudgetProgress
// ---------------------------------------------------------------------------
describe("calculateBudgetProgress", () => {
  it("returns 'on-track' status when under 80% of limit", () => {
    const result = calculateBudgetProgress(60, 100);
    expect(result.status).toBe("on-track");
    expect(result.pct).toBe(60);
    expect(result.remaining).toBe(40);
    expect(result.over).toBe(false);
  });

  it("returns 'watch' status at exactly 80%", () => {
    const result = calculateBudgetProgress(80, 100);
    expect(result.status).toBe("watch");
    expect(result.pct).toBe(80);
  });

  it("returns 'watch' status between 80% and 100%", () => {
    const result = calculateBudgetProgress(90, 100);
    expect(result.status).toBe("watch");
    expect(result.pct).toBe(90);
  });

  it("returns 'over' status when spent exceeds limit", () => {
    const result = calculateBudgetProgress(120, 100);
    expect(result.status).toBe("over");
    expect(result.over).toBe(true);
    expect(result.pct).toBe(100);
    expect(result.remaining).toBe(0);
  });

  it("returns 'none' status when limit is zero", () => {
    const result = calculateBudgetProgress(50, 0);
    expect(result.status).toBe("none");
    expect(result.pct).toBe(0);
    expect(result.limit).toBe(0);
  });

  it("clamps pct at 100 when well over budget", () => {
    const result = calculateBudgetProgress(500, 100);
    expect(result.pct).toBe(100);
  });

  it("rounds spent and remaining to 2 decimal places", () => {
    const result = calculateBudgetProgress(33.333, 100);
    expect(result.spent).toBe(33.33);
    expect(result.remaining).toBe(66.67);
  });

  it("treats negative spent as zero", () => {
    const result = calculateBudgetProgress(-10, 100);
    expect(result.spent).toBe(0);
    expect(result.remaining).toBe(100);
    expect(result.status).toBe("on-track");
  });
});

describe("chart period helpers", () => {
  const sample: Expense[] = [
    makeExpense({ id: "a", date: "2026-08-05", amount: 10 }),
    makeExpense({ id: "b", date: "2026-10-02", amount: 20 }),
    makeExpense({ id: "c", date: "2026-10-09", amount: 30 }),
    makeExpense({ id: "d", date: "2025-12-25", amount: 40 }),
  ];

  it("availableMonths lists newest first", () => {
    expect(availableMonths(sample)).toEqual(["2026-10", "2026-08", "2025-12"]);
  });

  it("availableYears lists newest first", () => {
    expect(availableYears(sample)).toEqual(["2026", "2025"]);
  });

  it("monthlyTotals aggregates 12 months", () => {
    const totals = monthlyTotals(sample, "2026");
    expect(totals).toHaveLength(12);
    expect(totals[7].label).toBe("Aug");
    expect(totals[7].total).toBe(10);
    expect(totals[9].label).toBe("Oct");
    expect(totals[9].total).toBe(50);
    expect(totals[0].total).toBe(0);
    expect(totals[11].date).toBe("2026-12");
  });

  it("monthlyTotals rejects bad year keys", () => {
    expect(monthlyTotals(sample, "2026-10")).toEqual([]);
    expect(monthlyTotals(sample, "")).toEqual([]);
  });
});
