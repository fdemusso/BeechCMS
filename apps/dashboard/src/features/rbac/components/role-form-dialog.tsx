// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { permissionsHeldAnywhere, type Permission, type RoleRecord } from "@beechcms/core"
import { Search } from "reicon-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { usePermissions } from "@/features/shared"
import { resolveIcon, ICON_NAMES } from "@/lib/icon-registry"
import { cn } from "@/lib/utils"
import { useCreateRole, useUpdateRole } from "../hooks/use-rbac"
import { rbacErrorCode, RBAC_ERROR_CODES } from "../constants"

export const PERMISSION_GROUPS = [
  {
    id: "content",
    titleKey: "rbac.roles.groupContent",
    defaultTitle: "Content",
    permissions: [
      "content:read",
      "content:create",
      "content:update",
      "content:delete",
    ] as const,
  },
  {
    id: "system",
    titleKey: "rbac.roles.groupSystem",
    defaultTitle: "System",
    permissions: [
      "manage_users",
      "manage_roles",
      "view_analytics",
    ] as const,
  },
] as const

export interface RoleFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present ⇒ edit; absent ⇒ create. */
  role?: RoleRecord | null
}

export function RoleFormDialog({ open, onOpenChange, role }: RoleFormDialogProps) {
  const { t } = useTranslation()
  const { effective } = usePermissions()
  const createRole = useCreateRole()
  const updateRole = useUpdateRole()

  const [name, setName] = React.useState(role?.name ?? "")
  const [description, setDescription] = React.useState(role?.description ?? "")
  const [icon, setIcon] = React.useState(role?.icon ?? "Users")
  const [iconPickerOpen, setIconPickerOpen] = React.useState(false)
  const [iconSearch, setIconSearch] = React.useState("")
  const [permissions, setPermissions] = React.useState<Permission[]>(role?.permissions ?? [])
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setName(role?.name ?? "")
      setDescription(role?.description ?? "")
      setIcon(role?.icon ?? "Users")
      setIconPickerOpen(false)
      setIconSearch("")
      setPermissions(role?.permissions ?? [])
      setError(null)
    }
  }, [open, role])

  const uniqueIconNames = React.useMemo(() => Array.from(new Set(ICON_NAMES)), [])
  const filteredIcons = React.useMemo(() => {
    const q = iconSearch.trim().toLowerCase()
    if (!q) return uniqueIconNames
    return uniqueIconNames.filter((item) => item.toLowerCase().includes(q))
  }, [uniqueIconNames, iconSearch])

  const SelectedIcon = resolveIcon(icon || "Users")
  const heldAnywhere = React.useMemo(() => permissionsHeldAnywhere(effective), [effective])

  const togglePermission = (permission: Permission) => {
    setPermissions((current) =>
      current.includes(permission) ? current.filter((p) => p !== permission) : [...current, permission],
    )
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    try {
      const payload = {
        name,
        description: description || null,
        icon: icon || "Users",
        permissions,
      }
      if (role) {
        await updateRole.mutateAsync({ roleId: role.id, payload })
      } else {
        await createRole.mutateAsync(payload)
      }
      toast.success(t("rbac.roles.saveSuccess", "Role saved"))
      onOpenChange(false)
    } catch (err) {
      const code = rbacErrorCode(err)
      if (code === RBAC_ERROR_CODES.ROLE_NAME_TAKEN) {
        setError(t("rbac.errors.role-name-taken"))
      } else if (code === RBAC_ERROR_CODES.SYSTEM_ROLE_IMMUTABLE) {
        setError(t("rbac.errors.system-role-immutable"))
      } else {
        setError(t("rbac.errors.generic"))
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{role ? t("rbac.roles.edit", "Edit role") : t("rbac.roles.create", "Create role")}</DialogTitle>
          <DialogDescription className="sr-only">
            {role ? t("rbac.roles.edit", "Edit role") : t("rbac.roles.create", "Create role")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="rf-name">{t("rbac.roles.name", "Name")}</FieldLabel>
              <div className="flex items-center gap-2">
                <Popover
                  open={iconPickerOpen}
                  onOpenChange={(next) => {
                    setIconPickerOpen(next)
                    if (!next) setIconSearch("")
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-9 shrink-0 rounded-md border-border/80 hover:bg-accent flex items-center justify-center cursor-pointer"
                      aria-label={t("rbac.roles.selectIcon", "Select icon")}
                      title={t("rbac.roles.selectIcon", "Select icon")}
                    >
                      <SelectedIcon className="size-4 text-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" sideOffset={4} className="w-64 p-2.5">
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <Input
                          placeholder={t("rbac.roles.searchIcons", "Search icons...")}
                          value={iconSearch}
                          onChange={(e) => setIconSearch(e.target.value)}
                          className="h-8 pl-8 text-xs"
                          autoFocus
                        />
                      </div>
                      <div className="grid grid-cols-6 gap-1 max-h-48 overflow-y-auto p-0.5">
                        {filteredIcons.map((iconName) => {
                          const IconComp = resolveIcon(iconName)
                          const isSelected = (icon || "Users") === iconName
                          return (
                            <button
                              key={iconName}
                              type="button"
                              onClick={() => {
                                setIcon(iconName)
                                setIconPickerOpen(false)
                                setIconSearch("")
                              }}
                              title={iconName}
                              className={cn(
                                "size-8 rounded-md flex items-center justify-center transition-colors cursor-pointer",
                                isSelected
                                  ? "bg-primary text-primary-foreground shadow-xs"
                                  : "hover:bg-accent text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <IconComp className="size-4" />
                            </button>
                          )
                        })}
                        {filteredIcons.length === 0 && (
                          <p className="col-span-6 text-center text-xs text-muted-foreground py-4">
                            {t("rbac.roles.noIconsFound", "No icons found")}
                          </p>
                        )}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                <Input id="rf-name" required maxLength={32} value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="rf-description">{t("rbac.roles.description", "Description")}</FieldLabel>
              <Input
                id="rf-description"
                maxLength={50}
                value={description ?? ""}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>{t("rbac.roles.permissions", "Permissions")}</FieldLabel>
              <TooltipProvider delayDuration={100} disableHoverableContent>
                <div className="grid grid-cols-2 gap-4">
                  {PERMISSION_GROUPS.map((group) => (
                    <div key={group.id}>
                      <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                        {t(group.titleKey, group.defaultTitle)}
                      </span>
                      <div className="space-y-2">
                        {group.permissions.map((permission) => {
                          const disabled = !heldAnywhere.has(permission)
                          const checkbox = (
                            <label
                              key={permission}
                              className={cn(
                                "flex items-center gap-2 text-sm",
                                disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                              )}
                            >
                              <Checkbox
                                checked={permissions.includes(permission)}
                                disabled={disabled}
                                onCheckedChange={() => togglePermission(permission)}
                              />
                              {permission.replace(/^content:/, "").replace(/_/g, " ")}
                            </label>
                          )
                          if (!disabled) return checkbox
                          return (
                            <Tooltip key={permission}>
                              <TooltipTrigger asChild>{checkbox}</TooltipTrigger>
                              <TooltipContent>{t("rbac.errors.escalation-refused")}</TooltipContent>
                            </Tooltip>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </TooltipProvider>
            </Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={!name || permissions.length === 0 || createRole.isPending || updateRole.isPending}>
              {t("common.save", "Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
