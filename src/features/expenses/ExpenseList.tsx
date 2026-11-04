import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import type { Expense, RecordKind } from "@/lib/types";
import { useExpenses } from "@/services/expenses/useExpenses";
import { ExpenseRow } from "./ExpenseRow";

/** Expenses shown before the user asks for more. */
export const EXPENSE_PAGE_SIZE = 20;

/**
 * Narrow layouts (the app's own mobile breakpoint, where the bottom nav
 * appears) load more as the user scrolls; wider layouts get an explicit
 * Load more button. Without IntersectionObserver, the button is used
 * everywhere so content is never unreachable.
 */
function useNarrowLayout(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const onChange = (event: MediaQueryListEvent) => setNarrow(event.matches);
    setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

export function ExpenseList({
  status,
  expenses,
  error,
  onRetry,
  editingId,
  onEdit,
  onCancelEdit,
  onDelete,
  deletingId,
  isPending,
  onAddFirst,
  /** Active period/kind filter (period|kind). Pagination restarts when it changes. */
  resetKey,
  /** Kind filter the (already filtered) list reflects, for the empty-state copy. */
  kindFilter = "all",
}: {
  status: "loading" | "ready" | "error";
  expenses: Expense[];
  error: string | null;
  onRetry: () => void;
  editingId: string | null;
  onEdit: (expense: Expense) => void;
  onCancelEdit: () => void;
  onDelete: (expense: Expense) => Promise<void>;
  deletingId: string | null;
  isPending: (id: string) => boolean;
  onAddFirst: () => void;
  resetKey?: string;
  kindFilter?: RecordKind | "all";
}) {
  const { updateExpense } = useExpenses();
  const { notify } = useToast();
  const [visibleCount, setVisibleCount] = useState(EXPENSE_PAGE_SIZE);

  // A new period/kind filter starts a fresh page; "Load more" progress from
  // the previous filter must not carry over.
  useEffect(() => {
    setVisibleCount(EXPENSE_PAGE_SIZE);
  }, [resetKey]);
  const narrow = useNarrowLayout();
  const infiniteScroll =
    narrow && typeof window !== "undefined" && "IntersectionObserver" in window;
  const sentinelRef = useRef<HTMLDivElement>(null);

  const hasMore = visibleCount < expenses.length;
  const showBottomLine = !hasMore && expenses.length > EXPENSE_PAGE_SIZE;
  const visibleExpenses = expenses.slice(0, visibleCount);

  useEffect(() => {
    if (!infiniteScroll || !hasMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((count) => Math.min(count + EXPENSE_PAGE_SIZE, expenses.length));
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [infiniteScroll, hasMore, expenses.length]);

  if (status === "loading") {
    return (
      <Card>
        <LoadingState label="Loading your expenses…" />
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card>
        <ErrorState action={<Button onClick={onRetry}>Try again</Button>}>{error}</ErrorState>
      </Card>
    );
  }

  if (expenses.length === 0) {
    const emptyCopy =
      kindFilter === "income"
        ? {
            title: "No income yet",
            action: "Add transaction",
            body: "Add your first transaction and your money story will start taking shape.",
          }
        : kindFilter === "expense"
          ? {
              title: "No expenses yet",
              action: "Add transaction",
              body: "Add your first transaction and your money story will start taking shape.",
            }
          : {
              title: "Nothing here yet",
              action: "Add transaction",
              body: "Add your first transaction and your money story will start taking shape.",
            };
    return (
      <Card>
        <EmptyState
          emoji={"\uD83E\uDDFE"}
          title={emptyCopy.title}
          action={<Button onClick={onAddFirst}>{emptyCopy.action}</Button>}
        >
          {emptyCopy.body}
        </EmptyState>
      </Card>
    );
  }

  return (
    <>
      <div className="stack" role="list" aria-label="Expenses">
        {visibleExpenses.map((expense) => (
          <div key={expense.id} role="listitem" className="expense-item">
            <ExpenseRow
              expense={expense}
              pending={isPending(expense.id)}
              editing={editingId === expense.id}
              deleting={deletingId === expense.id}
              onEdit={() => onEdit(expense)}
              onCancelEdit={onCancelEdit}
              onSaveEdit={async (values) => {
                await updateExpense(expense.id, {
                  kind: values.kind,
                  amount: values.amount,
                  currency: values.currency,
                  categoryId: values.categoryId,
                  description: values.description,
                  date: values.date,
                  paymentMethod: values.paymentMethod || undefined,
                  notes: values.notes || undefined,
                });
                notify("Saved!");
                onCancelEdit();
              }}
              onDelete={() => onDelete(expense)}
            />
          </div>
        ))}
      </div>
      {hasMore && !infiniteScroll ? (
        <div className="load-more-row">
          <Button
            variant="secondary"
            onClick={() =>
              setVisibleCount((count) => Math.min(count + EXPENSE_PAGE_SIZE, expenses.length))
            }
          >
            Load more
          </Button>
        </div>
      ) : null}
      {hasMore && infiniteScroll ? (
        <div ref={sentinelRef} className="load-more-sentinel" aria-hidden="true" />
      ) : null}
      {showBottomLine ? <p className="bottom-line">You reach the bottom line 🧡</p> : null}
    </>
  );
}
