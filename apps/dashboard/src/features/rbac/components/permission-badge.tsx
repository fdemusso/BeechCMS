// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { Globe, Key } from "@/components/icons"
import { GLOBAL_SCOPE, type Permission } from "@beechcms/core"
import { Badge } from "@/components/ui/badge"
import { IconBadge, IconBadgeGroup } from "@/components/ui/icon-badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { resolveIcon } from "@/lib/icon-registry"
import { useSchema } from "@/features/shared"
import { PERMISSION_METADATA } from "./permission-metadata"

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

  if (!showLabel) return <IconBadge icon={Icon ?? Key} label={label} className={className} />

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="secondary"
          className={cn("transition-colors leading-none h-5 px-1.5 inline-flex items-center gap-1 text-xs", className)}
          aria-label={label}
        >
          {Icon ? <Icon size={14} className="!size-3.5 shrink-0 block" /> : null}
          <span className="text-xs">{label}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function permissionBadge(permission: string, t: (key: string, fallback: string) => string) {
  const meta = PERMISSION_METADATA[permission as Permission]
  return { id: permission, icon: meta?.icon ?? Key, label: meta ? t(meta.translationKey, meta.defaultLabel) : permission }
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
  return (
    <IconBadgeGroup
      items={permissions.map((permission) => permissionBadge(permission, t))}
      max={max}
      moreLabel={(count) => t("rbac.roles.morePermissions", "+{{count}} more", { count })}
      className={className}
    />
  )
}

export interface ScopeBadgeProps {
  readonly scope: string
  readonly className?: string
}

export function ScopeBadge({ scope, className }: ScopeBadgeProps) {
  const { t } = useTranslation()
  const { data: seeds = [] } = useSchema()

  const isGlobal = scope === GLOBAL_SCOPE
  const seed = isGlobal ? undefined : seeds.find((s) => s.slug === scope)
  const Icon = isGlobal ? Globe : resolveIcon(seed?.dashboard?.icon)
  const label = isGlobal
    ? t("rbac.scope.global", "All seeds (global)")
    : seed?.labelPlural ?? seed?.label ?? scope

  return <IconBadge icon={Icon} label={label} className={className} />
}
