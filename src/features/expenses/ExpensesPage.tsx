import { lazy, Suspense, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { LoadingState } from "@/components/ui/States";
import {
  currentMonthKey,
  dailyTotals,
  filterByMonth,
  availableMonths,
  availableYears,
  monthlyTotals,
} from "@/lib/analytics";
import { formatMonthLabel } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { useExpenses } from "@/services/expenses/useExpenses";
import { useBudgets } from "@/services/budgets/useBudgets";
import { ImportDialog } from "@/features/import/ImportDialog";
import { useProfile } from "@/services/profile/useProfile";
import { ExpenseList } from "./ExpenseList";
import { ExportDialog } from "./ExportDialog";

const SpendingChart = lazy(() => import("@/components/ui/SpendingChart"));

export function ExpensesPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { status, expenses, error, refresh, deleteExpense, isPending } = useExpenses();
  const { budgets } = useBudgets();
  const { profile } = useProfile();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const currency = expenses[0]?.currency ?? profile.currency ?? "USD";

  // Chart controls: month/year view + period picker.
  const [chartMode, setChartMode] = useState<"month" | "year">("month");
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [yearKey, setYearKey] = useState<string | null>(null);
  const months = useMemo(() => availableMonths(expenses), [expenses]);
  const years = useMemo(() => availableYears(expenses), [expenses]);
  const activeMonth = monthKey ?? currentMonthKey();
  const activeYear = yearKey ?? String(new Date().getFullYear());
  const chartData =
    chartMode === "month"
      ? dailyTotals(filterByMonth(expenses, activeMonth), activeMonth)
      : monthlyTotals(expenses, activeYear);
  const hasChartData = chartData.some((d) => d.total > 0);

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
              Add expense
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
          title={chartMode === "month" ? "Daily spending" : "Monthly spending"}
          action={chartControls}
        >
          <Suspense fallback={<LoadingState label="Loading chart…" />}>
            <SpendingChart data={chartData} currency={currency} />
          </Suspense>
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
        expenses={expenses}
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
        onAddFirst={() => onNavigate("/add-expense")}
      />
    </>
  );
}
