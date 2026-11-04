/**
 * AI category suggestions for import review.
 *
 * Privacy boundary: the caller sends ONLY distinct merchant descriptions
 * (plus their money direction) — never amounts, dates, account numbers, or
 * any other row data. Suggestions are advisory: they fill in rows the local
 * keyword guesser left as Others, the user reviews every row before
 * importing, and a manual override always wins. Anything the model is unsure
 * about comes back null and stays as Others.
 *
 * The LLM call itself is injected (`complete`), so this module is pure and
 * unit-testable, and works with either line's LLM service — both expose the
 * same `{ messages, maxTokens, temperature, json }` request shape.
 */
import { categoriesForKind, getCategoryById } from "@/lib/categories";
import type { RecordKind } from "@/lib/types";

export interface SuggestItem {
  description: string;
  kind: RecordKind;
}

export interface SuggestLlmRequest {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
}

export interface SuggestLlmResult {
  text: string;
}

export type SuggestComplete = (request: SuggestLlmRequest) => Promise<SuggestLlmResult>;

/** Distinct descriptions per model call — bounds prompt and reply size. */
export const SUGGEST_BATCH_SIZE = 60;

/** Lookup key for a suggestion: direction + exact description text. */
export function suggestionKey(description: string, kind: RecordKind): string {
  return `${kind}:${description}`;
}

function taxonomyLines(kind: RecordKind): string {
  return categoriesForKind(kind)
    .map((c) => `${c.id}: ${c.name}`)
    .join("\n");
}

/** Messages for one batch. Descriptions are listed verbatim, one per line. */
export function buildSuggestMessages(items: SuggestItem[]): SuggestLlmRequest["messages"] {
  const lines = items.map((item, i) => `${i + 1}. [${item.kind}] ${item.description}`);
  return [
    {
      role: "system",
      content: [
        "You categorize bank transaction descriptions for a personal expense tracker.",
        "Reply with JSON only, in this shape:",
        '{"suggestions": [{"description": "<exact description string>", "kind": "expense" | "income", "categoryId": "<id>" | null}]}',
        "Use one of the category ids below for the matching kind, or null when the description is too vague to categorize confidently — transfers between the user's own accounts, unknown merchants, and people's names should be null.",
        "Expense categories:",
        taxonomyLines("expense"),
        "Income categories:",
        taxonomyLines("income"),
      ].join("\n"),
    },
    { role: "user", content: lines.join("\n") },
  ];
}

interface RawSuggestion {
  description?: unknown;
  kind?: unknown;
  categoryId?: unknown;
}

/** Pull the first JSON object out of model output (tolerates code fences). */
function extractJsonObject(text: string): unknown | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Validate one batch reply against the items that were sent. Returns
 * kind+description keys -> category ids. Drops anything malformed, any
 * description that was not sent, and any id that does not exist for the
 * item's kind.
 */
export function parseSuggestResponse(text: string, items: SuggestItem[]): Record<string, string> {
  const out: Record<string, string> = {};
  const parsed = extractJsonObject(text);
  if (!parsed || typeof parsed !== "object") return out;
  const list = (parsed as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(list)) return out;
  // The same description can be sent as both expense and income (e.g. a
  // merchant name appearing on both sides), so match on kind + description
  // when the reply echoes a kind; fall back to description-only when exactly
  // one item carries that description.
  const byKey = new Map(items.map((item) => [suggestionKey(item.description, item.kind), item]));
  const byDescription = new Map<string, SuggestItem>();
  const descriptionCounts = new Map<string, number>();
  for (const item of items) {
    if (!byDescription.has(item.description)) byDescription.set(item.description, item);
    descriptionCounts.set(item.description, (descriptionCounts.get(item.description) ?? 0) + 1);
  }
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const { description, kind, categoryId } = entry as RawSuggestion;
    if (typeof description !== "string") continue;
    const item =
      (kind === "expense" || kind === "income"
        ? byKey.get(suggestionKey(description, kind))
        : undefined) ??
      (descriptionCounts.get(description) === 1 ? byDescription.get(description) : undefined);
    if (!item) continue;
    if (typeof categoryId !== "string" || !categoryId) continue;
    const category = getCategoryById(categoryId);
    if (!category || category.kind !== item.kind) continue;
    const key = suggestionKey(item.description, item.kind);
    if (!(key in out)) out[key] = categoryId;
  }
  return out;
}

/**
 * Suggest categories for distinct descriptions, in batches. Dedupe is by
 * kind + exact description text. Throws when the LLM call fails — the
 * caller falls back to local guesses and tells the user.
 */
export async function suggestCategories(
  items: SuggestItem[],
  complete: SuggestComplete
): Promise<Record<string, string>> {
  const seen = new Set<string>();
  const unique: SuggestItem[] = [];
  for (const item of items) {
    const key = suggestionKey(item.description, item.kind);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  const merged: Record<string, string> = {};
  for (let i = 0; i < unique.length; i += SUGGEST_BATCH_SIZE) {
    const batch = unique.slice(i, i + SUGGEST_BATCH_SIZE);
    const result = await complete({
      messages: buildSuggestMessages(batch),
      maxTokens: 2500,
      temperature: 0,
      json: true,
    });
    Object.assign(merged, parseSuggestResponse(result.text, batch));
  }
  return merged;
}
