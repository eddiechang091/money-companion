import { BADGE_DEFS, type BadgeDef } from "./badges";

export function BadgesRow({
  unlockedIds,
  onSelect,
}: {
  unlockedIds: ReadonlySet<string>;
  onSelect?: (badge: BadgeDef) => void;
}) {
  const unlockedCount = BADGE_DEFS.filter((b) => unlockedIds.has(b.id)).length;
  const pct = Math.round((unlockedCount / BADGE_DEFS.length) * 100);
  return (
    <div className="badge-wall">
      <div className="badge-wall-head">
        <div>
          <h3 className="badge-wall-title">Badge Wall</h3>
          <p className="muted badge-wall-sub">
            {unlockedCount} of {BADGE_DEFS.length} unlocked
          </p>
        </div>
        <div
          className="badge-wall-progress"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Badges unlocked"
        >
          <div className="badge-wall-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="badge-wall-grid" role="list" aria-label="Achievement badges">
        {BADGE_DEFS.map((b) => {
          const unlocked = unlockedIds.has(b.id);
          const clickable = unlocked && onSelect;
          return (
            <div
              key={b.id}
              role={clickable ? "button" : "listitem"}
              title={unlocked ? `${b.name} — unlocked!` : `${b.name}: ${b.hint}`}
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
              <span className="badge-card-name">{b.name}</span>
              <span className="badge-card-hint">{unlocked ? b.hint : "Locked"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
