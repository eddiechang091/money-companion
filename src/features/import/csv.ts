/**
 * Bank CSV parsing + column auto-detection.
 * Handles the common Canadian bank statement shapes:
 *  - TD / Scotia / CIBC: Date, Description, Debit, Credit, Balance
 *  - RBC: "Account Type","Account Number","Transaction Date",...,"Description 1","Description 2","CAD$","USD$"
 *  - Single signed-amount shape: Date, Description, Amount
 */

import { HEADER_ALIASES, directionOf, findAliasColumn, mapCategoryName, normalizeHeaderCell } from "./fields";

/** A raw data row (header stripped when detected). */
export type CsvRow = string[];

/** Parse CSV text into rows. Handles quoted fields, escaped quotes, embedded newlines. */
export function parseCsv(text: string, delimiter = ","): CsvRow[] {
  const rows: CsvRow[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    // Skip fully-empty rows
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
    } else if (ch === '"') {
      inQuotes = true;
      i += 1;
    } else if (ch === delimiter) {
      pushField();
      i += 1;
    } else if (ch === "\r") {
      pushField();
      pushRow();
      i += text[i + 1] === "\n" ? 2 : 1;
    } else if (ch === "\n") {
      pushField();
      pushRow();
      i += 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  pushField();
  pushRow();
  return rows;
}

/**
 * Guess the field delimiter from the first few lines. Candidates: comma,
 * semicolon, tab, full-width comma (some Chinese exports). Picks the
 * delimiter with the most consistent column count > 1.
 */
export function sniffDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "").slice(0, 5);
  if (lines.length === 0) return ",";
  const candidates = [",", ";", "\t", "，"];
  let best = ",";
  let bestScore = -1;
  for (const d of candidates) {
    const counts = lines.map((l) => l.split(d).length);
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    // Prefer many columns and consistent counts across lines.
    const score = min > 1 ? min * 10 - (max - min) : -1;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/**
 * Decode raw file bytes to text. Sniffs a UTF-16 BOM first, then tries
 * strict UTF-8, then GBK (common in older Chinese exports), then lossy
 * UTF-8 as a last resort.
 */
export function decodeFileBytes(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Not valid UTF-8 — try GBK before giving up.
  }
  try {
    return new TextDecoder("gbk", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

const DATE_PATTERNS: Array<{ re: RegExp; parse: (m: RegExpMatchArray) => string | null }> = [
  {
    // 2026-10-05 or 2026/10/05
    re: /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/,
    parse: (m) => iso(+m[1], +m[2], +m[3]),
  },
  {
    // 2026-10-05 22:15 / 2018/4/8 22:15 (Qianji datetimes)
    re: /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[T ]\d{1,2}:\d{2}(:\d{2})?$/,
    parse: (m) => iso(+m[1], +m[2], +m[3]),
  },
  {
    // 2026年10月5日
    re: /^(\d{4})年(\d{1,2})月(\d{1,2})日$/,
    parse: (m) => iso(+m[1], +m[2], +m[3]),
  },
  {
    // 10/05/2026 or 10-05-2026 (assume MM/DD/YYYY, North-American banks)
    re: /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/,
    parse: (m) => iso(+m[3], +m[1], +m[2]),
  },
  {
    // 10/05/26 (assume MM/DD/YY, 20xx)
    re: /^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/,
    parse: (m) => iso(2000 + +m[3], +m[1], +m[2]),
  },
  {
    // 05/10/2026 ambiguous — tried only if MM/DD fails sanity elsewhere; skip here
    re: /^$/,
    parse: () => null,
  },
  {
    // 05-Oct-2026 / Oct 05, 2026 / 05 Oct 2026
    re: /^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s,]*(\d{4})$/,
    parse: (m) => {
      const mon = monthIndex(m[2]);
      return mon >= 0 ? iso(+m[3], mon + 1, +m[1]) : null;
    },
  },
  {
    re: /^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})$/,
    parse: (m) => {
      const mon = monthIndex(m[1]);
      return mon >= 0 ? iso(+m[3], mon + 1, +m[2]) : null;
    },
  },
];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function monthIndex(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase());
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1970 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Parse a loose date string into YYYY-MM-DD, or null. */
export function parseDateLoose(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  for (const p of DATE_PATTERNS) {
    const m = v.match(p.re);
    if (m) {
      const out = p.parse(m);
      if (out) return out;
    }
  }
  return null;
}

/** Parse a loose money string ("1,234.56", "($12.34)", "-$12.34", "¥1,234", "100元") into a number, or null. */
export function parseAmountLoose(value: string): number | null {
  let v = value.trim();
  if (!v) return null;
  // Unicode minus, full-width digits handled by the digit check below via normalization.
  v = v.replace(/\u2212/g, "-");
  let negative = false;
  if (/^\(.*\)$/.test(v)) {
    negative = true;
    v = v.slice(1, -1);
  }
  // Trailing 元 (Chinese yuan unit) and currency symbols.
  v = v.replace(/元$/, "").trim();
  v = v.replace(/[$¥￥\s,]/g, "");
  if (/^-/.test(v)) {
    negative = true;
    v = v.slice(1);
  }
  if (!/^\d+(\.\d{1,4})?$/.test(v)) return null;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export interface ColumnMapping {
  hasHeader: boolean;
  header: string[];
  date: number;
  description: number;
  /** Single signed-amount column (negative = money out). */
  amount: number;
  /** Debit/credit pair (both non-negative; debit = money out). -1 when unused. */
  debit: number;
  credit: number;
  /** Outflow/inflow pair (YNAB-style; outflow = money out). -1 when unused. */
  outflow: number;
  inflow: number;
  /** Direction/type column (debit/credit, 支出/收入, regular/income...). -1 when unused. */
  direction: number;
  /** Category-name column (leaf or Parent:Child). -1 when unused. */
  category: number;
  /** Second-level category column; preferred over `category` when non-empty. -1 when unused. */
  subcategory: number;
  /** Currency column (e.g. Wealthsimple official export). -1 when unused. */
  currencyCol: number;
  /** Activity-type column (e.g. Wealthsimple official export). -1 when unused. */
  activityTypeCol: number;
}

/** A mapping with every column unset. */
export function emptyMapping(hasHeader: boolean, header: string[]): ColumnMapping {
  return {
    hasHeader,
    header,
    date: -1,
    description: -1,
    amount: -1,
    debit: -1,
    credit: -1,
    outflow: -1,
    inflow: -1,
    direction: -1,
    category: -1,
    subcategory: -1,
    currencyCol: -1,
    activityTypeCol: -1,
  };
}

/** Score a row as a header candidate: how many alias roles its cells match. */
function headerRoleScore(cells: string[]): number {
  const roles = ["date", "description", "amount", "outflow", "inflow", "direction", "category", "subcategory"];
  let score = 0;
  for (const cell of cells) {
    const c = normalizeHeaderCell(cell);
    if (!c) continue;
    for (const role of roles) {
      const aliases = HEADER_ALIASES[role];
      if (aliases && aliases.includes(c)) {
        score++;
        break;
      }
    }
  }
  return score;
}

/**
 * Find the header row within the first few rows (some exports, e.g. 随手记,
 * put preamble/title rows before the header). Returns the index of the
 * header row, or -1 when no row looks like a header.
 */
export function findHeaderRow(rows: CsvRow[]): number {
  const limit = Math.min(rows.length, 10);
  for (let i = 0; i < limit; i++) {
    if (rows[i].length >= 2 && headerRoleScore(rows[i]) >= 2) return i;
  }
  return -1;
}

function looksLikeHeader(cells: string[]): boolean {
  if (headerRoleScore(cells) >= 2) return true;
  const joined = cells.join(" ").toLowerCase();
  return /(date|description|debit|credit|amount|transaction|balance|withdrawal|deposit)/.test(joined);
}

function headerName(header: string[], idx: number): string {
  return (header[idx] ?? "").toLowerCase();
}

/** Index of the first header cell matching one of the given names (underscore/space-insensitive), or -1. */
function headerNameIndex(header: string[], ...names: string[]): number {
  const norm = header.map((c) => c.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " "));
  for (const name of names) {
    const idx = norm.indexOf(name);
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Most common non-empty value in the mapping's currency column, or null. */
export function detectCurrency(rows: CsvRow[], mapping: ColumnMapping): string | null {
  if (mapping.currencyCol < 0) return null;
  const data = mapping.hasHeader ? rows.slice(1) : rows;
  const counts = new Map<string, number>();
  for (const r of data) {
    const v = (r[mapping.currencyCol] ?? "").trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [v, n] of counts) {
    if (n > bestCount) {
      bestCount = n;
      best = v;
    }
  }
  return best;
}

/** Auto-detect the column mapping for a parsed CSV. */
export function detectColumns(rows: CsvRow[]): ColumnMapping | null {
  if (rows.length === 0) return null;
  const hasHeader = looksLikeHeader(rows[0]);
  const header = hasHeader ? rows[0] : [];
  const data = hasHeader ? rows.slice(1) : rows;
  if (data.length === 0) return null;
  const colCount = Math.max(...data.map((r) => r.length));

  const scoreDate = (c: number): number => {
    let hit = 0;
    let total = 0;
    for (const r of data) {
      const v = (r[c] ?? "").trim();
      if (!v) continue;
      total++;
      if (parseDateLoose(v)) hit++;
    }
    return total === 0 ? 0 : hit / total;
  };
  const scoreAmount = (c: number): number => {
    let hit = 0;
    let total = 0;
    for (const r of data) {
      const v = (r[c] ?? "").trim();
      if (!v) continue;
      total++;
      if (parseAmountLoose(v) !== null) hit++;
    }
    return total === 0 ? 0 : hit / total;
  };

  let date = -1;
  let bestDate = 0.6;
  for (let c = 0; c < colCount; c++) {
    const s = scoreDate(c);
    if (s > bestDate) {
      bestDate = s;
      date = c;
    }
  }
  if (date < 0) return null;

  // Numeric columns (excluding the date column)
  const numeric: number[] = [];
  for (let c = 0; c < colCount; c++) {
    if (c === date) continue;
    if (scoreAmount(c) > 0.6) numeric.push(c);
  }
  if (numeric.length === 0) return null;

  let amount = -1;
  let debit = -1;
  let credit = -1;

  if (hasHeader) {
    const debitIdx = numeric.findIndex((c) => /debit|withdrawal|paid out/.test(headerName(header, c)));
    const creditIdx = numeric.findIndex((c) => /credit|deposit|paid in/.test(headerName(header, c)));
    if (debitIdx >= 0 && creditIdx >= 0) {
      debit = numeric[debitIdx];
      credit = numeric[creditIdx];
    } else {
      // A header literally named *amount* (e.g. net_cash_amount) beats the
      // exclusivity heuristic below: sparse numeric columns like quantity
      // would otherwise be misread as a debit/credit pair.
      const amountIdx = numeric.findIndex((c) => /amount|total/.test(headerName(header, c)));
      if (amountIdx >= 0) amount = numeric[amountIdx];
    }
  }
  if (debit < 0 && amount < 0) {
    // Heuristic: a debit/credit pair shows values in only one of the two columns per row.
    for (let a = 0; a < numeric.length && debit < 0; a++) {
      for (let b = a + 1; b < numeric.length && debit < 0; b++) {
        let exclusive = 0;
        let total = 0;
        for (const r of data) {
          const va = parseAmountLoose(r[numeric[a]] ?? "");
          const vb = parseAmountLoose(r[numeric[b]] ?? "");
          if ((va && va !== 0) || (vb && vb !== 0)) {
            total++;
            if ((va && va !== 0) !== (vb && vb !== 0)) exclusive++;
          }
        }
        // Require real evidence: the pair must cover at least half the rows.
        if (total >= data.length / 2 && exclusive / total > 0.8) {
          debit = numeric[a];
          credit = numeric[b];
        }
      }
    }
  }
  if (debit < 0 && amount < 0) {
    // Single signed-amount column: prefer one with both signs, else the first numeric.
    const signed = numeric.find((c) => {
      let neg = false;
      let pos = false;
      for (const r of data) {
        const v = parseAmountLoose(r[c] ?? "");
        if (v !== null && v !== 0) {
          if (v < 0) neg = true;
          else pos = true;
        }
      }
      return neg && pos;
    });
    amount = signed ?? numeric[0];
  }

  // Description: longest-average-text column that isn't date/amount/debit/credit.
  const used = new Set([date, amount, debit, credit]);
  let description = -1;
  let bestLen = 0;
  for (let c = 0; c < colCount; c++) {
    if (used.has(c)) continue;
    let len = 0;
    let total = 0;
    for (const r of data) {
      const v = (r[c] ?? "").trim();
      if (!v) continue;
      total++;
      len += v.length;
    }
    if (total > 0 && len / total > bestLen) {
      bestLen = len / total;
      description = c;
    }
  }
  if (description < 0) return null;

  return {
    hasHeader,
    header,
    date,
    description,
    amount,
    debit,
    credit,
    outflow: -1,
    inflow: -1,
    direction: -1,
    category: -1,
    subcategory: -1,
    currencyCol: hasHeader ? headerNameIndex(header, "currency") : -1,
    activityTypeCol: hasHeader ? headerNameIndex(header, "activity type", "activity sub type") : -1,
  };
}

/**
 * Build a column mapping from header names using the EN+ZH alias lists.
 * Returns null when no usable date + amount columns are found.
 * Falls back to content heuristics for columns the aliases miss.
 */
export function detectColumnsByHeader(rows: CsvRow[]): ColumnMapping | null {
  if (rows.length === 0) return null;
  const header = rows[0];
  const mapping = emptyMapping(true, header);
  mapping.date = findAliasColumn(header, "date");
  mapping.description = findAliasColumn(header, "description");
  mapping.amount = findAliasColumn(header, "amount");
  mapping.outflow = findAliasColumn(header, "outflow");
  mapping.inflow = findAliasColumn(header, "inflow");
  mapping.direction = findAliasColumn(header, "direction");
  mapping.category = findAliasColumn(header, "category");
  mapping.subcategory = findAliasColumn(header, "subcategory");
  mapping.currencyCol = headerNameIndex(header, "currency");
  mapping.activityTypeCol = headerNameIndex(header, "activity type", "activity sub type");
  if (mapping.date < 0) return null;
  const hasAmount =
    mapping.amount >= 0 ||
    (mapping.outflow >= 0 && mapping.inflow >= 0) ||
    mapping.outflow >= 0;
  if (!hasAmount) return null;
  // A lone outflow column without inflow still needs a direction or a
  // debit/credit-style partner; treat it as the amount column only when
  // the values are signed. The caller (normalizeRows) handles it via the
  // outflow path when inflow is -1 and direction is -1: values > 0 count
  // as expenses only if no inflow column exists — handled there.
  if (mapping.description < 0) {
    // Description falls back to the note column, else the longest
    // average-text column that isn't date/amount.
    const note = findAliasColumn(header, "note");
    if (note >= 0) {
      mapping.description = note;
    } else {
      const data = rows.slice(1);
      const used = new Set(
        [mapping.date, mapping.amount, mapping.outflow, mapping.inflow, mapping.direction, mapping.category, mapping.subcategory].filter((i) => i >= 0)
      );
      let bestLen = 0;
      for (let c = 0; c < header.length; c++) {
        if (used.has(c)) continue;
        let len = 0;
        let total = 0;
        for (const r of data) {
          const v = (r[c] ?? "").trim();
          if (!v) continue;
          total++;
          len += v.length;
        }
        if (total > 0 && len / total > bestLen) {
          bestLen = len / total;
          mapping.description = c;
        }
      }
    }
  }
  return mapping;
}

export interface NormalizedRow {
  /** YYYY-MM-DD */
  date: string;
  description: string;
  /** Positive = money out (expense). */
  amount: number;
  /** True when the row looks like income/a credit (skipped for expenses). */
  isCredit: boolean;
  /** Pre-computed category from format-specific parsing (e.g. Wealthsimple). */
  categoryHint?: string | null;
  /** Row currency when the export carries one per row (e.g. Wealthsimple official export). */
  currency?: string;
  /** Why this row is not ordinary spending: investment purchase or internal transfer. */
  skipReason?: "investment" | "transfer";
  raw: CsvRow;
}

/** Activity-type value -> skip reason for Wealthsimple official exports. */
function activitySkipReason(value: string): "investment" | "transfer" | undefined {
  const v = value.trim().toUpperCase();
  if (!v) return undefined;
  if (/TRANSFER|INTERNAL/.test(v)) return "transfer";
  if (/^(BUY|SELL)$/.test(v)) return "investment";
  return undefined;
}

/** Convert parsed rows into normalized expense rows using a column mapping. */
export function normalizeRows(
  rows: CsvRow[],
  mapping: ColumnMapping,
  opts?: { positiveIsExpense?: boolean }
): NormalizedRow[] {
  const data = mapping.hasHeader ? rows.slice(1) : rows;
  const out: NormalizedRow[] = [];
  for (const r of data) {
    const date = parseDateLoose(r[mapping.date] ?? "");
    if (!date) continue;
    const description = [r[mapping.description] ?? ""]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
    let amount: number | null = null;
    let isCredit = false;
    if (mapping.outflow >= 0 && mapping.inflow >= 0) {
      // YNAB-style pair: outflow > 0 = money out, inflow > 0 = money in.
      const o = parseAmountLoose(r[mapping.outflow] ?? "");
      const i = parseAmountLoose(r[mapping.inflow] ?? "");
      if (o && o !== 0) amount = Math.abs(o);
      else if (i && i !== 0) {
        amount = Math.abs(i);
        isCredit = true;
      }
    } else if (mapping.debit >= 0) {
      const d = parseAmountLoose(r[mapping.debit] ?? "");
      const c = parseAmountLoose(r[mapping.credit] ?? "");
      if (d && d !== 0) amount = Math.abs(d);
      else if (c && c !== 0) {
        amount = Math.abs(c);
        isCredit = true;
      }
    } else {
      const v = parseAmountLoose(r[mapping.amount] ?? "");
      if (v !== null && v !== 0) {
        if (mapping.direction >= 0) {
          // An explicit direction/type column wins over the amount sign.
          const dir = directionOf(r[mapping.direction] ?? "");
          if (dir === "transfer") continue;
          if (dir === "income") {
            amount = Math.abs(v);
            isCredit = true;
          } else if (dir === "expense") {
            amount = Math.abs(v);
          } else {
            // Unknown direction value — fall back to the sign convention.
            amount = opts?.positiveIsExpense ? v : -v;
            if (amount < 0) {
              amount = -amount;
              isCredit = true;
            }
          }
        } else {
          // Default bank convention: negative = money out. Some exports use
          // the opposite — the UI lets the user flip it.
          amount = opts?.positiveIsExpense ? v : -v;
          if (amount < 0) {
            amount = -amount;
            isCredit = true;
          }
        }
      }
    }
    if (amount === null || amount <= 0) continue;
    // Category hint from the category/subcategory columns (leaf wins).
    let categoryHint: string | null = null;
    if (mapping.subcategory >= 0 || mapping.category >= 0) {
      const sub = mapping.subcategory >= 0 ? (r[mapping.subcategory] ?? "").trim() : "";
      const cat = mapping.category >= 0 ? (r[mapping.category] ?? "").trim() : "";
      categoryHint = mapCategoryName(sub || undefined) ?? mapCategoryName(cat || undefined);
    }
    const currency = mapping.currencyCol >= 0 ? (r[mapping.currencyCol] ?? "").trim() || undefined : undefined;
    const skipReason =
      mapping.activityTypeCol >= 0 ? activitySkipReason(r[mapping.activityTypeCol] ?? "") : undefined;
    out.push({ date, description: description || "(no description)", amount, isCredit, categoryHint, currency, skipReason, raw: r });
  }
  return out;
}

/** Stable key for dedupe: date + amount (cents) + normalized description. Keeps CJK characters so Chinese descriptions dedupe correctly. */
export function importKeyOf(date: string, amount: number, description: string): string {
  const norm = description.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ").trim().replace(/\s+/g, " ");
  return `${date}|${Math.round(amount * 100)}|${norm}`;
}

/* ─── Wealthsimple activity export ───────────────────────────────────────
 * Wealthsimple's activity CSV has no merchant names — descriptions are
 * generic ("Pre-authorized Debit", "Online bill payment"). But it has
 * `activity_sub_type` which tells us the transaction kind, so we can:
 *  - skip internal TRANSFERs (not expenses) and income rows
 *  - map bill-like sub-types (OBP_OUT, AFT_OUT) to the bills category
 *  - clean up "(executed at ...)" noise from descriptions
 */

const WS_SUBTYPE_COL = "activity_sub_type";
const WS_AMOUNT_COL = "net_cash_amount";
const WS_DATE_COL = "effective_date";

/** Sub-types that are internal money moves, never expenses. */
const WS_SKIP_SUBTYPES = new Set(["TRANSFER"]);

/** Sub-type -> category hint for expense rows. */
const WS_CATEGORY_HINTS: Record<string, string> = {
  OBP_OUT: "bills", // Online bill payment
  AFT_OUT: "bills", // Pre-authorized debit (recurring bills)
};

/** True when the parsed rows look like a Wealthsimple *activities* export (effective_date). The official export (transaction_date) is handled by the generic path with currency/activity-type detection. */
export function isWealthsimpleExport(rows: CsvRow[]): boolean {
  if (rows.length === 0) return false;
  const header = rows[0].map((c) => c.trim().toLowerCase());
  return header.includes(WS_SUBTYPE_COL) && header.includes(WS_AMOUNT_COL) && header.includes(WS_DATE_COL);
}

function cleanWsDescription(raw: string): string {
  // "Online bill payment (executed at 2026-07-23)" -> "Online bill payment"
  return raw.replace(/\s*\(executed at [^)]*\)\s*/i, "").trim() || "(no description)";
}

/** Normalize Wealthsimple activity rows into expense rows. */
export function normalizeWealthsimpleRows(rows: CsvRow[]): NormalizedRow[] {
  const header = rows[0].map((c) => c.trim().toLowerCase());
  const subIdx = header.indexOf(WS_SUBTYPE_COL);
  const amtIdx = header.indexOf(WS_AMOUNT_COL);
  const dateIdx = header.indexOf(WS_DATE_COL);
  const descIdx = header.indexOf("description");
  const out: NormalizedRow[] = [];
  for (const r of rows.slice(1)) {
    const subType = (r[subIdx] ?? "").trim().toUpperCase();
    if (WS_SKIP_SUBTYPES.has(subType)) continue;
    const rawAmount = parseAmountLoose(r[amtIdx] ?? "");
    if (rawAmount === null || rawAmount === 0) continue;
    // Wealthsimple convention: negative = money out.
    if (rawAmount > 0) continue; // income — not an expense
    const date = parseDateLoose(r[dateIdx] ?? "");
    if (!date) continue;
    const description = cleanWsDescription(r[descIdx] ?? "");
    out.push({
      date,
      description,
      amount: Math.abs(rawAmount),
      isCredit: false,
      categoryHint: WS_CATEGORY_HINTS[subType] ?? null,
      raw: r,
    });
  }
  return out;
}
