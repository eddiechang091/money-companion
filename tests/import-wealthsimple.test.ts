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

  it("skips internal transfers and income", () => {
    const normalized = normalizeWealthsimpleRows(rows);
    // 36 data rows: 5 TRANSFER + 11 income (AFT_IN/E_TRFIN/Interest) = 16 skipped
    expect(normalized).toHaveLength(20);
    for (const r of normalized) {
      expect(r.amount).toBeGreaterThan(0);
      expect(r.isCredit).toBe(false);
    }
  });

  it("maps bill sub-types to the bills category", () => {
    const normalized = normalizeWealthsimpleRows(rows);
    const billRows = normalized.filter((r) => r.categoryHint === "bills");
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
    expect(guessCategoryId("RBC MORTGAGE PAYMENT")).toBe("housing");
    expect(guessCategoryId("RENT - LANDLORD")).toBe("housing");
  });
  it("guesses utilities", () => {
    expect(guessCategoryId("MARITIME ELECTRIC")).toBe("utilities");
    expect(guessCategoryId("CITY WATER BILL")).toBe("utilities");
  });
  it("guesses internet", () => {
    expect(guessCategoryId("BELL MOBILITY")).toBe("internet");
    expect(guessCategoryId("EASTLINK INTERNET")).toBe("internet");
  });
  it("guesses insurance", () => {
    expect(guessCategoryId("MANULIFE INSURANCE")).toBe("insurance");
  });
  it("guesses kids and travel", () => {
    expect(guessCategoryId("CARTERS OSHKOSH")).toBe("kids");
    expect(guessCategoryId("AIRBNB * HM123")).toBe("travel");
  });
  it("keeps streaming under fun", () => {
    expect(guessCategoryId("NETFLIX.COM")).toBe("fun");
  });
});
