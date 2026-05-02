import type { LucideIcon } from "lucide-react"
import {
  LayoutDashboard,
  Settings,
  Folder,
  Newspaper,
  ShoppingBag,
  Users,
  MessageSquare,
  Layout,
  UserCircle,
  Mail,
} from "lucide-react"
import { SEED_REGISTRY } from "@beech/core"

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

/** Mappa slug seed -> icona Lucide */
export const SLUG_ICON_MAP: Record<string, LucideIcon> = {
  articoli: Newspaper,
  prodotti: ShoppingBag,
  team: Users,
  testimonianze: MessageSquare,
  pagine: Layout,
  clienti: UserCircle,
  messaggi: Mail,
}

/** Menu statico: solo Dashboard e Impostazioni */
export function getStaticMenu(t: (key: string) => string): NavItem[] {
  return [
    {
      title: "Dashboard",
      url: "/",
      icon: LayoutDashboard,
      isActive: true,
    },
    {
      title: t("settings.title"),
      url: "/settings",
      icon: Settings,
      items: [
        { title: t("settings.tabs.profile"), url: "/settings?tab=profile" },
        { title: t("settings.tabs.interface"), url: "/settings?tab=interface" },
        { title: t("settings.tabs.security"), url: "/settings?tab=security" },
        { title: t("settings.tabs.storage"), url: "/settings?tab=storage" },
        { title: t("settings.tabs.notifications"), url: "/settings?tab=notifications" },
      ],
    },
  ]
}

/** Menu contenuti: generato dinamicamente dai seed registrati */
export const CONTENT_MENU: NavItem[] = Object.values(SEED_REGISTRY).map((seed) => ({
  title: seed.labelPlural ?? seed.label,
  url: `/content/${seed.slug}`,
  icon: SLUG_ICON_MAP[seed.slug] ?? Folder,
}))

/** Voci secondarie (Support, Feedback, ecc.). Vuoto per CMS minimale */
export const STATIC_NAV_SECONDARY: NavSecondaryItem[] = []
