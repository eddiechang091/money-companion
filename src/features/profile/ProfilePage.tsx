import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useExpenses } from "@/services/expenses/useExpenses";
import { useProfile } from "@/services/profile/useProfile";
import {
  PROFILE_STATUSES,
  statusDef,
  type ProfileStatus,
} from "@/services/profile/profile";
import {
  availableYears,
  buildYearHeatmap,
  computeStreak,
  yearStats,
} from "@/lib/streak";
import { BadgesRow } from "@/features/gamification/BadgesRow";
import { awardBadge } from "@/features/gamification/awardBadges";
import { Avatar } from "@/components/ui/Avatar";
import { AVATARS } from "@/services/profile/avatars";
import { BadgeCelebration } from "@/features/gamification/BadgeCelebration";
import type { BadgeDef } from "@/features/gamification/badges";
import { useGamification } from "@/features/gamification/useGamification";
import { useBudgets } from "@/services/budgets/useBudgets";

function HeatmapYear({
  year,
  expenses,
}: {
  year: number;
  expenses: Parameters<typeof buildYearHeatmap>[0];
}) {
  const weeks = useMemo(() => buildYearHeatmap(expenses, year), [expenses, year]);
  const stats = useMemo(() => yearStats(expenses, year), [expenses, year]);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Month label per column: show when the first day of the column is in a new month.
  let prevMonth = -1;
  const labels = weeks.map((week) => {
    const firstInYear = week.find((d) => !d.placeholder);
    const m = firstInYear ? Number(firstInYear.date.slice(5, 7)) - 1 : -1;
    if (m !== prevMonth && m >= 0) {
      prevMonth = m;
      return months[m];
    }
    return null;
  });

  return (
    <div>
      <div className="profile-stats">
        <div className="profile-stat">
          <span className="profile-stat-value">{stats.daysLogged}</span>
          <span className="profile-stat-label">days logged</span>
        </div>
        <div className="profile-stat">
          <span className="profile-stat-value">{stats.expenseCount}</span>
          <span className="profile-stat-label">expenses</span>
        </div>
        <div className="profile-stat">
          <span className="profile-stat-value">{stats.longestStreak}</span>
          <span className="profile-stat-label">longest streak</span>
        </div>
      </div>
      <div className="heatmap" role="img" aria-label={`Activity in ${year}`}>
        <div className="heatmap-months heatmap-months--year">
          {labels.map((label, i) => (
            <span key={i} className="heatmap-month">{label ?? ""}</span>
          ))}
        </div>
        <div className="heatmap-grid">
          {weeks.map((week, wi) => (
            <div key={wi} className="heatmap-week">
              {week.map((day) => (
                <span
                  key={day.date}
                  title={day.placeholder ? undefined : `${day.date}: ${day.count} logged`}
                  className={`heatmap-day hm-${day.level}${day.placeholder ? " is-placeholder" : ""}`}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="heatmap-legend">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`heatmap-day hm-${l} is-legend`} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { expenses } = useExpenses();
  const { budgets } = useBudgets();
  const { profile, loaded, update } = useProfile();
  const { unlockedIds } = useGamification(expenses, budgets.length);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  const years = useMemo(() => availableYears(expenses), [expenses]);
  const [year, setYear] = useState<number | null>(null);
  const [shareBadge, setShareBadge] = useState<BadgeDef | null>(null);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [avatarDraft, setAvatarDraft] = useState<string | null>(null);
  const activeYear = year ?? years[0] ?? new Date().getFullYear();

  const streak = useMemo(() => computeStreak(expenses), [expenses]);
  const status = statusDef(profile.status);

  return (
    <>
      <PageHeader title="Profile" lede="Your money-logging journey." />

      <Card>
        <div className="profile-head">
          <button
            type="button"
            className="profile-avatar profile-avatar--clickable"
            onClick={() => {
              setAvatarDraft(profile.avatarId ?? null);
              setAvatarModalOpen(true);
            }}
            aria-label="Change avatar"
            title="Change avatar"
          >
            <Avatar avatarId={profile.avatarId} avatarEmoji={profile.avatarEmoji} size={68} />
            <span className="profile-avatar-edit" aria-hidden="true">✏️</span>
          </button>
          <div className="profile-identity">
            {editing ? (
              <div className="profile-edit">
                <input
                  className="profile-name-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  maxLength={24}
                  aria-label="Display name"
                />
                <div className="profile-avatar-pick" role="group" aria-label="Choose avatar">
                  {AVATARS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={`avatar-choice${profile.avatarId === a.id ? " is-selected" : ""}`}
                      onClick={() => update({ avatarId: a.id })}
                      aria-label={a.label}
                      title={a.label}
                    >
                      <img src={a.src} alt="" aria-hidden="true" width={36} height={36} style={{ borderRadius: "50%", objectFit: "cover" }} />
                    </button>
                  ))}
                </div>
                <div className="row">
                  <Button
                    size="sm"
                    onClick={() => {
                      const trimmed = name.trim();
                      if (trimmed) update({ displayName: trimmed });
                      setEditing(false);
                    }}
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="profile-name">
                  {loaded ? profile.displayName : "…"}
                  <button
                    type="button"
                    className="profile-name-edit"
                    onClick={() => {
                      setName(profile.displayName);
                      setEditing(true);
                    }}
                    title="Edit name"
                    aria-label="Edit display name"
                  >
                    <span aria-hidden="true">✏️</span>
                  </button>
                </h2>
                <span className="profile-status">
                  <span aria-hidden="true">{status.emoji}</span> {status.label}
                </span>
              </>
            )}
          </div>
        </div>
        {!editing && (
          <div className="profile-status-row" role="group" aria-label="Set status">
            {PROFILE_STATUSES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`status-chip${profile.status === s.id ? " is-active" : ""}`}
                onClick={() => {
                  if (s.id !== profile.status) {
                    update({ status: s.id as ProfileStatus });
                    // Celebrate the first status set immediately.
                    void awardBadge("status-set");
                  }
                }}
                title={s.label}
              >
                <span aria-hidden="true">{s.emoji}</span> {s.label}
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card
        title={`${activeYear} activity`}
        action={
          <div className="year-tabs" role="tablist" aria-label="Select year">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                role="tab"
                aria-selected={y === activeYear}
                className={`year-tab${y === activeYear ? " is-active" : ""}`}
                onClick={() => setYear(y)}
              >
                {y}
              </button>
            ))}
          </div>
        }
      >
        {streak.current > 0 && (
          <p className="profile-streak-line">
            🔥 <strong>{streak.current}-day streak</strong>
            {streak.aliveButIdleToday ? " — log today to keep it going!" : " — keep it up!"}
          </p>
        )}
        <HeatmapYear year={activeYear} expenses={expenses} />
      </Card>

      {avatarModalOpen && (
        <div className="avatar-modal-backdrop" onClick={() => setAvatarModalOpen(false)} role="dialog" aria-modal="true" aria-label="Choose avatar">
          <div className="avatar-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 15, margin: "0 0 12px" }}>Choose your avatar</h3>
            <div className="profile-avatar-pick" role="group" aria-label="Choose avatar">
              {AVATARS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`avatar-choice${avatarDraft === a.id ? " is-selected" : ""}`}
                  onClick={() => setAvatarDraft(a.id)}
                  aria-label={a.label}
                  title={a.label}
                >
                  <img src={a.src} alt="" aria-hidden="true" width={48} height={48} style={{ borderRadius: "50%", objectFit: "cover" }} />
                </button>
              ))}
            </div>
            <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
              <Button size="sm" variant="ghost" onClick={() => setAvatarModalOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (avatarDraft) update({ avatarId: avatarDraft });
                  setAvatarModalOpen(false);
                }}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}

      <Card>
        <BadgesRow unlockedIds={unlockedIds} onSelect={setShareBadge} />
      </Card>

      {shareBadge ? (
        <BadgeCelebration
          badges={[shareBadge]}
          onDone={() => setShareBadge(null)}
        />
      ) : null}
    </>
  );
}
