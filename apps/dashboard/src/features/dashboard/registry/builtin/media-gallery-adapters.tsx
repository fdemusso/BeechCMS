import { useTranslation } from "react-i18next"
import { z } from "zod"
import { MediaGalleryWidget } from "../../components/widgets"
import type { DashboardWidgetProps } from "../widget-definition"
import { SeedSelect, VariantSelect } from "../../builder/config-fields"

export const mediaGalleryConfigSchema = z.object({
  seedSlug: z.string().catch(""),
  variant: z.enum(["grid", "unused"]).optional().catch(undefined),
})
export type MediaGalleryConfig = z.infer<typeof mediaGalleryConfigSchema>

export function MediaGalleryAdapter({ config }: DashboardWidgetProps<MediaGalleryConfig>) {
  return <MediaGalleryWidget seedSlug={config.seedSlug} variant={config.variant} />
}

const MEDIA_GALLERY_VARIANT_OPTIONS = [
  { value: "grid", labelKey: "dashboard.builder.config.variants.grid" },
  { value: "unused", labelKey: "dashboard.builder.config.variants.unused" },
]

export function MediaGalleryConfigPanel({
  config,
  onChange,
}: {
  config: MediaGalleryConfig
  onChange: (next: MediaGalleryConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <SeedSelect value={config.seedSlug} onChange={(seedSlug) => onChange({ ...config, seedSlug })} />
      <VariantSelect
        label={t("dashboard.builder.config.variant")}
        value={config.variant ?? "grid"}
        options={MEDIA_GALLERY_VARIANT_OPTIONS}
        onChange={(variant) => onChange({ ...config, variant: variant as "grid" | "unused" })}
      />
    </div>
  )
}
