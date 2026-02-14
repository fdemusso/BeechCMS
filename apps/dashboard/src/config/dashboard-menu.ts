import type { LucideIcon } from "lucide-react"
import { LayoutDashboard, Settings, Folder } from "lucide-react"

/** Voce di navigazione principale (può avere sottomenu) */
export interface NavItem {
  title: string
  url: string
  icon: LucideIcon
  isActive?: boolean
  items?: { title: string; url: string }[]
}

/** Voce di navigazione secondaria (senza sottomenu) */
export interface NavSecondaryItem {
  title: string
  url: string
  icon: LucideIcon
}

/** Menu principale statico. TODO: Merge with dynamic seeds from @beech/core here */
export const STATIC_MENU: NavItem[] = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
    isActive: true,
  },
  {
    title: "Progetti",
    url: "/content/progetti",
    icon: Folder,
  },
  {
    title: "Impostazioni",
    url: "#",
    icon: Settings,
    items: [
      { title: "Generale", url: "#" },
      { title: "Account", url: "#" },
    ],
  },
]

/** Voci secondarie (Support, Feedback, ecc.). Vuoto per CMS minimale */
export const STATIC_NAV_SECONDARY: NavSecondaryItem[] = []
