import type { ReactNode } from "react"
import type { IconComponent } from '@/lib/icon-registry'
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

"use client"

import { useRef, useState } from "react"
import type { ComponentProps } from "react"
import { ChevronRight } from '@/components/icons'
import { Link, useLocation } from "react-router-dom"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { usePrefetchOnIntent } from "../lib/route-prefetch"
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
  useSidebar,
} from "@/components/ui/sidebar"

/** A router Link that warms its target page when the pointer rests on it or it takes focus. */
function PrefetchLink({ to, ...props }: Omit<ComponentProps<typeof Link>, "to"> & { readonly to: string }) {
  const intent = usePrefetchOnIntent(to)
  return <Link to={to} {...intent} {...props} />
}

type NavSectionSubItem = {
  readonly title: string
  readonly url: string
}

type NavSectionItem = {
  readonly title: string
  readonly url: string
  readonly icon: IconComponent
  readonly isActive?: boolean
  readonly items?: ReadonlyArray<NavSectionSubItem>
  readonly disabled?: boolean
  readonly disabledReason?: string
  readonly notImplemented?: boolean
  /** Runs instead of navigating to `url` (e.g. opens a dialog over the current page). */
  readonly onSelect?: () => void
}

type NavSectionProps = {
  readonly items: ReadonlyArray<NavSectionItem>
  readonly groupLabel?: string
  readonly className?: string
  readonly hasLine?: boolean
  /** Whether clicking the group label folds the group. Defaults to true; the fixed system groups pass false. */
  readonly collapsible?: boolean
  /** Extra rows rendered after `items`, for entries that are not plain links (e.g. a popover trigger). */
  readonly children?: ReactNode
}

type NavSectionMenuItemProps = {
  readonly item: NavSectionItem
  readonly currentPath: string
  readonly currentSearch: string
}

function NavSectionMenuItem({
  item,
  currentPath,
  currentSearch,
}: NavSectionMenuItemProps) {
  const itemRef = useRef<HTMLLIElement>(null)

  // A collapsible parent is open when the current path starts with its base path
  const isParentActive =
    item.items?.length
      ? currentPath === item.url || currentPath.startsWith(item.url + "/") || currentPath.startsWith(item.url + "?")
      : currentPath === item.url

  const subItemsContent = item.items?.length ? (
    <SidebarMenuSub>
      {item.items.map((subItem) => {
        // Match sub-item: compare full path + search string
        const [subPath, subQuery] = subItem.url.split("?")
        const subSearch = subQuery ? `?${subQuery}` : ""
        const isSubActive =
          currentPath === subPath &&
          (subSearch === "" || currentSearch === subSearch)

        return (
          <SidebarMenuSubItem key={subItem.title}>
            <SidebarMenuSubButton asChild isActive={isSubActive}>
              <PrefetchLink to={subItem.url}>
                <span>{subItem.title}</span>
              </PrefetchLink>
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
          element.scrollIntoView({ behavior: "smooth", block: "nearest" })
        }
      }

      scroll()
      requestAnimationFrame(scroll)
      setTimeout(scroll, 50)
      setTimeout(scroll, 100)
    }
  }

  if (item.disabled) {
    return (
      <SidebarMenuItem ref={itemRef}>
        <SidebarMenuButton
          disabled
          aria-disabled="true"
          tooltip={item.disabledReason ?? item.title}
          className="cursor-not-allowed opacity-50"
        >
          <item.icon />
          <span>{item.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  if (item.onSelect) {
    return (
      <SidebarMenuItem ref={itemRef}>
        <SidebarMenuButton tooltip={item.title} onClick={item.onSelect}>
          <item.icon />
          <span>{item.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  if (item.notImplemented) {
    return (
      <SidebarMenuItem ref={itemRef}>
        <SidebarMenuButton
          tooltip={item.title}
          onClick={() => toast.info("This feature is not implemented yet.")}
        >
          <item.icon />
          <span>{item.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <Collapsible
      key={item.title}
      asChild
      defaultOpen={item.isActive || isParentActive}
      onOpenChange={handleOpenChange}
    >
      <SidebarMenuItem ref={itemRef}>
        <SidebarMenuButton asChild tooltip={item.title} isActive={isParentActive && !item.items?.length}>
          <PrefetchLink to={item.url}>
            <item.icon />
            <span>{item.title}</span>
          </PrefetchLink>
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
              {subItemsContent}
            </CollapsibleContent>
          </>
        ) : null}
      </SidebarMenuItem>
    </Collapsible>
  )
}

const GROUP_STORAGE_PREFIX = "beech:sidebar-group:"

/** Open/closed state of a group, remembered per label. Storage can throw or be empty: the group then starts open. */
function useGroupOpen(label: string | undefined) {
  const [open, setOpenState] = useState(() => {
    if (!label) return true
    try {
      return localStorage.getItem(GROUP_STORAGE_PREFIX + label) !== "closed"
    } catch {
      return true
    }
  })
  const setOpen = (next: boolean) => {
    setOpenState(next)
    if (!label) return
    try {
      localStorage.setItem(GROUP_STORAGE_PREFIX + label, next ? "open" : "closed")
    } catch {
      // per-viewer convenience only
    }
  }
  return [open, setOpen] as const
}

export function NavSection({
  items,
  groupLabel,
  className,
  hasLine = false,
  collapsible = true,
  children,
}: NavSectionProps) {
  const location = useLocation()
  const currentPath = location.pathname
  const currentSearch = location.search
  const { state, isMobile } = useSidebar()
  const [groupOpen, setGroupOpen] = useGroupOpen(groupLabel)
  // The icon rail has no group labels: every group stays expanded there so its icons remain reachable.
  const inRail = state === "collapsed" && !isMobile

  const menu = (
    <SidebarMenu
      className={cn(
        // A tree line under the group label's icon axis; the buttons inside start closer to it (--sb-pad-start).
        // w-auto: SidebarMenu is w-full, which plus the left margin would run past the sidebar's right edge (and
        // so would the hover pills). The rail has no room for the line.
        hasLine &&
          "ml-[calc(var(--sb-pad-start)+0.5rem)] w-auto border-l border-sidebar-border/40 *:[--sb-pad-start:0.5rem] group-data-[collapsible=icon]:ml-0 group-data-[collapsible=icon]:border-transparent",
      )}
    >
      {items.map((item) => (
        <NavSectionMenuItem
          key={item.title}
          item={item}
          currentPath={currentPath}
          currentSearch={currentSearch}
        />
      ))}
      {children}
    </SidebarMenu>
  )

  // No label (e.g. Settings) or a fixed system group (Main, Studio, Content): a plain label, nothing to fold.
  if (!groupLabel || !collapsible) {
    return (
      <SidebarGroup className={className}>
        {groupLabel && <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>}
        {menu}
      </SidebarGroup>
    )
  }

  return (
    <Collapsible open={inRail || groupOpen} onOpenChange={setGroupOpen} asChild>
      {/* Closed: the group is only its label, so its vertical padding shrinks to keep the collapsed list tight. */}
      <SidebarGroup className={cn(className, "transition-[padding] duration-(--duration-exit) data-[state=closed]:py-0.5")}>
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger
            tabIndex={inRail ? -1 : undefined}
            className="group/label w-full cursor-pointer gap-0.5 text-left hover:text-sidebar-foreground group-data-[collapsible=icon]:pointer-events-none"
          >
            {/* Inline affordance before the label, starting where the label text used to start (the label's own left padding is untouched, so nothing enters the margin). The polyline's ink starts 8.67/24 of the box in, minus half the stroke: -ml-[0.355em] pulls the ink back to the label's start edge: points right when closed, down when open; takes the label's colour. Size is measured: Geist cap height is 0.71em and the reicon chevron is a 16.67/24-tall polyline, so 0.87em makes the glyph about cap-height tall (caps are centred on the line box, so items-center aligns it). Stroke is the weight that looked right on screen (at 12px): 1.7 units at this box size, a touch lighter than the 0.108em medium stem because a solid SVG line reads heavier than text. */}
            <ChevronRight
              aria-hidden
              strokeWidth={1.7}
              className="-ml-[0.355em] size-[0.87em] shrink-0 transition-transform duration-(--duration-exit) group-data-[state=open]/label:rotate-90 group-data-[collapsible=icon]:hidden"
            />
            <span className="min-w-0 truncate">{groupLabel}</span>
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent className="sidebar-group-content">{menu}</CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}
