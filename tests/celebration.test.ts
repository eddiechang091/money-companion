import { describe, expect, it } from "vitest";
import {
  CELEBRATION_SLIDE_MS,
  emitCelebration,
  onCelebration,
  type Celebration,
} from "@/features/gamification/badgeEvents";
import { BADGE_DEFS } from "@/features/gamification/badges";

describe("celebration events", () => {
  it("auto-dismiss slide duration is 3s", () => {
    expect(CELEBRATION_SLIDE_MS).toBe(3000);
  });

  it("delivers badges and rewards to subscribers", () => {
    const seen: Celebration[] = [];
    const off = onCelebration((c) => seen.push(c));
    const badge = BADGE_DEFS[0];
    emitCelebration({
      badges: [badge],
      rewards: [{ title: "Test reward", items: [] }],
    });
    off();
    expect(seen).toHaveLength(1);
    expect(seen[0].badges).toEqual([badge]);
    expect(seen[0].rewards[0].title).toBe("Test reward");
  });

  it("ignores empty celebrations", () => {
    let calls = 0;
    const off = onCelebration(() => calls++);
    emitCelebration({ badges: [], rewards: [] });
    off();
    expect(calls).toBe(0);
  });

  it("a broken listener does not break others", () => {
    const off1 = onCelebration(() => {
      throw new Error("boom");
    });
    let calls = 0;
    const off2 = onCelebration(() => calls++);
    emitCelebration({ badges: [BADGE_DEFS[0]], rewards: [] });
    off1();
    off2();
    expect(calls).toBe(1);
  });
});
