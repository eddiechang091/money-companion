import { describe, expect, it } from "vitest";
import {
  dailyFlow,
  monthlyFlow,
  sumByKind,
  sumExpenses,
  sumIncome,
  totalsByCategory,
} from "@/lib/analytics";
import { categoryLabel, normalizeCategoryId, normalizeRecordKind } from "@/lib/categories";
import type { Expense } from "@/lib/types";

function rec(partial: Partial<Expense> & { id: string }): Expense {
  return {
    amount: 10,
    kind: "expense",
    currency: "CAD",
    categoryId: null,
    description: "Test",
    date: "2026-10-05",
    createdAt: "2026-10-05T00:00:00.000Z",
    updatedAt: "2026-10-05T00:00:00.000Z",
    ...partial,
  };
}

describe("record kind", () => {
  it("defaults missing or unknown kinds to expense", () => {
    expect(normalizeRecordKind(undefined)).toBe("expense");
    expect(normalizeRecordKind("transfer" as never)).toBe("expense");
    expect(normalizeRecordKind("income")).toBe("income");
  });

  it("migrates legacy category ids, uncategorized for other", () => {
    expect(normalizeCategoryId("food")).toBe("dining-out");
    expect(normalizeCategoryId("other")).toBeNull();
    expect(categoryLabel(null)).toBe("Others");
  });
});

describe("kind-aware totals", () => {
  const records = [
    rec({ id: "e1", amount: 100, kind: "expense", categoryId: "dining-out" }),
    rec({ id: "e2", amount: 50, kind: "expense", categoryId: "dining-out" }),
    rec({ id: "i1", amount: 2000, kind: "income", categoryId: "main-salary" }),
    rec({ id: "i2", amount: 120, kind: "income", categoryId: "reimbursements-refunds" }),
  ];

  it("sums each kind separately", () => {
    expect(sumExpenses(records)).toBe(150);
    expect(sumIncome(records)).toBe(2120);
    expect(sumByKind(records, "expense")).toBe(150);
    expect(sumByKind(records, "income")).toBe(2120);
  });

  it("totalsByCategory excludes income by default and includes it when asked", () => {
    expect(totalsByCategory(records)).toHaveLength(1);
    expect(totalsByCategory(records)[0]).toMatchObject({ categoryId: "dining-out", total: 150, count: 2 });
    const income = totalsByCategory(records, "income");
    expect(income).toHaveLength(2);
    expect(income[0]).toMatchObject({ categoryId: "main-salary", total: 2000 });
  });

  it("dailyFlow splits expense and income per day", () => {
    const flow = dailyFlow(records, "2026-10");
    const day5 = flow.find((d) => d.label === "5");
    expect(day5).toMatchObject({ expense: 150, income: 2120 });
    expect(flow.find((d) => d.label === "6")).toMatchObject({ expense: 0, income: 0 });
  });

  it("monthlyFlow splits expense and income per month", () => {
    const flow = monthlyFlow(records, "2026");
    const oct = flow.find((d) => d.label === "Oct");
    expect(oct).toMatchObject({ expense: 150, income: 2120 });
    expect(flow.find((d) => d.label === "Jan")).toMatchObject({ expense: 0, income: 0 });
  });
});
