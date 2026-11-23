import { describe, expect, it } from "vitest";
import { compactMoney, isValidIsoDate, money, monthKey, parseAmountInput } from "@/lib/utils";

describe("money", () => {
  it("formats a number as currency", () => {
    expect(money(12.5, "CAD")).toContain("12.50");
  });
  it("handles non-finite input", () => {
    expect(money(Number.NaN)).toContain("0.00");
  });
});

describe("compactMoney", () => {
  it("keeps small amounts whole", () => {
    expect(compactMoney(500, "USD")).toBe("$500");
    expect(compactMoney(0, "CAD")).toContain("0");
  });
  it("compacts thousands", () => {
    expect(compactMoney(1142, "USD")).toBe("$1.1K");
    expect(compactMoney(4200, "CAD")).toContain("4.2K");
  });
  it("handles non-finite input", () => {
    expect(compactMoney(Number.NaN, "USD")).toBe("$0");
  });
});

describe("parseAmountInput", () => {
  it("parses plain numbers", () => {
    expect(parseAmountInput("12.5")).toBe(12.5);
  });
  it("strips currency symbols and commas", () => {
    expect(parseAmountInput("$1,234.00")).toBe(1234);
  });
  it("rejects negatives and blanks", () => {
    expect(parseAmountInput("-3")).toBeNull();
    expect(parseAmountInput("")).toBeNull();
  });
});

describe("isValidIsoDate", () => {
  it("accepts a real date", () => {
    expect(isValidIsoDate("2026-09-15")).toBe(true);
  });
  it("rejects an impossible date", () => {
    expect(isValidIsoDate("2026-13-40")).toBe(false);
  });
});

describe("monthKey", () => {
  it("zero-pads the month", () => {
    expect(monthKey(new Date(2026, 0, 3))).toBe("2026-01");
  });
});
