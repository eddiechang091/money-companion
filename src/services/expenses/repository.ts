import type { KvStore } from "@/services/anna/storage";
import { getKvStore } from "@/services/anna/storage";
import { STORAGE_KEYS, STORAGE_VERSION } from "@/lib/constants";
import { isValidIsoDate } from "@/lib/utils";
import { normalizeCategoryId, normalizeRecordKind } from "@/lib/categories";
import type { Expense } from "@/lib/types";
import {
  ExpenseStoreError,
  assertStorable,
  buildExpense,
  isExpenseRecord,
  normalizeRecord,
  notFoundError,
  readExpenseIndex,
  sanitizeNewExpense,
  serializeMutation,
  storageError,
  writeExpenseIndex,
  type ExpensePatch,
  type NewExpenseInput,
} from "./store";

export type { ExpensePatch, NewExpenseInput };
export { ExpenseStoreError };

export interface ExpenseRepository {
  list(): Promise<Expense[]>;
  get(id: string): Promise<Expense | null>;
  create(input: NewExpenseInput): Promise<Expense>;
  update(id: string, patch: ExpensePatch): Promise<Expense>;
  remove(id: string): Promise<void>;
}

async function healIndex(store: KvStore, staleIds: string[]): Promise<void> {
  if (staleIds.length === 0) return;
  const stale = new Set(staleIds);
  await serializeMutation(async () => {
    const ids = await readExpenseIndex(store);
    const cleaned = ids.filter((id) => !stale.has(id));
    if (cleaned.length !== ids.length) await writeExpenseIndex(store, cleaned);
  }).catch(() => undefined);
}

function applyPatch(current: Expense, patch: ExpensePatch): Expense {
  const merged: Expense = { ...current, kind: normalizeRecordKind(current.kind) };
  if (patch.kind !== undefined) merged.kind = normalizeRecordKind(patch.kind);
  if (patch.amount !== undefined) {
    if (!Number.isFinite(patch.amount) || patch.amount <= 0) {
      throw new ExpenseStoreError("storage", "That expense couldn't be saved. Check the amount and try again.");
    }
    merged.amount = Math.round(patch.amount * 100) / 100;
  }
  if (patch.currency !== undefined) {
    merged.currency = patch.currency.trim().toUpperCase() || current.currency;
  }
  if (patch.categoryId !== undefined) merged.categoryId = normalizeCategoryId(patch.categoryId);
  if (patch.description !== undefined) merged.description = patch.description.trim();
  if (patch.date !== undefined) {
    if (!isValidIsoDate(patch.date)) {
      throw new ExpenseStoreError("storage", "That expense couldn't be saved. Check the date and try again.");
    }
    merged.date = patch.date;
  }
  if (patch.paymentMethod !== undefined) {
    merged.paymentMethod = patch.paymentMethod.trim() ? patch.paymentMethod.trim() : undefined;
  }
  if (patch.notes !== undefined) {
    merged.notes = patch.notes.trim() ? patch.notes.trim() : undefined;
  }
  if (patch.originalAmount !== undefined) {
    merged.originalAmount = Number.isFinite(patch.originalAmount) ? patch.originalAmount : undefined;
  } else if ("originalAmount" in patch) {
    merged.originalAmount = undefined;
  }
  if (patch.originalCurrency !== undefined) {
    merged.originalCurrency = patch.originalCurrency.trim().toUpperCase() || undefined;
  } else if ("originalCurrency" in patch) {
    merged.originalCurrency = undefined;
  }
  if (patch.fxRate !== undefined) {
    merged.fxRate = Number.isFinite(patch.fxRate) && patch.fxRate > 0 ? patch.fxRate : undefined;
  } else if ("fxRate" in patch) {
    merged.fxRate = undefined;
  }
  merged.updatedAt = new Date().toISOString();
  return merged;
}

export function createExpenseRepository(store: KvStore): ExpenseRepository {
  return {
    async list(): Promise<Expense[]> {
      const ids = await readExpenseIndex(store);
      if (ids.length === 0) return [];
      const settled = await Promise.all(
        ids.map(async (id) => {
          try {
            const doc = await store.get<{ version: number; expense: unknown }>(STORAGE_KEYS.expense(id));
            const expense = (doc as { expense: unknown } | null)?.expense;
            if (!isExpenseRecord(expense)) return { id, expense: null as Expense | null };
            return { id, expense: normalizeRecord(expense) };
          } catch {
            return { id, expense: null as Expense | null };
          }
        })
      );
      const stale = settled.filter((e) => e.expense === null).map((e) => e.id);
      if (stale.length > 0) await healIndex(store, stale);
      const valid = settled.filter((e): e is { id: string; expense: Expense } => e.expense !== null);
      return valid.map((e) => e.expense);
    },
    async get(id: string): Promise<Expense | null> {
      let doc: { version: number; expense: unknown } | null;
      try {
        doc = await store.get<{ version: number; expense: unknown }>(STORAGE_KEYS.expense(id));
      } catch {
        throw storageError();
      }
      const raw = (doc as { expense: unknown } | null)?.expense;
      if (!isExpenseRecord(raw)) return null;
      return normalizeRecord(raw);
    },

    async create(input: NewExpenseInput): Promise<Expense> {
      sanitizeNewExpense(input);
      return serializeMutation(async () => {
        const expense = await buildExpense("", input);
        const doc = { version: STORAGE_VERSION, expense };
        assertStorable(doc, "expense");
        try {
          await store.set(STORAGE_KEYS.expense(expense.id), doc);
        } catch (error) {
          if (error instanceof ExpenseStoreError) throw error;
          throw storageError();
        }
        try {
          const ids = await readExpenseIndex(store);
          if (!ids.includes(expense.id)) ids.unshift(expense.id);
          await writeExpenseIndex(store, ids);
        } catch (error) {
          await store.remove(STORAGE_KEYS.expense(expense.id)).catch(() => undefined);
          if (error instanceof ExpenseStoreError) throw error;
          throw storageError();
        }
        return expense;
      });
    },

    async update(id: string, patch: ExpensePatch): Promise<Expense> {
      return serializeMutation(async () => {
        let doc: { version: number; expense: unknown } | null;
        try {
          doc = await store.get<{ version: number; expense: unknown }>(STORAGE_KEYS.expense(id));
        } catch {
          throw storageError();
        }
        const current = (doc as { expense: unknown } | null)?.expense;
        if (!isExpenseRecord(current) || current.id !== id) throw notFoundError();
        const merged = applyPatch(current, patch);
        const next = { version: STORAGE_VERSION, expense: merged };
        assertStorable(next, "expense");
        try {
          await store.set(STORAGE_KEYS.expense(id), next);
        } catch (error) {
          if (error instanceof ExpenseStoreError) throw error;
          throw storageError();
        }
        return merged;
      });
    },

    async remove(id: string): Promise<void> {
      return serializeMutation(async () => {
        let doc: { version: number; expense: unknown } | null;
        try {
          doc = await store.get<{ version: number; expense: unknown }>(STORAGE_KEYS.expense(id));
        } catch {
          throw storageError();
        }
        const current = (doc as { expense: unknown } | null)?.expense;
        if (!isExpenseRecord(current)) throw notFoundError();
        try {
          await store.remove(STORAGE_KEYS.expense(id));
        } catch {
          throw storageError();
        }
        try {
          const ids = await readExpenseIndex(store);
          const cleaned = ids.filter((entry) => entry !== id);
          if (cleaned.length !== ids.length) await writeExpenseIndex(store, cleaned);
        } catch {
          console.warn("[expenses] index cleanup deferred; list() will heal it.");
        }
      });
    },
  };
}

let cachedRepository: Promise<ExpenseRepository> | null = null;

export function getExpenseRepository(): Promise<ExpenseRepository> {
  if (cachedRepository) return cachedRepository;
  cachedRepository = getKvStore().then((store) => createExpenseRepository(store));
  return cachedRepository;
}

export function resetExpenseRepository(): void {
  cachedRepository = null;
}
