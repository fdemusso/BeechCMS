// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Plus, Edit as Pencil, Trash2 } from "@/components/icons"
import type { RoleRecord } from "@beechcms/core"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { SettingsList, SettingsListItem, SettingsSection } from "@/components/ui/settings-section"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { usePermissions } from "@/features/shared"
import { TooltipProvider } from "@/components/ui/tooltip"
import { resolveIcon } from "@/lib/icon-registry"
import { useRbacRoles, useDeleteRole } from "../hooks/use-rbac"
import { RoleFormDialog } from "./role-form-dialog"
import { PermissionBadgeGroup } from "./permission-badge"
import { rbacErrorCode, RBAC_ERROR_CODES } from "../constants"

const SYSTEM_HINT_ID = "roles-system-hint"

/**
 * The roles, one per row: its icon, name and description on the left; what it allows and the buttons to edit or
 * delete it on the right. A system role is built in: it is marked as such and its buttons stay off, and a line
 * (read aloud, not shown) says why.
 */
export function RolesSection() {
  const { t } = useTranslation()
  const { canAnywhere } = usePermissions()
  const { data: roles = [], isLoading } = useRbacRoles()
  const deleteRole = useDeleteRole()

  const canManageRoles = canAnywhere("manage_roles")
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingRole, setEditingRole] = React.useState<RoleRecord | null>(null)

  const handleDelete = async (roleId: string) => {
    try {
      await deleteRole.mutateAsync(roleId)
    } catch (err) {
      const code = rbacErrorCode(err)
      if (code === RBAC_ERROR_CODES.LAST_GLOBAL_ADMIN) {
        toast.error(t("rbac.errors.last-global-admin"))
      } else {
        toast.error(t("rbac.errors.generic"))
      }
    }
  }

  return (
    <SettingsSection
      id="roles"
      title={t("rbac.roles.title", "Roles")}
      description={t("rbac.roles.description")}
      action={canManageRoles && (
        <Button size="sm" onClick={() => { setEditingRole(null); setFormOpen(true) }}>
          <Plus aria-hidden className="size-4" />
          {t("rbac.roles.create", "Create role")}
        </Button>
      )}
    >
      {isLoading ? (
        <div role="status" className="space-y-3 py-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          <span className="sr-only">{t("common.loading")}</span>
        </div>
      ) : (
        <TooltipProvider delayDuration={100} disableHoverableContent>
          <p id={SYSTEM_HINT_ID} className="sr-only">{t("rbac.roles.systemHint")}</p>
          <SettingsList label={t("rbac.roles.title", "Roles")}>
            {roles.map((role) => {
              const RoleIcon = resolveIcon(role.icon ?? (role.isSystem ? "Shield" : "Users"))
              return (
                <SettingsListItem key={role.id}>
                  <div className="flex min-w-0 items-center gap-3">
                    <RoleIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <span className="truncate">{role.name}</span>
                        {role.isSystem && <Badge variant="outline" className="shrink-0">{t("rbac.roles.system", "System")}</Badge>}
                      </p>
                      {role.description && <p className="truncate text-sm text-muted-foreground">{role.description}</p>}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-4">
                    <PermissionBadgeGroup permissions={role.permissions} max={3} />
                    {canManageRoles && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          disabled={role.isSystem}
                          aria-label={t("rbac.roles.editFor", { name: role.name })}
                          aria-describedby={role.isSystem ? SYSTEM_HINT_ID : undefined}
                          onClick={() => { setEditingRole(role); setFormOpen(true) }}
                        >
                          <Pencil aria-hidden className="size-4" />
                        </Button>
                        {role.isSystem ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive"
                            disabled
                            aria-label={t("rbac.roles.deleteFor", { name: role.name })}
                            aria-describedby={SYSTEM_HINT_ID}
                          >
                            <Trash2 aria-hidden className="size-4" />
                          </Button>
                        ) : (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-destructive"
                                aria-label={t("rbac.roles.deleteFor", { name: role.name })}
                              >
                                <Trash2 aria-hidden className="size-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("rbac.roles.delete", "Delete role")}</AlertDialogTitle>
                                <AlertDialogDescription>{t("rbac.roles.deleteWarning", "Every assignment through this role is removed by cascade.")}</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(role.id)}>{t("common.confirm")}</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    )}
                  </div>
                </SettingsListItem>
              )
            })}
          </SettingsList>
        </TooltipProvider>
      )}

      {canManageRoles && (
        <RoleFormDialog open={formOpen} onOpenChange={setFormOpen} role={editingRole} />
      )}
    </SettingsSection>
  )
}
