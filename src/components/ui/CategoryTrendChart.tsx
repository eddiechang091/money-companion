import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { compactMoney, money } from "@/lib/utils";
import type { CategoryTrendRow } from "@/lib/analytics";

export interface TrendCategory {
  id: string;
  name: string;
  color: string;
}

/** One line per category; colors come from the category taxonomy. */
export default function CategoryTrendChart({
  data,
  categories,
  currency = "USD",
}: {
  data: CategoryTrendRow[];
  categories: TrendCategory[];
  currency?: string;
}) {
  const hasData = data.some((d) => categories.some((c) => (d[c.id] as number) > 0));
  if (!hasData) return null;
  // 12 monthly points: show every other label so they fit on mobile.
  const labelInterval = data.length > 8 ? 1 : 0;

  function renderTooltip({ active, payload }: TooltipProps<number, string>) {
    if (!active || !payload || payload.length === 0) return null;
    const datum = payload[0]?.payload as CategoryTrendRow | undefined;
    if (!datum) return null;
    const rows = categories.filter((c) => (datum[c.id] as number) > 0);
    if (rows.length === 0) return null;
    return (
      <div className="chart-tooltip">
        <span className="chart-tooltip-date">{datum.label}</span>
        {rows.map((c) => (
          <span key={c.id}>
            <span className="lg-dot" style={{ background: c.color }} />
            {c.name}&nbsp;&nbsp;{money(datum[c.id] as number, currency)}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="chart-wrap chart-wrap-tall" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            interval={labelInterval}
            padding={{ left: 24, right: 24 }}
          />
          <YAxis
            width={44}
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tickFormatter={(value: number) => compactMoney(value, currency)}
            domain={[0, "auto"]}
            allowDecimals={false}
          />
          <Tooltip content={renderTooltip} cursor={{ stroke: "var(--border)" }} />
          {categories.map((c) => (
            <Line
              key={c.id}
              type="monotone"
              dataKey={c.id}
              stroke={c.color}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
