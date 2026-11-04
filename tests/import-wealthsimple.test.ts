import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseCsv,
  isWealthsimpleExport,
  normalizeWealthsimpleRows,
} from "@/features/import/csv";
import { guessCategoryId } from "@/features/import/guess";

const WS_CSV = readFileSync(
  "/home/hatch/workspace/user/files/activities-export-2026-10-10.csv",
  "utf-8"
);

describe("wealthsimple import", () => {
  const rows = parseCsv(WS_CSV);

  it("detects the wealthsimple format", () => {
    expect(isWealthsimpleExport(rows)).toBe(true);
  });

  it("skips internal transfers and imports income rows", () => {
    const normalized = normalizeWealthsimpleRows(rows);
    // 37 data rows: 5 TRANSFER skipped, 12 income rows (AFT_IN/E_TRFIN/interest) now import as income
    expect(normalized).toHaveLength(32);
    expect(normalized.filter((r) => r.isCredit)).toHaveLength(12);
    expect(normalized.filter((r) => !r.isCredit)).toHaveLength(20);
    for (const r of normalized) {
      expect(r.amount).toBeGreaterThan(0);
    }
  });

  it("maps bill sub-types to the bills category", () => {
    const normalized = normalizeWealthsimpleRows(rows);
    const billRows = normalized.filter((r) => r.categoryHint === "nest-utilities");
    // 7 OBP_OUT + 8 AFT_OUT = 15 bill rows
    expect(billRows).toHaveLength(15);
  });

  it("cleans executed-at noise from descriptions", () => {
    const normalized = normalizeWealthsimpleRows(rows);
    for (const r of normalized) {
      expect(r.description).not.toMatch(/executed at/i);
    }
    const obp = normalized.find((r) => r.description === "Online bill payment");
    expect(obp).toBeDefined();
  });
});

describe("category guessing with new categories", () => {
  it("guesses housing", () => {
    expect(guessCategoryId("RBC MORTGAGE PAYMENT")).toBe("nest-home");
    expect(guessCategoryId("RENT - LANDLORD")).toBe("nest-home");
  });
  it("guesses utilities", () => {
    expect(guessCategoryId("MARITIME ELECTRIC")).toBe("nest-utilities");
    expect(guessCategoryId("CITY WATER BILL")).toBe("nest-utilities");
  });
  it("guesses internet", () => {
    expect(guessCategoryId("BELL MOBILITY")).toBe("nest-utilities");
    expect(guessCategoryId("EASTLINK INTERNET")).toBe("nest-utilities");
  });
  it("guesses insurance", () => {
    expect(guessCategoryId("MANULIFE INSURANCE")).toBe("cushion-insurance");
  });
  it("guesses kids and travel", () => {
    expect(guessCategoryId("CARTERS OSHKOSH")).toBe("loved-family");
    expect(guessCategoryId("AIRBNB * HM123")).toBe("joy-vacation");
  });
  it("keeps streaming under fun", () => {
    expect(guessCategoryId("NETFLIX.COM")).toBe("joy-subs");
    expect(guessCategoryId("EMPLOYER PAYROLL")).toBeNull();
    expect(guessCategoryId("EMPLOYER PAYROLL", "income")).toBe("inc-paycheck");
  });
});
