import { useEffect, useState } from "react";
import { BadgeCelebration } from "./BadgeCelebration";
import { onBadgeUnlock } from "./badgeEvents";
import type { BadgeDef } from "./badges";

/**
 * Global badge celebration host — render once at the App root so unlocks
 * celebrate immediately wherever the user is, not only on the dashboard.
 */
export function BadgeHost() {
  const [badges, setBadges] = useState<BadgeDef[]>([]);

  useEffect(() => {
    return onBadgeUnlock((fresh) => {
      setBadges((prev) => {
        const ids = new Set(prev.map((b) => b.id));
        const next = fresh.filter((b) => !ids.has(b.id));
        return next.length > 0 ? [...prev, ...next] : prev;
      });
    });
  }, []);

  if (badges.length === 0) return null;
  return <BadgeCelebration badges={badges} onDone={() => setBadges([])} />;
}
