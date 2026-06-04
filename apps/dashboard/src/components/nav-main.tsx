// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

"use client"

import { useRef } from "react"
import { ChevronRight, type LucideIcon } from "lucide-react"
import { Link, useLocation } from "react-router-dom"

import { cn } from "@/lib/utils"
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
  readonly hasLine?: boolean
  readonly openUpwards?: boolean
}

type NavMainMenuItemProps = {
  readonly item: NavMainItem
  readonly currentPath: string
  readonly currentSearch: string
  readonly openUpwards: boolean
}

function NavMainMenuItem({
  item,
  currentPath,
  currentSearch,
  openUpwards,
}: NavMainMenuItemProps) {
  const itemRef = useRef<HTMLLIElement>(null)

  // A collapsible parent is open when the current path starts with its base path
  const isParentActive =
    item.items?.length
      ? currentPath === item.url || currentPath.startsWith(item.url + "/") || currentPath.startsWith(item.url + "?")
      : currentPath === item.url

  const subItemsContent = item.items?.length ? (
    <SidebarMenuSub className={cn(openUpwards ? "settings-sub-menu mb-1 mt-0" : "")}>
      {item.items.map((subItem) => {
        // Match sub-item: compare full path + search string
        const [subPath, subQuery] = subItem.url.split("?")
        const subSearch = subQuery ? `?${subQuery}` : ""
        const isSubActive =
          currentPath === subPath &&
          (subSearch === "" || currentSearch === subSearch)

        return (
          <SidebarMenuSubItem key={subItem.title} className={cn(openUpwards ? "settings-item" : "")}>
            <SidebarMenuSubButton asChild isActive={isSubActive}>
              <Link to={subItem.url}>
                <span>{subItem.title}</span>
              </Link>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        )
      })}
    </SidebarMenuSub>
  ) : null

  const handleOpenChange = (open: boolean) => {
    if (open) {
      const scroll = () => {
        const element = itemRef.current
        if (element) {
          const container = element.closest('[data-sidebar="content"]')
          if (container) {
            if (openUpwards) {
              container.scrollTo({
                top: container.scrollHeight,
                behavior: "smooth",
              })
            } else {
              element.scrollIntoView({ behavior: "smooth", block: "nearest" })
            }
          }
        }
      }

      scroll()
      requestAnimationFrame(scroll)
      setTimeout(scroll, 50)
      setTimeout(scroll, 100)
      setTimeout(scroll, 200)
    }
  }

  return (
    <Collapsible
      key={item.title}
      asChild
      defaultOpen={item.isActive || isParentActive}
      onOpenChange={handleOpenChange}
    >
      <SidebarMenuItem ref={itemRef}>
        {openUpwards && item.items?.length ? (
          <CollapsibleContent>
            {subItemsContent}
          </CollapsibleContent>
        ) : null}

        <SidebarMenuButton asChild tooltip={item.title} isActive={isParentActive && !item.items?.length}>
          <Link to={item.url}>
            <item.icon />
            <span>{item.title}</span>
          </Link>
        </SidebarMenuButton>
        {item.items?.length ? (
          <>
            <CollapsibleTrigger asChild>
              <SidebarMenuAction className={cn(openUpwards ? "top-auto! bottom-1.5! data-[state=open]:-rotate-90" : "data-[state=open]:rotate-90")}>
                <ChevronRight />
                <span className="sr-only">Toggle</span>
              </SidebarMenuAction>
            </CollapsibleTrigger>
            {!openUpwards && (
              <CollapsibleContent>
                {subItemsContent}
              </CollapsibleContent>
            )}
          </>
        ) : null}
      </SidebarMenuItem>
    </Collapsible>
  )
}

export function NavMain({
  items,
  groupLabel,
  className,
  hasLine = false,
  openUpwards = false,
}: NavMainProps) {
  const location = useLocation()
  const currentPath = location.pathname
  const currentSearch = location.search

  return (
    <SidebarGroup className={className}>
      {groupLabel && <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>}
      <div className={cn(hasLine && "border-l border-sidebar-border/40 ml-3.5 pl-3.5")}>
        <SidebarMenu>
          {items.map((item) => (
            <NavMainMenuItem
              key={item.title}
              item={item}
              currentPath={currentPath}
              currentSearch={currentSearch}
              openUpwards={openUpwards}
            />
          ))}
        </SidebarMenu>
      </div>
    </SidebarGroup>
  )
}
