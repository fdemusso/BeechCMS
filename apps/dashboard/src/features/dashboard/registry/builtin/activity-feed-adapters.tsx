import { useTranslation } from "react-i18next"
import { z } from "zod"
import { ActivityFeedWidget } from "../../components/widgets"
import type { DashboardWidgetProps } from "../widget-definition"
import { SeedSelect, VariantSelect, NumberField } from "../../builder/config-fields"

export const activityFeedConfigSchema = z.object({
  seedSlug: z.string().catch(""),
  variant: z.enum(["feed", "compact"]).optional().catch(undefined),
  limit: z.number().int().positive().optional().catch(undefined),
})
export type ActivityFeedConfig = z.infer<typeof activityFeedConfigSchema>

export function ActivityFeedAdapter({ instance, config }: DashboardWidgetProps<ActivityFeedConfig>) {
  return <ActivityFeedWidget seedSlug={config.seedSlug} variant={config.variant} limit={config.limit} title={instance.title} />
}

const ACTIVITY_FEED_VARIANT_OPTIONS = [
  { value: "feed", labelKey: "dashboard.builder.config.variants.feed" },
  { value: "compact", labelKey: "dashboard.builder.config.variants.compact" },
]

export function ActivityFeedConfigPanel({
  config,
  onChange,
}: {
  config: ActivityFeedConfig
  onChange: (next: ActivityFeedConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <SeedSelect value={config.seedSlug} onChange={(seedSlug) => onChange({ ...config, seedSlug })} />
      <VariantSelect
        label={t("dashboard.builder.config.variant")}
        value={config.variant ?? "feed"}
        options={ACTIVITY_FEED_VARIANT_OPTIONS}
        onChange={(variant) => onChange({ ...config, variant: variant as "feed" | "compact" })}
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
