import { describe, expect, it } from "vitest";
import {
  categoriesForKind,
  categoryLabel,
  getCategoryById,
  normalizeCategoryId,
  sortExpensesByRecency,
} from "@/lib/categories";
import { CATEGORY_GROUPS, DEFAULT_CATEGORIES } from "@/lib/constants";
import type { Expense } from "@/lib/types";

function makeExpense(partial: Partial<Expense> & { id: string }): Expense {
  return {
    amount: 10,
    kind: "expense",
    currency: "CAD",
    categoryId: "food-dining",
    description: "Test",
    date: "2026-09-15",
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    ...partial,
  };
}

describe("categories", () => {
  it("resolves the two-level taxonomy: 32 expense subcategories + 6 income categories", () => {
    expect(DEFAULT_CATEGORIES).toHaveLength(38);
    expect(categoriesForKind("expense")).toHaveLength(32);
    expect(categoriesForKind("income")).toHaveLength(6);
    expect(CATEGORY_GROUPS).toHaveLength(10);
    for (const cat of DEFAULT_CATEGORIES) {
      expect(getCategoryById(cat.id)?.id).toBe(cat.id);
      expect(CATEGORY_GROUPS.some((g) => g.id === cat.groupId && g.kind === cat.kind)).toBe(true);
    }
    expect(getCategoryById("food-dining")?.name).toBe("Dining Out & Treats");
    expect(getCategoryById("inc-paycheck")?.name).toBe("Main Paycheck");
  });

  it("migrates pre-taxonomy ids on read", () => {
    expect(normalizeCategoryId("food")).toBe("food-dining");
    expect(normalizeCategoryId("transport")).toBe("around-commute");
    expect(normalizeCategoryId("shopping")).toBe("life-apparel");
    expect(normalizeCategoryId("housing")).toBe("nest-home");
    expect(normalizeCategoryId("utilities")).toBe("nest-utilities");
    expect(normalizeCategoryId("internet")).toBe("nest-utilities");
    expect(normalizeCategoryId("insurance")).toBe("cushion-insurance");
    expect(normalizeCategoryId("bills")).toBe("nest-utilities");
    expect(normalizeCategoryId("fun")).toBe("joy-hobbies");
    expect(normalizeCategoryId("health")).toBe("well-health");
    expect(normalizeCategoryId("kids")).toBe("loved-family");
    expect(normalizeCategoryId("travel")).toBe("joy-vacation");
    expect(normalizeCategoryId("other")).toBeNull();
  });

  it("normalizes unknown ids to null", () => {
    expect(normalizeCategoryId("yacht")).toBeNull();
    expect(normalizeCategoryId("")).toBeNull();
    expect(normalizeCategoryId(undefined)).toBeNull();
  });

  it("labels unknown categories as Just Life Stuff", () => {
    expect(categoryLabel("yacht")).toBe("Just Life Stuff");
    expect(categoryLabel(null)).toBe("Just Life Stuff");
  });
});

describe("sortExpensesByRecency", () => {
  it("orders newest date first", () => {
    const a = makeExpense({ id: "a", date: "2026-09-01" });
    const b = makeExpense({ id: "b", date: "2026-09-20" });
    expect(sortExpensesByRecency([a, b]).map((e) => e.id)).toEqual(["b", "a"]);
  });
});
