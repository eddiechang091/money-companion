// Progressive reward celebration — reveals claimed items one at a time,
// like the badge celebration. Explains what each item is for.

import { useLanguage } from "@/lib/i18n";
import { itemName, itemBlurb } from "@/services/cat/items";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { CatItem } from "@/services/cat/types";
import { CELEBRATION_SLIDE_MS } from "@/features/gamification/badgeEvents";

function itemPurposeKey(item: CatItem): "reward.feedHint" | "reward.playHint" | "reward.groomHint" {
  switch (item.kind) {
    case "food":
      return "reward.feedHint";
    case "toy":
      return "reward.playHint";
    case "care":
      return "reward.groomHint";
  }
}

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
  const { t } = useLanguage();
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
      aria-label={t("reward.claimed", { name: itemName(item.id) })}
      onClick={next}
    >
      <div className="celebration-card" onClick={(e) => e.stopPropagation()}>
        <p className="celebration-kicker">🎁 {title}</p>
        <div key={item.id} className="celebration-emoji" aria-hidden="true">
          {item.emoji}
        </div>
        <h2 className="celebration-name">{itemName(item.id)}</h2>
        <p className="celebration-hint muted">
          {t(`reward.${item.rarity}`)} · {itemBlurb(item.id)}
        </p>
        <p className="celebration-purpose">{t(itemPurposeKey(item))}</p>
        {items.length > 1 && (
          <p className="celebration-progress muted">
            {t("common.of", { a: index + 1, b: items.length })}
          </p>
        )}
        <div className="celebration-actions">
          <Button variant="ghost" onClick={next}>
            {index + 1 < items.length ? t("common.next") : t("reward.awesome")}
          </Button>
        </div>
      </div>
    </div>
  );
}
