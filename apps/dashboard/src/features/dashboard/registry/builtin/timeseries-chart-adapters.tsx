import { useTranslation } from "react-i18next"
import { z } from "zod"
import type { IconComponent } from '@/lib/icon-registry'
import { TimeseriesChartWidget } from "../../components/widgets/timeseries-chart-widget"
import type { TimeseriesChartKind } from "../../components/widgets/timeseries-chart-widget"
import type { DashboardWidgetProps } from "../widget-definition"
import {
  SeedSelect,
  FormulaEditor,
  WindowSelect,
  BranchAliasSelect,
  TextField,
} from "../../builder/config-fields"
import { timeWindowSchema } from "./stat-adapters"

const aggregateFormulaSchema = z.union([
  z.object({ op: z.literal("count") }),
  z.object({ op: z.literal("sum"), column: z.string() }),
  z.object({ op: z.literal("avg"), column: z.string() }),
  z.object({ op: z.literal("min"), column: z.string() }),
  z.object({ op: z.literal("max"), column: z.string() }),
  z.object({ op: z.literal("countWhere"), column: z.string(), value: z.unknown() }),
  z.object({ op: z.literal("percentageOf"), numeratorColumn: z.string(), denominatorColumn: z.string() }),
])

export const timeseriesChartConfigSchema = z.object({
  seedSlug: z.string(),
  formula: aggregateFormulaSchema.optional(),
  window: timeWindowSchema.optional(),
  groupColumn: z.string().optional(),
  color: z.string().optional(),
})
export type TimeseriesChartWidgetConfig = z.infer<typeof timeseriesChartConfigSchema>

export function makeTimeseriesChartAdapter(kind: TimeseriesChartKind, labelKey: string, icon: IconComponent) {
  return function TimeseriesChartAdapter({ instance, config }: DashboardWidgetProps<TimeseriesChartWidgetConfig>) {
    const { t } = useTranslation()
    return <TimeseriesChartWidget config={config} kind={kind} title={instance.title || t(labelKey)} icon={icon} />
  }
}

export function TimeseriesChartConfigPanel({
  config,
  onChange,
}: {
  config: TimeseriesChartWidgetConfig
  onChange: (next: TimeseriesChartWidgetConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <SeedSelect value={config.seedSlug} onChange={(seedSlug) => onChange({ ...config, seedSlug })} />
      <FormulaEditor
        seedSlug={config.seedSlug}
        value={config.formula}
        onChange={(formula) => onChange({ ...config, formula })}
      />
      <WindowSelect value={config.window} onChange={(window) => onChange({ ...config, window })} />
      <BranchAliasSelect
        seedSlug={config.seedSlug}
        value={config.groupColumn}
        onChange={(groupColumn) => onChange({ ...config, groupColumn })}
        label={t("dashboard.builder.config.groupColumn")}
      />
      <TextField
        label={t("dashboard.builder.config.color")}
        value={config.color}
        onChange={(color) => onChange({ ...config, color })}
        placeholder="#3b82f6"
      />
    </div>
  )
}
