import { getKvStore } from "@/services/anna/storage";
import { STORAGE_KEYS } from "@/lib/constants";
import { computeStreak } from "@/lib/streak";
import { getExpenseRepository } from "@/services/expenses/repository";
import { getBudgetRepository } from "@/services/budgets/repository";
import { loadConversation } from "@/features/ai/conversationStorage";
import {
  checkBadgeUnlocks,
  badgeDefById,
  countConsecutiveMonths,
  type BadgeDef,
  type BadgeContext,
} from "./badges";
import { emitCelebration, type RewardBundle } from "./badgeEvents";
import { randomItems } from "@/services/cat/items";
import { historyRarityBoost } from "@/services/cat/milestones";

const CAT_STATE_KEY = "cat:companion_state";

interface CatStateLike {
  checkinStreak?: unknown;
  lastCheckinDate?: unknown;
  inventory?: Record<string, number>;
}

/**
 * Cat items granted automatically when these badges unlock.
 * (Replaces the old claimable milestone rewards.)
 */
const BADGE_REWARD_SIZES: Record<string, number> = {
  "streak-3": 2,
  "streak-7": 3,
  "streak-30": 6,
  "streak-100": 8,
  "expenses-50": 3,
  "checkin-7": 4,
  "months-3": 3,
  "months-6": 4,
  "months-12": 6,
  "months-60": 10,
};

/**
 * Grants cat items for freshly unlocked badges and returns the reward
 * bundles to celebrate. Best effort — never throws.
 */
async function grantBadgeRewards(
  freshIds: string[],
  stats: { longestStreak: number; totalExpenses: number }
): Promise<RewardBundle[]> {
  const rewardIds = freshIds.filter((id) => BADGE_REWARD_SIZES[id]);
  if (rewardIds.length === 0) return [];
  try {
    const boost = historyRarityBoost({
      streakDays: 0,
      longestStreak: stats.longestStreak,
      totalExpenses: stats.totalExpenses,
    });
    const store = await getKvStore();
    const saved = await store.get<CatStateLike>(CAT_STATE_KEY).catch(() => null);
    const inventory: Record<string, number> = { ...(saved?.inventory ?? {}) };
    const bundles: RewardBundle[] = [];
    for (const id of rewardIds) {
      const items = randomItems(BADGE_REWARD_SIZES[id], boost);
      for (const item of items) inventory[item.id] = (inventory[item.id] ?? 0) + 1;
      const def = badgeDefById(id);
      bundles.push({
        title: def ? `${def.name} reward` : "Badge reward",
        items,
      });
    }
    await store
      .set(CAT_STATE_KEY, { ...(saved ?? {}), inventory, updatedAt: Date.now() })
      .catch(() => {});
    return bundles;
  } catch {
    return [];
  }
}

/** Emits a rewards-only celebration (for items granted outside badges). */
export function celebrateRewards(rewards: RewardBundle[]): void {
  emitCelebration({ badges: [], rewards });
}

async function loadUnlocked(): Promise<Record<string, string>> {
  const store = await getKvStore();
  return (await store.get<Record<string, string>>(STORAGE_KEYS.badgesUnlocked)) ?? {};
}

async function persistUnlocked(next: Record<string, string>): Promise<void> {
  const store = await getKvStore();
  await store.set(STORAGE_KEYS.badgesUnlocked, next);
}

function toDefs(ids: string[]): BadgeDef[] {
  return ids.map(badgeDefById).filter((d): d is BadgeDef => !!d);
}

/**
 * Awards a single event badge (theme change, status set, import, export).
 * Pure events carry no state to recompute — the action site calls this
 * directly after the action succeeds. Returns true when newly awarded.
 * Badges with cat rewards (e.g. checkin-7) also grant and celebrate items.
 */
export async function awardBadge(id: string): Promise<boolean> {
  const def = badgeDefById(id);
  if (!def) return false;
  const unlocked = await loadUnlocked();
  if (unlocked[id]) return false;
  unlocked[id] = new Date().toISOString();
  await persistUnlocked(unlocked);
  // Reward stats for single-event badges: streak/count unknown here, use 0.
  const rewards = await grantBadgeRewards([id], { longestStreak: 0, totalExpenses: 0 });
  emitCelebration({ badges: [def], rewards });
  return true;
}

/** Builds the full badge context from persisted stores. */
export async function buildBadgeContext(): Promise<BadgeContext> {
  const store = await getKvStore();
  const [expenses, budgets, conversation, catState, persistedLongest] =
    await Promise.all([
      getExpenseRepository()
        .then((r) => r.list())
        .catch(() => []),
      getBudgetRepository()
        .then((r) => r.list())
        .catch(() => []),
      loadConversation().catch(() => null),
      store.get<CatStateLike>(CAT_STATE_KEY).catch(() => null),
      store.get<number>(STORAGE_KEYS.longestStreak).catch(() => 0),
    ]);

  const streak = computeStreak(expenses);
  const longest = Math.max(streak.longest, persistedLongest ?? 0);
  if (longest > (persistedLongest ?? 0)) {
    await store.set(STORAGE_KEYS.longestStreak, longest).catch(() => {});
  }

  const userMessages = (conversation?.messages ?? []).filter(
    (m) => m.role === "user"
  );

  const checkinStreak =
    typeof catState?.checkinStreak === "number" ? catState.checkinStreak : 0;

  return {
    streak: { ...streak, longest },
    expenseCount: expenses.length,
    budgetCount: budgets.length,
    hasChatted: userMessages.length > 0,
    chatMessageCount: userMessages.length,
    checkinStreak,
    hasCheckedIn: checkinStreak >= 1 || !!catState?.lastCheckinDate,
    consecutiveMonths: countConsecutiveMonths(expenses.map((e) => e.date)),
  };
}

/**
 * Recomputes state-derived badges from current data and celebrates new
 * unlocks immediately. Call after any action that can change badge state
 * (expense added, chat sent, budget saved). Safe to call often — already
 * unlocked badges are skipped.
 */
export async function refreshBadges(): Promise<void> {
  try {
    const unlocked = await loadUnlocked();
    const already = new Set(Object.keys(unlocked));
    const ctx = await buildBadgeContext();
    const fresh = checkBadgeUnlocks(already, ctx);
    if (fresh.length === 0) return;
    const now = new Date().toISOString();
    for (const id of fresh) unlocked[id] = now;
    await persistUnlocked(unlocked);
    const rewards = await grantBadgeRewards(fresh, {
      longestStreak: ctx.streak.longest,
      totalExpenses: ctx.expenseCount,
    });
    emitCelebration({ badges: toDefs(fresh), rewards });
  } catch {
    // Badges must never break the action that triggered them.
  }
}
