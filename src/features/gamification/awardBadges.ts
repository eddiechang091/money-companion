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
import { emitBadgeUnlock } from "./badgeEvents";

const CAT_STATE_KEY = "cat:companion_state";

interface CatStateLike {
  checkinStreak?: unknown;
  lastCheckinDate?: unknown;
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
 */
export async function awardBadge(id: string): Promise<boolean> {
  const def = badgeDefById(id);
  if (!def) return false;
  const unlocked = await loadUnlocked();
  if (unlocked[id]) return false;
  unlocked[id] = new Date().toISOString();
  await persistUnlocked(unlocked);
  emitBadgeUnlock([def]);
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
    emitBadgeUnlock(toDefs(fresh));
  } catch {
    // Badges must never break the action that triggered them.
  }
}
