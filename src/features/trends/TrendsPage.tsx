import { lazy, Suspense, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { useExpenses } from "@/services/expenses/useExpenses";
import { useProfile } from "@/services/profile/useProfile";
import {
  availableMonths,
  availableYears,
  categoryMonthlySeries,
  categoryYearlySeries,
  filterByKind,
  sumByKind,
  totalsByCategory,
  trendKey,
} from "@/lib/analytics";
import { getCategoryById } from "@/lib/categories";
import { UNCATEGORIZED_LABEL } from "@/lib/constants";
import { money } from "@/lib/utils";
import type { RecordKind } from "@/lib/types";

const CategoryTrendChart = lazy(() => import("@/components/ui/CategoryTrendChart"));

const TOP_DEFAULT = 5;
const MONTH_WINDOW = 12;
const YEAR_WINDOW = 6;

export function TrendsPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { status, expenses, error, refresh } = useExpenses();
  const { profile } = useProfile();
  const currency = expenses[0]?.currency ?? profile.currency ?? "USD";

  const [granularity, setGranularity] = useState<"month" | "year">("month");
  const [kind, setKind] = useState<RecordKind>("expense");
  // null = auto: top 5 categories by total in the visible range.
  const [selected, setSelected] = useState<string[] | null>(null);

  const months = useMemo(
    () => availableMonths(expenses).slice(0, MONTH_WINDOW).reverse(),
    [expenses]
  );
  const years = useMemo(
    () => availableYears(expenses).slice(0, YEAR_WINDOW).reverse(),
    [expenses]
  );

  // Records inside the visible range (both kinds); series + totals filter
  // by kind from here.
  const rangeRecords = useMemo(() => {
    if (granularity === "month") {
      const set = new Set(months);
      return expenses.filter((e) => set.has(e.date.slice(0, 7)));
    }
    const set = new Set(years);
    return expenses.filter((e) => set.has(e.date.slice(0, 4)));
  }, [expenses, granularity, months, years]);

  const scoped = useMemo(() => filterByKind(rangeRecords, kind), [rangeRecords, kind]);
  const totals = useMemo(() => totalsByCategory(scoped, kind), [scoped, kind]);
  const allCategories = useMemo(
    () =>
      totals.map((t) => {
        const id = trendKey(t.categoryId);
        const cat = id === "uncategorized" ? null : getCategoryById(id);
        return {
          id,
          name: cat?.name ?? UNCATEGORIZED_LABEL,
          color: cat?.color ?? "var(--text-muted)",
        };
      }),
    [totals]
  );
  const allIds = useMemo(() => allCategories.map((c) => c.id), [allCategories]);
  const visibleIds = selected ?? allIds.slice(0, TOP_DEFAULT);
  const visible = useMemo(
    () => allCategories.filter((c) => visibleIds.includes(c.id)),
    [allCategories, visibleIds]
  );
  const series = useMemo(
    () =>
      granularity === "month"
        ? categoryMonthlySeries(rangeRecords, kind, months)
        : categoryYearlySeries(rangeRecords, kind, years),
    [rangeRecords, granularity, kind, months, years]
  );
  const hasSeriesData = series.some((d) => visibleIds.some((id) => (d[id] as number) > 0));
  const totalIn = sumByKind(rangeRecords, "income");
  const totalOut = sumByKind(rangeRecords, "expense");
  const net = Math.round((totalIn - totalOut) * 100) / 100;

  function switchGranularity(g: "month" | "year") {
    setGranularity(g);
    setSelected(null);
  }

  function switchKind(k: RecordKind) {
    setKind(k);
    setSelected(null);
  }

  function toggleCategory(id: string) {
    const base = selected ?? allIds.slice(0, TOP_DEFAULT);
    setSelected(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
  }

  const controls = (
    <div className="chart-controls">
      <div className="segmented" role="tablist" aria-label="Trend view">
        {(["month", "year"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={granularity === m}
            className={`segmented-btn${granularity === m ? " is-active" : ""}`}
            onClick={() => switchGranularity(m)}
          >
            {m === "month" ? "Month" : "Year"}
          </button>
        ))}
      </div>
      <div className="segmented" role="tablist" aria-label="Show">
        {(["expense", "income"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            className={`segmented-btn${kind === k ? " is-active" : ""}`}
            onClick={() => switchKind(k)}
          >
            {k === "expense" ? "Expenses" : "Income"}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <PageHeader title="Trends" lede="How each category moves over time." />
      {status === "loading" ? (
        <LoadingState label="Loading trends…" />
      ) : error && expenses.length === 0 ? (
        <Card>
          <ErrorState action={<Button onClick={() => void refresh()}>Retry</Button>}>
            Something went wrong loading your records.
          </ErrorState>
        </Card>
      ) : expenses.length === 0 ? (
        <Card>
          <EmptyState
            emoji="📈"
            title="No transactions yet"
            action={<Button onClick={() => onNavigate("/add-expense")}>Add transaction</Button>}
          >
            Add your first expense or income to see trends here.
          </EmptyState>
        </Card>
      ) : (
        <Card
          title={granularity === "month" ? "Monthly trends by category" : "Yearly trends by category"}
          action={controls}
        >
          {allIds.length === 0 ? (
            <p className="flow-summary">
              No {kind === "expense" ? "spending" : "income"} in this range yet.
            </p>
          ) : (
            <>
              <div className="trend-chips" role="group" aria-label="Categories">
                {allCategories.map((c) => {
                  const active = visibleIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className="chip"
                      aria-pressed={active}
                      onClick={() => toggleCategory(c.id)}
                    >
                      <span className="dot" style={{ background: c.color }} />
                      {c.name}
                    </button>
                  );
                })}
              </div>
              {visibleIds.length === 0 ? (
                <p className="flow-summary">Select at least one category to see its trend.</p>
              ) : hasSeriesData ? (
                <>
                  <div className="chart-legend" aria-hidden="true">
                    {visible.map((c) => (
                      <span key={c.id}>
                        <span className="lg-dot" style={{ background: c.color }} />
                        {c.name}
                      </span>
                    ))}
                  </div>
                  <Suspense fallback={<LoadingState label="Loading chart…" />}>
                    <CategoryTrendChart data={series} categories={visible} currency={currency} />
                  </Suspense>
                </>
              ) : (
                <p className="flow-summary">
                  No {kind === "expense" ? "spending" : "income"} in this range yet.
                </p>
              )}
              <p className="flow-summary">
                In <b>{money(totalIn, currency)}</b> · Out <b>{money(totalOut, currency)}</b> · Net{" "}
                <b>
                  {net >= 0 ? "+" : "−"}
                  {money(Math.abs(net), currency)}
                </b>
              </p>
            </>
          )}
        </Card>
      )}
    </>
  );
}
