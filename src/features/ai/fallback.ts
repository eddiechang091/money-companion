import type { Expense } from "@/lib/types";
import { recordKind } from "@/lib/types";
import type { InsightContext } from "@/lib/aiContext";
import type { InsightResult } from "@/lib/aiSchema";
import { getCategoryById } from "@/lib/categories";
import { UNCATEGORIZED_LABEL } from "@/lib/constants";
import { money } from "@/lib/utils";

function categoryEmoji(categoryId: string | null, isIncome: boolean): string {
  return getCategoryById(categoryId)?.icon ?? (isIncome ? "💰" : "💸");
}

export function buildFallbackResponse(
  expense: Expense,
  context: InsightContext
): InsightResult {
  const cat = getCategoryById(expense.categoryId);
  const isIncome = recordKind(expense) === "income";
  const catName = cat?.name ?? (isIncome ? "income" : UNCATEGORIZED_LABEL);
  const emoji = categoryEmoji(expense.categoryId, isIncome);
  const amount = money(expense.amount, expense.currency);
  const budget = context.financialSummary.budget;

  let headline: string;
  if (isIncome) {
    headline = `${amount} ${catName} income — logged! ${emoji}`;
  } else if (expense.amount < 10) {
    headline = `${amount} in ${catName} ${emoji}`;
  } else if (expense.amount < 50) {
    headline = `${amount} in ${catName} — logged! ${emoji}`;
  } else if (expense.amount < 150) {
    headline = `${amount} in ${catName} — a noticeable one. Logged! ${emoji}`;
  } else {
    headline = `${amount} in ${catName} — that's a bigger expense. Logged! ${emoji}`;
  }

  let financialObservation: string | null = null;
  if (budget?.status === "over") {
    financialObservation = "Heads up — the monthly budget is over for now.";
  } else if (budget?.status === "watch") {
    financialObservation = `Budget is at ${budget.pct}% — getting close.`;
  }

  return {
    mode: "casual",
    tone: "warm",
    headline,
    smallTalk: null,
    context: null,
    financialObservation,
    suggestion: null,
    followUpQuestion: null,
    confidence: 1.0,
    isFallback: true,
  };
}
