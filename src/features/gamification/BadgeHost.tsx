import { useCallback, useEffect, useState } from "react";
import { BadgeCelebration } from "./BadgeCelebration";
import { RewardCelebration } from "@/features/cat/RewardCelebration";
import { onCelebration, type RewardBundle } from "./badgeEvents";
import type { BadgeDef } from "./badges";

type Slide =
  | { kind: "badge"; badge: BadgeDef }
  | { kind: "reward"; bundle: RewardBundle };

/**
 * Global celebration host — render once at the App root so unlocks
 * celebrate immediately wherever the user is. Slides are sequenced:
 * badges first, then cat reward bundles. Each slide auto-dismisses
 * after 3s unless the user advances manually.
 */
export function BadgeHost() {
  const [slides, setSlides] = useState<Slide[]>([]);

  useEffect(() => {
    return onCelebration((c) => {
      const fresh: Slide[] = [
        ...c.badges.map((badge): Slide => ({ kind: "badge", badge })),
        ...c.rewards.map((bundle): Slide => ({ kind: "reward", bundle })),
      ];
      if (fresh.length === 0) return;
      setSlides((prev) => [...prev, ...fresh]);
    });
  }, []);

  const advance = useCallback(() => {
    setSlides((prev) => prev.slice(1));
  }, []);

  const current = slides[0];
  if (!current) return null;

  if (current.kind === "badge") {
    return <BadgeCelebration badges={[current.badge]} onDone={advance} />;
  }
  return (
    <RewardCelebration
      title={current.bundle.title}
      items={current.bundle.items}
      onDone={advance}
    />
  );
}
