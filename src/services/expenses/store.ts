import type { KvStore } from "@/services/anna/storage";
import { getKvStore } from "@/services/anna/storage";
import { STORAGE_KEYS, STORAGE_VERSION, DEFAULT_CURRENCY } from "@/lib/constants";
import { isValidIsoDate, newId } from "@/lib/utils";
import { normalizeCategoryId } from "@/lib/categories";
import type { Expense } from "@/lib/types";

export interface NewExpenseInput {
  amount: number;
  currency: string;
  categoryId: string | null;
  description: string;
  date: string;
  paymentMethod?: string;
  notes?: string;
  originalAmount?: number;
  originalCurrency?: string;
  fxRate?: number;
  source?: "manual" | "import";
  importKey?: string;
}

export interface ExpensePatch {
  amount?: number;
  currency?: string;
  categoryId?: string | null;
  description?: string;
  date?: string;
  paymentMethod?: string;
  notes?: string;
  originalAmount?: number;
  originalCurrency?: string;
  fxRate?: number;
  source?: "manual" | "import";
  importKey?: string;
}

export type ExpenseStoreErrorCode = "not-found" | "storage" | "too-large";

export class ExpenseStoreError extends Error {
  readonly code: ExpenseStoreErrorCode;

  constructor(code: ExpenseStoreErrorCode, message: string) {
    super(message);
    this.name = "ExpenseStoreError";
    this.code = code;
  }
}

export const MAX_VALUE_BYTES = 262144;

export function storageError(): ExpenseStoreError {
  return new ExpenseStoreError("storage", "Couldn't reach your expense storage. Please try again.");
}

export function notFoundError(): ExpenseStoreError {
  return new ExpenseStoreError("not-found", "That expense is already gone.");
}

// Serializes read-modify-write cycles on the expense index so concurrent
// creates/updates/deletes cannot interleave and lose entries.
let mutationChain: Promise<void> = Promise.resolve();

export function serializeMutation<T>(op: () => Promise<T>): Promise<T> {
  const next = mutationChain.then(op, op);
  mutationChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export function resetExpenseMutationChain(): void {
  mutationChain = Promise.resolve();
}

export function isExpenseRecord(value: unknown): value is Expense {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    record.id.length > 0 &&
    typeof record.amount === "number" &&
    Number.isFinite(record.amount) &&
    record.amount >= 0 &&
    typeof record.currency === "string" &&
    typeof record.date === "string" &&
    typeof record.description === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string"
  );
}

export function normalizeRecord(value: Expense): Expense {
  return {
    ...value,
    categoryId: normalizeCategoryId(value.categoryId),
    description: value.description.trim(),
    paymentMethod: value.paymentMethod?.trim() ? value.paymentMethod.trim() : undefined,
    notes: value.notes?.trim() ? value.notes.trim() : undefined,
  };
}

export function assertStorable(value: unknown, key: string): void {
  const payload = JSON.stringify(value);
  if (payload.length > MAX_VALUE_BYTES) {
    throw new ExpenseStoreError(
      "too-large",
      "That expense is too large to save. Try removing notes first."
    );
  }
  void key;
}

export function sanitizeNewExpense(input: NewExpenseInput): NewExpenseInput {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new ExpenseStoreError("storage", "That expense couldn't be saved. Check the amount and try again.");
  }
  if (!input.date || !isValidIsoDate(input.date)) {
    throw new ExpenseStoreError("storage", "That expense couldn't be saved. Check the date and try again.");
  }
  return {
    amount: Math.round(input.amount * 100) / 100,
    currency: (input.currency || DEFAULT_CURRENCY).trim().toUpperCase() || DEFAULT_CURRENCY,
    categoryId: normalizeCategoryId(input.categoryId),
    description: (input.description ?? "").trim(),
    date: input.date,
    paymentMethod: input.paymentMethod?.trim() ? input.paymentMethod.trim() : undefined,
    notes: input.notes?.trim() ? input.notes.trim() : undefined,
    originalAmount: input.originalAmount,
    originalCurrency: input.originalCurrency?.toUpperCase(),
    fxRate: input.fxRate,
    source: input.source === "import" ? "import" : undefined,
    importKey: input.importKey?.trim() ? input.importKey.trim() : undefined,
  };
}

export async function readExpenseIndex(store: KvStore): Promise<string[]> {
  let doc: unknown;
  try {
    doc = await store.get<{ version: number; ids: unknown }>(STORAGE_KEYS.expensesIndex);
  } catch {
    throw storageError();
  }
  if (!doc || typeof doc !== "object") return [];
  const ids = (doc as { ids: unknown }).ids;
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === "string" && id.length > 0);
}

export async function writeExpenseIndex(store: KvStore, ids: string[]): Promise<void> {
  const doc = { version: STORAGE_VERSION, ids };
  assertStorable(doc, "expenses index");
  try {
    await store.set(STORAGE_KEYS.expensesIndex, doc);
  } catch (error) {
    if (error instanceof ExpenseStoreError) throw error;
    throw storageError();
  }
}

export async function buildExpense(id: string, input: NewExpenseInput): Promise<Expense> {
  const clean = sanitizeNewExpense(input);
  const now = new Date().toISOString();
  return {
    id: id || newId(),
    amount: clean.amount,
    currency: clean.currency,
    categoryId: clean.categoryId,
    description: clean.description,
    date: clean.date,
    paymentMethod: clean.paymentMethod,
    notes: clean.notes,
    source: clean.source,
    importKey: clean.importKey,
    createdAt: now,
    updatedAt: now,
  };
}

export { getKvStore };
