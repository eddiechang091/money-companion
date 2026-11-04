import { describe, expect, it } from "vitest";
import { scoreRows } from "@/features/import/dedupe";
import { guessCategoryId } from "@/features/import/guess";
import type { Expense } from "@/lib/types";
import type { NormalizedRow } from "@/features/import/csv";

function row(partial: Partial<NormalizedRow>): NormalizedRow {
  return {
    date: "2026-10-01",
    description: "TIM HORTONS #1234",
    amount: 5.67,
    isCredit: false,
    raw: [],
    ...partial,
  };
}

function expense(partial: Partial<Expense>): Expense {
  return {
    id: "e1",
    kind: "expense",
    amount: 5.67,
    currency: "CAD",
    categoryId: "dining-out",
    description: "TIM HORTONS #1234",
    date: "2026-10-01",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    ...partial,
  };
}

describe("scoreRows", () => {
  it("marks exact importKey matches as duplicates", () => {
    const scored = scoreRows(
      [row({})],
      [expense({ importKey: "2026-10-01|567|tim hortons 1234" })]
    );
    expect(scored[0].status).toBe("duplicate");
  });

  it("fuzzy-matches same amount/date with similar description", () => {
    const scored = scoreRows(
      [row({ description: "TIM HORTONS STORE #1234" })],
      [expense({})]
    );
    expect(scored[0].status).toBe("duplicate");
  });

  it("treats genuinely new rows as new", () => {
    const scored = scoreRows(
      [row({ description: "COMPLETELY DIFFERENT SHOP", amount: 99.99 })],
      [expense({})]
    );
    expect(scored[0].status).toBe("new");
  });

  it("does not match on amount alone across different dates", () => {
    const scored = scoreRows(
      [row({ date: "2026-10-10" })],
      [expense({})]
    );
    expect(scored[0].status).toBe("new");
  });
});

describe("guessCategoryId", () => {
  it("guesses common merchants", () => {
    expect(guessCategoryId("TIM HORTONS #1234")).toBe("coffee-brew");
    expect(guessCategoryId("SHELL CANADA")).toBe("car-fuel");
    expect(guessCategoryId("AMAZON.CA")).toBe("apparel-style");
    expect(guessCategoryId("BELL MOBILITY")).toBe("utilities-bills");
    expect(guessCategoryId("CINEPLEX ODEON")).toBe("events-fun");
    expect(guessCategoryId("SHOPPERS DRUG MART")).toBe("health-pharmacy");
  });

  it("returns null for unknown merchants", () => {
    expect(guessCategoryId("SOME RANDOM PLACE XYZ")).toBeNull();
  });
});
