// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { resolveIcon } from "@/lib/icon-registry"
import { cn } from "@/lib/utils"

export interface RoleBadgeInfo {
  readonly id: string
  readonly name: string
  readonly icon?: string | null
  readonly isSystem?: boolean
}

export interface RoleBadgeProps {
  readonly role: RoleBadgeInfo
  readonly className?: string
}

export function RoleBadge({ role, className }: RoleBadgeProps) {
  const Icon = resolveIcon(role.icon ?? (role.isSystem ? "Shield" : "Users"))

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="secondary"
          className={cn(
            "transition-colors size-6 p-0 inline-flex items-center justify-center rounded-md",
            className
          )}
          aria-label={role.name}
        >
          <Icon className="size-3.5" />
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top">
        {role.name}
      </TooltipContent>
    </Tooltip>
  )
}

export interface RoleBadgeGroupProps {
  readonly roles: readonly RoleBadgeInfo[]
  /** Maximum visible badge slots (including the +N badge if truncated). Defaults to 3. */
  readonly max?: number
  readonly className?: string
}

export function RoleBadgeGroup({
  roles,
  max = 3,
  className,
}: RoleBadgeGroupProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const openTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = React.useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  React.useEffect(() => {
    return () => clearTimers()
  }, [clearTimers])

  const handlePointerEnter = React.useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    if (!openTimerRef.current) {
      openTimerRef.current = setTimeout(() => {
        setOpen(true)
        openTimerRef.current = null
      }, 200)
    }
  }, [])

  const handlePointerLeave = React.useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
    if (!closeTimerRef.current) {
      closeTimerRef.current = setTimeout(() => {
        setOpen(false)
        closeTimerRef.current = null
      }, 250)
    }
  }, [])

  if (roles.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  const shouldTruncate = roles.length > max
  const visibleCount = shouldTruncate ? max - 1 : roles.length
  const visible = roles.slice(0, visibleCount)
  const remaining = roles.slice(visibleCount)

  const isSingle = !shouldTruncate && visible.length === 1

  return (
    <div className={cn("flex items-center -space-x-1.5", isSingle && "justify-center", className)}>
      {visible.map((role) => (
        <div
          key={role.id}
          className="relative ring-1 ring-border rounded-md transition-transform hover:z-10 hover:scale-105"
        >
          <RoleBadge role={role} />
        </div>
      ))}

      {shouldTruncate && (
        <Popover
          open={open}
          onOpenChange={(next) => {
            clearTimers()
            setOpen(next)
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              onPointerEnter={handlePointerEnter}
              onPointerLeave={handlePointerLeave}
              className="relative z-0 ring-1 ring-border size-6 rounded-md bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground text-[10px] font-semibold inline-flex items-center justify-center transition-transform hover:z-10 hover:scale-105 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("rbac.roles.moreRoles", "+{{count}} more", { count: remaining.length })}
            >
              +{remaining.length}
            </button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            side="top"
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
            className="w-auto p-2 shadow-lg border-border/80 bg-popover"
          >
            <div className="flex items-center gap-1.5">
              {remaining.map((role) => (
                <RoleBadge key={role.id} role={role} />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
