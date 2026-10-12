import { lazy, Suspense, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LoadingState } from "@/components/ui/States";
import { currentMonthKey, dailyTotals, filterByMonth } from "@/lib/analytics";
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
  const monthExpenses = filterByMonth(expenses, currentMonthKey());
  const chartData = dailyTotals(monthExpenses, currentMonthKey());

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
      {monthExpenses.length > 0 ? (
        <Card title="Daily spending">
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
