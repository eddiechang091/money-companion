import { lazy, Suspense, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { LoadingState } from "@/components/ui/States";
import {
  dailyFlow,
  defaultMonthKey,
  defaultYearKey,
  filterByCategory,
  filterByKind,
  filterByMonth,
  filterByYear,
  availableMonths,
  availableYears,
  monthlyFlow,
  sumByKind,
} from "@/lib/analytics";
import { formatMonthLabel, money } from "@/lib/utils";
import type { RecordKind } from "@/lib/types";
import { categoryName, getCategoryById } from "@/lib/categories";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { useExpenses } from "@/services/expenses/useExpenses";
import { useBudgets } from "@/services/budgets/useBudgets";
import { ImportDialog } from "@/features/import/ImportDialog";
import { useProfile } from "@/services/profile/useProfile";
import { useLanguage } from "@/lib/i18n";
import { ExpenseList } from "./ExpenseList";
import { ExportDialog } from "./ExportDialog";

const SpendingChart = lazy(() => import("@/components/ui/SpendingChart"));

type KindFilter = RecordKind | "all";

export function ExpensesPage({
  onNavigate,
  initialMonthKey,
  initialYearKey,
  initialCategoryId,
  initialKind,
}: {
  onNavigate: (path: string) => void;
  /** Month from the route (?month=YYYY-MM), e.g. Dashboard "View all". */
  initialMonthKey?: string | null;
  /** Year from the route (?year=YYYY), e.g. a Trends year point. */
  initialYearKey?: string | null;
  /** Category from the route (?category=<trend key>), e.g. a Trends point. */
  initialCategoryId?: string | null;
  /** Kind from the route (?kind=expense|income), e.g. a Trends point. */
  initialKind?: RecordKind;
}) {
  const { t } = useLanguage();
  const { status, expenses, error, refresh, deleteExpense, isPending } = useExpenses();
  const { budgets } = useBudgets();
  const { profile } = useProfile();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const currency = expenses[0]?.currency ?? profile.currency ?? "USD";

  // Period + kind controls. Everything on this page — chart, summary, list —
  // follows the selected period and kind. The opening month is the route's
  // ?month=… when given (Dashboard "View all"), otherwise the current month
  // when it has data, otherwise the latest month with data — an empty
  // current month must not hide older transactions.
  // Route entry (Trends point drill-down): ?month=… / ?year=… / ?category=…
  // (trend key, "uncategorized" for Others) / ?kind=…. The chart and the
  // summary stay period-scoped, like the kind switch; the category filter
  // narrows the list only, and can be cleared from the banner.
  const initialMonth =
    initialMonthKey && /^\d{4}-(0[1-9]|1[0-2])$/.test(initialMonthKey)
      ? initialMonthKey
      : undefined;
  const initialYear =
    initialYearKey && /^\d{4}$/.test(initialYearKey) ? initialYearKey : undefined;
  const validInitialCategory =
    initialCategoryId &&
    (initialCategoryId === "uncategorized" || getCategoryById(initialCategoryId))
      ? initialCategoryId
      : null;
  const initialKindFilter: KindFilter =
    initialKind === "expense" || initialKind === "income" ? initialKind : "all";
  const [chartMode, setChartMode] = useState<"month" | "year">(initialYear ? "year" : "month");
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [yearKey, setYearKey] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>(initialKindFilter);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(validInitialCategory);
  const months = useMemo(() => availableMonths(expenses), [expenses]);
  const years = useMemo(() => availableYears(expenses), [expenses]);
  const activeMonth = monthKey ?? initialMonth ?? defaultMonthKey(expenses);
  const activeYear = yearKey ?? initialYear ?? defaultYearKey(expenses);
  const periodRecords =
    chartMode === "month" ? filterByMonth(expenses, activeMonth) : filterByYear(expenses, activeYear);
  const chartData =
    chartMode === "month" ? dailyFlow(periodRecords, activeMonth) : monthlyFlow(periodRecords, activeYear);
  const hasChartData = chartData.some((d) => d.expense > 0 || d.income > 0);
  const visibleRecords = filterByCategory(
    kindFilter === "all" ? periodRecords : filterByKind(periodRecords, kindFilter),
    categoryFilter
  );
  const totalIn = sumByKind(periodRecords, "income");
  const totalOut = sumByKind(periodRecords, "expense");
  const net = Math.round((totalIn - totalOut) * 100) / 100;

  const chartControls = (
    <div className="chart-controls">
      <div className="segmented" role="tablist" aria-label={t("expenses.chartView")}>
        {(["month", "year"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={chartMode === m}
            className={`segmented-btn${chartMode === m ? " is-active" : ""}`}
            onClick={() => setChartMode(m)}
          >
            {m === "month" ? t("common.month") : t("common.year")}
          </button>
        ))}
      </div>
      {chartMode === "month" ? (
        <Dropdown
          ariaLabel={t("common.selectMonth")}
          value={activeMonth}
          onChange={setMonthKey}
          options={[
            ...(months.includes(activeMonth)
              ? []
              : [{ value: activeMonth, label: formatMonthLabel(activeMonth) }]),
            ...months.map((k) => ({ value: k, label: formatMonthLabel(k) })),
          ]}
        />
      ) : (
        <Dropdown
          ariaLabel={t("common.selectYear")}
          value={activeYear}
          onChange={setYearKey}
          options={[
            ...(years.includes(activeYear) ? [] : [{ value: activeYear, label: activeYear }]),
            ...years.map((y) => ({ value: y, label: y })),
          ]}
        />
      )}
      <div className="segmented" role="tablist" aria-label={t("common.show")}>
        {(["all", "expense", "income"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kindFilter === k}
            className={`segmented-btn${kindFilter === k ? " is-active" : ""}`}
            onClick={() => setKindFilter(k)}
          >
            {k === "all" ? t("common.all") : k === "expense" ? t("common.expenses") : t("common.income")}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        title={t("expenses.title")}
        lede={t("expenses.lede")}
        actions={
          <div className="row" style={{ gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={() => onNavigate("/add-expense")}>
              {t("nav.addTransaction")}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setExportOpen(true)}>
              {t("expenses.export")}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
              {t("expenses.import")}
            </Button>
          </div>
        }
      />
      {hasChartData ? (
        <Card
          className="expenses-chart-card"
          title={chartMode === "month" ? t("expenses.dailyFlow") : t("expenses.monthlyFlow")}
          action={chartControls}
        >
          <div className="chart-legend" aria-hidden="true">
            {kindFilter !== "income" ? (
              <span>
                <span className="lg-dot" style={{ background: "var(--chart-expense, var(--primary))" }} />
                {t("common.expenses")}
              </span>
            ) : null}
            {kindFilter !== "expense" ? (
              <span>
                <span className="lg-dot" style={{ background: "var(--chart-income, var(--success))" }} />
                {t("common.income")}
              </span>
            ) : null}
          </div>
          <Suspense fallback={<LoadingState label={t("expenses.loadingChart")} />}>
            <SpendingChart
              data={chartData}
              currency={currency}
              visible={kindFilter === "all" ? "all" : kindFilter === "expense" ? "expenses" : "income"}
            />
          </Suspense>
          <p className="flow-summary">
            {t("expenses.in")} <b>{money(totalIn, currency)}</b> · {t("expenses.out")} <b>{money(totalOut, currency)}</b> · {t("expenses.net")}{" "}
            <b>
              {net >= 0 ? "+" : "−"}
              {money(Math.abs(net), currency)}
            </b>
          </p>
        </Card>
      ) : null}
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        expenses={expenses}
        budgets={budgets}
      />
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        expenses={expenses}
        onImported={() => void refresh()}
      />
      {categoryFilter ? (
        <div className="filter-banner" role="status">
          <span>
            {t("expenses.onlyCategory", {
              category: categoryName(categoryFilter === "uncategorized" ? null : categoryFilter),
            })}
          </span>
          <button
            type="button"
            className="filter-banner-clear"
            onClick={() => setCategoryFilter(null)}
            aria-label={t("expenses.clearCategoryFilter")}
          >
            ✕
          </button>
        </div>
      ) : null}
      <ExpenseList
        status={status}
        expenses={visibleRecords}
        error={error}
        onRetry={() => void refresh()}
        editingId={editingId}
        onEdit={(expense) => setEditingId(expense.id)}
        onCancelEdit={() => setEditingId(null)}
        onDelete={async (expense) => {
          setDeletingId(expense.id);
          try {
            await deleteExpense(expense.id);
          } finally {
            setDeletingId(null);
          }
        }}
        deletingId={deletingId}
        isPending={isPending}
        onAddFirst={() => onNavigate(kindFilter === "income" ? "/add-income" : "/add-expense")}
        resetKey={`${chartMode}|${activeMonth}|${activeYear}|${kindFilter}|${categoryFilter ?? ""}`}
        kindFilter={kindFilter}
      />
    </>
  );
}
