import { useTranslation } from "react-i18next"
import { z } from "zod"
import { DataTableWidget } from "../../components/widgets/data-table-widget"
import type { DashboardWidgetProps } from "../widget-definition"
import {
  SeedSelect,
  BranchAliasSelect,
  TextField,
  NumberField,
  VariantSelect,
} from "../../builder/config-fields"

export const dataTableConfigSchema = z.object({
  seedSlug: z.string(),
  columns: z.array(z.string()).optional(),
  pageSize: z.number().optional(),
  orderByColumn: z.string().optional(),
  orderDirection: z.enum(["ASC", "DESC"]).optional(),
})
export type DataTableWidgetConfig = z.infer<typeof dataTableConfigSchema>

export function DataTableAdapter({ instance, config }: DashboardWidgetProps<DataTableWidgetConfig>) {
  return <DataTableWidget config={config} title={instance.title} />
}

const ORDER_DIRECTION_OPTIONS = [
  { value: "ASC", labelKey: "dashboard.builder.config.variants.asc" },
  { value: "DESC", labelKey: "dashboard.builder.config.variants.desc" },
]

export function DataTableConfigPanel({
  config,
  onChange,
}: {
  config: DataTableWidgetConfig
  onChange: (next: DataTableWidgetConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <SeedSelect value={config.seedSlug} onChange={(seedSlug) => onChange({ ...config, seedSlug })} />
      <TextField
        label={t("dashboard.builder.config.columns")}
        value={(config.columns ?? []).join(", ")}
        onChange={(value) =>
          onChange({ ...config, columns: value.split(",").map((c) => c.trim()).filter(Boolean) })
        }
        placeholder={t("dashboard.builder.config.columnsPlaceholder")}
      />
      <NumberField
        label={t("dashboard.builder.config.pageSize")}
        value={config.pageSize}
        onChange={(pageSize) => onChange({ ...config, pageSize })}
        min={1}
      />
      <BranchAliasSelect
        seedSlug={config.seedSlug}
        value={config.orderByColumn}
        onChange={(orderByColumn) => onChange({ ...config, orderByColumn })}
        label={t("dashboard.builder.config.orderByColumn")}
      />
      <VariantSelect
        label={t("dashboard.builder.config.orderDirection")}
        value={config.orderDirection ?? "ASC"}
        options={ORDER_DIRECTION_OPTIONS}
        onChange={(orderDirection) => onChange({ ...config, orderDirection: orderDirection as "ASC" | "DESC" })}
      />
    </div>
  )
}
