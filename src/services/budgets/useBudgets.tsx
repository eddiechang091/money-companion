import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { MonthlyBudget } from "@/lib/types";
import { BudgetStoreError, getBudgetRepository, type BudgetInput } from "./repository";
import { useToast } from "@/components/ui/Toast";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import { refreshBadges } from "@/features/gamification/awardBadges";

export type BudgetsStatus = "loading" | "ready" | "error";

export interface BudgetsState {
  status: BudgetsStatus;
  budgets: MonthlyBudget[];
  error: string | null;
}

export type BudgetsAction =
  | { type: "load-start" }
  | { type: "load-success"; budgets: MonthlyBudget[] }
  | { type: "load-error"; message: string }
  | { type: "optimistic-upsert"; budget: MonthlyBudget }
  | { type: "optimistic-remove"; id: string }
  | { type: "rollback-restore"; snapshot: MonthlyBudget[] };

const EMPTY: BudgetsState = { status: "loading", budgets: [], error: null };

export function budgetsReducer(state: BudgetsState, action: BudgetsAction): BudgetsState {
  switch (action.type) {
    case "load-start":
      return { ...state, status: "loading", error: null };
    case "load-success":
      return { ...state, status: "ready", error: null, budgets: action.budgets };
    case "load-error":
      return { ...state, status: "error", error: action.message };
    case "optimistic-upsert": {
      const rest = state.budgets.filter(
        (b) => b.id !== action.budget.id && b.categoryId !== action.budget.categoryId
      );
      return { ...state, budgets: [...rest, action.budget] };
    }
    case "optimistic-remove":
      return { ...state, budgets: state.budgets.filter((b) => b.id !== action.id) };
    case "rollback-restore":
      return { ...state, budgets: action.snapshot };
  }
}

function friendly(error: unknown): string {
  if (error instanceof BudgetStoreError) return error.message;
  return "Oops — something went a little sideways.";
}

interface BudgetsContextValue extends BudgetsState {
  monthlyBudget: MonthlyBudget | null;
  categoryBudgets: MonthlyBudget[];
  refresh: () => Promise<void>;
  saveBudget: (input: BudgetInput) => Promise<MonthlyBudget>;
  deleteBudget: (id: string) => Promise<void>;
}

const BudgetsContext = createContext<BudgetsContextValue | null>(null);

export function BudgetsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(budgetsReducer, EMPTY);
  const { notify } = useToast();

  const load = useCallback(async () => {
    dispatch({ type: "load-start" });
    try {
      const repo = await getBudgetRepository();
      dispatch({ type: "load-success", budgets: await repo.list() });
    } catch (error) {
      dispatch({ type: "load-error", message: friendly(error) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveBudget = useCallback(
    async (input: BudgetInput): Promise<MonthlyBudget> => {
      const snapshot = state.budgets;
      const optimistic: MonthlyBudget = {
        id: snapshot.find((b) => b.categoryId === (input.categoryId ?? null))?.id ?? `temp-${Date.now()}`,
        categoryId: input.categoryId ?? null,
        amount: input.amount,
        currency: (input.currency || DEFAULT_CURRENCY).toUpperCase(),
        period: "monthly",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      dispatch({ type: "optimistic-upsert", budget: optimistic });
      try {
        const repo = await getBudgetRepository();
        const saved = await repo.upsert(input);
        dispatch({ type: "optimistic-upsert", budget: saved });
        // Refresh from storage to ensure consistency
        void load();
        // Celebrate badge unlocks immediately (goal setter…).
        void refreshBadges();
        return saved;
      } catch (error) {
        dispatch({ type: "rollback-restore", snapshot });
        notify(friendly(error), "error");
        throw error;
      }
    },
    [notify, state.budgets, load]
  );

  const deleteBudget = useCallback(
    async (id: string): Promise<void> => {
      const snapshot = state.budgets;
      dispatch({ type: "optimistic-remove", id });
      try {
        const repo = await getBudgetRepository();
        await repo.remove(id);
        // Refresh from storage to ensure consistency
        void load();
      } catch (error) {
        dispatch({ type: "rollback-restore", snapshot });
        notify(friendly(error), "error");
        throw error;
      }
    },
    [notify, state.budgets, load]
  );

  const value = useMemo<BudgetsContextValue>(() => {
    const monthlyBudget = state.budgets.find((b) => b.categoryId === null) ?? null;
    const categoryBudgets = state.budgets
      .filter((b) => b.categoryId !== null)
      .sort((a, b) => (a.categoryId ?? "").localeCompare(b.categoryId ?? ""));
    return {
      ...state,
      monthlyBudget,
      categoryBudgets,
      refresh: load,
      saveBudget,
      deleteBudget,
    };
  }, [state, load, saveBudget, deleteBudget]);

  return <BudgetsContext.Provider value={value}>{children}</BudgetsContext.Provider>;
}

export function useBudgets(): BudgetsContextValue {
  const ctx = useContext(BudgetsContext);
  if (!ctx) throw new Error("useBudgets must be used inside <BudgetsProvider>.");
  return ctx;
}
