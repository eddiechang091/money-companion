import {
  CATEGORY_GROUPS,
  DEFAULT_CATEGORIES,
  LEGACY_CATEGORY_MIGRATION,
  UNCATEGORIZED_LABEL,
} from "./constants";
import type { Category, CategoryGroup, Expense, RecordKind } from "./types";

export function getCategoryById(id: string | null | undefined): Category | null {
  if (!id) return null;
  return DEFAULT_CATEGORIES.find((category) => category.id === id) ?? null;
}

export function getCategoryGroup(id: string | null | undefined): CategoryGroup | null {
  if (!id) return null;
  return CATEGORY_GROUPS.find((group) => group.id === id) ?? null;
}

export function getGroupOfCategory(category: Category | null | undefined): CategoryGroup | null {
  if (!category) return null;
  return getCategoryGroup(category.groupId);
}

/** Subcategories of one kind, in group order (DEFAULT_CATEGORIES is already grouped). */
export function categoriesForKind(kind: RecordKind): Category[] {
  return DEFAULT_CATEGORIES.filter((category) => category.kind === kind);
}

/**
 * Accepts a current subcategory id, or a pre-taxonomy id (mapped via
 * LEGACY_CATEGORY_MIGRATION, e.g. "food" → "food-dining", "other" → null).
 * Anything else → null.
 */
export function normalizeCategoryId(id: unknown): string | null {
  if (typeof id !== "string" || id.trim() === "") return null;
  if (DEFAULT_CATEGORIES.some((category) => category.id === id)) return id;
  if (id in LEGACY_CATEGORY_MIGRATION) return LEGACY_CATEGORY_MIGRATION[id];
  return null;
}

/** Normalizes a stored kind value; records written before income support read as "expense". */
export function normalizeRecordKind(kind: unknown): RecordKind {
  return kind === "income" ? "income" : "expense";
}

export function categoryLabel(id: string | null | undefined): string {
  return getCategoryById(id)?.name ?? UNCATEGORIZED_LABEL;
}

export function sortExpensesByRecency(expenses: Expense[]): Expense[] {
  return [...expenses].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
}
