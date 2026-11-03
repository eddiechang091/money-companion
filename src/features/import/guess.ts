/**
 * Keyword-based category guessing for imported bank descriptions.
 * Bank descriptions are uppercase merchant strings ("TIM HORTONS #1234"),
 * so matching is case-insensitive substring based. First match wins —
 * rules are ordered from most specific to most general.
 *
 * Income descriptions consult only income rules (a payroll line mentioning
 * a merchant name must not land on a spending category).
 */
import type { RecordKind } from "@/lib/types";

interface GuessRule {
  categoryId: string;
  kind: RecordKind;
  keywords: string[];
}

const RULES: GuessRule[] = [
  // ── Income ──────────────────────────────────────────────────────────
  {
    categoryId: "inc-paycheck",
    kind: "income",
    keywords: [
      "payroll", "salary", "pay deposit", "direct dep", "direct deposit",
      "employment", "employer",
    ],
  },
  {
    categoryId: "inc-refunds",
    kind: "income",
    keywords: ["refund", "reimbursement", "cashback", "rebate"],
  },
  {
    categoryId: "inc-invest",
    kind: "income",
    keywords: ["dividend", "interest", "capital gain"],
  },
  {
    categoryId: "inc-side",
    kind: "income",
    keywords: ["freelance", "contract payment", "fiverr", "upwork"],
  },
  // ── Expense: most specific first ────────────────────────────────────
  {
    categoryId: "food-coffee",
    kind: "expense",
    keywords: ["tim hortons", "starbucks", "cafe", "coffee"],
  },
  {
    categoryId: "food-delivery",
    kind: "expense",
    keywords: ["uber eats", "doordash", "skip the dishes", "skipdishes"],
  },
  {
    categoryId: "food-dining",
    kind: "expense",
    keywords: [
      "mcdonald", "subway", "restaurant", "pizza", "sushi", "burger", "taco",
      "noodle", "ramen", "diner", "bakery", "dairy queen", "wendy", "kfc",
      "a&w", "harvey", "pita", "shawarma", "pho", "thai",
    ],
  },
  {
    categoryId: "nest-groceries",
    kind: "expense",
    keywords: [
      "grocery", "sobeys", "loblaws", "superstore", "walmart", "costco",
      "metro ", "foodland", "IGA ", "wholesale club", "bulk barn",
    ],
  },
  {
    categoryId: "around-car",
    kind: "expense",
    keywords: [
      "shell", "esso", "petro", "ultramar", "irving", "circle k", "couche-tard",
      "gas", "car wash", "napa", "midas", "mr. lube",
    ],
  },
  {
    categoryId: "around-commute",
    kind: "expense",
    keywords: [
      "parking", "uber", "lyft", "taxi", "transit", "maritime bus", "via rail",
    ],
  },
  {
    categoryId: "joy-vacation",
    kind: "expense",
    keywords: [
      "hotel", "airbnb", "booking.com", "expedia", "airline", "flight",
      "air canada", "westjet", "porter airlines", "flair airlines",
    ],
  },
  {
    categoryId: "life-apparel",
    kind: "expense",
    keywords: [
      "amazon", "dollarama", "giant tiger", "marshalls", "winners",
      "old navy", "h&m", "zara", "uniqlo", "sport chek",
      "mark's", "shein", "temu", "aliexpress", "ebay", "etsy",
    ],
  },
  {
    categoryId: "nest-sanctuary",
    kind: "expense",
    keywords: [
      "canadian tire", "home depot", "rona", "kent ", "ikea", "bed bath",
    ],
  },
  {
    categoryId: "life-tech",
    kind: "expense",
    keywords: ["best buy", "staples"],
  },
  {
    categoryId: "joy-hobbies",
    kind: "expense",
    keywords: ["michaels"],
  },
  {
    categoryId: "growth-learning",
    kind: "expense",
    keywords: ["indigo", "chapters"],
  },
  {
    categoryId: "nest-home",
    kind: "expense",
    keywords: [
      "mortgage", "rent", "property tax", "landlord", "apartment",
      "condo fee", "strata",
    ],
  },
  {
    categoryId: "nest-utilities",
    kind: "expense",
    keywords: [
      "maritime electric", "pei energy", "hydro", "electric bill", "power bill",
      "water bill", "sewer", "heating", "furnace oil", "propane",
      "natural gas", "utility", "bill payment", "pre-authorized debit",
      "preauthorized", "bell", "rogers", "telus", "koodo", "fido",
      "virgin mobile", "eastlink", "internet", "wifi", "cable",
    ],
  },
  {
    categoryId: "cushion-insurance",
    kind: "expense",
    keywords: [
      "insurance", "manulife", "sun life", "canada life", "desjardins",
      "intact", "td insurance", "rbc insurance",
    ],
  },
  {
    categoryId: "joy-hobbies",
    kind: "expense",
    keywords: [
      "cineplex", "theatre", "cinema", "golf", "bowling", "arcade", "steam",
      "playstation", "xbox", "nintendo", "roblox", "concert", "ticketmaster",
      "museum", "zoo", "park",
    ],
  },
  {
    categoryId: "joy-subs",
    kind: "expense",
    keywords: [
      "netflix", "spotify", "disney", "prime video",
      "youtube premium", "icloud", "google one", "dropbox",
    ],
  },
  {
    categoryId: "well-health",
    kind: "expense",
    keywords: [
      "shoppers drug", "pharmasave", "pharmacy", "dental", "dentist",
      "clinic", "hospital", "optical", "eyecare", "physio", "massage",
    ],
  },
  {
    categoryId: "well-fitness",
    kind: "expense",
    keywords: ["gym", "goodlife", "planet fitness"],
  },
  {
    categoryId: "loved-family",
    kind: "expense",
    keywords: [
      "toys r us", "carters", "oshkosh", "daycare", "childcare", "babysitter",
      "kids", "children's place",
    ],
  },
];

/** Guess a category id from a bank description, or null. */
export function guessCategoryId(
  description: string,
  kind: RecordKind = "expense"
): string | null {
  const hay = ` ${description.toLowerCase()} `;
  for (const rule of RULES) {
    if (rule.kind !== kind) continue;
    for (const kw of rule.keywords) {
      if (hay.includes(kw)) return rule.categoryId;
    }
  }
  return null;
}
