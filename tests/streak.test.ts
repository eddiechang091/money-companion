import { describe, it, expect } from "vitest";
import { computeStreak, buildHeatmap } from "@/lib/streak";
import type { Expense } from "@/lib/types";

function expenseOn(date: string, n = 1): Expense[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${date}-${i}`,
    kind: "expense",
    amount: 10,
    currency: "CAD",
    categoryId: null,
    description: "",
    date,
    createdAt: date,
    updatedAt: date,
  }));
}

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

describe("computeStreak", () => {
  it("returns zeros with no expenses", () => {
    const s = computeStreak([], D(2026, 10, 5));
    expect(s).toMatchObject({ current: 0, longest: 0, totalDays: 0, lastActiveDate: null });
  });

  it("counts a run ending today", () => {
    const expenses = [...expenseOn("2026-10-03"), ...expenseOn("2026-10-04"), ...expenseOn("2026-10-05")];
    const s = computeStreak(expenses, D(2026, 10, 5));
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
    expect(s.aliveButIdleToday).toBe(false);
  });

  it("keeps the streak alive when today is idle but yesterday is active", () => {
    const expenses = [...expenseOn("2026-10-03"), ...expenseOn("2026-10-04")];
    const s = computeStreak(expenses, D(2026, 10, 5));
    expect(s.current).toBe(2);
    expect(s.aliveButIdleToday).toBe(true);
  });

  it("breaks the streak after a gap day", () => {
    const expenses = [...expenseOn("2026-10-01"), ...expenseOn("2026-10-03"), ...expenseOn("2026-10-05")];
    const s = computeStreak(expenses, D(2026, 10, 5));
    expect(s.current).toBe(1);
    expect(s.longest).toBe(1);
    expect(s.totalDays).toBe(3);
  });

  it("finds the longest run in history", () => {
    const expenses = [
      ...expenseOn("2026-09-01"),
      ...expenseOn("2026-09-02"),
      ...expenseOn("2026-09-03"),
      ...expenseOn("2026-09-04"),
      ...expenseOn("2026-10-05"),
    ];
    const s = computeStreak(expenses, D(2026, 10, 5));
    expect(s.current).toBe(1);
    expect(s.longest).toBe(4);
  });

  it("ignores malformed dates", () => {
    const bad = { ...expenseOn("2026-10-05")[0], date: "not-a-date" };
    const s = computeStreak([bad], D(2026, 10, 5));
    expect(s.totalDays).toBe(0);
  });
});

describe("buildHeatmap", () => {
  it("returns 16 weeks of 7 days, ending this week", () => {
    const grid = buildHeatmap([], 16, D(2026, 10, 5)); // Monday
    expect(grid).toHaveLength(16);
    expect(grid[15]).toHaveLength(7);
    // Last week contains today (Monday = index 1 in Sun..Sat)
    expect(grid[15][1].date).toBe("2026-10-05");
    expect(grid[15][1].placeholder).toBe(false);
    // Future days are placeholders
    expect(grid[15][6].placeholder).toBe(true);
    expect(grid[15][6].level).toBe(0);
  });

  it("assigns intensity levels by count", () => {
    const expenses = [
      ...expenseOn("2026-10-05", 1),
      ...expenseOn("2026-10-04", 2),
      ...expenseOn("2026-10-03", 4),
      ...expenseOn("2026-10-02", 7),
    ];
    const grid = buildHeatmap(expenses, 2, D(2026, 10, 5));
    const byDate = new Map(grid.flat().map((d) => [d.date, d]));
    expect(byDate.get("2026-10-05")?.level).toBe(1);
    expect(byDate.get("2026-10-04")?.level).toBe(2);
    expect(byDate.get("2026-10-03")?.level).toBe(3);
    expect(byDate.get("2026-10-02")?.level).toBe(4);
  });
});
