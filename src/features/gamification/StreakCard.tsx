import type { HeatmapDay, StreakInfo } from "@/lib/streak";
import { useLanguage } from "@/lib/i18n";
import { getIntlLocale } from "@/lib/utils";

const LEVEL_CLASS = ["hm-0", "hm-1", "hm-2", "hm-3", "hm-4"] as const;

const MONTHS = () =>
  Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(getIntlLocale(), { month: "short" }).format(new Date(2024, i, 1)),
  );

function monthLabels(weeks: HeatmapDay[][]): (string | null)[] {
  const months = MONTHS();
  let prevMonth = -1;
  return weeks.map((week) => {
    const m = Number(week[0].date.slice(5, 7)) - 1;
    if (m !== prevMonth) {
      prevMonth = m;
      return months[m];
    }
    return null;
  });
}

export function StreakCard({
  streak,
  heatmap,
}: {
  streak: StreakInfo;
  heatmap: HeatmapDay[][];
}) {
  const { t } = useLanguage();
  const labels = monthLabels(heatmap);
  const title =
    streak.current > 0 ? (
      <>
        <span className="streak-fire" aria-hidden="true">🔥</span> {t("profile.streak", { count: streak.current })}
      </>
    ) : streak.totalDays > 0 ? (
      <>{t("streak.waiting")}</>
    ) : (
      <>{t("streak.start")}</>
    );

  return (
    <div className="streak-card">
      <div className="streak-head">
        <h3 className="streak-title">{title}</h3>
        {streak.aliveButIdleToday && (
          <p className="streak-nudge">{t("streak.logToday")}</p>
        )}
      </div>
      <div className="heatmap" role="img" aria-label={t("streak.activity", { count: heatmap.length })}>
        <div className="heatmap-months">
          {labels.map((label, i) => (
            <span key={i} className="heatmap-month">{label ?? ""}</span>
          ))}
        </div>
        <div className="heatmap-grid">
          {heatmap.map((week, wi) => (
            <div key={wi} className="heatmap-week">
              {week.map((day) => (
                <span
                  key={day.date}
                  title={day.placeholder ? undefined : t("profile.dayCount", { date: day.date, count: day.count })}
                  className={`heatmap-day ${LEVEL_CLASS[day.level]}${day.placeholder ? " is-placeholder" : ""}`}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="heatmap-legend">
          <span>{t("profile.less")}</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`heatmap-day ${LEVEL_CLASS[l as 0|1|2|3|4]} is-legend`} />
          ))}
          <span>{t("profile.more")}</span>
        </div>
      </div>
      <p className="streak-meta muted">
        {streak.longest > 0 ? t("streak.longest", { count: streak.longest }) : t("streak.growGarden")}
        {streak.totalDays > 0 ? ` · ${t("streak.daysLogged", { count: streak.totalDays })}` : ""}
      </p>
    </div>
  );
}
