/**
 * Shared field knowledge for imports: direction/type values, category-name
 * mapping (EN + ZH), and generic header aliases. Kept dependency-free so
 * both csv.ts (low-level parsing) and presets.ts can use it.
 */

/* ─── Direction / type values ──────────────────────────────────────────── */

/** Normalize a direction/type cell to expense / income / transfer. */
export function directionOf(
  value: string
): "expense" | "income" | "transfer" | null {
  const v = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (
    ["支出", "expense", "debit", "regular", "out", "paidout", "withdrawal"].includes(v)
  ) {
    return "expense";
  }
  if (["收入", "income", "credit", "in", "paidin", "deposit"].includes(v)) {
    return "income";
  }
  if (
    [
      "转账", "transfer", "internaltransfer", "internal", "报销", "还款",
      "reimbursement", "repayment",
    ].includes(v)
  ) {
    return "transfer";
  }
  return null;
}

/* ─── Category name mapping ───────────────────────────────────────────── */

const CATEGORY_ALIASES: Array<{ id: string; names: string[] }> = [
  {
    id: "insurance",
    names: [
      "insurance", "health insurance", "life insurance", "car insurance",
      "auto insurance", "home insurance", "renters insurance", "dental insurance",
      "保险", "车险", "医保", "社保", "寿险", "健康险",
    ],
  },
  {
    id: "health",
    names: [
      "health", "healthcare", "medical", "doctor", "dentist", "dental",
      "pharmacy", "drugstore", "fitness", "gym", "health care",
      "医疗", "健康", "药品", "看病", "牙科", "医院", "健身房", "运动健身", "药店",
    ],
  },
  {
    id: "housing",
    names: [
      "housing", "rent", "mortgage", "property tax", "home", "house",
      "apartment", "condo", "hoa", "property management",
      "住房", "房租", "房贷", "物业", "物业费", "房租水电",
    ],
  },
  {
    id: "utilities",
    names: [
      "utilities", "utility", "electric", "electricity", "water",
      "natural gas", "gas bill", "heating", "sewer", "trash",
      "水电", "水费", "电费", "燃气费", "燃气", "暖气", "水电燃气", "水电费",
    ],
  },
  {
    id: "internet",
    names: [
      "internet", "wifi", "cable", "tv", "phone", "mobile", "cell phone",
      "telephone", "broadband",
      "话费", "手机费", "宽带", "网费", "电话费", "通讯",
    ],
  },
  {
    id: "kids",
    names: [
      "kids", "children", "childcare", "child care", "daycare",
      "education", "school", "tuition", "toys", "baby",
      "孩子", "儿童", "教育", "学费", "培训", "幼儿园", "玩具", "育儿",
    ],
  },
  {
    id: "travel",
    names: [
      "travel", "hotel", "lodging", "flight", "flights", "airline",
      "vacation", "rental car", "airbnb",
      "旅行", "旅游", "酒店", "机票", "度假", "出差", "住宿",
    ],
  },
  {
    id: "food",
    names: [
      "food", "dining", "restaurants", "restaurant", "groceries", "grocery",
      "coffee", "cafe", "fast food", "breakfast", "lunch", "dinner",
      "snacks", "alcohol", "bars", "bakery", "supermarket",
      "餐饮", "食品", "饮食", "午餐", "晚餐", "早餐", "零食", "饮料",
      "水果", "买菜", "餐饮美食", "外卖", "小吃", "早点",
    ],
  },
  {
    id: "transport",
    names: [
      "transport", "transportation", "gas", "fuel", "gas & fuel", "auto",
      "car", "parking", "uber", "lyft", "taxi", "transit",
      "public transportation", "vehicle", "gasoline", "rideshare",
      "交通", "出行", "打车", "公交", "地铁", "加油", "停车", "汽车",
      "油费", "滴滴", "出租车", "高速", "过路费",
    ],
  },
  {
    id: "shopping",
    names: [
      "shopping", "clothing", "clothes", "electronics", "household",
      "general merchandise", "gifts", "books", "apparel", "shoes",
      "购物", "衣服", "服装", "日用品", "电子产品", "淘宝", "京东",
      "拼多多", "商场", "超市",
    ],
  },
  {
    id: "bills",
    names: [
      "bills", "bill", "bill payment", "subscriptions", "subscription",
      "fees", "taxes", "service fee",
      "账单", "缴费", "税费", "手续费", "订阅", "会员", "月费",
    ],
  },
  {
    id: "fun",
    names: [
      "fun", "entertainment", "movies", "movie", "games", "game", "sports",
      "hobbies", "hobby", "music", "concert", "streaming", "netflix",
      "spotify", "leisure",
      "娱乐", "电影", "游戏", "运动", "休闲", "演出", "视频会员",
    ],
  },
];

function matchAlias(normalized: string, alias: string): boolean {
  if (normalized === alias) return true;
  if (/[\u4e00-\u9fa5]/.test(alias)) return normalized.includes(alias);
  const esc = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${esc}\\b`).test(normalized);
}

/**
 * Map a foreign category name to one of this app's category ids.
 * Handles two-level names ("Parent:Child", "Parent/Child") by trying the
 * child part first, then the parent, then the whole string.
 * Returns null when nothing matches (caller falls back to guessing).
 */
export function mapCategoryName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const norm = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!norm) return null;
  const parts = norm.split(/[:/>]/).map((p) => p.trim()).filter(Boolean);
  // Child first, then parent, then the whole string.
  const candidates = [...parts.slice().reverse(), norm];
  for (const cand of candidates) {
    for (const { id, names } of CATEGORY_ALIASES) {
      for (const alias of names) {
        if (matchAlias(cand, alias)) return id;
      }
    }
  }
  return null;
}

/* ─── Generic header aliases (EN + ZH) ─────────────────────────────────── */

export const HEADER_ALIASES: Record<string, string[]> = {
  date: ["date", "transaction date", "posted date", "postedon", "日期", "时间", "交易日期", "记账日期"],
  description: [
    "description", "description 1", "description 2", "details", "detail",
    "memo", "payee", "merchant", "name", "narrative", "particulars",
    "商家", "备注", "说明", "摘要", "附言", "内容",
  ],
  amount: ["amount", "金额", "money", "total", "交易金额"],
  outflow: ["outflow", "debit", "withdrawal", "paid out", "支出金额", "借方"],
  inflow: ["inflow", "credit", "deposit", "paid in", "收入金额", "贷方"],
  direction: ["type", "transaction type", "direction", "kind", "类型", "交易类型", "收支类型"],
  category: ["category", "category name", "envelope", "分类", "一级分类", "类别"],
  subcategory: ["subcategory", "sub-category", "sub category", "category group", "parent category", "二级分类", "子分类", "二级类别"],
  account: ["account", "account name", "wallet", "账户", "帐户", "账户1"],
  note: ["note", "notes", "remark", "remarks", "comment", "备注", "说明", "附注"],
};

export function normalizeHeaderCell(cell: string): string {
  return cell.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

export function findAliasColumn(header: string[], role: string): number {
  const norm = header.map(normalizeHeaderCell);
  const aliases = HEADER_ALIASES[role] ?? [];
  for (const alias of aliases) {
    const idx = norm.indexOf(alias);
    if (idx >= 0) return idx;
  }
  return -1;
}
