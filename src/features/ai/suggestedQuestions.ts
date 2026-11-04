import type { ConversationContext } from "./conversationContext";
import { getCategoryById } from "@/lib/categories";

type SuggestionSet = readonly string[];

const WELCOME_SUGGESTIONS: SuggestionSet = [
  "How am I doing this month?",
  "What am I spending the most on?",
  "Am I on track with my budget?",
];

/** Keyed by category id. Income categories get their own questions. */
const CATEGORY_SUGGESTIONS: Record<string, SuggestionSet> = {
  "dining-out": [
    "Was it worth it?",
    "How much have I spent eating out?",
    "Am I eating out more than usual?",
  ],
  "daily-commute": [
    "How much am I spending on getting around?",
    "Is this my usual amount?",
    "Am I spending more on transport than last month?",
  ],
  "apparel-style": [
    "Was this planned?",
    "How much have I spent shopping this month?",
    "Can I keep spending this month?",
  ],
  "utilities-bills": [
    "Am I on track with bills this month?",
    "Are my bills going up?",
    "What fixed costs do I have?",
  ],
  "hobbies-passions": [
    "How much fun spending am I doing?",
    "Is this my usual amount?",
    "How does this compare to last month?",
  ],
  "health-pharmacy": [
    "What's my health spending like?",
    "Is this a regular expense?",
    "How much have I spent on health?",
  ],
  "main-salary": [
    "How does this compare to last month?",
    "Is this my usual pay?",
    "Anything else coming in this month?",
  ],
};

const BUDGET_QUESTIONS: SuggestionSet = [
  "How much budget do I have left?",
  "Am I over budget?",
  "How do I get back on track?",
];

const PATTERN_QUESTIONS: SuggestionSet = [
  "What's changed in my spending?",
  "Do I have any recurring expenses?",
  "Which category went up the most?",
];

/** Normalize for comparison: lowercase, strip punctuation. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

/** Check if a candidate was already asked (exact or high word overlap). */
function wasAsked(candidate: string, asked: string[]): boolean {
  const c = norm(candidate);
  const cWords = new Set(c.split(/\s+/).filter((w) => w.length > 3));
  for (const a of asked) {
    const na = norm(a);
    if (na === c) return true;
    // High overlap: >60% of candidate's significant words appear in asked
    if (cWords.size > 0) {
      const overlap = [...cWords].filter((w) => na.includes(w)).length;
      if (overlap / cWords.size > 0.6) return true;
    }
  }
  return false;
}

import type { ConversationMessage } from "./conversationTypes";

/**
 * A follow-up only becomes a tappable suggestion if it sounds like the user
 * asking about their own money: at most 10 words, and never cat-voiced
 * ("Would you like to set up…", questions about Lucky Cat itself). This is
 * the backstop for LLM replies that ignore the prompt's follow-up rules;
 * over-long or cat-directed questions are dropped and the static lists
 * below fill the slots instead.
 */
const MAX_FOLLOW_UP_WORDS = 10;
const CAT_VOICED_PATTERN =
  /lucky\s*cat|would you like|do you want|shall i\b|want me to|can i (set|help|arrange)/i;

export function isUsableFollowUp(question: string): boolean {
  const words = question.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > MAX_FOLLOW_UP_WORDS) return false;
  return !CAT_VOICED_PATTERN.test(question);
}

/** Extract follow-up questions from the last N assistant messages. */
function recentFollowUps(messages: ConversationMessage[], n = 2): string[] {
  const followUps: string[] = [];
  for (let i = messages.length - 1; i >= 0 && followUps.length < n; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.result?.followUpQuestion) {
      const q = m.result.followUpQuestion.trim();
      if (q && isUsableFollowUp(q) && !followUps.includes(q)) followUps.push(q);
    }
  }
  return followUps;
}

export function buildSuggestedQuestions(
  ctx: ConversationContext,
  hasMessages: boolean,
  userMessages: string[] = [],
  allMessages: ConversationMessage[] = []
): string[] {
  if (!hasMessages) return [...WELCOME_SUGGESTIONS];

  const asked = userMessages.map(norm).filter(Boolean);
  const suggestions: string[] = [];
  const pushIfNew = (q: string) => {
    if (!wasAsked(q, asked) && !suggestions.includes(q)) suggestions.push(q);
  };

  // At least 2 follow-up questions based on previous AI answers
  for (const q of recentFollowUps(allMessages, 2)) pushIfNew(q);

  // Category-specific suggestions from the active expense
  const catId = ctx.currentExpense?.categoryId ?? null;
  if (catId && CATEGORY_SUGGESTIONS[catId]) {
    for (const q of CATEGORY_SUGGESTIONS[catId]) pushIfNew(q);
  }

  // Budget-based suggestions
  const budgetStatus = ctx.financialSummary.budget?.status;
  if (budgetStatus === "over" || budgetStatus === "watch") {
    for (const q of BUDGET_QUESTIONS) pushIfNew(q);
  }

  // Pattern suggestions when meaningful changes exist
  if (ctx.financialSummary.changes.length > 0) {
    for (const q of PATTERN_QUESTIONS) pushIfNew(q);
  }

  // Unexplored topics: suggest categories with spending that haven't been discussed.
  // A category counts as discussed when the user named it.
  const discussedCats = new Set<string>();
  for (const m of asked) {
    for (const key of Object.keys(CATEGORY_SUGGESTIONS)) {
      const cat = getCategoryById(key);
      const names = [cat?.name]
        .filter((n): n is string => !!n)
        .map((n) => n.toLowerCase());
      if (names.some((n) => m.includes(n))) discussedCats.add(key);
    }
  }
  for (const top of ctx.financialSummary.topCategories.slice(0, 3)) {
    const catId = top.categoryId;
    if (!catId || discussedCats.has(catId)) continue;
    if (CATEGORY_SUGGESTIONS[catId]) {
      for (const q of CATEGORY_SUGGESTIONS[catId].slice(0, 1)) pushIfNew(q);
      if (suggestions.length >= 3) break;
    }
  }

  // If nothing specific (or all asked), use generic unexplored suggestions
  if (suggestions.length === 0) {
    for (const q of [
      "How am I doing this month?",
      "What am I spending the most on?",
      "Am I on track with my budget?",
    ]) {
      pushIfNew(q);
    }
  }

  return suggestions.slice(0, 3);
}
