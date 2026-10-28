import { useState } from "react";
import { useExpenses } from "@/services/expenses/useExpenses";
import { useBudgets } from "@/services/budgets/useBudgets";
import { useGamification } from "@/features/gamification/useGamification";
import { CatLauncher } from "./CatLauncher";
import { CatCompanionModal } from "./CatCompanionModal";

/**
 * Lucky Cat is always visible, on every page — no expense required.
 * Mounted once at the App root (inside CatProvider, next to BadgeHost).
 */
export function CatCompanionHost() {
  const [catOpen, setCatOpen] = useState(false);
  const { expenses } = useExpenses();
  const { budgets } = useBudgets();
  const { streak } = useGamification(expenses, budgets.length);
  return (
    <>
      <CatLauncher onOpen={() => setCatOpen(true)} />
      <CatCompanionModal
        open={catOpen}
        onClose={() => setCatOpen(false)}
        expenseStats={{
          streakDays: streak.current,
          longestStreak: streak.longest,
          totalExpenses: expenses.length,
        }}
      />
    </>
  );
}
