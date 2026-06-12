// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Cell, Pie, PieChart } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { DistributionSlice } from "@beechcms/core"

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

interface PieChartRechartsProps {
  data: DistributionSlice[]
  donut: boolean
  chartConfig: ChartConfig
}

/** Recharts rendering split out so it can be `React.lazy`-loaded. */
export default function PieChartRecharts({ data, donut, chartConfig }: PieChartRechartsProps) {
  return (
    <ChartContainer config={chartConfig} className="h-full w-full">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius={donut ? "55%" : 0}
          outerRadius="80%"
          strokeWidth={2}
        >
          {data.map((slice, index) => (
            <Cell key={slice.label} fill={PIE_COLORS[index % PIE_COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}
