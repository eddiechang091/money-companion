// Pure stat-decay math for the lucky cat, kept dependency-free so it can be
// unit-tested without the React/storage import chain of useCat.

/** Hours of neglect to fully deplete a stat from 100 (one week). */
export const FULL_DECAY_HOURS = 168;

/**
 * Accelerating decay: slow at first, faster over time.
 * Quadratic curve — 24h: ~2pts, 48h: ~8pts, 72h: ~18pts, 96h: ~32pts,
 * 120h: ~51pts, 144h: ~73pts, 168h: 100pts (fully depleted).
 */
export function acceleratedDecay(hoursAway: number): number {
  const t = Math.min(Math.max(0, hoursAway), FULL_DECAY_HOURS) / FULL_DECAY_HOURS;
  return Math.floor(100 * t * t);
}
