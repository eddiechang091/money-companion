import { describe, expect, it } from "vitest";
import {
  EMPTY_EXPENSES_STATE,
  expensesReducer,
  type ExpensesState,
} from "@/services/expenses/useExpenses";
import type { Expense } from "@/lib/types";

function makeExpense(id: string, overrides: Partial<Expense> = {}): Expense {
  return {
    id,
    amount: 10,
    kind: "expense",
    currency: "CAD",
    categoryId: "food-dining",
    description: `Expense ${id}`,
    date: "2026-09-15",
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("expensesReducer (optimistic UI)", () => {
  it("adds optimistically then commits the saved record", () => {
    const base: ExpensesState = { ...EMPTY_EXPENSES_STATE, status: "ready" };
    const optimistic = makeExpense("temp-1");
    const afterAdd = expensesReducer(base, { type: "optimistic-add", expense: optimistic });
    expect(afterAdd.expenses.map((e) => e.id)).toContain("temp-1");

    const saved = makeExpense("real-1");
    const afterCommit = expensesReducer(afterAdd, { type: "commit-add", tempId: "temp-1", expense: saved });
    expect(afterCommit.expenses.map((e) => e.id)).toEqual(["real-1"]);
    expect(afterCommit.pendingIds).toEqual([]);
  });

  it("rolls back a failed create", () => {
    const base: ExpensesState = { ...EMPTY_EXPENSES_STATE, status: "ready" };
    const optimistic = makeExpense("temp-1");
    const afterAdd = expensesReducer(base, { type: "optimistic-add", expense: optimistic });
    const afterRollback = expensesReducer(afterAdd, { type: "rollback-add", tempId: "temp-1" });
    expect(afterRollback.expenses).toHaveLength(0);
    expect(afterRollback.pendingIds).toEqual([]);
  });

  it("applies an optimistic update and restores the snapshot on failure", () => {
    const original = makeExpense("a", { amount: 10 });
    const base: ExpensesState = { ...EMPTY_EXPENSES_STATE, status: "ready", expenses: [original] };
    const edited = { ...original, amount: 99 };
    const afterEdit = expensesReducer(base, { type: "optimistic-update", expense: edited });
    expect(afterEdit.expenses[0].amount).toBe(99);
    const afterRollback = expensesReducer(afterEdit, { type: "rollback-update", expense: original });
    expect(afterRollback.expenses[0].amount).toBe(10);
  });

  it("removes optimistically and restores on failure", () => {
    const expense = makeExpense("a");
    const base: ExpensesState = { ...EMPTY_EXPENSES_STATE, status: "ready", expenses: [expense] };
    const afterRemove = expensesReducer(base, { type: "optimistic-remove", id: "a" });
    expect(afterRemove.expenses).toHaveLength(0);
    const restored = expensesReducer(afterRemove, { type: "rollback-add-back", expense });
    expect(restored.expenses.map((e) => e.id)).toEqual(["a"]);
  });
});
