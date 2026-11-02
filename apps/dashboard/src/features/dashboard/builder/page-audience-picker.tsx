// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { MAX_ROLES_PER_PAGE } from "@beechcms/core"
import { Check, Plus } from "@/components/icons"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { resolveIcon } from "@/lib/icon-registry"
import { cn } from "@/lib/utils"
import { RoleBadgeGroup } from "@/features/rbac/components/role-badge"
import { useLayoutRoles } from "./use-layout-roles"

export interface PageAudiencePickerProps {
  /** The active page's target role ids (`page.roles ?? []`). */
  readonly roleIds: readonly string[]
  /** Receives the full next list; the caller forwards it to `setPageRoles`. */
  readonly onChange: (roleIds: string[]) => void
}

/**
 * Edits which roles may see the active dashboard tab. No roles means everyone.
 * Targeted roles show as the icon badges of the users table; the icon button opens the picker, where a
 * selected role is toggled off. An id with no matching role is kept visible so it can still be removed.
 */
export function PageAudiencePicker({ roleIds, onChange }: PageAudiencePickerProps): React.JSX.Element {
  const { t } = useTranslation()
  const { data: roles, isPending, isError } = useLayoutRoles()
  const [open, setOpen] = React.useState(false)

  const selectedIds = new Set(roleIds)
  const isAtLimit = roleIds.length >= MAX_ROLES_PER_PAGE

  const toggleRole = (id: string) => {
    onChange(selectedIds.has(id) ? roleIds.filter((current) => current !== id) : [...roleIds, id])
  }

  // Until the list resolves no id may count as deleted, or a slow request would look like a mass deletion.
  const rolesById = new Map((roles ?? []).map((role) => [role.id, role]))
  const orphanIds = isPending || isError ? [] : roleIds.filter((id) => !rolesById.has(id))
  const deletedRoleName = t("dashboard.builder.audience.deletedRole")
  const badgeRoles = roleIds.flatMap((id) => {
    const role = rolesById.get(id)
    if (role) return [role]
    return orphanIds.includes(id) ? [{ id, name: deletedRoleName, icon: "AlertCircle" }] : []
  })

  const triggerLabel = t("dashboard.builder.audience.add")

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{t("dashboard.builder.audience.label")}</span>
        {isPending && <Skeleton className="h-6 w-16" />}
        {isError && <span className="text-xs text-muted-foreground">{t("dashboard.builder.audience.loadError")}</span>}
        {badgeRoles.length > 0 && <RoleBadgeGroup roles={badgeRoles} max={3} />}
        <Popover open={open} onOpenChange={setOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="icon-sm" aria-label={triggerLabel} disabled={isPending || isError}>
                  <Plus className="size-4" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">
              {roleIds.length === 0 ? t("dashboard.builder.audience.everyoneHint") : triggerLabel}
            </TooltipContent>
          </Tooltip>
          <PopoverContent className="w-64 p-0" align="end">
            <Command>
              <CommandInput placeholder={t("dashboard.builder.audience.search")} />
              <CommandList>
                <CommandEmpty>{t("dashboard.builder.audience.empty")}</CommandEmpty>
                <CommandGroup>
                  {orphanIds.map((id) => (
                    <CommandItem
                      key={id}
                      value={`${deletedRoleName} ${id}`}
                      onSelect={() => toggleRole(id)}
                      className="flex items-center gap-2 text-destructive"
                    >
                      <Check className="size-4 shrink-0" />
                      <span className="flex-1 truncate">{deletedRoleName}</span>
                    </CommandItem>
                  ))}
                  {(roles ?? []).map((role) => {
                    const isSelected = selectedIds.has(role.id)
                    const Icon = resolveIcon(role.icon ?? "Users")
                    return (
                      <CommandItem
                        key={role.id}
                        value={role.name}
                        disabled={isAtLimit && !isSelected}
                        onSelect={() => toggleRole(role.id)}
                        className="flex items-center gap-2"
                      >
                        <Check className={cn("size-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                        <Icon className="size-4 shrink-0" />
                        <span className="flex-1 truncate">{role.name}</span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </TooltipProvider>
  )
}
