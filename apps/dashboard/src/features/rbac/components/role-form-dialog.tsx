// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { permissionsHeldAnywhere, type Permission, type RoleRecord } from "@beechcms/core"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { IconPicker } from "@/components/ui/icon-picker"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { usePermissions } from "@/features/shared"
import { cn } from "@/lib/utils"
import { useCreateRole, useUpdateRole } from "../hooks/use-rbac"
import { rbacErrorCode, RBAC_ERROR_CODES } from "../constants"
import { PERMISSION_GROUPS } from "./permission-groups"

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
  const [permissions, setPermissions] = React.useState<Permission[]>(role?.permissions ?? [])
  const [error, setError] = React.useState<string | null>(null)

  const [prevOpen, setPrevOpen] = React.useState(open)
  const [prevRoleId, setPrevRoleId] = React.useState(role?.id)
  if (open !== prevOpen || role?.id !== prevRoleId) {
    setPrevOpen(open)
    setPrevRoleId(role?.id)
    if (open) {
      setName(role?.name ?? "")
      setDescription(role?.description ?? "")
      setIcon(role?.icon ?? "Users")
      setPermissions(role?.permissions ?? [])
      setError(null)
    }
  }

  const heldAnywhere = React.useMemo(() => permissionsHeldAnywhere(effective), [effective])
  const permissionSet = React.useMemo(() => new Set(permissions), [permissions])
  const hasUnheldPermission = PERMISSION_GROUPS.some((group) => group.permissions.some((permission) => !heldAnywhere.has(permission)))

  const togglePermission = (permission: Permission) => {
    setPermissions((current) =>
      current.includes(permission) ? current.filter((p) => p !== permission) : [...current, permission],
    )
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (createRole.isPending || updateRole.isPending) return
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
                <IconPicker
                  value={icon}
                  onChange={setIcon}
                  ariaLabel={t("rbac.roles.selectIcon", "Select icon")}
                  searchPlaceholder={t("rbac.roles.searchIcons", "Search icons...")}
                  emptyLabel={t("rbac.roles.noIconsFound", "No icons found")}
                />

                <Input id="rf-name" name="role-name" autoComplete="off" required maxLength={32} value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="rf-description">{t("rbac.roles.description", "Description")}</FieldLabel>
              <Input
                id="rf-description"
                name="role-description"
                autoComplete="off"
                maxLength={50}
                value={description ?? ""}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            {/* A fieldset, so a screen reader says which group a checkbox is in: "Permissions, Content, read". */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">{t("rbac.roles.permissions", "Permissions")}</legend>
              {hasUnheldPermission && (
                <p id="rf-permissions-hint" className="text-sm text-muted-foreground">{t("rbac.roles.permissionsHint")}</p>
              )}
              <TooltipProvider delayDuration={100} disableHoverableContent>
                <div className="grid grid-cols-2 gap-4">
                  {PERMISSION_GROUPS.map((group) => (
                    <fieldset key={group.id}>
                      <legend className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                        {t(group.titleKey, group.defaultTitle)}
                      </legend>
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
                                checked={permissionSet.has(permission)}
                                disabled={disabled}
                                aria-describedby={disabled ? "rf-permissions-hint" : undefined}
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
                    </fieldset>
                  ))}
                </div>
              </TooltipProvider>
            </fieldset>
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
