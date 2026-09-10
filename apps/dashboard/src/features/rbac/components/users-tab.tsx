// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Plus, ShieldCheck } from "reicon-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
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

  const sortedUsers = React.useMemo(() => {
    if (!currentUser?.id) return users
    return [...users].sort((a, b) => {
      if (a.id === currentUser.id) return -1
      if (b.id === currentUser.id) return 1
      return 0
    })
  }, [users, currentUser?.id])

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
        <TooltipProvider delayDuration={100} disableHoverableContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("rbac.users.email", "Email")}</TableHead>
                <TableHead>{t("rbac.users.name", "Name")}</TableHead>
                <TableHead>{t("rbac.users.roles", "Roles")}</TableHead>
                <TableHead className="w-[120px] text-right">{t("common.actions", "Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedUsers.map((accountUser) => {
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
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setAssignmentsUser(accountUser)}
                              aria-label={t("rbac.users.manageRoles", "Manage roles")}
                            >
                              <ShieldCheck className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {t("rbac.users.manageRoles", "Manage roles")}
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex">
                              <Switch
                                checked={accountUser.isActive}
                                disabled={isSelf || setUserActive.isPending}
                                onCheckedChange={() => handleToggleActive(accountUser)}
                                aria-label={t("rbac.users.status", "Status")}
                              />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {t("rbac.users.status", "Status")}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TooltipProvider>
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
