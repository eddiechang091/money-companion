/** Money direction of a record: money out ("expense") or money in ("income"). */
export type RecordKind = "expense" | "income";

export interface CategoryGroup {
  id: string;
  name: string;
  icon: string;
  kind: RecordKind;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
  /** Group this subcategory belongs to (see CATEGORY_GROUPS). */
  groupId: string;
  /** Which kind of record this category applies to. */
  kind: RecordKind;
}

export interface Expense {
  id: string;
  /** Money direction. Records written before income support lack this field and read as "expense". */
  kind: RecordKind;
  amount: number;
  currency: string;
  categoryId: string | null;
  description: string;
  date: string;
  paymentMethod?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  /** Original amount/currency when converted via FX (amount+currency hold converted values). */
  originalAmount?: number;
  originalCurrency?: string;
  fxRate?: number;
  /** "import" for bank-CSV imports, undefined/"manual" otherwise. */
  source?: "manual" | "import";
  /** Stable dedupe key for imports: kind|date|amount_cents|normalized description. */
  importKey?: string;
}

/** Money direction of a record, defaulting unknown/missing values to "expense". */
export function recordKind(expense: Expense): RecordKind {
  return expense.kind === "income" ? "income" : "expense";
}

export interface MonthlyBudget {
  id: string;
  categoryId: string | null;
  amount: number;
  currency: string;
  period: "monthly";
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  name: string;
  currency: string;
  preferencesVersion: number;
}

export interface AnnaStatus {
  state: "connecting" | "connected" | "standalone" | "error";
  isHosted: boolean;
  storageKind: "anna" | "local" | "unknown";
  llmAvailable: boolean;
}