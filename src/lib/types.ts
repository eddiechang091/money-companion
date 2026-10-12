export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
}

export interface Expense {
  id: string;
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
  /** Stable dedupe key for imports: date|amount_cents|normalized description. */
  importKey?: string;
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