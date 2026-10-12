import type { Category } from "./types";

export const APP_NAMESPACE = "expense-tracker";
export const STORAGE_VERSION = 1;
export const DEFAULT_CURRENCY = "USD"; // last-resort fallback; real default comes from user profile

export const STORAGE_KEYS = {
  profile: "profile",
  expensesIndex: "expenses:index",
  expense: (id: string) => `expenses:item:${id}`,
  categoriesIndex: "categories:index",
  budgetsIndex: "budgets:index",
  budget: (id: string) => `budgets:item:${id}`,
  conversationActive: "conversations:active",
  theme: "settings:theme",
  // Gamification — streaks, badges, daily delight
  badgesUnlocked: "gamification:badges",
  longestStreak: "gamification:longest_streak",
  dailyDelight: (dateKey: string) => `daily:delight:${dateKey}`,
} as const;

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "food", name: "Food & Dining", icon: "\uD83C\uDF5C", color: "#ff8a5b", isDefault: true },
  { id: "transport", name: "Transport", icon: "\uD83D\uDE97", color: "#5b9bff", isDefault: true },
  { id: "shopping", name: "Shopping", icon: "\uD83D\uDECD", color: "#c17bff", isDefault: true },
  { id: "housing", name: "Mortgage & Rent", icon: "\uD83C\uDFE0", color: "#e07a3f", isDefault: true },
  { id: "utilities", name: "Utilities", icon: "\uD83D\uDCA1", color: "#f5d142", isDefault: true },
  { id: "internet", name: "Internet & TV", icon: "\uD83D\uDCFA", color: "#4fd1c5", isDefault: true },
  { id: "insurance", name: "Insurance", icon: "\uD83D\uDEE1\uFE0F", color: "#6b8cff", isDefault: true },
  { id: "bills", name: "Bills", icon: "\uD83E\uDDFE", color: "#4fc3a1", isDefault: true },
  { id: "fun", name: "Fun & Games", icon: "\uD83C\uDFAE", color: "#f5b642", isDefault: true },
  { id: "health", name: "Health", icon: "\uD83D\uDC8A", color: "#ff7aa8", isDefault: true },
  { id: "kids", name: "Kids & Family", icon: "\uD83E\uDDF8", color: "#ff9ecb", isDefault: true },
  { id: "travel", name: "Travel", icon: "\u2708\uFE0F", color: "#7bc96f", isDefault: true },
  { id: "other", name: "Other", icon: "\uD83D\uDCE6", color: "#9aa3b2", isDefault: true },
];