// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

"use client"

import { CheckCircle as BadgeCheck, More, Logout as LogOut } from '@/components/icons'
import { useNavigate } from "react-router-dom"

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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
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

type DashboardNavUserUser = {
  readonly name: string
  readonly email: string
  readonly avatar?: string
}

type DashboardNavUserProps = {
  readonly user: DashboardNavUserUser
  readonly onLogout?: () => void
  /** "header" mirrors the former logo block (rounded-square image, bordered card); "footer" is the original row. */
  readonly layout?: "footer" | "header"
}

export function DashboardNavUser({
  user,
  onLogout,
  layout = "footer",
}: DashboardNavUserProps) {
  const { isMobile } = useSidebar()
  const navigate = useNavigate()
  const initials = getInitials(user.name, user.email)
  const isHeader = layout === "header"

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
                isHeader && "rounded-lg border border-border pl-[3px]",
              )}
            >
              {isHeader ? (
                // Same box as the logo it replaces (size-10, clipped); radius derived from the card, see the button above.
                <div className="flex aspect-square size-10 items-center justify-center rounded-sm overflow-hidden">
                  {/* Avatar defaults to a circle (root, image, fallback and the after: ring all use rounded-full). */}
                  <Avatar className="size-10 rounded-sm after:hidden">
                    <AvatarImage className="rounded-sm" src={user.avatar} alt={user.name} />
                    <AvatarFallback className="rounded-sm">{initials}</AvatarFallback>
                  </Avatar>
                </div>
              ) : (
                <Avatar className="h-8 w-8 rounded-full">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-full">{initials}</AvatarFallback>
                </Avatar>
              )}
              <div className={cn("grid min-w-0 flex-1 text-left leading-tight", isHeader ? "text-[13px]" : "text-sm")}>
                <span className="truncate font-medium">{user.name}</span>
                <span className={cn("truncate", isHeader ? "text-[11px] opacity-60" : "text-xs")}>{user.email}</span>
              </div>
              <More className="ml-auto size-4 shrink-0 rotate-90 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-full">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-full">{initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <BadgeCheck />
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
