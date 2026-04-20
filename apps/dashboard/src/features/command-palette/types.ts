import type { LucideIcon } from "lucide-react"

export type CommandPage = "root" | "seeds" | "create" | "search-results"

export interface CommandAction {
  id: string
  label: string
  description?: string
  icon: LucideIcon
  keywords?: string[]
  shortcut?: string // e.g. "N" shown as kbd
  onSelect: () => void
  disabled?: boolean
}

export interface CommandPaletteContext {
  open: boolean
  setOpen: (open: boolean) => void
  pages: CommandPage[]
  pushPage: (page: CommandPage) => void
  popPage: () => void
  search: string
  setSearch: (s: string) => void
}
