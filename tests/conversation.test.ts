import { describe, expect, it } from "vitest";
import type { Expense, MonthlyBudget } from "@/lib/types";
import { buildConversationContext } from "@/features/ai/conversationContext";
import { buildSuggestedQuestions } from "@/features/ai/suggestedQuestions";
import { buildConversationMessages, buildConversationRepairMessages } from "@/features/ai/conversationPrompts";
import { makeUserMessage, makeAssistantMessage } from "@/features/ai/conversationStorage";
import type { ConversationMessage } from "@/features/ai/conversationTypes";
import { MAX_LLM_HISTORY_TURNS } from "@/features/ai/conversationTypes";
import type { InsightResult } from "@/lib/aiSchema";

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

const MONTH = "2026-09";

const MOCK_RESULT: InsightResult = {
  mode: "conversation",
  tone: "playful",
  headline: "Okay, that's a serious sushi night 🍣",
  smallTalk: "Feels more like a treat than a regular dinner.",
  context: null,
  financialObservation: "Restaurant spending is up a bit this month.",
  suggestion: null,
  followUpQuestion: "Was it actually amazing?",
  confidence: 0.88,
  isFallback: false,
};

// ---------------------------------------------------------------------------
// buildConversationContext
// ---------------------------------------------------------------------------
describe("buildConversationContext", () => {
  const expense = makeExpense({ id: "e1", date: "2026-09-15", amount: 128.40, categoryId: "food", description: "Sushi" });
  const expenses = [
    expense,
    makeExpense({ id: "e2", date: "2026-09-10", amount: 45, categoryId: "food" }),
    makeExpense({ id: "e3", date: "2026-08-20", amount: 200, categoryId: "food" }),
  ];

  it("builds context with a specific active expense", () => {
    const ctx = buildConversationContext(expenses, [], "CAD", expense, MONTH);
    expect(ctx.currentExpense).not.toBeNull();
    expect(ctx.currentExpense!.amount).toBe(128.40);
    expect(ctx.currentExpense!.category).toBe("Food & Dining");
  });

  it("allows null activeExpense for general conversation", () => {
    const ctx = buildConversationContext(expenses, [], "CAD", null, MONTH);
    expect(ctx.currentExpense).toBeNull();
  });

  it("includes financial summary", () => {
    const ctx = buildConversationContext(expenses, [], "CAD", null, MONTH);
    expect(ctx.financialSummary.totalSpent).toBeGreaterThan(0);
    expect(ctx.financialSummary.topCategories.length).toBeGreaterThan(0);
  });

  it("includes budget when provided", () => {
    const budget: MonthlyBudget = {
      id: "b1", categoryId: null, amount: 1500, currency: "CAD",
      period: "monthly", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
    };
    const ctx = buildConversationContext(expenses, [budget], "CAD", null, MONTH);
    expect(ctx.financialSummary.budget).not.toBeNull();
    expect(ctx.financialSummary.budget!.limit).toBe(1500);
  });

  it("sets merchantContext to null always", () => {
    const ctx = buildConversationContext(expenses, [], "CAD", expense, MONTH);
    expect(ctx.merchantContext).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildSuggestedQuestions
// ---------------------------------------------------------------------------
describe("buildSuggestedQuestions", () => {
  const expense = makeExpense({ id: "e1", date: "2026-09-15", amount: 50, categoryId: "food" });
  const ctx = buildConversationContext([expense], [], "CAD", expense, MONTH);
  const ctxNoExpense = buildConversationContext([expense], [], "CAD", null, MONTH);

  it("returns welcome suggestions when no messages exist", () => {
    const questions = buildSuggestedQuestions(ctxNoExpense, false);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.length).toBeLessThanOrEqual(4);
  });

  it("returns food-specific questions after a food expense", () => {
    const questions = buildSuggestedQuestions(ctx, true);
    const text = questions.join(" ");
    // Should reference dining/worth/eating
    expect(text.toLowerCase()).toMatch(/worth|eating|eat/);
  });

  it("caps results at 4", () => {
    const questions = buildSuggestedQuestions(ctx, true);
    expect(questions.length).toBeLessThanOrEqual(4);
  });

  it("deduplicates suggestions", () => {
    const questions = buildSuggestedQuestions(ctx, true);
    const unique = new Set(questions);
    expect(unique.size).toBe(questions.length);
  });

  it("returns budget questions when over budget", () => {
    const budget: MonthlyBudget = {
      id: "b1", categoryId: null, amount: 10, currency: "CAD",
      period: "monthly", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
    };
    const expense2 = makeExpense({ id: "e1", date: "2026-09-15", amount: 9999, categoryId: "bills" });
    const ctxOver = buildConversationContext([expense2], [budget], "CAD", null, MONTH);
    const questions = buildSuggestedQuestions(ctxOver, true);
    const text = questions.join(" ");
    expect(text.toLowerCase()).toMatch(/budget/);
  });
});

// ---------------------------------------------------------------------------
// buildConversationMessages
// ---------------------------------------------------------------------------
describe("buildConversationMessages", () => {
  const expense = makeExpense({ id: "e1", date: "2026-09-15", amount: 50, categoryId: "food" });
  const ctx = buildConversationContext([expense], [], "CAD", expense, MONTH);

  it("returns system + user for a fresh conversation", () => {
    const messages = buildConversationMessages("How am I doing?", ctx, []);
    expect(messages[0].role).toBe("system");
    expect(messages[messages.length - 1].role).toBe("user");
  });

  it("includes the user message text", () => {
    const messages = buildConversationMessages("Was it worth it?", ctx, []);
    const userMsg = messages.find((m) => m.role === "user");
    expect(userMsg?.content).toContain("Was it worth it?");
  });

  it("includes the schema hint in the last user message", () => {
    const messages = buildConversationMessages("test", ctx, []);
    const last = messages[messages.length - 1];
    expect(last.content).toContain("headline");
    expect(last.content).toContain("confidence");
  });

  it("injects history turns for follow-ups", () => {
    const history: ConversationMessage[] = [
      makeUserMessage("First question"),
      makeAssistantMessage(MOCK_RESULT),
    ];
    const messages = buildConversationMessages("Follow-up", ctx, history);
    // Should have: system + user(first) + assistant(first) + user(follow-up)
    expect(messages.length).toBeGreaterThanOrEqual(4);
    expect(messages[2].role).toBe("assistant");
  });

  it("caps history at MAX_LLM_HISTORY_TURNS * 2 messages", () => {
    const longHistory: ConversationMessage[] = [];
    for (let i = 0; i < MAX_LLM_HISTORY_TURNS * 3; i++) {
      longHistory.push(makeUserMessage(`Message ${i}`));
      longHistory.push(makeAssistantMessage(MOCK_RESULT));
    }
    const messages = buildConversationMessages("Current", ctx, longHistory);
    // system + capped_history + current_user = at most MAX_LLM_HISTORY_TURNS*2 + 2
    const maxExpected = MAX_LLM_HISTORY_TURNS * 2 + 2;
    expect(messages.length).toBeLessThanOrEqual(maxExpected + 1);
  });

  it("schema hint only appears in the final user message of a multi-turn conversation", () => {
    const history: ConversationMessage[] = [
      makeUserMessage("First"),
      makeAssistantMessage(MOCK_RESULT),
    ];
    const messages = buildConversationMessages("Follow-up", ctx, history);
    // Only the last user message should have the schema hint
    const userMessages = messages.filter((m) => m.role === "user");
    const lastUser = userMessages[userMessages.length - 1];
    expect(lastUser.content).toContain("confidence");
    const othersHaveHint = userMessages
      .slice(0, -1)
      .some((m) => m.content.includes('"confidence"'));
    expect(othersHaveHint).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildConversationRepairMessages
// ---------------------------------------------------------------------------
describe("buildConversationRepairMessages", () => {
  const expense = makeExpense({ id: "e1", date: "2026-09-15", amount: 50, categoryId: "food" });
  const ctx = buildConversationContext([expense], [], "CAD", expense, MONTH);
  const original = buildConversationMessages("test", ctx, []);

  it("appends assistant + repair user message", () => {
    const repaired = buildConversationRepairMessages(original, "{bad json}");
    expect(repaired.length).toBe(original.length + 2);
    expect(repaired[repaired.length - 2].role).toBe("assistant");
    expect(repaired[repaired.length - 1].role).toBe("user");
  });

  it("echoes the bad response in the assistant turn", () => {
    const repaired = buildConversationRepairMessages(original, "{bad json}");
    expect(repaired[repaired.length - 2].content).toBe("{bad json}");
  });
});

// ---------------------------------------------------------------------------
// makeUserMessage / makeAssistantMessage
// ---------------------------------------------------------------------------
describe("makeUserMessage", () => {
  it("trims the text", () => {
    const msg = makeUserMessage("  hello  ");
    expect(msg.text).toBe("hello");
    expect(msg.role).toBe("user");
  });

  it("attaches expenseId when provided", () => {
    const msg = makeUserMessage("test", "expense-123");
    expect(msg.expenseId).toBe("expense-123");
  });

  it("generates a unique id", () => {
    const a = makeUserMessage("test");
    const b = makeUserMessage("test");
    expect(a.id).not.toBe(b.id);
  });
});

describe("makeAssistantMessage", () => {
  it("builds text from all non-null result fields", () => {
    const msg = makeAssistantMessage(MOCK_RESULT);
    expect(msg.text).toContain(MOCK_RESULT.headline);
    expect(msg.text).toContain(MOCK_RESULT.smallTalk!);
    expect(msg.text).toContain(MOCK_RESULT.followUpQuestion!);
  });

  it("sets role to assistant and attaches result", () => {
    const msg = makeAssistantMessage(MOCK_RESULT);
    expect(msg.role).toBe("assistant");
    expect(msg.result).toBe(MOCK_RESULT);
  });

  it("omits null fields from text", () => {
    const minimalResult: InsightResult = {
      ...MOCK_RESULT,
      smallTalk: null,
      financialObservation: null,
      suggestion: null,
      followUpQuestion: null,
    };
    const msg = makeAssistantMessage(minimalResult);
    expect(msg.text).toBe(MOCK_RESULT.headline);
  });
});

// ---------------------------------------------------------------------------
// Conversation history bounds
// ---------------------------------------------------------------------------
describe("conversation history bounds", () => {
  it("MAX_LLM_HISTORY_TURNS is a reasonable positive number", () => {
    expect(MAX_LLM_HISTORY_TURNS).toBeGreaterThan(0);
    expect(MAX_LLM_HISTORY_TURNS).toBeLessThanOrEqual(10);
  });
});
