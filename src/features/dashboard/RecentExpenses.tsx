import type { Expense } from "@/lib/types";
import { recordKind } from "@/lib/types";
import { categoryName, getCategoryById } from "@/lib/categories";
import { getIntlLocale, money } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n";

function dateLabel(iso: string): string {
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3) return iso;
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(getIntlLocale(), { month: "short", day: "numeric" });
}

export function RecentExpenses({
  expenses,
  monthKey,
  onNavigate,
}: {
  expenses: Expense[];
  /** The month these rows belong to — "View all" opens Expenses on it. */
  monthKey: string;
  onNavigate: (path: string) => void;
}) {
  const { t } = useLanguage();
  if (expenses.length === 0) return null;
  return (
    <div>
      <ul className="recent-list" aria-label={t("dashboard.recentActivity")}>
        {expenses.map((expense) => {
          const cat = getCategoryById(expense.categoryId);
          const isIncome = recordKind(expense) === "income";
          const title = expense.description || categoryName(expense.categoryId) || (isIncome ? t("dashboard.income") : t("dashboard.expense"));
          return (
            <li key={expense.id} className="recent-row">
              <span className="recent-icon" aria-hidden="true">{cat?.icon ?? "📦"}</span>
              <span className="recent-main">
                <span className="recent-title">{title}</span>
                <span className="recent-meta">
                  <span>{dateLabel(expense.date)}</span>
                  {cat ? <span>{categoryName(expense.categoryId)}</span> : null}
                </span>
              </span>
              <span className={`recent-amount${isIncome ? " is-income" : ""}`}>
                {isIncome ? `+${money(expense.amount, expense.currency)}` : money(expense.amount, expense.currency)}
              </span>
            </li>
          );
        })}
      </ul>
      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn ghost small"
          onClick={() => onNavigate(`/expenses?month=${monthKey}`)}
        >
          {t("dashboard.viewAll")}
        </button>
      </div>
    </div>
  );
}
