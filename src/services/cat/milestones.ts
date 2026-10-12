// Interactive lucky cat — history-based reward rarity.
//
// (The old claimable milestone list was removed; its achievements now live
// as badges, and badge unlocks grant cat items automatically.)

import type { ExpenseStats } from "./types";

/** Rarity boost from history length: 0 = new, 1 = established, 2 = veteran. */
export function historyRarityBoost(stats: ExpenseStats): number {
  if (stats.longestStreak >= 30 || stats.totalExpenses >= 200) return 2;
  if (stats.longestStreak >= 7 || stats.totalExpenses >= 50) return 1;
  return 0;
}
