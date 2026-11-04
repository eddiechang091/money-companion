import type { Category, RecordKind } from "./types";

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

/** Flat taxonomy: 24 expense categories + 7 income categories, each with its
 * own color. No groups — the picker, the breakdown and the change messages
 * all use the category itself. */
function cat(
  id: string,
  name: string,
  icon: string,
  kind: RecordKind,
  color: string
): Category {
  return { id, name, icon, color, isDefault: true, kind };
}

export const DEFAULT_CATEGORIES: Category[] = [
  // Expense
  cat("housing-rent", "Housing & Rent", "🏠", "expense", "#5b9bff"),
  cat("utilities-bills", "Utilities & Bills", "💡", "expense", "#ff8a5b"),
  cat("home-sanctuary", "Home Sanctuary", "🕯️", "expense", "#35c286"),
  cat("groceries-fresh", "Groceries & Fresh", "🥬", "expense", "#f6c453"),
  cat("dining-out", "Dining Out", "🍽️", "expense", "#c792ea"),
  cat("coffee-brew", "Coffee & Brew", "☕", "expense", "#ff7b9c"),
  cat("food-delivery", "Food Delivery", "🛵", "expense", "#2fbfa8"),
  cat("daily-commute", "Daily Commute", "🚌", "expense", "#4fc3ff"),
  cat("car-fuel", "Car & Fuel", "🚗", "expense", "#ef6d6d"),
  cat("travel-getaways", "Travel & Getaways", "✈️", "expense", "#7bc96f"),
  cat("health-pharmacy", "Health & Pharmacy", "💊", "expense", "#ffb347"),
  cat("selfcare-beauty", "Self-Care & Beauty", "💅", "expense", "#9aa3b2"),
  cat("fitness-sports", "Fitness & Sports", "🏋️", "expense", "#5b9bff"),
  cat("subscriptions-digital", "Subscriptions & Digital", "📺", "expense", "#ff8a5b"),
  cat("hobbies-passions", "Hobbies & Passions", "🎨", "expense", "#35c286"),
  cat("events-fun", "Events & Fun", "🎟️", "expense", "#f6c453"),
  cat("apparel-style", "Apparel & Style", "👗", "expense", "#c792ea"),
  cat("pet-care", "Pet Care & Treats", "🐾", "expense", "#ff7b9c"),
  cat("kids-family", "Kids & Family", "👨‍👩‍👧", "expense", "#2fbfa8"),
  cat("gifts-celebrations", "Gifts & Celebrations", "🎁", "expense", "#4fc3ff"),
  cat("growth-courses", "Growth & Courses", "📚", "expense", "#ef6d6d"),
  cat("insurance-safety", "Insurance & Safety", "🛡️", "expense", "#7bc96f"),
  cat("rainy-day", "Rainy Day / Unexpected", "🌧️", "expense", "#ffb347"),
  // Income — one shared green, so money in reads as green everywhere.
  cat("main-salary", "Main Salary", "💼", "income", "#0e9f8a"),
  cat("side-hustle", "Side Hustle", "🤝", "income", "#0e9f8a"),
  cat("bonuses-perks", "Bonuses & Perks", "🎉", "income", "#0e9f8a"),
  cat("investments-dividends", "Investments & Dividends", "💹", "income", "#0e9f8a"),
  cat("gifts-cash", "Gifts & Cash", "💌", "income", "#0e9f8a"),
  cat("reimbursements-refunds", "Reimbursements & Refunds", "↩️", "income", "#0e9f8a"),
];

/** Category preselected for a fresh record of each kind. */
export const DEFAULT_CATEGORY_ID: Record<RecordKind, string> = {
  expense: "groceries-fresh",
  income: "main-salary",
};

/** Retired category ids → current id (null = uncategorized). Applied on every
 * read, so old records and budgets migrate in place without a rewrite. Covers
 * the pre-taxonomy flat ids (e.g. "food") and the retired 2026-11-03 two-level
 * subcategory ids (e.g. "food-dining"). Retired ids with no equivalent in the
 * new taxonomy map to null. */
export const LEGACY_CATEGORY_MIGRATION: Record<string, string | null> = {
  food: "dining-out",
  transport: "daily-commute",
  shopping: "apparel-style",
  housing: "housing-rent",
  utilities: "utilities-bills",
  internet: "utilities-bills",
  insurance: "insurance-safety",
  bills: "utilities-bills",
  fun: "hobbies-passions",
  health: "health-pharmacy",
  kids: "kids-family",
  travel: "travel-getaways",
  other: null,
  "nest-home": "housing-rent",
  "nest-utilities": "utilities-bills",
  "nest-groceries": "groceries-fresh",
  "nest-sanctuary": "home-sanctuary",
  "food-dining": "dining-out",
  "food-coffee": "coffee-brew",
  "food-drinks": "dining-out",
  "around-commute": "daily-commute",
  "around-car": "car-fuel",
  "around-getaways": "travel-getaways",
  "well-selfcare": "selfcare-beauty",
  "well-health": "health-pharmacy",
  "well-fitness": "fitness-sports",
  "well-mental": "selfcare-beauty",
  "joy-hobbies": "hobbies-passions",
  "joy-subs": "subscriptions-digital",
  "joy-events": "events-fun",
  "joy-vacation": "travel-getaways",
  "life-apparel": "apparel-style",
  "loved-pets": "pet-care",
  "loved-family": "kids-family",
  "loved-gifts": "gifts-celebrations",
  "growth-learning": "growth-courses",
  "cushion-insurance": "insurance-safety",
  "cushion-rainy": "rainy-day",
  "inc-paycheck": "main-salary",
  "inc-side": "side-hustle",
  "inc-bonus": "bonuses-perks",
  "inc-invest": "investments-dividends",
  "inc-gifts": "gifts-cash",
  "inc-refunds": "reimbursements-refunds",
  "life-tech": null,
  "life-splurges": null,
  "growth-savings": null,
  "growth-invest": null,
  "cushion-taxes": null,
  "cushion-debt": null,
};

/** Label for records without a category. */
export const UNCATEGORIZED_LABEL = "Others";

/** Icon shown with the uncategorized label where siblings show icons (picker, chip). */
export const UNCATEGORIZED_ICON = "📦";