/**
 * Named import presets for expense-tracker exports.
 *
 * Each preset knows how to recognize its own export (by header names)
 * and how to normalize its rows into NormalizedRow. Amount-direction
 * quirks live here: never infer direction from amount sign alone when
 * the format carries an explicit type/direction column.
 *
 * Detection order matters (see PRESETS): the most distinctive
 * signatures first. 随手记 is checked before 钱迹 because its app CSV
 * shares 钱迹's 时间/类型/金额 columns but adds transfer-account
 * （转出账户/转入账户） or merchant （商家） columns.
 */
import {
  parseAmountLoose,
  parseDateLoose,
  type CsvRow,
  type NormalizedRow,
} from "./csv";
import { directionOf, mapCategoryName, normalizeHeaderCell } from "./fields";

function normHeader(header: string[]): string[] {
  return header.map(normalizeHeaderCell);
}

function colIndex(header: string[], ...names: string[]): number {
  return header.indexOf(names.find((n) => header.includes(n)) ?? "");
}

function hasAll(header: string[], ...names: string[]): boolean {
  return names.every((n) => header.includes(n));
}

function hasAny(header: string[], ...names: string[]): boolean {
  return names.some((n) => header.includes(n));
}

function firstNonEmpty(row: CsvRow, idxs: number[]): string {
  for (const i of idxs) {
    if (i >= 0) {
      const v = (row[i] ?? "").trim();
      if (v) return v;
    }
  }
  return "";
}

export interface Preset {
  id: string;
  name: string;
  detect(header: string[]): boolean;
  normalize(rows: CsvRow[]): NormalizedRow[];
}

function pushRow(
  out: NormalizedRow[],
  dateRaw: string,
  description: string,
  amount: number,
  categoryHint: string | null,
  raw: CsvRow
): void {
  const date = parseDateLoose(dateRaw);
  if (!date || !(amount > 0)) return;
  out.push({
    date,
    description: description || "(no description)",
    amount,
    isCredit: false,
    categoryHint,
    raw,
  });
}

/* ─── YNAB ─────────────────────────────────────────────────────────────
 * Register export: Date, Payee, Category, Memo, Outflow, Inflow
 * (plus Account, Category Group, Cleared). Outflow > 0 = spending.
 */
const ynab: Preset = {
  id: "ynab",
  name: "YNAB",
  detect: (h) => hasAll(h, "outflow", "inflow") && hasAny(h, "date", "payee"),
  normalize: (rows) => {
    const header = normHeader(rows[0]);
    const date = colIndex(header, "date");
    const payee = colIndex(header, "payee");
    const category = colIndex(header, "category");
    const memo = colIndex(header, "memo");
    const outflow = colIndex(header, "outflow");
    const out: NormalizedRow[] = [];
    for (const r of rows.slice(1)) {
      const outAmt = parseAmountLoose(r[outflow] ?? "");
      if (outAmt && outAmt !== 0) {
        pushRow(
          out,
          r[date] ?? "",
          firstNonEmpty(r, [payee, memo]),
          Math.abs(outAmt),
          mapCategoryName(r[category] ?? ""),
          r
        );
      }
      // Inflow rows are income — skipped (not expenses).
    }
    return out;
  },
};

/* ─── Mint (shut down Mar 2024; exports still circulate) ───────────────
 * Date, Description, Original Description, Amount (always positive),
 * Transaction Type (debit = spending), Category, Account Name, Labels, Notes.
 */
const mint: Preset = {
  id: "mint",
  name: "Mint",
  detect: (h) => hasAll(h, "original description", "transaction type", "amount"),
  normalize: (rows) => {
    const header = normHeader(rows[0]);
    const date = colIndex(header, "date");
    const desc = colIndex(header, "description", "original description");
    const amount = colIndex(header, "amount");
    const type = colIndex(header, "transaction type");
    const category = colIndex(header, "category");
    const out: NormalizedRow[] = [];
    for (const r of rows.slice(1)) {
      if (directionOf(r[type] ?? "") !== "expense") continue;
      const amt = parseAmountLoose(r[amount] ?? "");
      if (amt === null || amt === 0) continue;
      pushRow(
        out,
        r[date] ?? "",
        firstNonEmpty(r, [desc]),
        Math.abs(amt),
        mapCategoryName(r[category] ?? ""),
        r
      );
    }
    return out;
  },
};

/* ─── Monarch Money ────────────────────────────────────────────────────
 * Date, Merchant, Category, Account, Amount (signed: negative = spending),
 * Notes, Tags (+ Category Group / Pending / Transaction ID variants).
 */
const monarch: Preset = {
  id: "monarch",
  name: "Monarch",
  detect: (h) =>
    hasAll(h, "merchant", "account", "amount") && hasAny(h, "category", "notes"),
  normalize: (rows) => {
    const header = normHeader(rows[0]);
    const date = colIndex(header, "date");
    const merchant = colIndex(header, "merchant");
    const category = colIndex(header, "category");
    const amount = colIndex(header, "amount");
    const pending = colIndex(header, "pending");
    const notes = colIndex(header, "notes");
    const out: NormalizedRow[] = [];
    for (const r of rows.slice(1)) {
      if (pending >= 0 && (r[pending] ?? "").trim().toLowerCase() === "pending") {
        continue;
      }
      const amt = parseAmountLoose(r[amount] ?? "");
      if (amt === null || amt >= 0) continue; // negative = spending
      pushRow(
        out,
        r[date] ?? "",
        firstNonEmpty(r, [merchant, notes]),
        Math.abs(amt),
        mapCategoryName(r[category] ?? ""),
        r
      );
    }
    return out;
  },
};

/* ─── Copilot Money ────────────────────────────────────────────────────
 * date, name, amount, status, category, parent category, excluded, tags,
 * type (regular/income/internal transfer), account, account mask, note.
 * Sign convention is disputed across sources — trust `type`, never sign.
 */
const copilot: Preset = {
  id: "copilot",
  name: "Copilot",
  detect: (h) => hasAll(h, "parent category", "account mask", "type"),
  normalize: (rows) => {
    const header = normHeader(rows[0]);
    const date = colIndex(header, "date");
    const name = colIndex(header, "name");
    const amount = colIndex(header, "amount");
    const category = colIndex(header, "category");
    const parent = colIndex(header, "parent category");
    const type = colIndex(header, "type");
    const note = colIndex(header, "note");
    const out: NormalizedRow[] = [];
    for (const r of rows.slice(1)) {
      if (directionOf(r[type] ?? "") !== "expense") continue;
      const amt = parseAmountLoose(r[amount] ?? "");
      if (amt === null || amt === 0) continue;
      const hint =
        mapCategoryName(r[category] ?? "") ?? mapCategoryName(r[parent] ?? "");
      pushRow(
        out,
        r[date] ?? "",
        firstNonEmpty(r, [name, note]),
        Math.abs(amt),
        hint,
        r
      );
    }
    return out;
  },
};

/* ─── 钱迹 (Qianji) ────────────────────────────────────────────────────
 * Template: 时间, 分类, 二级分类, 类型, 金额 (+ 账户/备注/标签/币种).
 * 类型: 收入/支出/报销/转账/还款 — only 支出 imports.
 * Category: 二级分类 wins over 分类. 时间 accepts datetimes ("2018/4/8 22:15").
 */
const qianji: Preset = {
  id: "qianji",
  name: "钱迹",
  detect: (h) => hasAll(h, "类型", "金额") && hasAny(h, "时间", "日期"),
  normalize: (rows) => {
    const header = normHeader(rows[0]);
    const date = colIndex(header, "时间", "日期");
    const cat1 = colIndex(header, "分类", "一级分类");
    const cat2 = colIndex(header, "二级分类", "子分类");
    const type = colIndex(header, "类型");
    const amount = colIndex(header, "金额");
    const remark = colIndex(header, "备注", "说明");
    const out: NormalizedRow[] = [];
    for (const r of rows.slice(1)) {
      if (directionOf(r[type] ?? "") !== "expense") continue;
      const amt = parseAmountLoose(r[amount] ?? "");
      if (amt === null || amt === 0) continue;
      const catRaw = firstNonEmpty(r, [cat2, cat1]);
      pushRow(
        out,
        r[date] ?? "",
        firstNonEmpty(r, [remark]) || catRaw || "支出",
        Math.abs(amt),
        mapCategoryName(catRaw),
        r
      );
    }
    return out;
  },
};

/* ─── 随手记 (Suishouji) ────────────────────────────────────────────────
 * App CSV: 类型, 分类, 二级分类, 金额, 币种, 账户, 转出账户, 转入账户,
 *   备注, 时间, 标签, 附件 (may have preamble rows — stripped upstream).
 * Web .xls: 交易类型, 日期, 分类, 子分类, 账户1, 账户2, 金额, 商家, 项目, 备注.
 * Only 支出 imports. Category: 二级分类/子分类 wins. Description: 商家, else 备注.
 */
const suishouji: Preset = {
  id: "suishouji",
  name: "随手记",
  detect: (h) =>
    (hasAny(h, "转出账户", "转入账户") && hasAny(h, "类型", "交易类型")) ||
    (hasAll(h, "账户1", "账户2") && hasAny(h, "商家", "交易类型")) ||
    (hasAll(h, "商家", "类型", "金额") && hasAny(h, "二级分类", "分类")),
  normalize: (rows) => {
    const header = normHeader(rows[0]);
    const date = colIndex(header, "时间", "日期");
    const cat1 = colIndex(header, "分类", "一级分类");
    const cat2 = colIndex(header, "二级分类", "子分类");
    const type = colIndex(header, "类型", "交易类型");
    const amount = colIndex(header, "金额");
    const merchant = colIndex(header, "商家");
    const remark = colIndex(header, "备注", "说明");
    const project = colIndex(header, "项目");
    const out: NormalizedRow[] = [];
    for (const r of rows.slice(1)) {
      if (directionOf(r[type] ?? "") !== "expense") continue;
      const amt = parseAmountLoose(r[amount] ?? "");
      if (amt === null || amt === 0) continue;
      const catRaw = firstNonEmpty(r, [cat2, cat1]);
      pushRow(
        out,
        r[date] ?? "",
        firstNonEmpty(r, [merchant, remark, project]) || catRaw || "支出",
        Math.abs(amt),
        mapCategoryName(catRaw),
        r
      );
    }
    return out;
  },
};

export const PRESETS: Preset[] = [suishouji, qianji, ynab, mint, copilot, monarch];

/** Match a header row against the named presets. Returns null when none fits. */
export function detectPreset(rows: CsvRow[]): Preset | null {
  if (rows.length === 0) return null;
  const header = normHeader(rows[0]);
  for (const preset of PRESETS) {
    if (preset.detect(header)) return preset;
  }
  return null;
}
