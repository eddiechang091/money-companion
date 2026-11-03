import type { Category, CategoryGroup, RecordKind } from "./types";

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

/** Two-level taxonomy: 9 expense groups + 1 income group. Subcategories share their group's color. */
export const CATEGORY_GROUPS: CategoryGroup[] = [
  { id: "nest-living", name: "Nest & Living", icon: "🏡", kind: "expense" },
  { id: "food-social", name: "Food & Social", icon: "🍲", kind: "expense" },
  { id: "getting-around", name: "Getting Around", icon: "🚗", kind: "expense" },
  { id: "wellness", name: "Wellness & Self-Care", icon: "💖", kind: "expense" },
  { id: "joy-chill", name: "Joy & Chill", icon: "🎈", kind: "expense" },
  { id: "lifestyle", name: "Lifestyle & Shopping", icon: "🛍️", kind: "expense" },
  { id: "loved-ones", name: "Loved Ones & Pets", icon: "🐾", kind: "expense" },
  { id: "growth-future", name: "Growth & Future", icon: "📚", kind: "expense" },
  { id: "cushion-duty", name: "Life Cushion & Duty", icon: "🛡️", kind: "expense" },
  { id: "income", name: "Income", icon: "💰", kind: "income" },
];

function cat(
  id: string,
  name: string,
  icon: string,
  groupId: string,
  kind: RecordKind,
  color: string
): Category {
  return { id, name, icon, color, isDefault: true, groupId, kind };
}

export const DEFAULT_CATEGORIES: Category[] = [
  // 🏡 Nest & Living
  cat("nest-home", "Home & Shelter", "🏠", "nest-living", "expense", "#5b9bff"),
  cat("nest-utilities", "Utilities & Bills", "💡", "nest-living", "expense", "#5b9bff"),
  cat("nest-groceries", "Groceries & Nourishment", "🥬", "nest-living", "expense", "#5b9bff"),
  cat("nest-sanctuary", "Home Sanctuary", "🕯️", "nest-living", "expense", "#5b9bff"),
  // 🍲 Food & Social
  cat("food-dining", "Dining Out & Treats", "🍽️", "food-social", "expense", "#ff8a5b"),
  cat("food-coffee", "Coffee & Daily Brew", "☕", "food-social", "expense", "#ff8a5b"),
  cat("food-drinks", "Drinks & Night Out", "🍸", "food-social", "expense", "#ff8a5b"),
  cat("food-delivery", "Food Delivery", "🛵", "food-social", "expense", "#ff8a5b"),
  // 🚗 Getting Around
  cat("around-commute", "Daily Commute", "🚌", "getting-around", "expense", "#f6c453"),
  cat("around-car", "Car & Upkeep", "🚗", "getting-around", "expense", "#f6c453"),
  cat("around-getaways", "Getaways & Rides", "🛣️", "getting-around", "expense", "#f6c453"),
  // 💖 Wellness & Self-Care
  cat("well-selfcare", "Self-Care & Beauty", "💅", "wellness", "expense", "#7bc96f"),
  cat("well-health", "Health & Pharmacy", "💊", "wellness", "expense", "#7bc96f"),
  cat("well-fitness", "Fitness & Movement", "🏋️", "wellness", "expense", "#7bc96f"),
  cat("well-mental", "Mental Wellness", "🧘", "wellness", "expense", "#7bc96f"),
  // 🎈 Joy & Chill
  cat("joy-hobbies", "Hobbies & Passions", "🎨", "joy-chill", "expense", "#ff7b9c"),
  cat("joy-subs", "Subscriptions & Digital", "📺", "joy-chill", "expense", "#ff7b9c"),
  cat("joy-events", "Events & Outings", "🎟️", "joy-chill", "expense", "#ff7b9c"),
  cat("joy-vacation", "Vacation & Trips", "🏖️", "joy-chill", "expense", "#ff7b9c"),
  // 🛍️ Lifestyle & Shopping
  cat("life-apparel", "Apparel & Style", "👗", "lifestyle", "expense", "#c792ea"),
  cat("life-tech", "Tech & Gadgets", "📱", "lifestyle", "expense", "#c792ea"),
  cat("life-splurges", "Little Splurges", "✨", "lifestyle", "expense", "#c792ea"),
  // 🐾 Loved Ones & Pets
  cat("loved-pets", "Pet Care & Treats", "🐾", "loved-ones", "expense", "#ff9f68"),
  cat("loved-family", "Family & Kids", "👨‍👩‍👧", "loved-ones", "expense", "#ff9f68"),
  cat("loved-gifts", "Gifts & Celebrations", "🎁", "loved-ones", "expense", "#ff9f68"),
  // 📚 Growth & Future
  cat("growth-learning", "Learning & Books", "📚", "growth-future", "expense", "#35c286"),
  cat("growth-savings", "Future Savings", "🌱", "growth-future", "expense", "#35c286"),
  cat("growth-invest", "Investments & Wealth", "📈", "growth-future", "expense", "#35c286"),
  // 🛡️ Life Cushion & Duty
  cat("cushion-insurance", "Insurance Protection", "🛡️", "cushion-duty", "expense", "#9aa3b2"),
  cat("cushion-taxes", "Taxes & Official", "🧾", "cushion-duty", "expense", "#9aa3b2"),
  cat("cushion-debt", "Debt & Loans", "💳", "cushion-duty", "expense", "#9aa3b2"),
  cat("cushion-rainy", "Rainy Day / Unexpected", "🌧️", "cushion-duty", "expense", "#9aa3b2"),
  // 💰 Income
  cat("inc-paycheck", "Main Paycheck", "💼", "income", "income", "#0e9f8a"),
  cat("inc-side", "Side Hustle", "🤝", "income", "income", "#0e9f8a"),
  cat("inc-bonus", "Bonuses & Perks", "🎉", "income", "income", "#0e9f8a"),
  cat("inc-invest", "Investments & Dividends", "💹", "income", "income", "#0e9f8a"),
  cat("inc-gifts", "Gifts & Unexpected Cash", "💌", "income", "income", "#0e9f8a"),
  cat("inc-refunds", "Reimbursements & Refunds", "↩️", "income", "income", "#0e9f8a"),
];

/** Pre-taxonomy category ids → new subcategory id (null = uncategorized). Applied on every read, so old records migrate in place without a rewrite. */
export const LEGACY_CATEGORY_MIGRATION: Record<string, string | null> = {
  food: "food-dining",
  transport: "around-commute",
  shopping: "life-apparel",
  housing: "nest-home",
  utilities: "nest-utilities",
  internet: "nest-utilities",
  insurance: "cushion-insurance",
  bills: "nest-utilities",
  fun: "joy-hobbies",
  health: "well-health",
  kids: "loved-family",
  travel: "joy-vacation",
  other: null,
};

/** Warm wording for records without a category. */
export const UNCATEGORIZED_LABEL = "Just Life Stuff";