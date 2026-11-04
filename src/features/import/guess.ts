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
    categoryId: "main-salary",
    kind: "income",
    keywords: [
      "payroll", "salary", "pay deposit", "direct dep", "direct deposit",
      "employment", "employer",
    ],
  },
  {
    categoryId: "reimbursements-refunds",
    kind: "income",
    keywords: ["refund", "reimbursement", "cashback", "rebate"],
  },
  {
    categoryId: "investments-dividends",
    kind: "income",
    keywords: ["dividend", "interest", "capital gain"],
  },
  {
    categoryId: "side-hustle",
    kind: "income",
    keywords: ["freelance", "contract payment", "fiverr", "upwork"],
  },
  // ── Expense: most specific first ────────────────────────────────────
  {
    categoryId: "coffee-brew",
    kind: "expense",
    keywords: ["tim hortons", "starbucks", "cafe", "coffee"],
  },
  {
    categoryId: "food-delivery",
    kind: "expense",
    keywords: ["uber eats", "doordash", "skip the dishes", "skipdishes"],
  },
  {
    categoryId: "dining-out",
    kind: "expense",
    keywords: [
      "mcdonald", "subway", "restaurant", "pizza", "sushi", "burger", "taco",
      "noodle", "ramen", "diner", "bakery", "dairy queen", "wendy", "kfc",
      "a&w", "harvey", "pita", "shawarma", "pho", "thai",
    ],
  },
  {
    categoryId: "groceries-fresh",
    kind: "expense",
    keywords: [
      "grocery", "sobeys", "loblaws", "superstore", "walmart", "costco",
      "metro ", "foodland", "IGA ", "wholesale club", "bulk barn",
    ],
  },
  {
    categoryId: "car-fuel",
    kind: "expense",
    keywords: [
      "shell", "esso", "petro", "ultramar", "irving", "circle k", "couche-tard",
      "gas", "car wash", "napa", "midas", "mr. lube",
    ],
  },
  {
    categoryId: "daily-commute",
    kind: "expense",
    keywords: [
      "parking", "uber", "lyft", "taxi", "transit", "maritime bus", "via rail",
    ],
  },
  {
    categoryId: "travel-getaways",
    kind: "expense",
    keywords: [
      "hotel", "airbnb", "booking.com", "expedia", "airline", "flight",
      "air canada", "westjet", "porter airlines", "flair airlines",
    ],
  },
  {
    categoryId: "apparel-style",
    kind: "expense",
    keywords: [
      "amazon", "dollarama", "giant tiger", "marshalls", "winners",
      "old navy", "h&m", "zara", "uniqlo", "sport chek",
      "mark's", "shein", "temu", "aliexpress", "ebay", "etsy",
    ],
  },
  {
    categoryId: "home-sanctuary",
    kind: "expense",
    keywords: [
      "canadian tire", "home depot", "rona", "kent ", "ikea", "bed bath",
    ],
  },
  {
    categoryId: "hobbies-passions",
    kind: "expense",
    keywords: ["michaels"],
  },
  {
    categoryId: "growth-courses",
    kind: "expense",
    keywords: ["indigo", "chapters"],
  },
  {
    categoryId: "housing-rent",
    kind: "expense",
    keywords: [
      "mortgage", "rent", "property tax", "landlord", "apartment",
      "condo fee", "strata",
    ],
  },
  {
    categoryId: "utilities-bills",
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
    categoryId: "insurance-safety",
    kind: "expense",
    keywords: [
      "insurance", "manulife", "sun life", "canada life", "desjardins",
      "intact", "td insurance", "rbc insurance",
    ],
  },
  {
    categoryId: "events-fun",
    kind: "expense",
    keywords: [
      "cineplex", "theatre", "cinema", "golf", "bowling", "arcade",
      "concert", "ticketmaster", "museum", "zoo", "park",
    ],
  },
  {
    categoryId: "hobbies-passions",
    kind: "expense",
    keywords: ["steam", "playstation", "xbox", "nintendo", "roblox"],
  },
  {
    categoryId: "subscriptions-digital",
    kind: "expense",
    keywords: [
      "netflix", "spotify", "disney", "prime video",
      "youtube premium", "icloud", "google one", "dropbox",
    ],
  },
  {
    categoryId: "health-pharmacy",
    kind: "expense",
    keywords: [
      "shoppers drug", "pharmasave", "pharmacy", "dental", "dentist",
      "clinic", "hospital", "optical", "eyecare", "physio", "massage",
    ],
  },
  {
    categoryId: "fitness-sports",
    kind: "expense",
    keywords: ["gym", "goodlife", "planet fitness"],
  },
  {
    categoryId: "kids-family",
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
