import { useTranslation } from "react-i18next"
import { z } from "zod"
import { PieChartWidget } from "../../components/widgets/pie-chart-widget"
import type { DashboardWidgetProps } from "../widget-definition"
import {
  SeedSelect,
  BranchAliasSelect,
  WindowSelect,
  SwitchField,
  NumberField,
} from "../../builder/config-fields"
import { timeWindowSchema } from "./stat-adapters"

export const pieChartConfigSchema = z.object({
  seedSlug: z.string(),
  column: z.string(),
  window: timeWindowSchema.optional(),
  donut: z.boolean().optional(),
  limit: z.number().optional(),
})
export type PieChartWidgetConfig = z.infer<typeof pieChartConfigSchema>

export function PieChartAdapter({ instance, config }: DashboardWidgetProps<PieChartWidgetConfig>) {
  const { t } = useTranslation()
  return <PieChartWidget config={config} title={instance.title || t("dashboard.widgetRegistry.widgets.pieChart.label")} />
}

export function PieChartConfigPanel({
  config,
  onChange,
}: {
  config: PieChartWidgetConfig
  onChange: (next: PieChartWidgetConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <SeedSelect value={config.seedSlug} onChange={(seedSlug) => onChange({ ...config, seedSlug })} />
      <BranchAliasSelect
        seedSlug={config.seedSlug}
        value={config.column}
        onChange={(column) => onChange({ ...config, column })}
      />
      <WindowSelect value={config.window} onChange={(window) => onChange({ ...config, window })} />
      <SwitchField
        label={t("dashboard.builder.config.donut")}
        checked={config.donut ?? false}
        onChange={(donut) => onChange({ ...config, donut })}
      />
      <NumberField
        label={t("dashboard.builder.config.limit")}
        value={config.limit}
        onChange={(limit) => onChange({ ...config, limit })}
        min={1}
      />
    </div>
  )
}
