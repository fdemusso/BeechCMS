import { useTranslation } from "react-i18next"
import { z } from "zod"
import { RecentContentWidget } from "../../components/widgets"
import type { DashboardWidgetProps } from "../widget-definition"
import { SeedSelect, VariantSelect } from "../../builder/config-fields"

export const recentContentConfigSchema = z.object({
  seedSlug: z.string().catch(""),
  variant: z.enum(["list", "cards"]).optional().catch(undefined),
})
export type RecentContentConfig = z.infer<typeof recentContentConfigSchema>

export function RecentContentAdapter({ instance, config }: DashboardWidgetProps<RecentContentConfig>) {
  return <RecentContentWidget seedSlug={config.seedSlug} variant={config.variant} title={instance.title} />
}

const RECENT_CONTENT_VARIANT_OPTIONS = [
  { value: "list", labelKey: "dashboard.builder.config.variants.list" },
  { value: "cards", labelKey: "dashboard.builder.config.variants.cards" },
]

export function RecentContentConfigPanel({
  config,
  onChange,
}: {
  config: RecentContentConfig
  onChange: (next: RecentContentConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <SeedSelect value={config.seedSlug} onChange={(seedSlug) => onChange({ ...config, seedSlug })} />
      <VariantSelect
        label={t("dashboard.builder.config.variant")}
        value={config.variant ?? "list"}
        options={RECENT_CONTENT_VARIANT_OPTIONS}
        onChange={(variant) => onChange({ ...config, variant: variant as "list" | "cards" })}
      />
    </div>
  )
}
