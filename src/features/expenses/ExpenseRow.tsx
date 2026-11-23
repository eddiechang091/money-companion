import { useState } from "react";
import type { Expense } from "@/lib/types";
import { recordKind } from "@/lib/types";
import { categoryName, getCategoryById } from "@/lib/categories";
import { getIntlLocale, money } from "@/lib/utils";
import { paymentMethodDisplayName, useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CategoryChip } from "@/components/ui/CategoryChip";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useProfile } from "@/services/profile/useProfile";
import { ExpenseForm, type ExpenseFormValues } from "./ExpenseForm";

function formatDateLabel(iso: string): string {
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3) return iso;
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(getIntlLocale(), { month: "short", day: "numeric" });
}

export function ExpenseRow({
  expense,
  pending,
  editing,
  deleting,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: {
  expense: Expense;
  pending: boolean;
  editing: boolean;
  deleting: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (values: ExpenseFormValues) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { profile } = useProfile();
  const { t } = useLanguage();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const category = getCategoryById(expense.categoryId);
  const isIncome = recordKind(expense) === "income";
  const title = expense.description || categoryName(expense.categoryId) || (isIncome ? t("dashboard.income") : t("dashboard.expense"));

  if (editing) {
    return (
      <Card className="expense-wrap">
        <ExpenseForm
          initial={{
            kind: recordKind(expense),
            amount: expense.amount,
            currency: expense.currency,
            categoryId: expense.categoryId ?? "",
            description: expense.description,
            date: expense.date,
            paymentMethod: expense.paymentMethod ?? "Card",
            notes: expense.notes ?? "",
          }}
          defaultCurrency={profile.currency || "USD"}
          submitLabel={t("row.saveChanges")}
          saving={savingEdit}
          onCancel={onCancelEdit}
          onSubmit={async (values) => {
            setSavingEdit(true);
            try {
              await onSaveEdit(values);
            } finally {
              setSavingEdit(false);
            }
          }}
        />
      </Card>
    );
  }

  return (
    <Card className="expense-wrap">
      <article className={pending ? "expense-card is-pending" : "expense-card"} aria-label={title}>
        <div className="expense-main">
          <div className="expense-title-row">
            <span className="expense-title">{title}</span>
            {pending ? <span className="saving-pill">{t("form.saving")}</span> : null}
          </div>
          <div className="expense-meta">
            <CategoryChip category={category} />
            <span className="muted">{formatDateLabel(expense.date)}</span>
            {expense.paymentMethod ? <span className="muted">{paymentMethodDisplayName(expense.paymentMethod)}</span> : null}
          </div>
        </div>
        <div className="expense-side">
          <span className={`expense-amount${isIncome ? " is-income" : ""}`}>
            {isIncome ? `+${money(expense.amount, expense.currency)}` : money(expense.amount, expense.currency)}
          </span>
          {expense.originalAmount != null && expense.originalCurrency ? (
            <span className="muted" style={{ fontSize: 11 }}>
              {money(expense.originalAmount, expense.originalCurrency)}
              {expense.fxRate ? ` @ ${expense.fxRate.toFixed(4)}` : ""}
            </span>
          ) : null}
          <div className="row expense-actions">
            <Button type="button" variant="ghost" size="sm" onClick={onEdit} disabled={deleting}>
              {t("common.edit")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={deleting}
            >
              {deleting ? t("row.deleting") : t("common.delete")}
            </Button>
          </div>
        </div>
        <ConfirmDialog
          open={confirmOpen}
          title={isIncome ? t("row.deleteIncomeTitle") : t("row.deleteExpenseTitle")}
          body={t("row.deleteBody", { title, amount: money(expense.amount, expense.currency) })}
          confirmLabel={deleting ? t("row.deleting") : t("common.delete")}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={async () => {
            await onDelete();
            setConfirmOpen(false);
          }}
        />
      </article>
    </Card>
  );
}
