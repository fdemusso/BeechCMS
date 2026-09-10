// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { PERMISSIONS, permissionsHeldAnywhere, type Permission, type RoleRecord } from "@beechcms/core"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { usePermissions } from "@/features/shared"
import { useCreateRole, useUpdateRole } from "../hooks/use-rbac"
import { rbacErrorCode, RBAC_ERROR_CODES } from "../constants"

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
  const [permissions, setPermissions] = React.useState<Permission[]>(role?.permissions ?? [])
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setName(role?.name ?? "")
      setDescription(role?.description ?? "")
      setPermissions(role?.permissions ?? [])
      setError(null)
    }
  }, [open, role])

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
      const payload = { name, description: description || null, permissions }
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
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="rf-name">{t("rbac.roles.name", "Name")}</FieldLabel>
              <Input id="rf-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="rf-description">{t("rbac.roles.description", "Description")}</FieldLabel>
              <Textarea id="rf-description" maxLength={400} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>{t("rbac.roles.permissions", "Permissions")}</FieldLabel>
              <TooltipProvider>
                <div className="grid grid-cols-2 gap-2">
                  {PERMISSIONS.map((permission) => {
                    const disabled = !heldAnywhere.has(permission)
                    const checkbox = (
                      <label key={permission} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={permissions.includes(permission)}
                          disabled={disabled}
                          onCheckedChange={() => togglePermission(permission)}
                        />
                        {t(`rbac.permissions.${permission}`, permission)}
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
