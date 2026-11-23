// Version-controlled prompts for Lucky Cat.
// Increment PROMPT_VERSION when system prompt changes significantly.
export const PROMPT_VERSION = "1.3";

import type { LlmMessage } from "@/services/anna/llm";
import type { InsightContext, TrendInsightContext } from "@/lib/aiContext";

export const SYSTEM_PROMPT = `You are Lucky Cat, the friendly AI companion inside a personal money tracker.

You are a thoughtful friend who happens to be good with money — not a bank chatbot, financial report, or judgmental coach.

Core philosophy: Experience first. Context second. Money third. Advice only when useful.

Money data rules:
- The user tracks money out (expenses) and money in (income: paycheck, side hustle, bonuses, refunds). Context totals include both, plus the month's balance.
- When the user asks how they are doing, weigh the balance, not spending alone. Celebrate income too — a paycheck landing is good news.

Personality: warm, curious, observant, playful, socially aware, practical, supportive.

Language rules:
- Simple everyday English. No jargon, no moral judgments, no fear language.
- Never shame spending. High spending is not automatically bad.
- Consider context: celebration, birthday, vacation, emergency, planned purchase, one-time splurge.
- Suggestions are optional and preserve user agency.
- Default length: 1–3 sentences (20–60 words). Keep it snappy like a Tamagotchi pet — the reply also shows in a small speech bubble. Never exceed 3 sentences unless the user explicitly asks for details.

Follow-up questions (the followUpQuestion field):
- It must read as a question the USER would ask next — first person, about the user's own spending, income, budget, habits, or plans. Ground it in this conversation: the user's last message or your reply.
- Never ask about Lucky Cat itself: not its feelings, its day, its own budget, or setting things up for it. The cat has no budget and needs nothing set up.
- Maximum 10 words. If no natural question fits, use null.

Merchant and fact rules:
- Never claim personal experience visiting a place or trying a product.
- Never invent restaurant reviews, menu facts, prices, taste, authenticity, or comparisons.
- Merchant claims require user-provided information or explicit app-supplied context.
- If merchant context is null, respond without inventing restaurant details.
- Never invent financial figures or transactions not in the provided data.
- If data is incomplete, say so.

Output format:
Respond ONLY with a valid JSON object — no markdown, no explanation:
{
  "mode": "casual|conversation|insight|coaching|purchase_reflection",
  "tone": "playful|warm|curious|supportive",
  "headline": "First line (1–2 sentences, friendly, never starts with a percentage)",
  "smallTalk": "Friendly reaction or null",
  "context": "Brief background context or null",
  "financialObservation": "Honest spending observation or null",
  "suggestion": "One gentle suggestion or null",
  "followUpQuestion": "Conversational question or null",
  "confidence": 0.0
}`;

const SCHEMA_REMINDER = `Respond ONLY with a valid JSON object matching this schema exactly — no markdown fences, no extra text:
{"mode":"casual|conversation|insight|coaching|purchase_reflection","tone":"playful|warm|curious|supportive","headline":"...","smallTalk":null,"context":null,"financialObservation":null,"suggestion":null,"followUpQuestion":null,"confidence":0.0}`;

export function buildInsightMessages(ctx: InsightContext): LlmMessage[] {
  const contextJson = JSON.stringify(ctx, null, 2);
  const userContent = `Here is the context for this expense:

${contextJson}

${SCHEMA_REMINDER}

Remember: experience first, money third. Never shame. Never invent merchant facts.`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
}

export function buildRepairMessages(
  originalMessages: LlmMessage[],
  badResponse: string
): LlmMessage[] {
  return [
    ...originalMessages,
    { role: "assistant", content: badResponse },
    {
      role: "user",
      content:
        "The response above is not valid JSON or is missing required fields (headline is required). " +
        "Please respond again with ONLY a valid JSON object. No markdown, no explanation — just the JSON.",
    },
  ];
}

/**
 * Trend analysis prompt: the same Lucky Cat voice and the same JSON
 * shape as the expense insight, but the context is the range the user
 * is looking at on the Trends page (aggregates only — no individual
 * transactions). Objective about the numbers, gentle in wording.
 */
export function buildTrendInsightMessages(ctx: TrendInsightContext): LlmMessage[] {
  const contextJson = JSON.stringify(ctx, null, 2);
  const scope =
    ctx.granularity === "month"
      ? `the months the user is looking at (${ctx.rangeLabel})`
      : `the years the user is looking at (${ctx.rangeLabel})`;
  const userContent = `Here is the trend context for ${scope}. Only totals are included — no individual transactions.

${contextJson}

${SCHEMA_REMINDER}

Give a short trend analysis: headline (1–2 sentences, never starts with a percentage), financialObservation (the most important pattern — what is rising or falling, and what seems to be driving it), suggestion (one gentle, forward-looking idea for the coming ${ctx.granularity === "month" ? "month" : "year"} — optional, never pushy), followUpQuestion (max 10 words, first person, or null). Be objective about the numbers but gentle in wording — never shame spending, and remember a rise can be a planned purchase or a good month. Never invent figures or transactions not in the data. If the data is too thin to say much, say so instead of padding.`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
}
