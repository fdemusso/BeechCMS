import { useTranslation } from "react-i18next"
import { z } from "zod"
import { SetupChecklistWidget } from "../../components/widgets"
import type { DashboardWidgetProps } from "../widget-definition"
import { VariantSelect } from "../../builder/config-fields"

export const setupChecklistConfigSchema = z.object({
  variant: z.enum(["full", "compact"]).optional().catch(undefined),
})
export type SetupChecklistConfig = z.infer<typeof setupChecklistConfigSchema>

export function SetupChecklistAdapter({ config }: DashboardWidgetProps<SetupChecklistConfig>) {
  return <SetupChecklistWidget variant={config.variant} />
}

const SETUP_CHECKLIST_VARIANT_OPTIONS = [
  { value: "full", labelKey: "dashboard.builder.config.variants.full" },
  { value: "compact", labelKey: "dashboard.builder.config.variants.compact" },
]

export function SetupChecklistConfigPanel({
  config,
  onChange,
}: {
  config: SetupChecklistConfig
  onChange: (next: SetupChecklistConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <VariantSelect
      label={t("dashboard.builder.config.variant")}
      value={config.variant ?? "full"}
      options={SETUP_CHECKLIST_VARIANT_OPTIONS}
      onChange={(variant) => onChange({ ...config, variant: variant as "full" | "compact" })}
    />
  )
}
