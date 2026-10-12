import type { BadgeDef } from "./badges";
import type { CatItem } from "@/services/cat/types";

// ---------------------------------------------------------------------------
// Celebration events — lets any action site celebrate unlocks immediately,
// wherever the user is. The global BadgeHost (App root) renders them as a
// sequenced queue: badges first, then cat reward bundles. Each slide
// auto-dismisses after 3s unless the user advances manually.
// ---------------------------------------------------------------------------

export interface RewardBundle {
  title: string;
  items: CatItem[];
}

export interface Celebration {
  badges: BadgeDef[];
  rewards: RewardBundle[];
}

export const CELEBRATION_SLIDE_MS = 3000;

type CelebrationListener = (c: Celebration) => void;

const listeners = new Set<CelebrationListener>();

/** Subscribe to celebrations. Returns an unsubscribe function. */
export function onCelebration(fn: CelebrationListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Notify all subscribers of a new celebration (badges and/or rewards). */
export function emitCelebration(c: Celebration): void {
  if (c.badges.length === 0 && c.rewards.length === 0) return;
  for (const fn of [...listeners]) {
    try {
      fn(c);
    } catch {
      // A broken listener must not break awarding.
    }
  }
}

/** Back-compat: badge-only celebrations. */
export function emitBadgeUnlock(badges: BadgeDef[]): void {
  emitCelebration({ badges, rewards: [] });
}

/** Back-compat listener for badge-only subscribers. */
export function onBadgeUnlock(fn: (badges: BadgeDef[]) => void): () => void {
  return onCelebration((c) => {
    if (c.badges.length > 0) fn(c.badges);
  });
}
