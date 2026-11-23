import type { Expense } from "@/lib/types";
import { recordKind } from "@/lib/types";
import type { InsightContext, TrendInsightContext } from "@/lib/aiContext";
import type { InsightResult } from "@/lib/aiSchema";
import { categoryName, getCategoryById } from "@/lib/categories";
import { translate } from "@/lib/i18n";
import { money } from "@/lib/utils";

function categoryEmoji(categoryId: string | null, isIncome: boolean): string {
  return getCategoryById(categoryId)?.icon ?? (isIncome ? "💰" : "💸");
}

export function buildFallbackResponse(
  expense: Expense,
  context: InsightContext
): InsightResult {
  const isIncome = recordKind(expense) === "income";
  const catName = categoryName(expense.categoryId);
  const emoji = categoryEmoji(expense.categoryId, isIncome);
  const amount = money(expense.amount, expense.currency);
  const budget = context.financialSummary.budget;

  const catVars = { amount, category: catName, emoji };
  let headline: string;
  if (isIncome) {
    headline = translate("ai.fallbackIncomeHeadline", catVars);
  } else if (expense.amount < 10) {
    headline = translate("ai.fallbackSmallHeadline", catVars);
  } else if (expense.amount < 50) {
    headline = translate("ai.fallbackLoggedHeadline", catVars);
  } else if (expense.amount < 150) {
    headline = translate("ai.fallbackNoticeableHeadline", catVars);
  } else {
    headline = translate("ai.fallbackBiggerHeadline", catVars);
  }

  let financialObservation: string | null = null;
  if (budget?.status === "over") {
    financialObservation = translate("ai.fallbackBudgetOver");
  } else if (budget?.status === "watch") {
    financialObservation = translate("ai.fallbackBudgetWatch", { pct: budget.pct });
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
        ? translate("ai.trendPicture", {
            range: ctx.rangeLabel,
            out: money(ctx.totals.totalOut, currency),
            in: money(ctx.totals.totalIn, currency),
          })
        : translate(periodWord === "month" ? "ai.trendThinMonth" : "ai.trendThinYear", {
            range: ctx.rangeLabel,
          });
  } else {
    const up = (biggest.deltaPct ?? 0) > 0;
    const moverKey =
      periodWord === "month"
        ? up
          ? "ai.trendMoverUpMonth"
          : "ai.trendMoverDownMonth"
        : up
          ? "ai.trendMoverUpYear"
          : "ai.trendMoverDownYear";
    headline = translate(moverKey, {
      category: biggest.category,
      pct: Math.abs(biggest.deltaPct ?? 0),
      amount: money(biggest.latest, currency),
    });
  }

  let financialObservation: string | null = null;
  if (ctx.categories.length > 0) {
    financialObservation = translate(ctx.totals.net >= 0 ? "ai.trendAhead" : "ai.trendBehind", {
      net: money(Math.abs(ctx.totals.net), currency),
      range: ctx.rangeLabel,
    });
    if (ctx.overallBudget?.status === "over") {
      financialObservation += translate("ai.trendBudgetOver");
    } else if (ctx.overallBudget?.status === "watch") {
      financialObservation += translate("ai.trendBudgetWatch", { pct: ctx.overallBudget.pct });
    }
  }

  const suggestion =
    biggest && (biggest.deltaPct ?? 0) > 0 && ctx.kind === "expense"
      ? translate("ai.trendSuggestion", { category: biggest.category })
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
