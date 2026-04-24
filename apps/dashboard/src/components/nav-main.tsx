"use client"

import { ChevronRight, type LucideIcon } from "lucide-react"
import { Link, useLocation } from "react-router-dom"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

type NavMainSubItem = {
  readonly title: string
  readonly url: string
}

type NavMainItem = {
  readonly title: string
  readonly url: string
  readonly icon: LucideIcon
  readonly isActive?: boolean
  readonly items?: ReadonlyArray<NavMainSubItem>
}

type NavMainProps = {
  readonly items: ReadonlyArray<NavMainItem>
  readonly groupLabel?: string
  readonly className?: string
}

export function NavMain({
  items,
  groupLabel = "Menu",
  className,
}: NavMainProps) {
  const location = useLocation()
  const currentPath = location.pathname
  const currentSearch = location.search

  return (
    <SidebarGroup className={className}>
      <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          // A collapsible parent is open when the current path starts with its base path
          const isParentActive =
            item.items?.length
              ? currentPath === item.url || currentPath.startsWith(item.url + "/") || currentPath.startsWith(item.url + "?")
              : currentPath === item.url

          return (
            <Collapsible key={item.title} asChild defaultOpen={item.isActive || isParentActive}>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip={item.title} isActive={isParentActive && !item.items?.length}>
                  <Link to={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
                {item.items?.length ? (
                  <>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuAction className="data-[state=open]:rotate-90">
                        <ChevronRight />
                        <span className="sr-only">Toggle</span>
                      </SidebarMenuAction>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.items?.map((subItem) => {
                          // Match sub-item: compare full path + search string
                          const [subPath, subQuery] = subItem.url.split("?")
                          const subSearch = subQuery ? `?${subQuery}` : ""
                          const isSubActive =
                            currentPath === subPath &&
                            (subSearch === "" || currentSearch === subSearch)

                          return (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton asChild isActive={isSubActive}>
                                <Link to={subItem.url}>
                                  <span>{subItem.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          )
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </>
                ) : null}
              </SidebarMenuItem>
            </Collapsible>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
