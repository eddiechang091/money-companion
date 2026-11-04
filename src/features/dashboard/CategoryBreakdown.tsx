import type { CategoryTotal } from "@/lib/analytics";
import { categoryLabel, getCategoryById } from "@/lib/categories";
import { money } from "@/lib/utils";

export function CategoryBreakdown({
  totals,
  monthTotal,
  currency,
  maxRows = 5,
}: {
  totals: CategoryTotal[];
  monthTotal: number;
  currency: string;
  maxRows?: number;
}) {
  if (totals.length === 0) return null;
  const rows = totals.slice(0, maxRows);
  const largest = rows[0]?.total ?? 1;
  return (
    <div className="stack" style={{ gap: 10 }} role="list" aria-label="Breakdown by category">
      {rows.map((row) => {
        const cat = getCategoryById(row.categoryId);
        const pct = largest > 0 ? Math.round((row.total / largest) * 100) : 0;
        const ofTotal = monthTotal > 0 ? Math.round((row.total / monthTotal) * 100) : 0;
        return (
          <div key={row.categoryId ?? "uncategorized"} className="cat-row" role="listitem">
            <span className="cat-icon" aria-hidden="true">{cat?.icon ?? "📦"}</span>
            <span className="cat-name">{categoryLabel(row.categoryId)}</span>
            <span className="cat-bar" aria-hidden="true">
              <span
                className="progress"
                role="presentation"
                style={{ height: 6 }}
              >
                <span
                  style={{
                    width: pct + "%",
                    backgroundColor: cat?.color ?? "var(--primary)",
                    display: "block",
                    height: "100%",
                    borderRadius: "inherit",
                    transition: "width var(--dur-slow) var(--ease)",
                  }}
                />
              </span>
            </span>
            <span className="cat-amount">
              <span className="sr-only">{categoryLabel(row.categoryId)}: </span>
              {money(row.total, currency)}
              {ofTotal > 0 ? (
                <span className="cat-pct muted"> {ofTotal}%</span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
