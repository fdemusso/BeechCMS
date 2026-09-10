// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import type { Permission } from "@beechcms/core"
import { Eye, Plus, Edit, Trash2, Users, ShieldCheck, Chart } from "reicon-react"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export interface PermissionMeta {
  readonly icon: React.ComponentType<{ className?: string }>
  readonly translationKey: string
  readonly defaultLabel: string
}

export const PERMISSION_METADATA: Record<Permission, PermissionMeta> = {
  "content:read": { icon: Eye, translationKey: "rbac.permissions.content:read", defaultLabel: "Read content" },
  "content:create": { icon: Plus, translationKey: "rbac.permissions.content:create", defaultLabel: "Create content" },
  "content:update": { icon: Edit, translationKey: "rbac.permissions.content:update", defaultLabel: "Update content" },
  "content:delete": { icon: Trash2, translationKey: "rbac.permissions.content:delete", defaultLabel: "Delete content" },
  "manage_users": { icon: Users, translationKey: "rbac.permissions.manage_users", defaultLabel: "Manage users" },
  "manage_roles": { icon: ShieldCheck, translationKey: "rbac.permissions.manage_roles", defaultLabel: "Manage roles" },
  "view_analytics": { icon: Chart, translationKey: "rbac.permissions.view_analytics", defaultLabel: "View analytics" },
}

export interface PermissionBadgeProps {
  readonly permission: string
  readonly showLabel?: boolean
  readonly className?: string
}

export function PermissionBadge({
  permission,
  showLabel = false,
  className,
}: PermissionBadgeProps) {
  const { t } = useTranslation()
  const meta = PERMISSION_METADATA[permission as Permission]
  const Icon = meta?.icon
  const label = meta ? t(meta.translationKey, meta.defaultLabel) : permission

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="secondary"
          className={cn(
            "transition-colors",
            showLabel
              ? "h-5 px-1.5 inline-flex items-center gap-1 text-[10px]"
              : "size-6 p-0 inline-flex items-center justify-center rounded-md",
            className
          )}
          aria-label={label}
        >
          {Icon ? <Icon className="size-3.5" /> : null}
          {showLabel && <span className="text-[10px]">{label}</span>}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export interface PermissionBadgeGroupProps {
  readonly permissions: readonly string[]
  /** Maximum visible badge slots (including the +N badge if truncated). Defaults to 3. */
  readonly max?: number
  readonly className?: string
}

export function PermissionBadgeGroup({
  permissions,
  max = 3,
  className,
}: PermissionBadgeGroupProps) {
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

  if (permissions.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  const shouldTruncate = permissions.length > max
  const visibleCount = shouldTruncate ? max - 1 : permissions.length
  const visible = permissions.slice(0, visibleCount)
  const remaining = permissions.slice(visibleCount)

  return (
    <div className={cn("flex items-center -space-x-1.5", className)}>
      {visible.map((permission) => (
        <div
          key={permission}
          className="relative ring-1 ring-border rounded-md transition-transform hover:z-10 hover:scale-105"
        >
          <PermissionBadge permission={permission} />
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
              aria-label={t("rbac.roles.morePermissions", "+{{count}} more", { count: remaining.length })}
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
              {remaining.map((permission) => (
                <PermissionBadge key={permission} permission={permission} />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
