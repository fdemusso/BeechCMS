import { useTranslation } from "react-i18next"
import { z } from "zod"
import { PublicationStatsWidget } from "../../components/widgets"
import type { DashboardWidgetProps } from "../widget-definition"
import { VariantSelect } from "../../builder/config-fields"

export const publicationStatsConfigSchema = z.object({
  variant: z.enum(["trio", "single"]).optional().catch(undefined),
})
export type PublicationStatsConfig = z.infer<typeof publicationStatsConfigSchema>

export function PublicationStatsAdapter({ config }: DashboardWidgetProps<PublicationStatsConfig>) {
  return <PublicationStatsWidget variant={config.variant} />
}

const PUBLICATION_STATS_VARIANT_OPTIONS = [
  { value: "trio", labelKey: "dashboard.builder.config.variants.trio" },
  { value: "single", labelKey: "dashboard.builder.config.variants.single" },
]

export function PublicationStatsConfigPanel({
  config,
  onChange,
}: {
  config: PublicationStatsConfig
  onChange: (next: PublicationStatsConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <VariantSelect
      label={t("dashboard.builder.config.variant")}
      value={config.variant ?? "trio"}
      options={PUBLICATION_STATS_VARIANT_OPTIONS}
      onChange={(variant) => onChange({ ...config, variant: variant as "trio" | "single" })}
    />
  )
}
