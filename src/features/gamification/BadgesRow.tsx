import { BADGE_DEFS, badgeName, badgeHint, type BadgeDef } from "./badges";
import { useLanguage } from "@/lib/i18n";

export function BadgesRow({
  unlockedIds,
  onSelect,
}: {
  unlockedIds: ReadonlySet<string>;
  onSelect?: (badge: BadgeDef) => void;
}) {
  const { t } = useLanguage();
  const unlockedCount = BADGE_DEFS.filter((b) => unlockedIds.has(b.id)).length;
  const pct = Math.round((unlockedCount / BADGE_DEFS.length) * 100);
  return (
    <div className="badge-wall">
      <div className="badge-wall-head">
        <div>
          <h3 className="badge-wall-title">{t("badges.wall")}</h3>
          <p className="muted badge-wall-sub">
            {t("badges.countOf", { a: unlockedCount, b: BADGE_DEFS.length })}
          </p>
        </div>
        <div
          className="badge-wall-progress"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("badges.unlocked")}
        >
          <div className="badge-wall-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="badge-wall-grid" role="list" aria-label={t("badges.achievements")}>
        {BADGE_DEFS.map((b) => {
          const unlocked = unlockedIds.has(b.id);
          const clickable = unlocked && onSelect;
          return (
            <div
              key={b.id}
              role={clickable ? "button" : "listitem"}
              title={unlocked ? t("badges.unlockedToast", { name: badgeName(b.id) }) : t("badges.nameHint", { name: badgeName(b.id), hint: badgeHint(b.id) })}
              className={`badge-card${unlocked ? " is-unlocked" : " is-locked"}${
                clickable ? " is-clickable" : ""
              }`}
              {...(clickable
                ? {
                    onClick: () => onSelect(b),
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(b);
                      }
                    },
                    tabIndex: 0,
                  }
                : {})}
            >
              <span className="badge-card-emoji" aria-hidden="true">
                {unlocked ? b.emoji : "🔒"}
              </span>
              <span className="badge-card-name">{badgeName(b.id)}</span>
              <span className="badge-card-hint">{unlocked ? badgeHint(b.id) : t("badges.locked")}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
