import { useTranslation } from "react-i18next"
import {
  LayoutDashboard,
  Image as ImageIcon,
  Settings,
  Layers,
  Plus,
  Sun,
  Moon,
} from "lucide-react"
import {
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import type { Seed } from "@beechcms/core"
import { resolveIcon } from "@/lib/icon-registry"
import type { CommandPage } from "../types"

interface RootViewProps {
  seeds: Seed[]
  pushPage: (page: CommandPage) => void
  navigate: (path: string) => void
  setOpen: (open: boolean) => void
  theme: string | undefined
  toggleTheme: () => void
}

export function RootView({
  seeds,
  pushPage,
  navigate,
  setOpen,
  theme,
  toggleTheme,
}: RootViewProps) {
  const { t } = useTranslation()
  const nav = (path: string) => { navigate(path); setOpen(false) }

  return (
    <>
      <CommandGroup heading={t("commandPalette.navigate")} forceMount>
        <CommandItem onSelect={() => nav("/")}>
          <LayoutDashboard className="size-4 shrink-0 text-muted-foreground" />
          <span>{t("commandPalette.dashboard")}</span>
        </CommandItem>
        <CommandItem onSelect={() => nav("/media")}>
          <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
          <span>{t("commandPalette.mediaLibrary")}</span>
        </CommandItem>
        <CommandItem onSelect={() => nav("/settings")}>
          <Settings className="size-4 shrink-0 text-muted-foreground" />
          <span>{t("commandPalette.settings")}</span>
        </CommandItem>
      </CommandGroup>

      <CommandSeparator />

      <CommandGroup heading={t("commandPalette.contents")}>
        {seeds.slice(0, 5).map((seed) => {
          const SeedIcon = resolveIcon(seed.dashboard?.icon)
          return (
            <CommandItem
              key={seed.slug}
              onSelect={() => nav(`/content/${seed.slug}`)}
              keywords={[seed.slug, "contenuto", "lista"]}
            >
              <SeedIcon className="size-4 shrink-0 text-muted-foreground" />
              <span>{t("commandPalette.goTo", { label: seed.label })}</span>
            </CommandItem>
          )
        })}
        {seeds.length > 5 && (
          <CommandItem onSelect={() => pushPage("seeds")}>
            <Layers className="size-4 shrink-0 text-muted-foreground" />
            <span>{t("commandPalette.allSeeds")}</span>
          </CommandItem>
        )}
      </CommandGroup>

      <CommandSeparator />

      <CommandGroup heading={t("commandPalette.create")}>
        <CommandItem onSelect={() => pushPage("create")}>
          <Plus className="size-4 shrink-0 text-muted-foreground" />
          <span>{t("commandPalette.newContent")}</span>
          <CommandShortcut className="flex items-center gap-0.5">
            <kbd className="text-xs font-mono bg-muted text-muted-foreground px-1 rounded">Alt</kbd>
            <kbd className="text-xs font-mono bg-muted text-muted-foreground px-1 rounded">N</kbd>
          </CommandShortcut>
        </CommandItem>
      </CommandGroup>

      <CommandSeparator />

      <CommandGroup heading={t("commandPalette.tools")}>
        {/* TODO: la ricerca globale non funziona — disabilitata temporaneamente */}
        {/* <CommandItem onSelect={() => pushPage("search-results")}>
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <span>Cerca nei contenuti…</span>
          <CommandShortcut className="flex items-center gap-0.5">
            <kbd className="text-xs font-mono bg-muted text-muted-foreground px-1 rounded">⌘</kbd>
            <kbd className="text-xs font-mono bg-muted text-muted-foreground px-1 rounded">F</kbd>
          </CommandShortcut>
        </CommandItem> */}
        <CommandItem
          onSelect={toggleTheme}
          keywords={["dark mode", "light mode", "tema", "theme"]}
        >
          {theme === "dark" ? (
            <Sun className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <Moon className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span>{t("commandPalette.changeTheme")}</span>
        </CommandItem>
      </CommandGroup>
    </>
  )
}
