import type { Expense } from "@/lib/types";
import { recordKind } from "@/lib/types";
import type { InsightContext, TrendInsightContext } from "@/lib/aiContext";
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

/**
 * Local trend summary, used when Lucky Cat can't be reached. Every
 * number comes from the aggregates in the context — nothing invented,
 * wording kept soft and objective like the app's other AI copy.
 */
export function buildTrendFallbackResponse(ctx: TrendInsightContext): InsightResult {
  const currency = ctx.user.currency;
  const periodWord = ctx.granularity === "month" ? "month" : "year";
  const movers = ctx.categories.filter(
    (c) => c.deltaPct !== null && c.previous > 0 && Math.abs(c.deltaPct) > 0
  );
  const biggest = [...movers].sort(
    (a, b) => Math.abs(b.deltaPct ?? 0) - Math.abs(a.deltaPct ?? 0)
  )[0];

  let headline: string;
  if (!biggest) {
    headline =
      ctx.categories.length > 0
        ? `Here's your picture for ${ctx.rangeLabel} — ${money(ctx.totals.totalOut, currency)} out, ${money(ctx.totals.totalIn, currency)} in.`
        : `Not much to compare yet in ${ctx.rangeLabel} — give it another ${periodWord} or two.`;
  } else {
    const direction = (biggest.deltaPct ?? 0) > 0 ? "up" : "down";
    headline = `${biggest.category} is ${direction} ${Math.abs(biggest.deltaPct ?? 0)}% vs the previous ${periodWord} (${money(biggest.latest, currency)}).`;
  }

  let financialObservation: string | null = null;
  if (ctx.categories.length > 0) {
    financialObservation =
      ctx.totals.net >= 0
        ? `Overall you're ${money(ctx.totals.net, currency)} ahead across ${ctx.rangeLabel}.`
        : `Overall spending ran ${money(Math.abs(ctx.totals.net), currency)} ahead of income across ${ctx.rangeLabel}.`;
    if (ctx.overallBudget?.status === "over") {
      financialObservation +=
        " The monthly budget is over for the latest month — one month doesn't define the trend.";
    } else if (ctx.overallBudget?.status === "watch") {
      financialObservation += ` The monthly budget is at ${ctx.overallBudget.pct}% for the latest month.`;
    }
  }

  const suggestion =
    biggest && (biggest.deltaPct ?? 0) > 0 && ctx.kind === "expense"
      ? `If ${biggest.category} keeps climbing, a small cap next month could help — no pressure, just a nudge.`
      : null;

  return {
    mode: "insight",
    tone: "warm",
    headline,
    smallTalk: null,
    context: null,
    financialObservation,
    suggestion,
    followUpQuestion: null,
    confidence: 1.0,
    isFallback: true,
  };
}
