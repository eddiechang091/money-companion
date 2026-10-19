import type { StreakInfo } from "@/lib/streak";

// ---------------------------------------------------------------------------
// Badges — small achievements that reward consistent logging.
// ---------------------------------------------------------------------------

export interface BadgeDef {
  id: string;
  emoji: string;
  name: string;
  hint: string;
}

export const BADGE_DEFS: BadgeDef[] = [
  { id: "first-expense", emoji: "🌱", name: "First Steps", hint: "Log your first expense" },
  { id: "streak-3", emoji: "🔥", name: "Warming Up", hint: "Log 3 days in a row" },
  { id: "streak-7", emoji: "⚡", name: "On Fire", hint: "Log 7 days in a row" },
  { id: "streak-30", emoji: "🏆", name: "Unstoppable", hint: "Log 30 days in a row" },
  { id: "streak-100", emoji: "💎", name: "Diamond", hint: "Log 100 days in a row" },
  { id: "expenses-50", emoji: "📝", name: "Record Keeper", hint: "Log 50 expenses" },
  { id: "budget-setter", emoji: "🎯", name: "Goal Setter", hint: "Set your first budget" },
  { id: "buddy-chat", emoji: "💬", name: "Good Talk", hint: "Chat with Lucky Cat" },
  { id: "chat-5", emoji: "🗣️", name: "Chatterbox", hint: "Send 5 messages to Lucky Cat" },
  { id: "checkin-1", emoji: "🐾", name: "First Check-in", hint: "Check in with your lucky cat" },
  { id: "checkin-7", emoji: "📅", name: "Devoted", hint: "Check in 7 days in a row" },
  { id: "months-3", emoji: "🗓️", name: "Quarter Keeper", hint: "Log expenses in 3 consecutive months" },
  { id: "months-6", emoji: "📆", name: "Half-Year Hero", hint: "Log expenses in 6 consecutive months" },
  { id: "months-12", emoji: "🎖️", name: "Year of Records", hint: "Log expenses in 12 consecutive months" },
  { id: "months-60", emoji: "👑", name: "Five-Year Legend", hint: "Log expenses for 5 straight years" },
  { id: "theme-changer", emoji: "🎨", name: "New Look", hint: "Change your theme" },
  { id: "status-set", emoji: "✨", name: "Set the Mood", hint: "Set your profile status" },
  { id: "first-import", emoji: "📥", name: "Import Pro", hint: "Import expenses from a file" },
  { id: "first-export", emoji: "📤", name: "Export Star", hint: "Export your expenses" },
];

export interface BadgeContext {
  streak: StreakInfo;
  expenseCount: number;
  budgetCount: number;
  hasChatted: boolean;
  /** Number of user-sent chat messages. */
  chatMessageCount: number;
  /** Current cat check-in streak (days). */
  checkinStreak: number;
  /** Whether the user has ever checked in with the cat. */
  hasCheckedIn: boolean;
  /** Consecutive calendar months (ending at the latest active month) with ≥1 expense. */
  consecutiveMonths: number;
}

/**
 * Counts consecutive calendar months with at least one expense, walking
 * back from the most recent month that has any expense. Gaps break the
 * chain. Pure helper — easy to unit test.
 */
export function countConsecutiveMonths(expenseDates: string[]): number {
  const months = new Set<string>();
  for (const d of expenseDates) {
    if (typeof d === "string" && d.length >= 7) months.add(d.slice(0, 7));
  }
  if (months.size === 0) return 0;
  const sorted = [...months].sort().reverse();
  let count = 1;
  let [y, m] = sorted[0].split("-").map(Number);
  for (let i = 1; i < sorted.length; i++) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    const expected = `${y}-${String(m).padStart(2, "0")}`;
    if (sorted[i] === expected) {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

function unlocked(ctx: BadgeContext, id: string): boolean {
  switch (id) {
    case "first-expense":
      return ctx.expenseCount >= 1;
    case "streak-3":
      return ctx.streak.current >= 3 || ctx.streak.longest >= 3;
    case "streak-7":
      return ctx.streak.current >= 7 || ctx.streak.longest >= 7;
    case "streak-30":
      return ctx.streak.current >= 30 || ctx.streak.longest >= 30;
    case "streak-100":
      return ctx.streak.current >= 100 || ctx.streak.longest >= 100;
    case "expenses-50":
      return ctx.expenseCount >= 50;
    case "budget-setter":
      return ctx.budgetCount >= 1;
    case "buddy-chat":
      return ctx.hasChatted;
    case "chat-5":
      return ctx.chatMessageCount >= 5;
    case "checkin-1":
      return ctx.hasCheckedIn;
    case "checkin-7":
      return ctx.checkinStreak >= 7;
    case "months-3":
      return ctx.consecutiveMonths >= 3;
    case "months-6":
      return ctx.consecutiveMonths >= 6;
    case "months-12":
      return ctx.consecutiveMonths >= 12;
    case "months-60":
      return ctx.consecutiveMonths >= 60;
    // Event badges (theme-changer, status-set, first-import, first-export)
    // are awarded directly at the action site via awardBadge() — they are
    // never unlocked by state refresh.
    default:
      return false;
  }
}

/**
 * Given the set of already-unlocked badge ids, return the ids that are
 * newly earned (and should be celebrated + persisted).
 */
export function checkBadgeUnlocks(
  alreadyUnlocked: ReadonlySet<string>,
  ctx: BadgeContext
): string[] {
  return BADGE_DEFS.filter((b) => !alreadyUnlocked.has(b.id) && unlocked(ctx, b.id)).map(
    (b) => b.id
  );
}

export function badgeDefById(id: string): BadgeDef | undefined {
  return BADGE_DEFS.find((b) => b.id === id);
}
