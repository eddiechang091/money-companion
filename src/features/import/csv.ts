/**
 * Bank CSV parsing + column auto-detection.
 * Handles the common Canadian bank statement shapes:
 *  - TD / Scotia / CIBC: Date, Description, Debit, Credit, Balance
 *  - RBC: "Account Type","Account Number","Transaction Date",...,"Description 1","Description 2","CAD$","USD$"
 *  - Single signed-amount shape: Date, Description, Amount
 */

/** A raw data row (header stripped when detected). */
export type CsvRow = string[];

/** Parse CSV text into rows. Handles quoted fields, escaped quotes, embedded newlines. */
export function parseCsv(text: string): CsvRow[] {
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
    } else if (ch === ",") {
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

const DATE_PATTERNS: Array<{ re: RegExp; parse: (m: RegExpMatchArray) => string | null }> = [
  {
    // 2026-10-05 or 2026/10/05
    re: /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/,
    parse: (m) => iso(+m[1], +m[2], +m[3]),
  },
  {
    // 10/05/2026 or 10-05-2026 (assume MM/DD/YYYY, North-American banks)
    re: /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/,
    parse: (m) => iso(+m[3], +m[1], +m[2]),
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

/** Parse a loose money string ("1,234.56", "($12.34)", "-$12.34") into a number, or null. */
export function parseAmountLoose(value: string): number | null {
  let v = value.trim();
  if (!v) return null;
  let negative = false;
  if (/^\(.*\)$/.test(v)) {
    negative = true;
    v = v.slice(1, -1);
  }
  v = v.replace(/[$\s,]/g, "");
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
}

function looksLikeHeader(cells: string[]): boolean {
  const joined = cells.join(" ").toLowerCase();
  return /(date|description|debit|credit|amount|transaction|balance|withdrawal|deposit)/.test(joined);
}

function headerName(header: string[], idx: number): string {
  return (header[idx] ?? "").toLowerCase();
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
    }
  }
  if (debit < 0) {
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
        if (total > 0 && exclusive / total > 0.8) {
          debit = numeric[a];
          credit = numeric[b];
        }
      }
    }
  }
  if (debit < 0) {
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

  return { hasHeader, header, date, description, amount, debit, credit };
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
  raw: CsvRow;
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
    if (mapping.debit >= 0) {
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
        // Default bank convention: negative = money out. Some exports use
        // the opposite — the UI lets the user flip it.
        amount = opts?.positiveIsExpense ? v : -v;
        if (amount < 0) {
          amount = -amount;
          isCredit = true;
        }
      }
    }
    if (amount === null || amount <= 0) continue;
    out.push({ date, description: description || "(no description)", amount, isCredit, raw: r });
  }
  return out;
}

/** Stable key for dedupe: date + amount (cents) + normalized description. */
export function importKeyOf(date: string, amount: number, description: string): string {
  const norm = description.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
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

/** True when the parsed rows look like a Wealthsimple activity export. */
export function isWealthsimpleExport(rows: CsvRow[]): boolean {
  if (rows.length === 0) return false;
  const header = rows[0].map((c) => c.trim().toLowerCase());
  return header.includes(WS_SUBTYPE_COL) && header.includes(WS_AMOUNT_COL);
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
