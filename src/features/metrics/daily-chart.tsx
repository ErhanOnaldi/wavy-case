"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function DailyChart({
  data,
}: {
  data: { date: string; views: number }[];
}) {
  return (
    <div>
      <div
        className="h-64 w-full min-w-0"
        role="img"
        aria-label="Daily observed view increases across the campaign period, including days with zero measurements."
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart
            data={data}
            margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
            accessibilityLayer
          >
            <CartesianGrid
              vertical={false}
              stroke="#e7ece8"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "#65736d" }}
              minTickGap={45}
              tickFormatter={(value: string) =>
                value.slice(5).replace("-", "/")
              }
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "#65736d" }}
              width={48}
              allowDecimals={false}
              tickFormatter={(value: number) =>
                new Intl.NumberFormat("en", { notation: "compact" }).format(
                  value,
                )
              }
            />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                borderColor: "#dfe5e1",
                fontSize: 12,
              }}
              labelFormatter={(label) => `${label} · UTC`}
            />
            <Area
              type="linear"
              dataKey="views"
              name="Observed views"
              stroke="#246746"
              strokeWidth={2}
              fill="#e9f2ec"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Daily increases, recorded on the measurement date (UTC). Days without a
        measurement appear as zero.
      </p>
    </div>
  );
}
