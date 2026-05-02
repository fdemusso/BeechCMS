import { useTranslation } from "react-i18next"
import { Folder } from "lucide-react"
import { CommandGroup, CommandItem } from "@/components/ui/command"
import type { Seed } from "@beechcms/core"
import { SLUG_ICON_MAP } from "@/config/dashboard-menu"

interface SeedsViewProps {
  seeds: Seed[]
  navigate: (path: string) => void
  setOpen: (open: boolean) => void
  /** "navigate" → /content/:slug, "create" → /content/:slug/create */
  mode: "navigate" | "create"
}

export function SeedsView({ seeds, navigate, setOpen, mode }: SeedsViewProps) {
  const { t } = useTranslation()
  const heading = mode === "create" ? t("commandPalette.chooseType") : t("commandPalette.chooseSeed")

  return (
    <CommandGroup heading={heading}>
      {seeds.map((seed) => {
        const SeedIcon = SLUG_ICON_MAP[seed.slug] ?? Folder
        return (
          <CommandItem
            key={seed.slug}
            onSelect={() => {
              const path =
                mode === "create"
                  ? `/content/${seed.slug}/create`
                  : `/content/${seed.slug}`
              navigate(path)
              setOpen(false)
            }}
          >
            <SeedIcon className="size-4 shrink-0 text-muted-foreground" />
            <div className="flex flex-col">
              <span>{seed.label}</span>
              <span className="text-[10px] text-muted-foreground">{seed.slug}</span>
            </div>
          </CommandItem>
        )
      })}
    </CommandGroup>
  )
}
