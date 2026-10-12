import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";
import { money } from "@/lib/utils";

export interface ChartDatum {
  date: string;
  label: string;
  total: number;
}

export default function SpendingChart({
  data,
  currency = "USD",
}: {
  data: ChartDatum[];
  currency?: string;
}) {
  const hasData = data.some((d) => d.total > 0);
  if (!hasData) return null;
  // Dense daily view (28–31 bars): thin out labels. Year view (12 bars): show all.
  const labelInterval = data.length > 15 ? 6 : 0;

  function renderTooltip({ active, payload }: TooltipProps<number, string>) {
    if (!active || !payload || payload.length === 0) return null;
    const item = payload[0];
    if (!item || item.value === undefined) return null;
    return (
      <div className="chart-tooltip">
        <span className="chart-tooltip-date">{(item.payload as ChartDatum).date}</span>
        <span className="chart-tooltip-amount">{money(item.value as number, currency)}</span>
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
          <Bar
            dataKey="total"
            fill="var(--primary)"
            radius={[3, 3, 0, 0]}
            maxBarSize={24}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
