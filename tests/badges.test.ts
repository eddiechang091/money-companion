import { describe, it, expect } from "vitest";
import {
  checkBadgeUnlocks,
  badgeDefById,
  BADGE_DEFS,
  countConsecutiveMonths,
} from "@/features/gamification/badges";
import type { BadgeContext } from "@/features/gamification/badges";

function ctx(over: Partial<BadgeContext> = {}): BadgeContext {
  return {
    streak: { current: 0, longest: 0, totalDays: 0, lastActiveDate: null, aliveButIdleToday: false },
    expenseCount: 0,
    budgetCount: 0,
    hasChatted: false,
    chatMessageCount: 0,
    checkinStreak: 0,
    hasCheckedIn: false,
    consecutiveMonths: 0,
    ...over,
  };
}

describe("checkBadgeUnlocks", () => {
  it("unlocks first-expense on the first log", () => {
    expect(checkBadgeUnlocks(new Set(), ctx({ expenseCount: 1 }))).toEqual(["first-expense"]);
  });

  it("unlocks streak badges from longest run too", () => {
    const ids = checkBadgeUnlocks(
      new Set(["first-expense"]),
      ctx({
        expenseCount: 10,
        streak: { current: 1, longest: 7, totalDays: 10, lastActiveDate: "2026-10-01", aliveButIdleToday: false },
      })
    );
    expect(ids).toContain("streak-3");
    expect(ids).toContain("streak-7");
    expect(ids).not.toContain("streak-30");
  });

  it("does not re-unlock already earned badges", () => {
    const ids = checkBadgeUnlocks(new Set(BADGE_DEFS.map((b) => b.id)), ctx({ expenseCount: 100 }));
    expect(ids).toEqual([]);
  });

  it("unlocks budget and chat badges", () => {
    const ids = checkBadgeUnlocks(new Set(), ctx({ budgetCount: 1, hasChatted: true }));
    expect(ids).toEqual(expect.arrayContaining(["budget-setter", "buddy-chat"]));
  });

  it("unlocks chatterbox at 5 user messages", () => {
    expect(checkBadgeUnlocks(new Set(), ctx({ chatMessageCount: 4 }))).not.toContain("chat-5");
    expect(checkBadgeUnlocks(new Set(), ctx({ chatMessageCount: 5 }))).toContain("chat-5");
  });

  it("unlocks check-in badges", () => {
    expect(checkBadgeUnlocks(new Set(), ctx({ hasCheckedIn: true }))).toContain("checkin-1");
    expect(checkBadgeUnlocks(new Set(), ctx({ checkinStreak: 6 }))).not.toContain("checkin-7");
    expect(checkBadgeUnlocks(new Set(), ctx({ checkinStreak: 7 }))).toContain("checkin-7");
  });

  it("unlocks consecutive-month badges", () => {
    const ids = checkBadgeUnlocks(new Set(), ctx({ consecutiveMonths: 6 }));
    expect(ids).toContain("months-3");
    expect(ids).toContain("months-6");
    expect(ids).not.toContain("months-12");
    expect(checkBadgeUnlocks(new Set(), ctx({ consecutiveMonths: 60 }))).toContain("months-60");
  });

  it("never unlocks event badges via state refresh", () => {
    const ids = checkBadgeUnlocks(
      new Set(),
      ctx({ expenseCount: 100, budgetCount: 5, hasChatted: true, chatMessageCount: 50 })
    );
    for (const e of ["theme-changer", "status-set", "first-import", "first-export"]) {
      expect(ids).not.toContain(e);
    }
  });
});

describe("countConsecutiveMonths", () => {
  it("counts back from the latest active month", () => {
    expect(
      countConsecutiveMonths(["2026-08-15", "2026-09-02", "2026-10-01", "2026-10-20"])
    ).toBe(3);
  });

  it("breaks the chain on a gap", () => {
    expect(countConsecutiveMonths(["2026-07-01", "2026-09-01", "2026-10-01"])).toBe(2);
  });

  it("handles year boundaries", () => {
    expect(countConsecutiveMonths(["2025-12-31", "2026-01-01", "2026-02-01"])).toBe(3);
  });

  it("returns 0 for no expenses", () => {
    expect(countConsecutiveMonths([])).toBe(0);
  });

  it("ignores malformed dates", () => {
    expect(countConsecutiveMonths(["junk", "2026-10-01"])).toBe(1);
  });
});

describe("badgeDefById", () => {
  it("finds every def", () => {
    for (const d of BADGE_DEFS) expect(badgeDefById(d.id)).toBe(d);
  });
  it("returns undefined for unknown ids", () => {
    expect(badgeDefById("nope")).toBeUndefined();
  });
});
