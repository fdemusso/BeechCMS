import { useTranslation } from "react-i18next"
import { z } from "zod"
import { PendingDraftsWidget } from "../../components/widgets"
import type { DashboardWidgetProps } from "../widget-definition"
import { SeedSelect, VariantSelect } from "../../builder/config-fields"

export const pendingDraftsConfigSchema = z.object({
  seedSlug: z.string().catch(""),
  variant: z.enum(["counter", "list"]).optional().catch(undefined),
})
export type PendingDraftsConfig = z.infer<typeof pendingDraftsConfigSchema>

export function PendingDraftsAdapter({ instance, config }: DashboardWidgetProps<PendingDraftsConfig>) {
  return <PendingDraftsWidget seedSlug={config.seedSlug} variant={config.variant} title={instance.title} />
}

const PENDING_DRAFTS_VARIANT_OPTIONS = [
  { value: "counter", labelKey: "dashboard.builder.config.variants.counter" },
  { value: "list", labelKey: "dashboard.builder.config.variants.list" },
]

export function PendingDraftsConfigPanel({
  config,
  onChange,
}: {
  config: PendingDraftsConfig
  onChange: (next: PendingDraftsConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <SeedSelect value={config.seedSlug} onChange={(seedSlug) => onChange({ ...config, seedSlug })} />
      <VariantSelect
        label={t("dashboard.builder.config.variant")}
        value={config.variant ?? "list"}
        options={PENDING_DRAFTS_VARIANT_OPTIONS}
        onChange={(variant) => onChange({ ...config, variant: variant as "counter" | "list" })}
      />
    </div>
  )
}
