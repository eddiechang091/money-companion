import {
  CartesianGrid,
  Dot,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type DotProps,
  type TooltipProps,
} from "recharts";
import { compactMoney, money } from "@/lib/utils";
import { resolveTrendPointClick, type TrendPointClick } from "@/lib/analytics";
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
  onPointClick,
}: {
  data: CategoryTrendRow[];
  categories: TrendCategory[];
  currency?: string;
  /** Fired when a dot is tapped — the caller navigates to its transactions. */
  onPointClick?: (point: TrendPointClick) => void;
}) {
  const hasData = data.some((d) => categories.some((c) => (d[c.id] as number) > 0));
  if (!hasData) return null;
  // 12 monthly points: show every other label so they fit on mobile.
  const labelInterval = data.length > 8 ? 1 : 0;

  function renderTooltip({ active, payload }: TooltipProps<number, string>) {
    if (!active || !payload || payload.length === 0) return null;
    const datum = payload[0]?.payload as CategoryTrendRow | undefined;
    if (!datum) return null;
    // Rows with money first. On a month where every visible category is
    // $0 (e.g. toggled down to one category with no record that month),
    // show the $0 rows instead of an empty tooltip.
    const rows = categories.filter((c) => (datum[c.id] as number) > 0);
    const shown = rows.length > 0 ? rows : categories;
    if (shown.length === 0) return null;
    return (
      <div className="chart-tooltip">
        <span className="chart-tooltip-date">{datum.label}</span>
        {shown.map((c) => (
          <span key={c.id}>
            <span className="lg-dot" style={{ background: c.color }} />
            {c.name}&nbsp;&nbsp;{money(datum[c.id] as number, currency)}
          </span>
        ))}
      </div>
    );
  }

  // Recharts drops event handlers from the Line's own props (renderDots
  // uses filterProps(..., false)) but keeps them from the dot object
  // (filterProps(..., true)). At runtime the dot's onClick receives the
  // dot's props as its first argument (dataKey, value, payload) — see
  // resolveTrendPointClick. The SAME handler must be on activeDot too:
  // as soon as the tooltip is active, recharts renders the active dot
  // (r=6) on top of the regular dot, and without its own onClick it
  // swallows the tap — hovered/tapped points did nothing.
  //
  // Note the active dot cannot take the handler as an object prop:
  // renderActivePoints calls adaptEventHandlers(activeDot), which invokes
  // the handler with the activeDot OBJECT itself (no dataKey/value/
  // payload), so resolveTrendPointClick would return null. As a render
  // function, the active dot receives the point's real dotProps and the
  // onClick closes over them.
  function handleDotClick(dotProps: unknown) {
    const point = resolveTrendPointClick(dotProps);
    if (point) onPointClick?.(point);
  }

  return (
    <div className="chart-wrap chart-wrap-tall" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--text-muted)" }}
            interval={labelInterval}
            padding={{ left: 24, right: 24 }}
          />
          <YAxis
            width={44}
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--text-muted)" }}
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
              dot={{
                r: 4,
                fill: c.color,
                stroke: "var(--surface)",
                strokeWidth: 1.5,
                onClick: handleDotClick,
              }}
              activeDot={(props: DotProps) => (
                <Dot
                  {...props}
                  r={6}
                  fill={c.color}
                  stroke="var(--surface)"
                  strokeWidth={2}
                  onClick={() => handleDotClick(props)}
                />
              )}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
