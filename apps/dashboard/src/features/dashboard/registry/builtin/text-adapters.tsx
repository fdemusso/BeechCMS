import { useTranslation } from "react-i18next"
import { z } from "zod"
import { TextWidget } from "../../components/widgets/text-widget"
import type { DashboardWidgetProps } from "../widget-definition"
import { TextAreaField, VariantSelect } from "../../builder/config-fields"

export const textConfigSchema = z.object({
  content: z.string().catch(""),
  align: z.enum(["left", "center"]).optional(),
})
export type TextWidgetConfig = z.infer<typeof textConfigSchema>

export function TextAdapter({ config }: DashboardWidgetProps<TextWidgetConfig>) {
  return <TextWidget config={config} />
}

const TEXT_ALIGN_OPTIONS = [
  { value: "left", labelKey: "dashboard.builder.config.variants.left" },
  { value: "center", labelKey: "dashboard.builder.config.variants.center" },
]

export function TextConfigPanel({
  config,
  onChange,
}: {
  config: TextWidgetConfig
  onChange: (next: TextWidgetConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <TextAreaField
        label={t("dashboard.builder.config.content")}
        value={config.content}
        onChange={(content) => onChange({ ...config, content })}
      />
      <VariantSelect
        label={t("dashboard.builder.config.align")}
        value={config.align ?? "left"}
        options={TEXT_ALIGN_OPTIONS}
        onChange={(align) => onChange({ ...config, align: align as "left" | "center" })}
      />
    </div>
  )
}
