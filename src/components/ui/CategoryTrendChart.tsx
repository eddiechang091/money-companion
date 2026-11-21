import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  type TooltipProps,
} from "recharts";
import { money } from "@/lib/utils";
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
  // With one or two points a line has no visible curve, so show dots.
  const showDots = data.length <= 2;

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
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            tickLine={false}
            axisLine={false}
            interval={labelInterval}
            padding={{ left: 24, right: 24 }}
          />
          <Tooltip content={renderTooltip} cursor={{ stroke: "var(--border)" }} />
          {categories.map((c) => (
            <Line
              key={c.id}
              type="monotone"
              dataKey={c.id}
              stroke={c.color}
              strokeWidth={2}
              dot={showDots ? { r: 3 } : false}
              activeDot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
