import {
  LayoutDashboard,
  Image as ImageIcon,
  Settings,
  Folder,
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
import type { Seed } from "@beech/core"
import { SLUG_ICON_MAP } from "@/config/dashboard-menu"
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
  const nav = (path: string) => { navigate(path); setOpen(false) }

  return (
    <>
      <CommandGroup heading="Naviga" forceMount>
        <CommandItem onSelect={() => nav("/")}>
          <LayoutDashboard className="size-4 shrink-0 text-muted-foreground" />
          <span>Dashboard</span>
        </CommandItem>
        <CommandItem onSelect={() => nav("/media")}>
          <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
          <span>Media Library</span>
        </CommandItem>
        <CommandItem onSelect={() => nav("/settings")}>
          <Settings className="size-4 shrink-0 text-muted-foreground" />
          <span>Impostazioni</span>
        </CommandItem>
      </CommandGroup>

      <CommandSeparator />

      <CommandGroup heading="Contenuti">
        {seeds.slice(0, 5).map((seed) => {
          const SeedIcon = SLUG_ICON_MAP[seed.slug] ?? Folder
          return (
            <CommandItem
              key={seed.slug}
              onSelect={() => nav(`/content/${seed.slug}`)}
              keywords={[seed.slug, "contenuto", "lista"]}
            >
              <SeedIcon className="size-4 shrink-0 text-muted-foreground" />
              <span>Vai a {seed.label}…</span>
            </CommandItem>
          )
        })}
        {seeds.length > 5 && (
          <CommandItem onSelect={() => pushPage("seeds")}>
            <Layers className="size-4 shrink-0 text-muted-foreground" />
            <span>Tutti i seed…</span>
          </CommandItem>
        )}
      </CommandGroup>

      <CommandSeparator />

      <CommandGroup heading="Crea">
        <CommandItem onSelect={() => pushPage("create")}>
          <Plus className="size-4 shrink-0 text-muted-foreground" />
          <span>Nuovo contenuto…</span>
          <CommandShortcut className="flex items-center gap-0.5">
            <kbd className="text-xs font-mono bg-muted text-muted-foreground px-1 rounded">Alt</kbd>
            <kbd className="text-xs font-mono bg-muted text-muted-foreground px-1 rounded">N</kbd>
          </CommandShortcut>
        </CommandItem>
      </CommandGroup>

      <CommandSeparator />

      <CommandGroup heading="Strumenti">
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
          <span>Cambia tema</span>
        </CommandItem>
      </CommandGroup>
    </>
  )
}
