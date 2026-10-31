// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { MAX_ROLES_PER_PAGE } from "@beechcms/core"
import { Check, Plus, X } from "@/components/icons"
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
import { resolveIcon } from "@/lib/icon-registry"
import { cn } from "@/lib/utils"
import { useLayoutRoles } from "./use-layout-roles"

export interface PageAudiencePickerProps {
  /** The active page's target role ids (`page.roles ?? []`). */
  readonly roleIds: readonly string[]
  /** Receives the full next list; the caller forwards it to `setPageRoles`. */
  readonly onChange: (roleIds: string[]) => void
}

interface AudienceChipProps {
  readonly name: string
  readonly icon?: string | null
  readonly isOrphan?: boolean
  readonly onRemove: () => void
}

function AudienceChip({ name, icon, isOrphan = false, onRemove }: AudienceChipProps) {
  const { t } = useTranslation()
  const Icon = resolveIcon(icon ?? "Users")

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
        isOrphan ? "border-destructive/40 bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground",
      )}
    >
      {!isOrphan && <Icon className="size-3.5 shrink-0" />}
      <span className="truncate">{name}</span>
      <button
        type="button"
        aria-label={t("dashboard.builder.audience.remove", { name })}
        className="rounded-sm opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onRemove}
      >
        <X className="size-3" />
      </button>
    </span>
  )
}

/** Edits which roles may see the active dashboard tab. No roles means everyone. */
export function PageAudiencePicker({ roleIds, onChange }: PageAudiencePickerProps): React.JSX.Element {
  const { t } = useTranslation()
  const { data: roles, isPending, isError } = useLayoutRoles()
  const [open, setOpen] = React.useState(false)

  const selectedIds = new Set(roleIds)
  const isAtLimit = roleIds.length >= MAX_ROLES_PER_PAGE

  const toggleRole = (id: string) => {
    onChange(selectedIds.has(id) ? roleIds.filter((current) => current !== id) : [...roleIds, id])
  }
  const removeRole = (id: string) => onChange(roleIds.filter((current) => current !== id))

  const renderChips = () => {
    if (isPending) return <Skeleton className="h-6 w-24" />
    if (isError) return <span className="text-xs text-muted-foreground">{t("dashboard.builder.audience.loadError")}</span>
    if (roleIds.length === 0) return <span className="text-xs text-muted-foreground">{t("dashboard.builder.audience.everyone")}</span>

    const rolesById = new Map(roles.map((role) => [role.id, role]))
    return roleIds.map((id) => {
      const role = rolesById.get(id)
      return role ? (
        <AudienceChip key={id} name={role.name} icon={role.icon} onRemove={() => removeRole(id)} />
      ) : (
        <AudienceChip key={id} name={t("dashboard.builder.audience.deletedRole")} isOrphan onRemove={() => removeRole(id)} />
      )
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">{t("dashboard.builder.audience.label")}</span>
      {renderChips()}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={isPending || isError}>
            <Plus className="size-4 mr-1" />
            {t("dashboard.builder.audience.add")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder={t("dashboard.builder.audience.search")} />
            <CommandList>
              <CommandEmpty>{t("dashboard.builder.audience.empty")}</CommandEmpty>
              <CommandGroup>
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
  )
}
