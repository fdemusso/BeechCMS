import { useTranslation } from "react-i18next"
import { z } from "zod"
import { StorageWidget } from "../../components/widgets"
import type { DashboardWidgetProps } from "../widget-definition"
import { NumberField, VariantSelect } from "../../builder/config-fields"

export const storageConfigSchema = z.object({
  variant: z.enum(["bar", "gauge"]).optional().catch(undefined),
  totalBytes: z.number().positive().optional().catch(undefined),
})
export type StorageConfig = z.infer<typeof storageConfigSchema>

export function StorageAdapter({ config }: DashboardWidgetProps<StorageConfig>) {
  return <StorageWidget variant={config.variant} totalBytes={config.totalBytes} />
}

const STORAGE_VARIANT_OPTIONS = [
  { value: "bar", labelKey: "dashboard.builder.config.variants.bar" },
  { value: "gauge", labelKey: "dashboard.builder.config.variants.gauge" },
]

export function StorageConfigPanel({
  config,
  onChange,
}: {
  config: StorageConfig
  onChange: (next: StorageConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <VariantSelect
        label={t("dashboard.builder.config.variant")}
        value={config.variant ?? "gauge"}
        options={STORAGE_VARIANT_OPTIONS}
        onChange={(variant) => onChange({ ...config, variant: variant as "bar" | "gauge" })}
      />
      <NumberField
        label={t("dashboard.builder.config.totalBytes")}
        value={config.totalBytes}
        onChange={(totalBytes) => onChange({ ...config, totalBytes })}
        min={1}
      />
    </div>
  )
}
