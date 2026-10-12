import { useEffect, useMemo, useRef, useState } from "react";
import type { Expense } from "@/lib/types";
import { computeStreak, buildHeatmap, type StreakInfo, type HeatmapDay } from "@/lib/streak";
import { getKvStore } from "@/services/anna/storage";
import { STORAGE_KEYS } from "@/lib/constants";
import { refreshBadges } from "./awardBadges";
import { onBadgeUnlock } from "./badgeEvents";

export interface Gamification {
  streak: StreakInfo;
  heatmap: HeatmapDay[][];
  unlockedIds: Set<string>;
}

/**
 * Computes streak + heatmap and exposes unlocked badge ids for display.
 * Celebration is global now (BadgeHost at the App root): actions award
 * badges immediately via awardBadges, and a mount-time refreshBadges()
 * catches up on anything earned before this feature existed.
 */
export function useGamification(expenses: Expense[], _budgetCount: number): Gamification {
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const checkedRef = useRef(false);

  const streak = useMemo(() => computeStreak(expenses), [expenses]);
  const heatmap = useMemo(() => buildHeatmap(expenses), [expenses]);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    (async () => {
      // Safety net: award anything the current data already earns
      // (e.g. existing users). New unlocks celebrate via BadgeHost.
      await refreshBadges();
      const store = await getKvStore();
      const persisted =
        (await store.get<Record<string, string>>(STORAGE_KEYS.badgesUnlocked)) ?? {};
      setUnlockedIds(new Set(Object.keys(persisted)));
    })();
    // Keep the displayed set fresh as badges unlock mid-session.
    return onBadgeUnlock((fresh) => {
      setUnlockedIds((prev) => {
        const next = new Set(prev);
        for (const b of fresh) next.add(b.id);
        return next;
      });
    });
  }, []);

  return { streak, heatmap, unlockedIds };
}
