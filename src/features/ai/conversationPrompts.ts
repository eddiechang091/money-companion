import type { LlmMessage } from "@/services/anna/llm";
import type { InsightResult } from "@/lib/aiSchema";
import type { ConversationContext } from "./conversationContext";
import type { ConversationMessage } from "./conversationTypes";
import { MAX_LLM_HISTORY_TURNS } from "./conversationTypes";
import { SYSTEM_PROMPT } from "./prompts";

const SCHEMA_HINT = `Respond ONLY with a valid JSON object. No markdown:
{"mode":"casual|conversation|insight|coaching|purchase_reflection","tone":"playful|warm|curious|supportive","headline":"...","smallTalk":null,"context":null,"financialObservation":null,"suggestion":null,"followUpQuestion":null,"confidence":0.0}`;

function resultToText(result: InsightResult): string {
  return [
    result.headline,
    result.smallTalk,
    result.financialObservation,
    result.suggestion,
    result.followUpQuestion,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildContextSummary(ctx: ConversationContext): string {
  const parts: string[] = [];
  if (ctx.currentExpense) {
    parts.push(
      `Current expense: ${ctx.currentExpense.description || ctx.currentExpense.category} — ` +
        `${ctx.currentExpense.currency}${ctx.currentExpense.amount.toFixed(2)} on ${ctx.currentExpense.date}`
    );
  }
  const s = ctx.financialSummary;
  parts.push(`Month: ${s.month}, total spent: ${ctx.user.currency}${s.totalSpent.toFixed(2)}`);
  if (s.budget) {
    parts.push(`Budget: ${s.budget.pct}% used (${s.budget.status})`);
  }
  if (s.topCategories.length > 0) {
    const cats = s.topCategories
      .slice(0, 3)
      .map((c) => `${c.category}: ${ctx.user.currency}${c.total.toFixed(2)}`)
      .join(", ");
    parts.push(`Top spending: ${cats}`);
  }
  if (s.previousMonth) {
    const pm = s.previousMonth;
    const dir = pm.delta >= 0 ? "+" : "-";
    const pct = pm.deltaPct != null ? ` (${dir}${Math.abs(pm.deltaPct).toFixed(1)}%)` : "";
    parts.push(
      `Last month total: ${ctx.user.currency}${pm.totalSpent.toFixed(2)}, ` +
        `change vs last month: ${dir}${ctx.user.currency}${Math.abs(pm.delta).toFixed(2)}${pct}`
    );
    if (pm.topCategories.length > 0) {
      const cats = pm.topCategories
        .slice(0, 3)
        .map((c) => `${c.category}: ${ctx.user.currency}${c.total.toFixed(2)}`)
        .join(", ");
      parts.push(`Last month top spending: ${cats}`);
    }
  }
  return parts.join("\n");
}

export function buildConversationMessages(
  userMessage: string,
  ctx: ConversationContext,
  history: ConversationMessage[]
): LlmMessage[] {
  const messages: LlmMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
  const contextSummary = buildContextSummary(ctx);
  const recentHistory = history.slice(-(MAX_LLM_HISTORY_TURNS * 2));

  if (recentHistory.length === 0) {
    // Fresh conversation — include full context + message
    messages.push({
      role: "user",
      content: `Context:\n${contextSummary}\n\nUser message: ${userMessage}\n\n${SCHEMA_HINT}`,
    });
  } else {
    // Inject recent history turns, skipping any fallback/error messages so
    // stale "having trouble" text never poisons the LLM context.
    const [first, ...rest] = recentHistory;
    messages.push({
      role: "user",
      content: `Context:\n${contextSummary}\n\nUser message: ${first.text}`,
    });
    for (const msg of rest) {
      if (msg.role === "assistant") {
        if (msg.result?.isFallback) continue; // skip stored error replies
        messages.push({
          role: "assistant",
          content: msg.result ? resultToText(msg.result) : msg.text,
        });
      } else {
        messages.push({ role: "user", content: msg.text });
      }
    }
    // Current message with schema hint
    messages.push({
      role: "user",
      content: `${userMessage}\n\n${SCHEMA_HINT}`,
    });
  }

  return messages;
}

export function buildConversationRepairMessages(
  originalMessages: LlmMessage[],
  badResponse: string
): LlmMessage[] {
  return [
    ...originalMessages,
    { role: "assistant", content: badResponse },
    {
      role: "user",
      content:
        "The response above is not valid JSON or is missing the required headline field. " +
        "Please respond again with ONLY a valid JSON object — no markdown, no explanation.",
    },
  ];
}
