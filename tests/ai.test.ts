import { describe, expect, it } from "vitest";
import type { LlmService, LlmRequest } from "@/services/anna/llm";
import type { Expense, MonthlyBudget } from "@/lib/types";
import {
  parseInsightResponse,
  normalizeInsightResponse,
  INSIGHT_SCHEMA_VERSION,
} from "@/lib/aiSchema";
import { buildInsightContext } from "@/lib/aiContext";
import { buildFallbackResponse } from "@/features/ai/fallback";
import { buildInsightMessages, buildRepairMessages } from "@/features/ai/prompts";
import { createInsightService } from "@/features/ai/insight";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExpense(partial: Partial<Expense> & { id: string; date: string; amount: number }): Expense {
  return {
    currency: "CAD",
    categoryId: "food",
    description: "Test expense",
    createdAt: `${partial.date}T00:00:00.000Z`,
    updatedAt: `${partial.date}T00:00:00.000Z`,
    ...partial,
  };
}

const VALID_RESPONSE = {
  mode: "conversation" as const,
  tone: "playful" as const,
  headline: "Okay, that's a serious sushi night 🍣",
  smallTalk: "That definitely feels like a treat-night kind of dinner.",
  context: null,
  financialObservation: "Restaurant spending is above your usual month.",
  suggestion: "Keep the dinners you really love and trim lower-value ones.",
  followUpQuestion: "Was it actually amazing?",
  confidence: 0.88,
};

function mockLlm(responses: Array<string | Error>): LlmService & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  let index = 0;
  return {
    available: true,
    calls,
    async complete(req): Promise<{ text: string; raw: unknown }> {
      calls.push(req);
      const response = responses[index] ?? "";
      index += 1;
      if (response instanceof Error) throw response;
      return { text: response as string, raw: {} };
    },
  };
}

function unavailableLlm(): LlmService {
  return {
    available: false,
    async complete() {
      throw new Error("LLM unavailable");
    },
  };
}

// ---------------------------------------------------------------------------
// parseInsightResponse
// ---------------------------------------------------------------------------
describe("parseInsightResponse", () => {
  it("parses a valid JSON string", () => {
    const text = JSON.stringify(VALID_RESPONSE);
    const result = parseInsightResponse(text);
    expect(result).not.toBeNull();
    expect(result!.headline).toBe(VALID_RESPONSE.headline);
    expect(result!.mode).toBe("conversation");
    expect(result!.tone).toBe("playful");
  });

  it("returns null for an empty string", () => {
    expect(parseInsightResponse("")).toBeNull();
    expect(parseInsightResponse("   ")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseInsightResponse("{broken json")).toBeNull();
    expect(parseInsightResponse("not json at all")).toBeNull();
  });

  it("extracts JSON from markdown fences", () => {
    const text = "Sure!\n```json\n" + JSON.stringify(VALID_RESPONSE) + "\n```";
    const result = parseInsightResponse(text);
    expect(result).not.toBeNull();
    expect(result!.headline).toBe(VALID_RESPONSE.headline);
  });

  it("extracts JSON embedded in prose", () => {
    const text = "Here you go: " + JSON.stringify(VALID_RESPONSE) + " Hope that helps!";
    const result = parseInsightResponse(text);
    expect(result).not.toBeNull();
    expect(result!.headline).toBe(VALID_RESPONSE.headline);
  });

  it("returns null when headline is missing", () => {
    const noHeadline: Record<string, unknown> = Object.fromEntries(
      Object.entries(VALID_RESPONSE).filter(([k]) => k !== "headline")
    );
    expect(parseInsightResponse(JSON.stringify(noHeadline))).toBeNull();
  });

  it("returns null when headline is empty string", () => {
    expect(parseInsightResponse(JSON.stringify({ ...VALID_RESPONSE, headline: "" }))).toBeNull();
    expect(parseInsightResponse(JSON.stringify({ ...VALID_RESPONSE, headline: "   " }))).toBeNull();
  });

  it("salvages complete fields from truncated JSON", () => {
    // Production case: the model stopped mid-object and the JSON never
    // closes. The reply should still render from the complete fields
    // instead of erroring the chat.
    const truncated =
      '{\n  "mode": "conversation",\n  "tone": "playful",\n' +
      '  "headline": "Haha, I run on electricity and data, so no real meals for me!",\n' +
      '  "smallTalk": "Though if digital snacks were a thing, I\'"';
    const result = parseInsightResponse(truncated);
    expect(result).not.toBeNull();
    expect(result!.headline).toBe(
      "Haha, I run on electricity and data, so no real meals for me!"
    );
    expect(result!.mode).toBe("conversation");
    expect(result!.tone).toBe("playful");
  });

  it("returns null for truncated JSON with no complete headline", () => {
    expect(parseInsightResponse('{"mode": "conversation", "headl')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizeInsightResponse
// ---------------------------------------------------------------------------
describe("normalizeInsightResponse", () => {
  it("normalizes unknown mode to 'casual'", () => {
    const result = normalizeInsightResponse({ ...VALID_RESPONSE, mode: "unknown_mode" });
    expect(result!.mode).toBe("casual");
  });

  it("normalizes unknown tone to 'warm'", () => {
    const result = normalizeInsightResponse({ ...VALID_RESPONSE, tone: "aggressive" });
    expect(result!.tone).toBe("warm");
  });

  it("clamps confidence below 0 to 0", () => {
    const result = normalizeInsightResponse({ ...VALID_RESPONSE, confidence: -5 });
    expect(result!.confidence).toBe(0);
  });

  it("clamps confidence above 1 to 1", () => {
    const result = normalizeInsightResponse({ ...VALID_RESPONSE, confidence: 99 });
    expect(result!.confidence).toBe(1);
  });

  it("defaults confidence to 0.5 for non-finite values", () => {
    const result = normalizeInsightResponse({ ...VALID_RESPONSE, confidence: NaN });
    expect(result!.confidence).toBe(0.5);
  });

  it("trims string fields", () => {
    const result = normalizeInsightResponse({ ...VALID_RESPONSE, headline: "  hello  " });
    expect(result!.headline).toBe("hello");
  });

  it("converts blank optional strings to null", () => {
    const result = normalizeInsightResponse({
      ...VALID_RESPONSE,
      smallTalk: "   ",
      suggestion: "",
    });
    expect(result!.smallTalk).toBeNull();
    expect(result!.suggestion).toBeNull();
  });

  it("returns null for non-objects", () => {
    expect(normalizeInsightResponse(null)).toBeNull();
    expect(normalizeInsightResponse("string")).toBeNull();
    expect(normalizeInsightResponse(42)).toBeNull();
  });

  it("exports the schema version constant", () => {
    expect(typeof INSIGHT_SCHEMA_VERSION).toBe("string");
    expect(INSIGHT_SCHEMA_VERSION.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// buildInsightContext
// ---------------------------------------------------------------------------
describe("buildInsightContext", () => {
  // Pin to a fixed month so tests are time-independent
  const MONTH = "2026-09";
  const expense = makeExpense({ id: "e1", date: "2026-09-15", amount: 128.40, categoryId: "food", description: "Sushi restaurant" });
  const expenses = [
    expense,
    makeExpense({ id: "e2", date: "2026-09-10", amount: 45, categoryId: "food" }),
    makeExpense({ id: "e3", date: "2026-08-20", amount: 200, categoryId: "food" }),
  ];
  const budgets: MonthlyBudget[] = [];

  it("sets currency from the expense", () => {
    const ctx = buildInsightContext(expense, expenses, budgets, MONTH);
    expect(ctx.user.currency).toBe("CAD");
    expect(ctx.currentExpense.currency).toBe("CAD");
  });

  it("includes the current expense details", () => {
    const ctx = buildInsightContext(expense, expenses, budgets, MONTH);
    expect(ctx.currentExpense.amount).toBe(128.40);
    expect(ctx.currentExpense.category).toBe("Food");
    expect(ctx.currentExpense.description).toBe("Sushi restaurant");
  });

  it("includes top category totals for the current month", () => {
    const ctx = buildInsightContext(expense, expenses, budgets, MONTH);
    expect(ctx.financialSummary.topCategories.length).toBeGreaterThan(0);
    const food = ctx.financialSummary.topCategories.find((c) => c.category === "Food");
    expect(food).toBeDefined();
    expect(food!.total).toBeGreaterThan(0);
  });

  it("omits budget when no budgets exist", () => {
    const ctx = buildInsightContext(expense, expenses, [], MONTH);
    expect(ctx.financialSummary.budget).toBeNull();
  });

  it("includes overall budget when one exists", () => {
    const budget: MonthlyBudget = {
      id: "b1",
      categoryId: null,
      amount: 1500,
      currency: "CAD",
      period: "monthly",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    const ctx = buildInsightContext(expense, expenses, [budget], MONTH);
    expect(ctx.financialSummary.budget).not.toBeNull();
    expect(ctx.financialSummary.budget!.limit).toBe(1500);
    expect(ctx.financialSummary.budget!.status).toBe("on-track");
  });

  it("sets merchantContext to null", () => {
    const ctx = buildInsightContext(expense, expenses, budgets, MONTH);
    expect(ctx.merchantContext).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildFallbackResponse
// ---------------------------------------------------------------------------
describe("buildFallbackResponse", () => {
  const MONTH = "2026-09";
  const expense = makeExpense({ id: "e1", date: "2026-09-15", amount: 128.40, categoryId: "food" });
  const ctx = buildInsightContext(expense, [expense], [], MONTH);

  it("returns a result with isFallback: true", () => {
    const result = buildFallbackResponse(expense, ctx);
    expect(result.isFallback).toBe(true);
  });

  it("includes the amount in the headline", () => {
    const result = buildFallbackResponse(expense, ctx);
    expect(result.headline).toContain("128");
  });

  it("includes the category name", () => {
    const result = buildFallbackResponse(expense, ctx);
    expect(result.headline).toContain("Food");
  });

  it("returns mode 'casual'", () => {
    const result = buildFallbackResponse(expense, ctx);
    expect(result.mode).toBe("casual");
  });

  it("never invents followUpQuestion or suggestion", () => {
    const result = buildFallbackResponse(expense, ctx);
    expect(result.followUpQuestion).toBeNull();
    expect(result.suggestion).toBeNull();
  });

  it("includes over-budget observation when budget is exceeded", () => {
    const budget: MonthlyBudget = {
      id: "b1", categoryId: null, amount: 50, currency: "CAD",
      period: "monthly", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
    };
    const ctxWithBudget = buildInsightContext(expense, [expense], [budget], MONTH);
    const result = buildFallbackResponse(expense, ctxWithBudget);
    expect(result.financialObservation).not.toBeNull();
    expect(result.financialObservation).toMatch(/over|budget/i);
  });
});

// ---------------------------------------------------------------------------
// buildInsightMessages / buildRepairMessages
// ---------------------------------------------------------------------------
describe("buildInsightMessages", () => {
  const MONTH = "2026-09";
  const expense = makeExpense({ id: "e1", date: "2026-09-15", amount: 50, categoryId: "food" });
  const ctx = buildInsightContext(expense, [expense], [], MONTH);

  it("returns two messages: system + user", () => {
    const messages = buildInsightMessages(ctx);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
  });

  it("includes expense amount in the user message", () => {
    const messages = buildInsightMessages(ctx);
    expect(messages[1].content).toContain("50");
  });

  it("includes category in the user message", () => {
    const messages = buildInsightMessages(ctx);
    expect(messages[1].content).toContain("Food");
  });

  it("system prompt contains the JSON schema instruction", () => {
    const messages = buildInsightMessages(ctx);
    expect(messages[0].content).toContain("headline");
    expect(messages[0].content).toContain("confidence");
  });
});

describe("buildRepairMessages", () => {
  const MONTH = "2026-09";
  const expense = makeExpense({ id: "e1", date: "2026-09-15", amount: 50, categoryId: "food" });
  const ctx = buildInsightContext(expense, [expense], [], MONTH);
  const originalMessages = buildInsightMessages(ctx);

  it("appends assistant + user messages to the original", () => {
    const repaired = buildRepairMessages(originalMessages, "{bad json}");
    expect(repaired).toHaveLength(originalMessages.length + 2);
    expect(repaired[repaired.length - 2].role).toBe("assistant");
    expect(repaired[repaired.length - 1].role).toBe("user");
  });

  it("includes the bad response in the assistant turn", () => {
    const repaired = buildRepairMessages(originalMessages, "{bad json}");
    expect(repaired[repaired.length - 2].content).toBe("{bad json}");
  });
});

// ---------------------------------------------------------------------------
// InsightService (createInsightService)
// ---------------------------------------------------------------------------
describe("createInsightService", () => {
  const expense = makeExpense({ id: "e1", date: "2026-09-15", amount: 128.40, categoryId: "food", description: "Sushi" });
  const expenses = [expense];
  const budgets: MonthlyBudget[] = [];

  it("returns parsed LLM response on success", async () => {
    const llm = mockLlm([JSON.stringify(VALID_RESPONSE)]);
    const service = createInsightService(llm);
    const result = await service.getInsight(expense, expenses, budgets);
    expect(result.isFallback).toBe(false);
    expect(result.headline).toBe(VALID_RESPONSE.headline);
    expect(result.mode).toBe("conversation");
  });

  it("makes exactly one LLM call on first-attempt success", async () => {
    const llm = mockLlm([JSON.stringify(VALID_RESPONSE)]);
    const service = createInsightService(llm);
    await service.getInsight(expense, expenses, budgets);
    expect(llm.calls).toHaveLength(1);
  });

  it("retries once on malformed first response and succeeds", async () => {
    const llm = mockLlm(["{bad json}", JSON.stringify(VALID_RESPONSE)]);
    const service = createInsightService(llm);
    const result = await service.getInsight(expense, expenses, budgets);
    expect(llm.calls).toHaveLength(2);
    expect(result.isFallback).toBe(false);
    expect(result.headline).toBe(VALID_RESPONSE.headline);
  });

  it("uses deterministic fallback after two failed attempts", async () => {
    const llm = mockLlm(["{bad}", "{still bad}"]);
    const service = createInsightService(llm);
    const result = await service.getInsight(expense, expenses, budgets);
    expect(llm.calls).toHaveLength(2);
    expect(result.isFallback).toBe(true);
    expect(result.headline.length).toBeGreaterThan(0);
  });

  it("uses fallback immediately when LLM throws on first call", async () => {
    const llm = mockLlm([new Error("network error")]);
    const service = createInsightService(llm);
    const result = await service.getInsight(expense, expenses, budgets);
    expect(result.isFallback).toBe(true);
    expect(llm.calls).toHaveLength(1);
  });

  it("uses fallback when LLM is unavailable", async () => {
    const service = createInsightService(unavailableLlm());
    // unavailableLlm throws, so service falls back
    const result = await service.getInsight(expense, expenses, budgets);
    expect(result.isFallback).toBe(true);
  });

  it("fallback response does not contain invented merchant details", async () => {
    const llm = mockLlm(["{bad}", "{bad again}"]);
    const service = createInsightService(llm);
    const result = await service.getInsight(expense, expenses, budgets);
    // Sushi was the description; fallback should NOT invent taste/quality/review details
    expect(result.headline).not.toMatch(/omakase|nigiri|delicious|review/i);
    expect(result.suggestion).toBeNull();
    expect(result.followUpQuestion).toBeNull();
  });

  it("repair messages use lower temperature", async () => {
    const llm = mockLlm(["{bad json}", JSON.stringify(VALID_RESPONSE)]);
    const service = createInsightService(llm);
    await service.getInsight(expense, expenses, budgets);
    expect(llm.calls[1].temperature).toBeLessThan(llm.calls[0].temperature!);
  });

  it("both calls use json: true flag", async () => {
    const llm = mockLlm(["{bad}", JSON.stringify(VALID_RESPONSE)]);
    const service = createInsightService(llm);
    await service.getInsight(expense, expenses, budgets);
    expect(llm.calls[0].json).toBe(true);
    expect(llm.calls[1].json).toBe(true);
  });

  it("empty string response triggers retry and then fallback", async () => {
    const llm = mockLlm(["", ""]);
    const service = createInsightService(llm);
    const result = await service.getInsight(expense, expenses, budgets);
    expect(result.isFallback).toBe(true);
  });
});
