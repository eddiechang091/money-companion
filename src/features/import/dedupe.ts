/**
 * Duplicate detection for bank CSV imports.
 * Exact match on importKey first, then a fuzzy fallback
 * (date ±1 day + same amount + similar description).
 */
import type { Expense } from "@/lib/types";
import { recordKind } from "@/lib/types";
import { importKeyOf, type NormalizedRow } from "./csv";

export type RowStatus = "new" | "duplicate";

export interface ScoredRow {
  row: NormalizedRow;
  key: string;
  status: RowStatus;
  /** Existing expense id when duplicate, for the UI tooltip. */
  matchedId?: string;
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 1)
  );
}

function similar(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const jaccard = inter / (ta.size + tb.size - inter);
  return jaccard >= 0.4;
}

function dayDiff(a: string, b: string): number {
  const ms = Math.abs(Date.parse(a) - Date.parse(b));
  return Math.round(ms / 86400000);
}

/**
 * Score imported rows against existing expenses.
 * Existing expenses may carry importKey (from a previous import) or not.
 */
export function scoreRows(rows: NormalizedRow[], existing: Expense[]): ScoredRow[] {
  const byKey = new Map<string, string>();
  for (const e of existing) {
    if (e.importKey) byKey.set(e.importKey, e.id);
  }

  return rows.map((row) => {
    // Kind-qualified key first; fall back to the legacy kind-less format so
    // rows imported before income support still dedupe.
    const kind = row.isCredit ? "income" : "expense";
    const key = importKeyOf(row.date, row.amount, row.description, kind);
    const exact = byKey.get(key) ?? byKey.get(importKeyOf(row.date, row.amount, row.description));
    if (exact) return { row, key, status: "duplicate" as const, matchedId: exact };

    for (const e of existing) {
      if (recordKind(e) !== kind) continue;
      if (Math.abs(e.amount - row.amount) > 0.005) continue;
      if (dayDiff(e.date, row.date) > 1) continue;
      if (similar(e.description, row.description)) {
        return { row, key, status: "duplicate" as const, matchedId: e.id };
      }
    }
    return { row, key, status: "new" as const };
  });
}
