/**
 * Shared field knowledge for imports: direction/type values, category-name
 * mapping (EN + ZH), and generic header aliases. Kept dependency-free so
 * both csv.ts (low-level parsing) and presets.ts can use it.
 */

import type { RecordKind } from "@/lib/types";

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


/**
 * Foreign category names → this app's category ids, split by kind.
 * Expense aliases and income aliases are disjoint: an income row consults
 * only income aliases, so "gift" on an expense row and "gift" on an income
 * row land in different places. `mapCategoryName` defaults to expense for
 * callers that don't know the row's direction (e.g. Wealthsimple hints).
 */
const CATEGORY_ALIASES: Array<{ id: string; kind: RecordKind; names: string[] }> = [
  // ── Income ──────────────────────────────────────────────────────────
  {
    id: "main-salary",
    kind: "income",
    names: [
      "salary", "paycheck", "payroll", "wages", "wage", "pay", "income", "main salary",
      "工资", "薪水", "薪资", "收入",
    ],
  },
  {
    id: "side-hustle",
    kind: "income",
    names: [
      "freelance", "side hustle", "consulting", "gig", "contract payment",
      "兼职", "副业", "自由职业",
    ],
  },
  {
    id: "bonuses-perks",
    kind: "income",
    names: ["bonus", "commission", "tips", "allowance", "subsidy", "奖金", "提成", "绩效", "补贴", "津贴"],
  },
  {
    id: "investments-dividends",
    kind: "income",
    names: [
      "dividend", "dividends", "interest", "capital gains", "股息", "分红", "利息", "收益",
    ],
  },
  {
    id: "gifts-cash",
    kind: "income",
    names: ["cash gift", "gift money", "red packet", "hongbao", "红包", "压岁钱"],
  },
  {
    id: "reimbursements-refunds",
    kind: "income",
    names: [
      "refund", "reimbursement", "cashback", "rebate", "退款", "报销", "返现", "退税",
    ],
  },
  // ── Expense ─────────────────────────────────────────────────────────
  {
    id: "insurance-safety",
    kind: "expense",
    names: [
      "insurance", "health insurance", "life insurance", "car insurance",
      "auto insurance", "home insurance", "renters insurance", "dental insurance",
      "保险", "车险", "医保", "社保", "寿险", "健康险",
    ],
  },
  {
    id: "health-pharmacy",
    kind: "expense",
    names: [
      "health", "healthcare", "medical", "doctor", "dentist", "dental",
      "pharmacy", "drugstore", "health care",
      "医疗", "健康", "药品", "看病", "牙科", "医院", "药店", "体检", "保健品",
    ],
  },
  {
    id: "fitness-sports",
    kind: "expense",
    names: ["fitness", "gym", "yoga", "sports", "健身房", "运动健身", "瑜伽", "运动"],
  },
  {
    id: "selfcare-beauty",
    kind: "expense",
    names: ["beauty", "salon", "spa", "美容", "美发", "护肤", "理发", "美妆", "护肤品"],
  },
  {
    id: "selfcare-beauty",
    kind: "expense",
    names: ["therapy", "counseling", "meditation", "心理", "咨询"],
  },
  {
    id: "housing-rent",
    kind: "expense",
    names: [
      "housing", "rent", "mortgage", "property tax", "home", "house",
      "apartment", "condo", "hoa", "property management",
      "住房", "房租", "房贷", "物业", "物业费",
    ],
  },
  {
    id: "utilities-bills",
    kind: "expense",
    names: [
      "utilities", "utility", "electric", "electricity", "water",
      "natural gas", "gas bill", "heating", "sewer", "trash",
      "internet", "wifi", "cable", "tv", "phone", "mobile", "cell phone",
      "telephone", "broadband", "bills", "bill", "bill payment",
      "水电", "水费", "电费", "燃气费", "燃气", "暖气", "水电燃气", "水电费", "房租水电",
      "话费", "手机费", "宽带", "网费", "电话费", "通讯", "账单", "缴费",
    ],
  },
  {
    id: "groceries-fresh",
    kind: "expense",
    names: [
      "groceries", "grocery", "supermarket", "食品", "水果", "买菜", "超市", "生鲜", "粮油",
    ],
  },
  {
    id: "home-sanctuary",
    kind: "expense",
    names: ["household", "general merchandise", "furniture", "日用品", "家具", "清洁", "家电"],
  },
  {
    id: "dining-out",
    kind: "expense",
    names: [
      "food", "dining", "restaurants", "restaurant",
      "fast food", "breakfast", "lunch", "dinner",
      "snacks", "bakery",
      "餐饮", "饮食", "午餐", "晚餐", "早餐", "零食",
      "小吃", "早点", "餐饮美食",
    ],
  },
  {
    id: "coffee-brew",
    kind: "expense",
    names: ["coffee", "cafe", "bubble tea", "咖啡", "奶茶", "下午茶"],
  },
  {
    id: "dining-out",
    kind: "expense",
    names: ["alcohol", "bars", "饮料", "酒"],
  },
  {
    id: "food-delivery",
    kind: "expense",
    names: ["food delivery", "外卖"],
  },
  {
    id: "daily-commute",
    kind: "expense",
    names: [
      "transport", "transportation", "transit", "public transportation",
      "uber", "lyft", "taxi", "rideshare",
      "交通", "出行", "打车", "公交", "地铁", "滴滴", "出租车",
    ],
  },
  {
    id: "car-fuel",
    kind: "expense",
    names: [
      "gas", "fuel", "gas & fuel", "auto", "car", "parking", "vehicle",
      "gasoline",
      "加油", "停车", "汽车", "油费", "高速", "过路费", "洗车", "保养", "维修",
    ],
  },
  {
    id: "travel-getaways",
    kind: "expense",
    names: ["road trip", "getaway", "rental car", "自驾游", "租车"],
  },
  {
    id: "kids-family",
    kind: "expense",
    names: [
      "kids", "children", "childcare", "child care", "daycare",
      "education", "school", "tuition", "toys", "baby",
      "孩子", "儿童", "教育", "学费", "培训", "幼儿园", "玩具", "育儿",
    ],
  },
  {
    id: "growth-courses",
    kind: "expense",
    names: ["books", "book", "learning", "course", "书籍", "课程", "学习", "培训"],
  },
  {
    id: "travel-getaways",
    kind: "expense",
    names: [
      "travel", "hotel", "lodging", "flight", "flights", "airline",
      "vacation", "airbnb",
      "旅行", "旅游", "酒店", "机票", "度假", "出差", "住宿",
    ],
  },
  {
    id: "apparel-style",
    kind: "expense",
    names: [
      "shopping", "clothing", "clothes", "apparel", "shoes",
      "购物", "衣服", "服装", "商场", "淘宝", "京东", "拼多多",
    ],
  },
  {
    id: "hobbies-passions",
    kind: "expense",
    names: ["blind box", "盲盒"],
  },
  {
    id: "gifts-celebrations",
    kind: "expense",
    names: ["gifts", "gift", "礼物", "红包", "随礼", "生日礼物"],
  },
  {
    id: "pet-care",
    kind: "expense",
    names: ["pet", "pets", "veterinary", "vet", "宠物", "宠物粮"],
  },
  {
    id: "subscriptions-digital",
    kind: "expense",
    names: [
      "subscriptions", "subscription", "streaming", "netflix", "spotify",
      "订阅", "会员", "月费", "视频会员",
    ],
  },
  {
    id: "hobbies-passions",
    kind: "expense",
    names: [
      "fun", "entertainment", "games", "game", "sports",
      "hobbies", "hobby", "music", "leisure",
      "娱乐", "游戏", "运动", "休闲",
    ],
  },
  {
    id: "events-fun",
    kind: "expense",
    names: ["events", "outings", "tickets", "movies", "movie", "concert", "活动", "门票", "电影", "演唱会", "展览"],
  },
  {
    id: "rainy-day",
    kind: "expense",
    names: ["unexpected", "emergency", "repair", "意外", "应急", "维修", "修缮"],
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
export function mapCategoryName(
  raw: string | null | undefined,
  kind: RecordKind = "expense"
): string | null {
  if (!raw) return null;
  const norm = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!norm) return null;
  const parts = norm.split(/[:/>]/).map((p) => p.trim()).filter(Boolean);
  // Child first, then parent, then the whole string.
  const candidates = [...parts.slice().reverse(), norm];
  for (const cand of candidates) {
    for (const { id, kind: entryKind, names } of CATEGORY_ALIASES) {
      if (entryKind !== kind) continue;
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
