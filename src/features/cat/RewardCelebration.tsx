// Progressive reward celebration — reveals claimed items one at a time,
// like the badge celebration. Explains what each item is for.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { CatItem } from "@/services/cat/types";
import { CELEBRATION_SLIDE_MS } from "@/features/gamification/badgeEvents";

function itemPurpose(item: CatItem): string {
  switch (item.kind) {
    case "food":
      return "Feed it to your cat for a happiness boost 🍖";
    case "toy":
      return "Play with your cat using this toy 🐾";
    case "care":
      return "Use it when grooming your cat 💆";
  }
}

const RARITY_LABEL: Record<CatItem["rarity"], string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
};

export function RewardCelebration({
  title,
  items,
  onDone,
}: {
  /** Reward title, e.g. "7-Day Logger". */
  title: string;
  /** Items won, revealed one at a time. */
  items: CatItem[];
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const item = items[index];

  useEffect(() => {
    setIndex(0);
  }, [items]);

  const next = () => {
    if (index + 1 < items.length) setIndex(index + 1);
    else onDone();
  };

  // Auto-advance after 3s unless the user advances manually.
  useEffect(() => {
    if (!item) return;
    const t = window.setTimeout(next, CELEBRATION_SLIDE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, index]);

  if (!item) return null;

  return (
    <div
      className="celebration-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Reward claimed: ${item.name}`}
      onClick={next}
    >
      <div className="celebration-card" onClick={(e) => e.stopPropagation()}>
        <p className="celebration-kicker">🎁 {title}</p>
        <div key={item.id} className="celebration-emoji" aria-hidden="true">
          {item.emoji}
        </div>
        <h2 className="celebration-name">{item.name}</h2>
        <p className="celebration-hint muted">
          {RARITY_LABEL[item.rarity]} · {item.blurb}
        </p>
        <p className="celebration-purpose">{itemPurpose(item)}</p>
        {items.length > 1 && (
          <p className="celebration-progress muted">
            {index + 1} of {items.length}
          </p>
        )}
        <div className="celebration-actions">
          <Button variant="ghost" onClick={next}>
            {index + 1 < items.length ? "Next" : "Awesome!"}
          </Button>
        </div>
      </div>
    </div>
  );
}
