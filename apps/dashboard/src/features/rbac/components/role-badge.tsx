// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { IconBadge, IconBadgeGroup } from "@/components/ui/icon-badge"
import { resolveIcon } from "@/lib/icon-registry"

interface RoleBadgeInfo {
  readonly id: string
  readonly name: string
  readonly icon?: string | null
  readonly isSystem?: boolean
}

const roleIcon = (role: RoleBadgeInfo) => resolveIcon(role.icon ?? (role.isSystem ? "Shield" : "Users"))

export interface RoleBadgeProps {
  readonly role: RoleBadgeInfo
  readonly className?: string
}

export function RoleBadge({ role, className }: RoleBadgeProps) {
  return <IconBadge icon={roleIcon(role)} label={role.name} className={className} />
}

export interface RoleBadgeGroupProps {
  readonly roles: readonly RoleBadgeInfo[]
  /** Maximum visible badge slots (including the +N badge if truncated). Defaults to 3. */
  readonly max?: number
  readonly className?: string
}

export function RoleBadgeGroup({ roles, max = 3, className }: RoleBadgeGroupProps) {
  const { t } = useTranslation()
  return (
    <IconBadgeGroup
      items={roles.map((role) => ({ id: role.id, icon: roleIcon(role), label: role.name }))}
      max={max}
      moreLabel={(count) => t("rbac.roles.moreRoles", "+{{count}} more", { count })}
      className={className}
    />
  )
}
