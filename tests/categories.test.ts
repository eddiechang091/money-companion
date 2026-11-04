import { describe, expect, it } from "vitest";
import {
  categoriesForKind,
  categoryLabel,
  defaultCategoryIdForKind,
  getCategoryById,
  normalizeCategoryId,
  sortExpensesByRecency,
} from "@/lib/categories";
import { DEFAULT_CATEGORIES, LEGACY_CATEGORY_MIGRATION } from "@/lib/constants";
import type { Expense } from "@/lib/types";

function makeExpense(partial: Partial<Expense> & { id: string }): Expense {
  return {
    amount: 10,
    kind: "expense",
    currency: "CAD",
    categoryId: "dining-out",
    description: "Test",
    date: "2026-09-15",
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    ...partial,
  };
}

describe("categories", () => {
  it("resolves the flat taxonomy: 23 expense categories + 6 income categories", () => {
    expect(DEFAULT_CATEGORIES).toHaveLength(29);
    expect(categoriesForKind("expense")).toHaveLength(23);
    expect(categoriesForKind("income")).toHaveLength(6);
    const ids = new Set<string>();
    for (const cat of DEFAULT_CATEGORIES) {
      expect(getCategoryById(cat.id)?.id).toBe(cat.id);
      expect(ids.has(cat.id)).toBe(false);
      ids.add(cat.id);
    }
    expect(getCategoryById("dining-out")?.name).toBe("Dining Out");
    expect(getCategoryById("main-salary")?.name).toBe("Main Salary");
  });

  it("preselects a default category per kind", () => {
    expect(defaultCategoryIdForKind("expense")).toBe("groceries-fresh");
    expect(defaultCategoryIdForKind("income")).toBe("main-salary");
    expect(getCategoryById(defaultCategoryIdForKind("expense"))?.kind).toBe("expense");
    expect(getCategoryById(defaultCategoryIdForKind("income"))?.kind).toBe("income");
  });

  it("migrates every retired id on read, per the migration map", () => {
    for (const [retiredId, expected] of Object.entries(LEGACY_CATEGORY_MIGRATION)) {
      expect(normalizeCategoryId(retiredId)).toBe(expected);
    }
    // Spot checks: pre-taxonomy flat id, retired subcategory id, orphan id.
    expect(normalizeCategoryId("food")).toBe("dining-out");
    expect(normalizeCategoryId("food-dining")).toBe("dining-out");
    expect(normalizeCategoryId("cushion-taxes")).toBeNull();
    // Current ids pass through untouched.
    expect(normalizeCategoryId("food-delivery")).toBe("food-delivery");
    expect(normalizeCategoryId("dining-out")).toBe("dining-out");
  });

  it("normalizes unknown ids to null", () => {
    expect(normalizeCategoryId("yacht")).toBeNull();
    expect(normalizeCategoryId("")).toBeNull();
    expect(normalizeCategoryId(undefined)).toBeNull();
  });

  it("labels unknown categories as Others", () => {
    expect(categoryLabel("yacht")).toBe("Others");
    expect(categoryLabel(null)).toBe("Others");
  });
});

describe("sortExpensesByRecency", () => {
  it("orders newest date first", () => {
    const a = makeExpense({ id: "a", date: "2026-09-01" });
    const b = makeExpense({ id: "b", date: "2026-09-20" });
    expect(sortExpensesByRecency([a, b]).map((e) => e.id)).toEqual(["b", "a"]);
  });
});
