import { describe, expect, it } from "vitest";
import {
  parseCsv,
  parseDateLoose,
  parseAmountLoose,
  detectColumns,
  normalizeRows,
  importKeyOf,
} from "@/features/import/csv";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    expect(parseCsv('"a,b","c""d",e\n')).toEqual([["a,b", 'c"d', "e"]]);
  });

  it("handles CRLF and skips empty rows", () => {
    expect(parseCsv('a,b\r\n\r\n1,2\r\n')).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a BOM", () => {
    expect(parseCsv("﻿a,b\n")).toEqual([["a", "b"]]);
  });
});

describe("parseDateLoose", () => {
  it("parses ISO and North-American formats", () => {
    expect(parseDateLoose("2026-10-05")).toBe("2026-10-05");
    expect(parseDateLoose("10/05/2026")).toBe("2026-10-05");
    expect(parseDateLoose("Oct 05, 2026")).toBe("2026-10-05");
  });

  it("rejects invalid dates", () => {
    expect(parseDateLoose("not a date")).toBeNull();
    expect(parseDateLoose("2026-13-99")).toBeNull();
    expect(parseDateLoose("")).toBeNull();
  });
});

describe("parseAmountLoose", () => {
  it("parses money strings", () => {
    expect(parseAmountLoose("1,234.56")).toBe(1234.56);
    expect(parseAmountLoose("-$12.34")).toBe(-12.34);
    expect(parseAmountLoose("($12.34)")).toBe(-12.34);
    expect(parseAmountLoose("abc")).toBeNull();
    expect(parseAmountLoose("")).toBeNull();
  });
});

const TD_CSV = `Date,Description,Debit,Credit,Balance
10/01/2026,TIM HORTONS #1234,5.67,,1000.00
10/02/2026,PAYROLL,,2500.00,3500.00
10/03/2026,SHELL GAS,45.00,,3455.00
`;

const RBC_CSV = `"Account Type","Account Number","Transaction Date","Cheque Number","Description 1","Description 2","CAD$","USD$"
Chequing,12345,10/04/2026,,WALMART SUPERCENTER,, -67.89,
Chequing,12345,10/05/2026,,INTEREST,, 0.12,
`;

describe("detectColumns + normalizeRows", () => {
  it("handles TD debit/credit shape", () => {
    const rows = parseCsv(TD_CSV);
    const mapping = detectColumns(rows);
    expect(mapping).not.toBeNull();
    expect(mapping!.debit).toBeGreaterThanOrEqual(0);
    expect(mapping!.credit).toBeGreaterThanOrEqual(0);
    const out = normalizeRows(rows, mapping!);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ date: "2026-10-01", amount: 5.67, isCredit: false });
    expect(out[1]).toMatchObject({ date: "2026-10-02", amount: 2500, isCredit: true });
    expect(out[2].description).toContain("SHELL");
  });

  it("handles RBC signed-amount shape", () => {
    const rows = parseCsv(RBC_CSV);
    const mapping = detectColumns(rows);
    expect(mapping).not.toBeNull();
    const out = normalizeRows(rows, mapping!);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ date: "2026-10-04", amount: 67.89, isCredit: false });
    expect(out[1]).toMatchObject({ amount: 0.12, isCredit: true });
  });

  it("respects the positiveIsExpense flip", () => {
    const rows = parseCsv("Date,Desc,Amount\n2026-10-01,SHOP,42.00\n");
    const mapping = detectColumns(rows)!;
    const normal = normalizeRows(rows, mapping);
    expect(normal[0]).toMatchObject({ amount: 42, isCredit: true });
    const flipped = normalizeRows(rows, mapping, { positiveIsExpense: true });
    expect(flipped[0]).toMatchObject({ amount: 42, isCredit: false });
  });

  it("returns null when no date column exists", () => {
    expect(detectColumns(parseCsv("a,b\n1,2\n"))).toBeNull();
  });
});

describe("importKeyOf", () => {
  it("is stable and normalized", () => {
    const a = importKeyOf("2026-10-01", 5.67, "TIM HORTONS #1234");
    const b = importKeyOf("2026-10-01", 5.670, "tim  hortons #1234");
    expect(a).toBe(b);
  });
});
