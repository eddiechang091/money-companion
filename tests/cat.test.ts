import { describe, expect, it } from "vitest";
import { CAT_ITEMS, getItem, randomItem, randomItems } from "@/services/cat/items";
import { historyRarityBoost } from "@/services/cat/milestones";

describe("cat item catalog", () => {
  it("has 18 items across food/toy/care", () => {
    expect(CAT_ITEMS).toHaveLength(18);
    const kinds = new Set(CAT_ITEMS.map((i) => i.kind));
    expect(kinds).toEqual(new Set(["food", "toy", "care"]));
  });

  it("ids are unique", () => {
    const ids = CAT_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("getItem resolves known ids", () => {
    expect(getItem("food-tuna")?.name).toBe("Tuna Can");
    expect(getItem("nope")).toBeUndefined();
  });

  it("randomItem honors rarity pools", () => {
    // With boost 2, epic should appear sometimes over many rolls.
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(randomItem(2).rarity);
    expect(seen.has("epic")).toBe(true);
    // With boost 0, epic should never appear.
    const seen0 = new Set<string>();
    for (let i = 0; i < 200; i++) seen0.add(randomItem(0).rarity);
    expect(seen0.has("epic")).toBe(false);
  });

  it("randomItems returns n items", () => {
    expect(randomItems(5)).toHaveLength(5);
  });
});

describe("history rarity boost", () => {
  it("scales with history", () => {
    expect(historyRarityBoost({ streakDays: 0, longestStreak: 0, totalExpenses: 0 })).toBe(0);
    expect(historyRarityBoost({ streakDays: 0, longestStreak: 7, totalExpenses: 0 })).toBe(1);
    expect(historyRarityBoost({ streakDays: 0, longestStreak: 0, totalExpenses: 50 })).toBe(1);
    expect(historyRarityBoost({ streakDays: 0, longestStreak: 30, totalExpenses: 0 })).toBe(2);
    expect(historyRarityBoost({ streakDays: 0, longestStreak: 0, totalExpenses: 200 })).toBe(2);
  });
});
