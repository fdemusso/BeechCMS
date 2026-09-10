// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Plus, Edit as Pencil, Trash2 } from "reicon-react"
import type { RoleRecord } from "@beechcms/core"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
import { useRbacRoles, useDeleteRole } from "../hooks/use-rbac"
import { RoleFormDialog } from "./role-form-dialog"
import { rbacErrorCode, RBAC_ERROR_CODES } from "../constants"

export function RolesTab() {
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("rbac.roles.title", "Roles")}</CardTitle>
        {canManageRoles && (
          <Button size="sm" onClick={() => { setEditingRole(null); setFormOpen(true) }}>
            <Plus className="size-4" />
            {t("rbac.roles.create", "Create role")}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("rbac.roles.name", "Name")}</TableHead>
                <TableHead>{t("rbac.roles.description", "Description")}</TableHead>
                <TableHead>{t("rbac.roles.permissions", "Permissions")}</TableHead>
                {canManageRoles && <TableHead className="text-right">{t("common.actions", "Actions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">
                    {role.name}
                    {role.isSystem && <Badge variant="secondary" className="ml-2 text-[10px]">{t("rbac.roles.system", "System")}</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{role.description ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {role.permissions.map((permission) => (
                        <Badge key={permission} variant="secondary" className="text-[10px]">{permission}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  {canManageRoles && (
                    <TableCell className="text-right space-x-2">
                      {!role.isSystem && (
                        <>
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => { setEditingRole(role); setFormOpen(true) }}>
                            <Pencil className="size-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8 text-destructive">
                                <Trash2 className="size-4" />
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
                        </>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {canManageRoles && (
        <RoleFormDialog open={formOpen} onOpenChange={setFormOpen} role={editingRole} />
      )}
    </Card>
  )
}
