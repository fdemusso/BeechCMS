import { useTranslation } from "react-i18next"
import { z } from "zod"
import { SiteStatusWidget } from "../../components/widgets"
import type { DashboardWidgetProps } from "../widget-definition"
import { VariantSelect } from "../../builder/config-fields"

export const siteStatusConfigSchema = z.object({
  variant: z.enum(["badge", "pill-row"]).optional().catch(undefined),
})
export type SiteStatusConfig = z.infer<typeof siteStatusConfigSchema>

export function SiteStatusAdapter({ config }: DashboardWidgetProps<SiteStatusConfig>) {
  return <SiteStatusWidget variant={config.variant} />
}

const SITE_STATUS_VARIANT_OPTIONS = [
  { value: "badge", labelKey: "dashboard.builder.config.variants.badge" },
  { value: "pill-row", labelKey: "dashboard.builder.config.variants.pillRow" },
]

export function SiteStatusConfigPanel({
  config,
  onChange,
}: {
  config: SiteStatusConfig
  onChange: (next: SiteStatusConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <VariantSelect
      label={t("dashboard.builder.config.variant")}
      value={config.variant ?? "badge"}
      options={SITE_STATUS_VARIANT_OPTIONS}
      onChange={(variant) => onChange({ ...config, variant: variant as "badge" | "pill-row" })}
    />
  )
}
