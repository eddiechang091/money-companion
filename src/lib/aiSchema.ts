// Versioned structured output shape for Lucky Cat insight responses.
// Bump INSIGHT_SCHEMA_VERSION when the shape changes in a breaking way.
export const INSIGHT_SCHEMA_VERSION = "1.0";

export type InsightMode =
  | "casual"
  | "conversation"
  | "insight"
  | "coaching"
  | "purchase_reflection";

export type InsightTone = "playful" | "warm" | "curious" | "supportive";

export interface InsightResponse {
  mode: InsightMode;
  tone: InsightTone;
  /** First line shown to the user — must not start with a percentage. */
  headline: string;
  smallTalk: string | null;
  context: string | null;
  financialObservation: string | null;
  suggestion: string | null;
  followUpQuestion: string | null;
  /** Model self-reported confidence 0–1. */
  confidence: number;
}

export interface InsightResult extends InsightResponse {
  isFallback: boolean;
}

const VALID_MODES = new Set<string>([
  "casual",
  "conversation",
  "insight",
  "coaching",
  "purchase_reflection",
]);
const VALID_TONES = new Set<string>(["playful", "warm", "curious", "supportive"]);

function normalizeMode(value: unknown): InsightMode {
  if (typeof value === "string" && VALID_MODES.has(value)) return value as InsightMode;
  return "casual";
}

function normalizeTone(value: unknown): InsightTone {
  if (typeof value === "string" && VALID_TONES.has(value)) return value as InsightTone;
  return "warm";
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

export function normalizeInsightResponse(raw: unknown): InsightResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const headline = normalizeOptionalString(obj.headline);
  if (!headline) return null;
  return {
    mode: normalizeMode(obj.mode),
    tone: normalizeTone(obj.tone),
    headline,
    smallTalk: normalizeOptionalString(obj.smallTalk),
    context: normalizeOptionalString(obj.context),
    financialObservation: normalizeOptionalString(obj.financialObservation),
    suggestion: normalizeOptionalString(obj.suggestion),
    followUpQuestion: normalizeOptionalString(obj.followUpQuestion),
    confidence: normalizeConfidence(obj.confidence),
  };
}

function tryExtractJson(text: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return null;
}

export function parseInsightResponse(text: string): InsightResponse | null {
  if (!text || text.trim().length === 0) return null;
  const candidates: string[] = [text];
  const extracted = tryExtractJson(text);
  if (extracted && extracted !== text) candidates.push(extracted);
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      const normalized = normalizeInsightResponse(parsed);
      if (normalized) return normalized;
    } catch {
      continue;
    }
  }
  return null;
}
