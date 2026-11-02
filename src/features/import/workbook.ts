/**
 * Spreadsheet import: .xlsx / legacy .xls via the `xlsx` package
 * (already a dependency — used by the Excel export).
 * Each sheet becomes a CsvRow[][] candidate; the caller tries them in
 * order until one yields a recognizable import.
 */
import * as XLSX from "xlsx";
import type { CsvRow } from "./csv";

function sheetToRows(ws: XLSX.WorkSheet): CsvRow[] {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: false,
    defval: "",
  });
  const rows: CsvRow[] = [];
  for (const raw of aoa) {
    if (!Array.isArray(raw)) continue;
    const row = raw.map((c) => String(c ?? ""));
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }
  return rows;
}

/** Read all non-empty sheets of a workbook file, in sheet order. */
export function readWorkbookSheets(buf: ArrayBuffer): CsvRow[][] {
  const wb = XLSX.read(buf, { type: "array" });
  const sheets: CsvRow[][] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = sheetToRows(ws);
    if (rows.length >= 2) sheets.push(rows);
  }
  return sheets;
}

/** True when the file looks like a spreadsheet by extension or magic bytes. */
export function looksLikeWorkbook(fileName: string, buf: ArrayBuffer): boolean {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return true;
  // ZIP magic (xlsx) or OLE magic (legacy xls).
  const b = new Uint8Array(buf);
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return true;
  if (b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return true;
  return false;
}
