import { useEffect, useState } from "react";
import { badgeName, badgeHint, type BadgeDef } from "./badges";
import { useLanguage } from "@/lib/i18n";
import { CELEBRATION_SLIDE_MS } from "./badgeEvents";

export function BadgeCelebration({
  badges,
  onDone,
}: {
  /** Newly unlocked badges, shown one at a time. */
  badges: BadgeDef[];
  onDone: () => void;
}) {
  const { t } = useLanguage();
  const [index, setIndex] = useState(0);
  const badge = badges[index];

  useEffect(() => {
    setIndex(0);
  }, [badges]);

  const next = () => {
    if (index + 1 < badges.length) {
      setIndex(index + 1);
    } else {
      onDone();
    }
  };

  // Auto-dismiss after 3s unless the user advances manually.
  useEffect(() => {
    if (!badge) return;
    const t = window.setTimeout(next, CELEBRATION_SLIDE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badge, index]);

  if (!badge) return null;

  return (
    <div
      className="celebration-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("badges.celebration", { name: badgeName(badge.id) })}
      onClick={next}
    >
      <div className="celebration-card" onClick={(e) => e.stopPropagation()}>
        <p className="celebration-kicker">{t("badges.celebrationTitle")}</p>
        <div key={badge.id} className="celebration-emoji" aria-hidden="true">
          {badge.emoji}
        </div>
        <h2 className="celebration-name">{badgeName(badge.id)}</h2>
        <p className="celebration-hint muted">{badgeHint(badge.id)}</p>
        {badges.length > 1 && (
          <p className="celebration-progress muted">
            {t("common.of", { a: index + 1, b: badges.length })}
          </p>
        )}
      </div>
    </div>
  );
}
