/**
 * Keyword-based category guessing for imported bank descriptions.
 * Bank descriptions are uppercase merchant strings ("TIM HORTONS #1234"),
 * so matching is case-insensitive substring based. First match wins —
 * rules are ordered from most specific to most general.
 */

const RULES: Array<{ categoryId: string; keywords: string[] }> = [
  {
    categoryId: "food",
    keywords: [
      "tim hortons", "mcdonald", "starbucks", "subway", "restaurant", "pizza",
      "sushi", "cafe", "coffee", "burger", "taco", "noodle", "ramen", "diner",
      "bakery", "grocery", "sobeys", "loblaws", "superstore", "walmart",
      "costco", "metro ", "foodland", "IGA ", "wholesale club", "bulk barn",
      "uber eats", "doordash", "skip the dishes", "skipdishes", "dairy queen",
      "wendy", "kfc", "a&w", "harvey", "pita", "shawarma", "pho", "thai",
    ],
  },
  {
    categoryId: "transport",
    keywords: [
      "shell", "esso", "petro", "ultramar", "irving", "circle k", "couche-tard",
      "parking", "uber", "lyft", "taxi", "transit", "maritime bus", "via rail",
      "air canada", "westjet", "porter airlines", "flair airlines", "gas",
      "car wash", "napa", "midas", "mr. lube",
    ],
  },
  {
    categoryId: "shopping",
    keywords: [
      "amazon", "dollarama", "giant tiger", "marshalls", "winners",
      "canadian tire", "home depot", "rona", "kent ", "ikea", "best buy",
      "staples", "michaels", "old navy", "h&m", "zara", "uniqlo", "sport chek",
      "mark's", "bed bath", "indigo", "chapters", "ebay", "etsy", "shein",
      "temu", "aliexpress",
    ],
  },
  {
    categoryId: "housing",
    keywords: [
      "mortgage", "rent", "property tax", "landlord", "apartment",
      "condo fee", "strata",
    ],
  },
  {
    categoryId: "utilities",
    keywords: [
      "maritime electric", "pei energy", "hydro", "electric bill", "power bill",
      "water bill", "sewer", "heating", "furnace oil", "propane",
      "natural gas", "utility",
    ],
  },
  {
    categoryId: "internet",
    keywords: [
      "bell", "rogers", "telus", "koodo", "fido", "virgin mobile", "eastlink",
      "internet", "wifi", "cable",
    ],
  },
  {
    categoryId: "insurance",
    keywords: [
      "insurance", "manulife", "sun life", "canada life", "desjardins",
      "intact", "td insurance", "rbc insurance",
    ],
  },
  {
    categoryId: "bills",
    keywords: [
      "bill payment", "pre-authorized debit", "preauthorized",
    ],
  },
  {
    categoryId: "fun",
    keywords: [
      "cineplex", "theatre", "cinema", "golf", "bowling", "arcade", "steam",
      "playstation", "xbox", "nintendo", "roblox", "concert", "ticketmaster",
      "museum", "zoo", "park", "netflix", "spotify", "disney", "prime video",
      "youtube premium", "icloud", "google one", "dropbox",
    ],
  },
  {
    categoryId: "health",
    keywords: [
      "shoppers drug", "pharmasave", "pharmacy", "dental", "dentist",
      "clinic", "hospital", "optical", "eyecare", "physio", "massage",
      "gym", "goodlife", "planet fitness",
    ],
  },
  {
    categoryId: "kids",
    keywords: [
      "toys r us", "carters", "oshkosh", "daycare", "childcare", "babysitter",
      "kids", "children's place",
    ],
  },
  {
    categoryId: "travel",
    keywords: [
      "hotel", "airbnb", "booking.com", "expedia", "airline", "flight",
    ],
  },
];

/** Guess a category id from a bank description, or null. */
export function guessCategoryId(description: string): string | null {
  const hay = ` ${description.toLowerCase()} `;
  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (hay.includes(kw)) return rule.categoryId;
    }
  }
  return null;
}
