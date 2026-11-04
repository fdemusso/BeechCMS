// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

"use client"

import { More, Logout as LogOut, Settings } from '@/components/icons'
import { useSettingsDialog } from "@/features/settings"

import { cn } from "@/lib/utils"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

function getInitials(name: string, email: string): string {
  if (name && name.length >= 2) {
    return name.slice(0, 2).toUpperCase()
  }
  if (email && email.length >= 2) {
    return email.slice(0, 2).toUpperCase()
  }
  return "??"
}

type NavUserUser = {
  readonly name: string
  readonly email: string
  readonly avatar?: string
}

type NavUserProps = {
  readonly user: NavUserUser
  readonly onLogout?: () => void
}

export function NavUser({
  user,
  onLogout,
}: NavUserProps) {
  const { openSettings } = useSettingsDialog()
  const initials = getInitials(user.name, user.email)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className={cn(
                "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
                // Concentric corners: image sits 4px from the outer edge on top/left/bottom (1px border + 3px; h-12 minus
                // border leaves 3px above/below the 40px image, pl-[3px] matches it), so outer radius = inner radius + 4:
                // rounded-lg (16) around rounded-sm (12).
                "rounded-lg border border-border pl-[3px] transition-[width,height,padding,border-color,background-color] duration-300",
                // Rail: only the picture, 30px inside the 1px (now transparent) border of the 32px button.
                "group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:pl-0!",
              )}
            >
              {/* Same box as the logo it replaces (size-10, clipped); radius derived from the card, see the button above. */}
              <div className="flex aspect-square size-10 shrink-0 items-center justify-center overflow-hidden rounded-sm transition-[width,height] duration-300 group-data-[collapsible=icon]:size-[30px]">
                {/* Avatar defaults to a circle (root, image, fallback and the after: ring all use rounded-full). */}
                <Avatar className="size-full rounded-sm after:hidden">
                  <AvatarImage className="rounded-sm" src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-sm">{initials}</AvatarFallback>
                </Avatar>
              </div>
              <div className="grid min-w-0 flex-1 text-left text-[13px] leading-tight transition-opacity duration-200 group-data-[collapsible=icon]:opacity-0">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-[11px] opacity-60">{user.email}</span>
              </div>
              <More className="ml-auto size-4 shrink-0 rotate-90 text-muted-foreground transition-opacity duration-200 group-data-[collapsible=icon]:opacity-0" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            // bg-popover overrides the translucent default so the menu is opaque.
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg bg-popover"
            side="bottom"
            align="start"
            // Opens below the card, nudged right, so it reads as hanging off the button instead of covering it.
            alignOffset={12}
            sideOffset={6}
          >
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => openSettings()}>
                <Settings />
                Account
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onLogout?.()}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
