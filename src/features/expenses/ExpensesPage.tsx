import { lazy, Suspense, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { LoadingState } from "@/components/ui/States";
import {
  currentMonthKey,
  dailyFlow,
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
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { useExpenses } from "@/services/expenses/useExpenses";
import { useBudgets } from "@/services/budgets/useBudgets";
import { ImportDialog } from "@/features/import/ImportDialog";
import { useProfile } from "@/services/profile/useProfile";
import { ExpenseList } from "./ExpenseList";
import { ExportDialog } from "./ExportDialog";

const SpendingChart = lazy(() => import("@/components/ui/SpendingChart"));

type KindFilter = RecordKind | "all";

export function ExpensesPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { status, expenses, error, refresh, deleteExpense, isPending } = useExpenses();
  const { budgets } = useBudgets();
  const { profile } = useProfile();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const currency = expenses[0]?.currency ?? profile.currency ?? "USD";

  // Period + kind controls. Everything on this page — chart, summary, list —
  // follows the selected period and kind. Default period is the current month.
  const [chartMode, setChartMode] = useState<"month" | "year">("month");
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [yearKey, setYearKey] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const months = useMemo(() => availableMonths(expenses), [expenses]);
  const years = useMemo(() => availableYears(expenses), [expenses]);
  const activeMonth = monthKey ?? currentMonthKey();
  const activeYear = yearKey ?? String(new Date().getFullYear());
  const periodRecords =
    chartMode === "month" ? filterByMonth(expenses, activeMonth) : filterByYear(expenses, activeYear);
  const chartData =
    chartMode === "month" ? dailyFlow(periodRecords, activeMonth) : monthlyFlow(periodRecords, activeYear);
  const hasChartData = chartData.some((d) => d.expense > 0 || d.income > 0);
  const visibleRecords =
    kindFilter === "all" ? periodRecords : filterByKind(periodRecords, kindFilter);
  const totalIn = sumByKind(periodRecords, "income");
  const totalOut = sumByKind(periodRecords, "expense");
  const net = Math.round((totalIn - totalOut) * 100) / 100;

  const chartControls = (
    <div className="chart-controls">
      <div className="segmented" role="tablist" aria-label="Chart view">
        {(["month", "year"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={chartMode === m}
            className={`segmented-btn${chartMode === m ? " is-active" : ""}`}
            onClick={() => setChartMode(m)}
          >
            {m === "month" ? "Month" : "Year"}
          </button>
        ))}
      </div>
      {chartMode === "month" ? (
        <Dropdown
          ariaLabel="Select month"
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
          ariaLabel="Select year"
          value={activeYear}
          onChange={setYearKey}
          options={[
            ...(years.includes(activeYear) ? [] : [{ value: activeYear, label: activeYear }]),
            ...years.map((y) => ({ value: y, label: y })),
          ]}
        />
      )}
      <div className="segmented" role="tablist" aria-label="Show">
        {(["all", "expense", "income"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kindFilter === k}
            className={`segmented-btn${kindFilter === k ? " is-active" : ""}`}
            onClick={() => setKindFilter(k)}
          >
            {k === "all" ? "All" : k === "expense" ? "Expenses" : "Income"}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Expenses"
        lede="Everything you have tracked."
        actions={
          <div className="row" style={{ gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={() => onNavigate("/add-expense")}>
              Add transaction
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setExportOpen(true)}>
              Export
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
              Import
            </Button>
          </div>
        }
      />
      {hasChartData ? (
        <Card
          className="expenses-chart-card"
          title={chartMode === "month" ? "Daily money flow" : "Monthly money flow"}
          action={chartControls}
        >
          <div className="chart-legend" aria-hidden="true">
            {kindFilter !== "income" ? (
              <span>
                <span className="lg-dot" style={{ background: "var(--chart-expense, var(--primary))" }} />
                Expenses
              </span>
            ) : null}
            {kindFilter !== "expense" ? (
              <span>
                <span className="lg-dot" style={{ background: "var(--chart-income, var(--success))" }} />
                Income
              </span>
            ) : null}
          </div>
          <Suspense fallback={<LoadingState label="Loading chart…" />}>
            <SpendingChart
              data={chartData}
              currency={currency}
              visible={kindFilter === "all" ? "all" : kindFilter === "expense" ? "expenses" : "income"}
            />
          </Suspense>
          <p className="flow-summary">
            In <b>{money(totalIn, currency)}</b> · Out <b>{money(totalOut, currency)}</b> · Net{" "}
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
        resetKey={`${chartMode}|${activeMonth}|${activeYear}|${kindFilter}`}
        kindFilter={kindFilter}
      />
    </>
  );
}
