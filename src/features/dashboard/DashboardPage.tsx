import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { BudgetProgress } from "@/components/ui/BudgetProgress";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { useExpenses } from "@/services/expenses/useExpenses";
import { useBudgets } from "@/services/budgets/useBudgets";
import {
  availableMonths,
  calculateBudgetProgress,
  comparePeriods,
  defaultMonthKey,
  filterByMonth,
  sumByKind,
  totalsByCategory,
  trendKey,
} from "@/lib/analytics";
import { money, formatMonthLabel } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n";
import type { TranslateVars } from "@/lib/i18n";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import { sortExpensesByRecency } from "@/lib/categories";
import type { RecordKind } from "@/lib/types";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { RecentExpenses } from "./RecentExpenses";
import { DailyDelightCard } from "@/features/delight/DailyDelightCard";

type T = (key: string, vars?: TranslateVars) => string;

function periodText(t: T, delta: number, direction: string, currency: string): string {
  const amount = money(Math.abs(delta), currency);
  if (direction === "flat") return t("dashboard.sameAsLast");
  if (direction === "down") return t("dashboard.lessThanLast", { amount });
  return t("dashboard.moreThanLast", { amount });
}

function budgetSummaryText(t: T, spent: number, limit: number, currency: string): string {
  if (limit <= 0) return "";
  const info = calculateBudgetProgress(spent, limit);
  if (info.status === "over") {
    return t("dashboard.overBudget", { amount: money(spent - limit, currency) });
  }
  if (info.status === "watch") {
    return t("dashboard.closeToBudget", { amount: money(info.remaining, currency) });
  }
  return t("dashboard.underBudget", { amount: money(info.remaining, currency) });
}

export function DashboardPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { t } = useLanguage();
  const { status: expStatus, expenses } = useExpenses();
  const { status: budgetStatus, monthlyBudget } = useBudgets();
  const isLoading = expStatus === "loading" || budgetStatus === "loading";

  // Month switcher: everything on this page follows the selected month.
  // Default is the current month when it has data, otherwise the latest
  // month with data — an empty current month must not hide older activity.
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [breakdownKind, setBreakdownKind] = useState<RecordKind>("expense");
  const months = useMemo(() => availableMonths(expenses), [expenses]);
  const now = monthKey ?? defaultMonthKey(expenses);
  const currency = expenses[0]?.currency ?? DEFAULT_CURRENCY;

  const monthRecords = filterByMonth(expenses, now);
  const monthOut = sumByKind(monthRecords, "expense");
  const monthIn = sumByKind(monthRecords, "income");
  const balance = Math.round((monthIn - monthOut) * 100) / 100;
  const comparison = comparePeriods(expenses, now);
  const expenseTotals = totalsByCategory(monthRecords, "expense");
  const incomeTotals = totalsByCategory(monthRecords, "income");
  const breakdownTotals = breakdownKind === "income" ? incomeTotals : expenseTotals;
  const breakdownTotal = breakdownKind === "income" ? monthIn : monthOut;

  // Memoize by ID to avoid re-firing on every render when the same expense
  // is returned as a new object reference (e.g. after expenses array refresh).
  const recentExpenses = sortExpensesByRecency(monthRecords).slice(0, 4);
  // Badge unlocks are checked here so they fire wherever the user is;
  // the badges themselves live on the profile page.

  if (isLoading) {
    return (
      <>
        <PageHeader title={t("dashboard.title")} lede={t("dashboard.lede")} />
        <Card>
          <LoadingState label={t("dashboard.loading")} />
        </Card>
      </>
    );
  }

  const monthLabel = formatMonthLabel(now);
  const prevLabel = comparison ? formatMonthLabel(comparison.previousKey) : "";

  return (
    <>
      <PageHeader
        title={t("dashboard.title")}
        lede={monthLabel}
        actions={
          <Dropdown
            ariaLabel={t("common.selectMonth")}
            value={now}
            onChange={setMonthKey}
            options={[
              ...(months.includes(now) ? [] : [{ value: now, label: monthLabel }]),
              ...months.map((k) => ({ value: k, label: formatMonthLabel(k) })),
            ]}
          />
        }
      />

      {/* Daily delight */}
      <DailyDelightCard />

      {/* Hero: money in / out / balance + budget progress + recent activity */}
      <Card>
        {monthRecords.length === 0 ? (
          <EmptyState
            emoji="🌱"
            title={t("dashboard.nothingYet")}
            action={
              <Button onClick={() => onNavigate("/add-expense")}>{t("dashboard.addFirst")}</Button>
            }
          >
            {t("dashboard.nothingYetBody")}
          </EmptyState>
        ) : (
          <div className="dashboard-hero">
            <div className="money-stats">
              <div className="money-stat">
                <p className="dashboard-label muted">{t("dashboard.moneyIn")}</p>
                <p className="money-stat-value is-income">{money(monthIn, currency)}</p>
              </div>
              <div className="money-stat">
                <p className="dashboard-label muted">{t("dashboard.moneyOut")}</p>
                <p className="money-stat-value">{money(monthOut, currency)}</p>
              </div>
              <div className="money-stat">
                <p className="dashboard-label muted">{t("dashboard.balance")}</p>
                <p className="money-stat-value">
                  {balance >= 0 ? "+" : "−"}
                  {money(Math.abs(balance), currency)}
                </p>
              </div>
            </div>
            {balance > 0 ? (
              <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                {t("dashboard.nestingGrew", { amount: money(balance, currency) })}
              </p>
            ) : null}
            {comparison && comparison.previousTotal > 0 ? (
              <p className="dashboard-comparison muted">
                {periodText(t, comparison.delta, comparison.direction, currency)}
                {prevLabel ? ` ${t("dashboard.vsPrevious", { month: prevLabel })}` : ""}
              </p>
            ) : null}
            {monthlyBudget ? (
              <div style={{ marginTop: 14 }}>
                <BudgetProgress spent={monthOut} limit={monthlyBudget.amount} currency={currency} />
                <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {budgetSummaryText(t, monthOut, monthlyBudget.amount, currency)}
                </p>
              </div>
            ) : null}
            {recentExpenses.length > 0 ? (
              <div className="dashboard-recent">
                <p className="dashboard-recent-title muted">{t("dashboard.recent")}</p>
                <RecentExpenses expenses={recentExpenses} monthKey={now} onNavigate={onNavigate} />
              </div>
            ) : null}
          </div>
        )}
      </Card>

      {/* Category breakdown */}
      {expenseTotals.length > 0 || incomeTotals.length > 0 ? (
        <Card
          title={t("dashboard.whereItWent")}
          action={
            <div className="segmented" role="tablist" aria-label={t("dashboard.breakdown")}>
              {(["expense", "income"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={breakdownKind === k}
                  className={`segmented-btn${breakdownKind === k ? " is-active" : ""}`}
                  onClick={() => setBreakdownKind(k)}
                >
                  {k === "expense" ? t("common.expenses") : t("common.income")}
                </button>
              ))}
            </div>
          }
        >
          {breakdownTotals.length > 0 ? (
            <CategoryBreakdown
              totals={breakdownTotals}
              monthTotal={breakdownTotal}
              currency={currency}
              onSelect={(categoryId) =>
                onNavigate(`/trends?category=${trendKey(categoryId)}&kind=${breakdownKind}`)
              }
            />
          ) : (
            <p className="muted" style={{ fontSize: 14 }}>
              {breakdownKind === "income" ? t("dashboard.noIncome") : t("dashboard.noSpending")}
            </p>
          )}
        </Card>
      ) : null}

      {/* Prompt to set a budget if none exists */}
      {!monthlyBudget && monthRecords.length > 0 ? (
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <p className="muted" style={{ fontSize: 14 }}>{t("dashboard.noBudget")}</p>
            <Button variant="secondary" size="sm" onClick={() => onNavigate("/budgets")}>
              {t("dashboard.setBudget")}
            </Button>
          </div>
        </Card>
      ) : null}

    </>
  );
}
