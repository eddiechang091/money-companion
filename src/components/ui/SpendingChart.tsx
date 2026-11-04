import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";
import { money } from "@/lib/utils";
import type { FlowDatum } from "@/lib/analytics";

export interface ChartDatum {
  date: string;
  label: string;
  total: number;
}

/** Which series the chart shows. "all" renders expenses and income side by side. */
export type FlowVisibility = "all" | "expenses" | "income";

export default function SpendingChart({
  data,
  currency = "USD",
  visible = "all",
}: {
  data: FlowDatum[];
  currency?: string;
  visible?: FlowVisibility;
}) {
  const hasData = data.some((d) => d.expense > 0 || d.income > 0);
  if (!hasData) return null;
  // Dense daily view (28–31 bars): thin out labels. Year view (12 bars): show all.
  const labelInterval = data.length > 15 ? 6 : 0;
  const showExpense = visible !== "income";
  const showIncome = visible !== "expenses";

  function renderTooltip({ active, payload }: TooltipProps<number, string>) {
    if (!active || !payload || payload.length === 0) return null;
    const datum = payload[0]?.payload as FlowDatum | undefined;
    if (!datum) return null;
    return (
      <div className="chart-tooltip">
        <span className="chart-tooltip-date">{datum.date}</span>
        {showExpense && datum.expense > 0 ? (
          <span>Out&nbsp;&nbsp;{money(datum.expense, currency)}</span>
        ) : null}
        {showIncome && datum.income > 0 ? (
          <span>In&nbsp;&nbsp;{money(datum.income, currency)}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="chart-wrap" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="20%">
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            tickLine={false}
            axisLine={false}
            interval={labelInterval}
          />
          <Tooltip
            content={renderTooltip}
            cursor={{ fill: "var(--surface-2)" }}
          />
          {showExpense ? (
            <Bar
              dataKey="expense"
              fill="var(--primary)"
              radius={[3, 3, 0, 0]}
              maxBarSize={24}
            />
          ) : null}
          {showIncome ? (
            <Bar
              dataKey="income"
              fill="var(--success)"
              radius={[3, 3, 0, 0]}
              maxBarSize={24}
            />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
