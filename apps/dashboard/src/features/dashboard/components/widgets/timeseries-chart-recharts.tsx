// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { TimeseriesPoint } from "@beechcms/core"
import type { TimeseriesChartKind } from "./timeseries-chart-widget"

interface TimeseriesChartRechartsProps {
  kind: TimeseriesChartKind
  data: TimeseriesPoint[]
  color: string
  chartConfig: ChartConfig
}

/** Recharts rendering split out so it can be `React.lazy`-loaded. */
export default function TimeseriesChartRecharts({ kind, data, color, chartConfig }: TimeseriesChartRechartsProps) {
  if (kind === "bar") {
    return (
      <ChartContainer config={chartConfig} className="h-full w-full">
        <BarChart data={data}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="value" fill={color} radius={4} />
        </BarChart>
      </ChartContainer>
    )
  }

  if (kind === "area") {
    return (
      <ChartContainer config={chartConfig} className="h-full w-full">
        <AreaChart data={data}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area dataKey="value" type="monotone" fill={color} fillOpacity={0.2} stroke={color} />
        </AreaChart>
      </ChartContainer>
    )
  }

  return (
    <ChartContainer config={chartConfig} className="h-full w-full">
      <LineChart data={data}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line dataKey="value" type="monotone" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ChartContainer>
  )
}
