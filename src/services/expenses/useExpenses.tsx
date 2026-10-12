import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { Expense } from "@/lib/types";
import { sortExpensesByRecency } from "@/lib/categories";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import { newId } from "@/lib/utils";
import {
  ExpenseStoreError,
  getExpenseRepository,
  type ExpensePatch,
  type NewExpenseInput,
} from "./repository";
import { useToast } from "@/components/ui/Toast";
import { refreshBadges } from "@/features/gamification/awardBadges";

export type ExpensesStatus = "loading" | "ready" | "error";

export interface ExpensesState {
  status: ExpensesStatus;
  expenses: Expense[];
  error: string | null;
  pendingIds: string[];
}

export type ExpensesAction =
  | { type: "load-start" }
  | { type: "load-success"; expenses: Expense[] }
  | { type: "load-error"; message: string }
  | { type: "optimistic-add"; expense: Expense }
  | { type: "commit-add"; tempId: string; expense: Expense }
  | { type: "rollback-add"; tempId: string }
  | { type: "optimistic-update"; expense: Expense }
  | { type: "rollback-update"; expense: Expense }
  | { type: "optimistic-remove"; id: string }
  | { type: "rollback-add-back"; expense: Expense }
  | { type: "pending-add"; id: string }
  | { type: "pending-clear"; id: string };

export const EMPTY_EXPENSES_STATE: ExpensesState = {
  status: "loading",
  expenses: [],
  error: null,
  pendingIds: [],
};

export function expensesReducer(state: ExpensesState, action: ExpensesAction): ExpensesState {
  switch (action.type) {
    case "load-start":
      return { ...state, status: "loading", error: null };
    case "load-success":
      return {
        ...state,
        status: "ready",
        error: null,
        pendingIds: [],
        expenses: sortExpensesByRecency(action.expenses),
      };
    case "load-error":
      return { ...state, status: "error", error: action.message };
    case "optimistic-add":
      return {
        ...state,
        expenses: sortExpensesByRecency([action.expense, ...state.expenses]),
        pendingIds: [...state.pendingIds, action.expense.id],
      };
    case "commit-add": {
      const mapped = state.expenses.map((e) => (e.id === action.tempId ? action.expense : e));
      return {
        ...state,
        expenses: sortExpensesByRecency(mapped),
        pendingIds: state.pendingIds.filter((id) => id !== action.tempId),
      };
    }
    case "rollback-add":
      return {
        ...state,
        expenses: state.expenses.filter((e) => e.id !== action.tempId),
        pendingIds: state.pendingIds.filter((id) => id !== action.tempId),
      };
    case "optimistic-update": {
      const mapped = state.expenses.map((e) => (e.id === action.expense.id ? action.expense : e));
      return { ...state, expenses: sortExpensesByRecency(mapped) };
    }
    case "rollback-update": {
      const mapped = state.expenses.map((e) => (e.id === action.expense.id ? action.expense : e));
      return { ...state, expenses: sortExpensesByRecency(mapped) };
    }
    case "optimistic-remove":
      return { ...state, expenses: state.expenses.filter((e) => e.id !== action.id) };
    case "rollback-add-back":
      return { ...state, expenses: sortExpensesByRecency([...state.expenses, action.expense]) };
    case "pending-add":
      return state.pendingIds.includes(action.id)
        ? state
        : { ...state, pendingIds: [...state.pendingIds, action.id] };
    case "pending-clear":
      return { ...state, pendingIds: state.pendingIds.filter((id) => id !== action.id) };
  }
}

function friendlyErrorMessage(error: unknown): string {
  if (error instanceof ExpenseStoreError) return error.message;
  return "Oops \u2014 something went a little sideways.";
}

interface ExpensesContextValue extends ExpensesState {
  isPending: (id: string) => boolean;
  refresh: () => Promise<void>;
  createExpense: (input: NewExpenseInput) => Promise<Expense>;
  updateExpense: (id: string, patch: ExpensePatch) => Promise<Expense>;
  deleteExpense: (id: string) => Promise<void>;
}

const ExpensesContext = createContext<ExpensesContextValue | null>(null);


export function ExpensesProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(expensesReducer, EMPTY_EXPENSES_STATE);
  const { notify } = useToast();

  const load = useCallback(async () => {
    dispatch({ type: "load-start" });
    try {
      const repository = await getExpenseRepository();
      const expenses = await repository.list();
      dispatch({ type: "load-success", expenses });
    } catch (error) {
      dispatch({ type: "load-error", message: friendlyErrorMessage(error) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  const createExpense = useCallback(
    async (input: NewExpenseInput): Promise<Expense> => {
      const now = new Date().toISOString();
      const optimistic: Expense = {
        id: `temp-${newId()}`,
        amount: input.amount,
        currency: input.currency || DEFAULT_CURRENCY,
        categoryId: input.categoryId,
        description: input.description,
        date: input.date,
        paymentMethod: input.paymentMethod,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      };
      dispatch({ type: "optimistic-add", expense: optimistic });
      try {
        const repository = await getExpenseRepository();
        const saved = await repository.create(input);
        dispatch({ type: "commit-add", tempId: optimistic.id, expense: saved });
        // Celebrate badge unlocks immediately (first expense, streaks…).
        void refreshBadges();
        return saved;
      } catch (error) {
        dispatch({ type: "rollback-add", tempId: optimistic.id });
        notify(friendlyErrorMessage(error), "error");
        throw error;
      }
    },
    [notify]
  );

  const updateExpense = useCallback(
    async (id: string, patch: ExpensePatch): Promise<Expense> => {
      const repository = await getExpenseRepository();
      const current = await repository.get(id);
      if (!current) {
        notify("That expense is already gone.", "error");
        throw new ExpenseStoreError("not-found", "That expense is already gone.");
      }
      const optimistic: Expense = { ...current, ...patch, id: current.id, updatedAt: new Date().toISOString() };
      dispatch({ type: "optimistic-update", expense: optimistic });
      dispatch({ type: "pending-add", id });
      try {
        const saved = await repository.update(id, patch);
        dispatch({ type: "optimistic-update", expense: saved });
        return saved;
      } catch (error) {
        dispatch({ type: "rollback-update", expense: current });
        notify(friendlyErrorMessage(error), "error");
        throw error;
      } finally {
        dispatch({ type: "pending-clear", id });
      }
    },
    [notify]
  );

  const deleteExpense = useCallback(
    async (id: string): Promise<void> => {
      const repository = await getExpenseRepository();
      const current = await repository.get(id);
      if (!current) {
        notify("That expense is already gone.", "error");
        throw new ExpenseStoreError("not-found", "That expense is already gone.");
      }
      dispatch({ type: "optimistic-remove", id });
      dispatch({ type: "pending-add", id });
      try {
        await repository.remove(id);
      } catch (error) {
        dispatch({ type: "rollback-add-back", expense: current });
        notify(friendlyErrorMessage(error), "error");
        throw error;
      } finally {
        dispatch({ type: "pending-clear", id });
      }
    },
    [notify]
  );

  const value = useMemo<ExpensesContextValue>(
    () => ({
      ...state,
      isPending: (id: string) => state.pendingIds.includes(id),
      refresh,
      createExpense,
      updateExpense,
      deleteExpense,
    }),
    [state, refresh, createExpense, updateExpense, deleteExpense]
  );

  return <ExpensesContext.Provider value={value}>{children}</ExpensesContext.Provider>;
}

export function useExpenses(): ExpensesContextValue {
  const context = useContext(ExpensesContext);
  if (!context) throw new Error("useExpenses must be used inside <ExpensesProvider>.");
  return context;
}
