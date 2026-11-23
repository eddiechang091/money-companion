import type { ConversationContext } from "./conversationContext";
import { categoryName, getCategoryById } from "@/lib/categories";
import { translate } from "@/lib/i18n";

type SuggestionSet = readonly string[];

function q(key: string): string {
  return translate(`ai.${key}`);
}

// Question lists are built lazily (functions, not module-level arrays)
// so they follow a language switch without a reload.
function welcomeSuggestions(): SuggestionSet {
  return [q("qWelcome1"), q("qWelcome2"), q("qWelcome3")];
}

/** Keyed by category id. Income categories get their own questions. */
const CATEGORY_QUESTION_KEYS: Record<string, readonly string[]> = {
  "dining-out": ["qDining1", "qDining2", "qDining3"],
  "daily-commute": ["qCommute1", "qCommute2", "qCommute3"],
  "apparel-style": ["qApparel1", "qApparel2", "qApparel3"],
  "utilities-bills": ["qBills1", "qBills2", "qBills3"],
  "hobbies-passions": ["qHobbies1", "qHobbies2", "qHobbies3"],
  "health-pharmacy": ["qHealth1", "qHealth2", "qHealth3"],
  "main-salary": ["qSalary1", "qSalary2", "qSalary3"],
};

function categoryQuestions(catId: string): SuggestionSet {
  return (CATEGORY_QUESTION_KEYS[catId] ?? []).map(q);
}

function budgetQuestions(): SuggestionSet {
  return [q("qBudget1"), q("qBudget2"), q("qBudget3")];
}

function patternQuestions(): SuggestionSet {
  return [q("qPattern1"), q("qPattern2"), q("qPattern3")];
}

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
  if (!hasMessages) return [...welcomeSuggestions()];

  const asked = userMessages.map(norm).filter(Boolean);
  const suggestions: string[] = [];
  const pushIfNew = (q: string) => {
    if (!wasAsked(q, asked) && !suggestions.includes(q)) suggestions.push(q);
  };

  // At least 2 follow-up questions based on previous AI answers
  for (const q of recentFollowUps(allMessages, 2)) pushIfNew(q);

  // Category-specific suggestions from the active expense
  const catId = ctx.currentExpense?.categoryId ?? null;
  if (catId && CATEGORY_QUESTION_KEYS[catId]) {
    for (const question of categoryQuestions(catId)) pushIfNew(question);
  }

  // Budget-based suggestions
  const budgetStatus = ctx.financialSummary.budget?.status;
  if (budgetStatus === "over" || budgetStatus === "watch") {
    for (const question of budgetQuestions()) pushIfNew(question);
  }

  // Pattern suggestions when meaningful changes exist
  if (ctx.financialSummary.changes.length > 0) {
    for (const question of patternQuestions()) pushIfNew(question);
  }

  // Unexplored topics: suggest categories with spending that haven't been discussed.
  // A category counts as discussed when the user named it.
  const discussedCats = new Set<string>();
  for (const m of asked) {
    for (const key of Object.keys(CATEGORY_QUESTION_KEYS)) {
      const cat = getCategoryById(key);
      const names = [categoryName(key), cat?.name]
        .filter((n): n is string => !!n)
        .map((n) => n.toLowerCase());
      if (names.some((n) => m.includes(n))) discussedCats.add(key);
    }
  }
  for (const top of ctx.financialSummary.topCategories.slice(0, 3)) {
    const catId = top.categoryId;
    if (!catId || discussedCats.has(catId)) continue;
    if (CATEGORY_QUESTION_KEYS[catId]) {
      for (const question of categoryQuestions(catId).slice(0, 1)) pushIfNew(question);
      if (suggestions.length >= 3) break;
    }
  }

  // If nothing specific (or all asked), use generic unexplored suggestions
  if (suggestions.length === 0) {
    for (const question of welcomeSuggestions()) {
      pushIfNew(question);
    }
  }

  return suggestions.slice(0, 3);
}
