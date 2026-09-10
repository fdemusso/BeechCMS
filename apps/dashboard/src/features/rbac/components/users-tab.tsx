// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Plus } from "reicon-react"
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
import { useMe } from "@/features/shared"
import { useRbacUsers, useSetUserActive } from "../hooks/use-rbac"
import { UserFormDialog } from "./user-form-dialog"
import { AssignmentsDialog } from "./assignments-dialog"
import { rbacErrorCode, RBAC_ERROR_CODES } from "../constants"
import type { AccountView } from "../types/rbac.types"

export function UsersTab() {
  const { t } = useTranslation()
  const { data: currentUser } = useMe()
  const { data: users = [], isLoading } = useRbacUsers()
  const setUserActive = useSetUserActive()

  const [createOpen, setCreateOpen] = React.useState(false)
  const [assignmentsUser, setAssignmentsUser] = React.useState<AccountView | null>(null)

  const handleToggleActive = async (targetUser: AccountView) => {
    try {
      await setUserActive.mutateAsync({ userId: targetUser.id, isActive: !targetUser.isActive })
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
        <CardTitle>{t("rbac.users.title", "Users")}</CardTitle>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          {t("rbac.users.create", "Create account")}
        </Button>
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
                <TableHead>{t("rbac.users.email", "Email")}</TableHead>
                <TableHead>{t("rbac.users.name", "Name")}</TableHead>
                <TableHead>{t("rbac.users.roles", "Roles")}</TableHead>
                <TableHead>{t("rbac.users.status", "Status")}</TableHead>
                <TableHead className="text-right">{t("common.actions", "Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((accountUser) => {
                const isSelf = currentUser?.id === accountUser.id
                return (
                  <TableRow key={accountUser.id}>
                    <TableCell className="font-medium">
                      {accountUser.email}
                      {isSelf && <Badge variant="secondary" className="ml-2 text-[10px]">{t("rbac.users.you", "You")}</Badge>}
                    </TableCell>
                    <TableCell>{[accountUser.name, accountUser.surname].filter(Boolean).join(" ") || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {accountUser.assignments.map((assignment) => (
                          <Badge key={assignment.id} variant="secondary" className="text-[10px]">
                            {assignment.scope}
                          </Badge>
                        ))}
                        {accountUser.assignments.length === 0 && (
                          <span className="text-xs text-muted-foreground">{t("rbac.users.zeroTrustHint", "No access")}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={accountUser.isActive ? "default" : "outline"}>
                        {accountUser.isActive ? t("rbac.users.active", "Active") : t("rbac.users.disabled", "Disabled")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="sm" onClick={() => setAssignmentsUser(accountUser)}>
                        {t("rbac.users.manageRoles", "Manage roles")}
                      </Button>
                      {!isSelf && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              {accountUser.isActive
                                ? t("rbac.users.deactivate", "Deactivate")
                                : t("rbac.users.reactivate", "Reactivate")}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {accountUser.isActive
                                  ? t("rbac.users.deactivate", "Deactivate")
                                  : t("rbac.users.reactivate", "Reactivate")}
                              </AlertDialogTitle>
                              {accountUser.isActive && (
                                <AlertDialogDescription>
                                  {t("rbac.users.deactivateWarning", "All active sessions are revoked immediately.")}
                                </AlertDialogDescription>
                              )}
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleToggleActive(accountUser)}>
                                {t("common.confirm")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <UserFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <AssignmentsDialog
        open={!!assignmentsUser}
        onOpenChange={(next) => { if (!next) setAssignmentsUser(null) }}
        userId={assignmentsUser?.id ?? null}
        userEmail={assignmentsUser?.email}
      />
    </Card>
  )
}
