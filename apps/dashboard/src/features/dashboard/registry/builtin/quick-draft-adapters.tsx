import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import type { Seed } from "@beechcms/core"
import { useSchema } from "@/features/shared"
import { QuickDraftWidget } from "../../components/widgets"
import type { DashboardWidgetProps } from "../widget-definition"
import { VariantSelect } from "../../builder/config-fields"

const EMPTY_SEEDS: Seed[] = []

export const quickDraftConfigSchema = z.object({
  variant: z.enum(["minimal", "expanded"]).optional().catch(undefined),
})
export type QuickDraftConfig = z.infer<typeof quickDraftConfigSchema>

export function QuickDraftAdapter({ config }: DashboardWidgetProps<QuickDraftConfig>) {
  const { data: seeds = EMPTY_SEEDS } = useSchema()
  const seedOptions = useMemo(
    () =>
      seeds.map((seed) => {
        const nameBranch = seed.branches.find((b) => b.alias === seed.displayNameAlias)
        return {
          slug: seed.slug,
          label: seed.label,
          displayNameAlias: seed.displayNameAlias,
          displayNameLabel: nameBranch?.label ?? seed.displayNameAlias,
        }
      }),
    [seeds],
  )
  return <QuickDraftWidget seeds={seedOptions} variant={config.variant} />
}

const QUICK_DRAFT_VARIANT_OPTIONS = [
  { value: "minimal", labelKey: "dashboard.builder.config.variants.minimal" },
  { value: "expanded", labelKey: "dashboard.builder.config.variants.expanded" },
]

export function QuickDraftConfigPanel({
  config,
  onChange,
}: {
  config: QuickDraftConfig
  onChange: (next: QuickDraftConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <VariantSelect
      label={t("dashboard.builder.config.variant")}
      value={config.variant ?? "minimal"}
      options={QUICK_DRAFT_VARIANT_OPTIONS}
      onChange={(variant) => onChange({ ...config, variant: variant as "minimal" | "expanded" })}
    />
  )
}
