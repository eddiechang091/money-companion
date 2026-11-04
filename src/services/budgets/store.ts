import type { MonthlyBudget } from "@/lib/types";
import type { KvStore } from "@/services/anna/storage";
import { STORAGE_KEYS, STORAGE_VERSION } from "@/lib/constants";
import { normalizeCategoryId } from "@/lib/categories";

export type BudgetStoreErrorCode = "not-found" | "storage" | "too-large";

export class BudgetStoreError extends Error {
  readonly code: BudgetStoreErrorCode;

  constructor(code: BudgetStoreErrorCode, message: string) {
    super(message);
    this.name = "BudgetStoreError";
    this.code = code;
  }
}

export function budgetStorageError(): BudgetStoreError {
  return new BudgetStoreError("storage", "Couldn't reach your budget storage. Please try again.");
}

export function budgetNotFoundError(): BudgetStoreError {
  return new BudgetStoreError("not-found", "That budget is already gone.");
}

export interface BudgetInput {
  categoryId: string | null;
  amount: number;
  currency?: string;
}

const MAX_BUDGET_BYTES = 65536;

export function isBudgetRecord(value: unknown): value is MonthlyBudget {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    record.id.length > 0 &&
    (record.categoryId === null || typeof record.categoryId === "string") &&
    typeof record.amount === "number" &&
    Number.isFinite(record.amount) &&
    record.amount >= 0 &&
    typeof record.currency === "string" &&
    record.period === "monthly" &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string"
  );
}

export function sanitizeBudgetAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new BudgetStoreError("storage", "Pick an amount above zero for your budget.");
  }
  return Math.round(amount * 100) / 100;
}

export function assertBudgetStorable(value: unknown): void {
  if (JSON.stringify(value).length > MAX_BUDGET_BYTES) {
    throw new BudgetStoreError("too-large", "That budget couldn't be saved.");
  }
}

export function wrapBudgetDoc(budget: MonthlyBudget): { version: number; budget: MonthlyBudget } {
  return { version: STORAGE_VERSION, budget };
}

export function unwrapBudgetDoc(doc: unknown): MonthlyBudget | null {
  if (!doc || typeof doc !== "object") return null;
  const budget = (doc as { budget: unknown }).budget;
  if (!isBudgetRecord(budget)) return null;
  // Migrate retired category ids on read, same map as expenses.
  return { ...budget, categoryId: normalizeCategoryId(budget.categoryId) };
}

let budgetMutationChain: Promise<void> = Promise.resolve();

export function serializeBudgetMutation<T>(op: () => Promise<T>): Promise<T> {
  const next = budgetMutationChain.then(op, op);
  budgetMutationChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export function resetBudgetMutationChain(): void {
  budgetMutationChain = Promise.resolve();
}

export async function readBudgetIndex(store: KvStore): Promise<string[]> {
  let doc: unknown;
  try {
    doc = await store.get<{ version: number; ids: unknown }>(STORAGE_KEYS.budgetsIndex);
  } catch {
    throw budgetStorageError();
  }
  if (!doc || typeof doc !== "object") return [];
  const ids = (doc as { ids: unknown }).ids;
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === "string" && id.length > 0);
}

export async function writeBudgetIndex(store: KvStore, ids: string[]): Promise<void> {
  const doc = { version: STORAGE_VERSION, ids };
  assertBudgetStorable(doc);
  try {
    await store.set(STORAGE_KEYS.budgetsIndex, doc);
  } catch (error) {
    if (error instanceof BudgetStoreError) throw error;
    throw budgetStorageError();
  }
}
