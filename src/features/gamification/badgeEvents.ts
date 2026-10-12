import type { BadgeDef } from "./badges";

// ---------------------------------------------------------------------------
// Badge events — lets any action site celebrate unlocks immediately,
// wherever the user is. The global BadgeHost (App root) renders them.
// ---------------------------------------------------------------------------

type BadgeListener = (badges: BadgeDef[]) => void;

const listeners = new Set<BadgeListener>();

/** Subscribe to badge unlocks. Returns an unsubscribe function. */
export function onBadgeUnlock(fn: BadgeListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Notify all subscribers of newly unlocked badges. */
export function emitBadgeUnlock(badges: BadgeDef[]): void {
  if (badges.length === 0) return;
  for (const fn of [...listeners]) {
    try {
      fn(badges);
    } catch {
      // A broken listener must not break awarding.
    }
  }
}
