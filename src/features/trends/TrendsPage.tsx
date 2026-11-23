import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { useExpenses } from "@/services/expenses/useExpenses";
import { useLanguage } from "@/lib/i18n";
import { categoryName } from "@/lib/categories";
import { useBudgets } from "@/services/budgets/useBudgets";
import { useProfile } from "@/services/profile/useProfile";
import { buildTrendInsightContext } from "@/lib/aiContext";
import { useTrendInsight } from "@/features/ai/useTrendInsight";
import {
  availableMonths,
  availableYears,
  categoryMonthlySeries,
  categoryYearlySeries,
  filterByKind,
  latestPointChanges,
  sumByKind,
  totalsByCategory,
  trendKey,
} from "@/lib/analytics";
import { getCategoryById } from "@/lib/categories";
import { UNCATEGORIZED_LABEL } from "@/lib/constants";
import { currencySymbol, money, plainMoney } from "@/lib/utils";
import type { RecordKind } from "@/lib/types";

const CategoryTrendChart = lazy(() => import("@/components/ui/CategoryTrendChart"));

const TOP_DEFAULT = 5;
const YEAR_WINDOW = 6;
const MONTH_RANGES = [3, 6, 12] as const;

export function TrendsPage({
  onNavigate,
  initialCategoryId,
  initialKind,
}: {
  onNavigate: (path: string) => void;
  /** Drill-down entry: pre-select one category (trend key, "uncategorized" for null). */
  initialCategoryId?: string | null;
  /** Drill-down entry: pre-select the kind. */
  initialKind?: RecordKind;
}) {
  const { status, expenses, error, refresh } = useExpenses();
  const { t } = useLanguage();
  const { budgets } = useBudgets();
  const { profile } = useProfile();
  const currency = expenses[0]?.currency ?? profile.currency ?? "USD";
  const trendInsight = useTrendInsight();

  const [granularity, setGranularity] = useState<"month" | "year">("month");
  const [kind, setKind] = useState<RecordKind>(initialKind ?? "expense");
  const [monthRange, setMonthRange] = useState<(typeof MONTH_RANGES)[number]>(12);
  // null = auto: top 5 categories by total in the visible range.
  // A drill-down entry pins a single category until the user changes view/kind.
  const validInitialCategory =
    initialCategoryId &&
    (initialCategoryId === "uncategorized" || getCategoryById(initialCategoryId))
      ? initialCategoryId
      : null;
  const [selected, setSelected] = useState<string[] | null>(
    validInitialCategory ? [validInitialCategory] : null
  );

  const months = useMemo(
    () => availableMonths(expenses).slice(0, monthRange).reverse(),
    [expenses, monthRange]
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
  // Latest point vs the previous one (month over month / year over year).
  const changes = useMemo(
    () => latestPointChanges(series, visibleIds),
    [series, visibleIds]
  );
  const prevLabel = series.length >= 2 ? series[series.length - 2].label : null;

  // A previous analysis goes stale as soon as the viewed data changes.
  const insightKey = [granularity, kind, monthRange, visibleIds.join(",")].join("|");
  useEffect(() => {
    trendInsight.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insightKey]);

  function handleAnalyze() {
    const ctx = buildTrendInsightContext(
      rangeRecords,
      series,
      visibleIds,
      kind,
      granularity,
      currency,
      budgets
    );
    void trendInsight.analyze(ctx);
  }

  function switchGranularity(g: "month" | "year") {
    setGranularity(g);
    setSelected(null);
  }

  function switchKind(k: RecordKind) {
    setKind(k);
    setSelected(null);
  }

  // Tap a point → its transactions: Expenses for that month (or year),
  // filtered to the point's category and the current kind.
  function handlePointClick(point: { periodKey: string; categoryId: string }) {
    const periodParam =
      granularity === "month" ? `month=${point.periodKey}` : `year=${point.periodKey}`;
    onNavigate(`/expenses?${periodParam}&category=${point.categoryId}&kind=${kind}`);
  }

  function toggleCategory(id: string) {
    const base = selected ?? allIds.slice(0, TOP_DEFAULT);
    setSelected(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
  }

  const controls = (
    <div className="chart-controls">
      <div className="segmented" role="tablist" aria-label={t("trends.view")}>
        {(["month", "year"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={granularity === m}
            className={`segmented-btn${granularity === m ? " is-active" : ""}`}
            onClick={() => switchGranularity(m)}
          >
            {m === "month" ? t("common.month") : t("common.year")}
          </button>
        ))}
      </div>
      <div className="segmented" role="tablist" aria-label={t("common.show")}>
        {(["expense", "income"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            className={`segmented-btn${kind === k ? " is-active" : ""}`}
            onClick={() => switchKind(k)}
          >
            {k === "expense" ? t("common.expenses") : t("common.income")}
          </button>
        ))}
      </div>
      {granularity === "month" ? (
        <div className="segmented" role="tablist" aria-label={t("trends.monthRange")}>
          {MONTH_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={monthRange === r}
              className={`segmented-btn${monthRange === r ? " is-active" : ""}`}
              onClick={() => setMonthRange(r)}
            >
              {r === 3 ? t("trends.range3m") : r === 6 ? t("trends.range6m") : t("trends.range12m")}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      <PageHeader title={t("trends.title")} lede={t("trends.lede")} />
      {status === "loading" ? (
        <LoadingState label={t("trends.loading")} />
      ) : error && expenses.length === 0 ? (
        <Card>
          <ErrorState action={<Button onClick={() => void refresh()}>{t("common.retry")}</Button>}>
            {t("trends.loadError")}
          </ErrorState>
        </Card>
      ) : expenses.length === 0 ? (
        <Card>
          <EmptyState
            emoji="📈"
            title={t("trends.noTransactions")}
            action={<Button onClick={() => onNavigate("/add-expense")}>{t("nav.addTransaction")}</Button>}
          >
            {t("trends.emptyBody")}
          </EmptyState>
        </Card>
      ) : (
        <>
        <Card
          title={granularity === "month" ? t("trends.monthlyTitle") : t("trends.yearlyTitle")}
          action={controls}
        >
          {allIds.length === 0 ? (
            <p className="flow-summary">
              {kind === "expense" ? t("trends.noData") : t("trends.noIncomeRange")}
            </p>
          ) : (
            <>
              <div className="trend-chips" role="group" aria-label={t("trends.categories")}>
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
                      {categoryName(c.id)}
                    </button>
                  );
                })}
              </div>
              {visibleIds.length === 0 ? (
                <p className="flow-summary">{t("trends.selectCategory")}</p>
              ) : hasSeriesData ? (
                <>
                  <div className="chart-legend" aria-hidden="true">
                    {visible.map((c) => (
                      <span key={c.id}>
                        <span className="lg-dot" style={{ background: c.color }} />
                        {categoryName(c.id)}
                      </span>
                    ))}
                  </div>
                  <Suspense fallback={<LoadingState label={t("expenses.loadingChart")} />}>
                    <CategoryTrendChart
                      data={series}
                      categories={visible}
                      currency={currency}
                      onPointClick={handlePointClick}
                    />
                  </Suspense>
                  <p className="flow-summary muted" style={{ fontSize: 13 }}>
                    {t("trends.tapHint")}
                  </p>
                </>
              ) : (
                <p className="flow-summary">
                  {kind === "expense" ? t("trends.noData") : t("trends.noIncomeRange")}
                </p>
              )}
              <p className="flow-summary">
                {t("expenses.in")} <b>{plainMoney(totalIn)}</b> · {t("expenses.out")} <b>{plainMoney(totalOut)}</b> · {t("expenses.net")}{" "}
                <b>
                  {net >= 0 ? "+" : "−"}
                  {plainMoney(Math.abs(net))}
                </b>{" "}
                ({currencySymbol(currency)})
              </p>
              {hasSeriesData && changes.length > 0 && prevLabel ? (
                <div className="trend-changes">
                  <p className="trend-changes-title">{t("trends.vsPrevious", { label: prevLabel })}</p>
                  {changes.map((ch) => {
                    const cat = visible.find((c) => c.id === ch.categoryId);
                    if (!cat) return null;
                    const good =
                      ch.delta === 0 ? null : kind === "expense" ? ch.delta < 0 : ch.delta > 0;
                    const label =
                      ch.deltaPct === null
                        ? ch.current > 0
                          ? t("trends.new")
                          : "—"
                        : ch.delta === 0
                          ? "±0%"
                          : `${ch.delta > 0 ? "▲" : "▼"} ${Math.abs(ch.deltaPct)}%`;
                    return (
                      <p key={ch.categoryId} className="trend-change">
                        <span className="trend-change-name">
                          <span className="lg-dot" style={{ background: cat.color }} />
                          {categoryName(cat.id)}
                        </span>
                        <span>{money(ch.current, currency)}</span>
                        <span
                          className={`trend-change-delta${
                            good === null ? " is-flat" : good ? " is-good" : " is-bad"
                          }`}
                        >
                          {label}
                        </span>
                      </p>
                    );
                  })}
                </div>
              ) : null}
            </>
          )}
        </Card>
        {/* AI insight — opt-in, aggregates only, below the chart card. */}
        {trendInsight.status === "idle" ? (
          <div className="trend-insight-cta">
            <Button variant="secondary" onClick={handleAnalyze}>
              {t("trends.analyze")}
            </Button>
            <p className="muted" style={{ fontSize: 13 }}>
              {t("trends.analyzeNote")}
            </p>
          </div>
        ) : trendInsight.status === "loading" ? (
          <Card>
            <LoadingState label={t("trends.asking")} />
          </Card>
        ) : trendInsight.status === "error" ? (
          <Card>
            <ErrorState action={<Button onClick={handleAnalyze}>{t("common.retry")}</Button>}>
              {t("trends.analyzeError")}
            </ErrorState>
          </Card>
        ) : trendInsight.result ? (
          <Card title={t("trends.takeTitle")}>
            <p className="bubble-headline">{trendInsight.result.headline}</p>
            {trendInsight.result.financialObservation ? (
              <p className="bubble-text muted">{trendInsight.result.financialObservation}</p>
            ) : null}
            {trendInsight.result.suggestion ? (
              <p className="bubble-text">{trendInsight.result.suggestion}</p>
            ) : null}
            {trendInsight.result.followUpQuestion ? (
              <p className="bubble-text muted">{trendInsight.result.followUpQuestion}</p>
            ) : null}
            {trendInsight.result.isFallback ? (
              <p className="trend-insight-note">
                {t("trends.localNote")}
              </p>
            ) : null}
            <div className="trend-insight-cta">
              <Button variant="secondary" onClick={handleAnalyze}>
                {t("trends.analyzeAgain")}
              </Button>
            </div>
          </Card>
        ) : null}
        </>
      )}
    </>
  );
}
