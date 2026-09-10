// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type { Scope } from "@beechcms/core"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Trash2 } from "reicon-react"
import { usePermissions } from "@/features/shared"
import { useUserAssignments, useCreateAssignment, useDeleteAssignment, useRbacRoles } from "../hooks/use-rbac"
import { ScopeSelect } from "./scope-select"
import { rbacErrorCode, RBAC_ERROR_CODES } from "../constants"

export interface AssignmentsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string | null
  userEmail?: string
}

export function AssignmentsDialog({ open, onOpenChange, userId, userEmail }: AssignmentsDialogProps) {
  const { t } = useTranslation()
  const { can } = usePermissions()
  const { data: assignments = [] } = useUserAssignments(userId ?? "", open && !!userId)
  const { data: roles = [] } = useRbacRoles()
  const createAssignment = useCreateAssignment()
  const deleteAssignment = useDeleteAssignment()

  const [roleId, setRoleId] = React.useState<string>("")
  const [scope, setScope] = React.useState<Scope | undefined>(undefined)

  const selectedRole = roles.find((r) => r.id === roleId)
  const escalationBlocked =
    !!selectedRole && !!scope && !selectedRole.permissions.every((p) => can(p, scope))

  const handleAdd = async () => {
    if (!userId || !roleId || !scope) return
    try {
      await createAssignment.mutateAsync({ userId, roleId, scope })
      toast.success(t("rbac.assignments.add", "Assignment added"))
      setRoleId("")
      setScope(undefined)
    } catch (err) {
      const code = rbacErrorCode(err)
      if (code === RBAC_ERROR_CODES.ESCALATION_REFUSED) {
        toast.error(t("rbac.errors.escalation-refused"))
      } else {
        toast.error(t("rbac.errors.generic"))
      }
    }
  }

  const handleRemove = async (assignmentId: string) => {
    if (!userId) return
    await deleteAssignment.mutateAsync({ assignmentId, userId })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("rbac.assignments.title", "Roles for {{email}}", { email: userEmail })}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {assignments.map((assignment) => (
            <div key={assignment.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {assignment.roleName ?? assignment.roleId} @ {assignment.scope}
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {assignment.permissions.map((permission) => (
                    <Badge key={permission} variant="secondary" className="text-[10px]">{permission}</Badge>
                  ))}
                  {!assignment.active && (
                    <Badge variant="outline" className="text-[10px]">{t("rbac.assignments.inactiveScope", "Inactive scope")}</Badge>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => handleRemove(assignment.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {assignments.length === 0 && (
            <p className="text-sm text-muted-foreground py-2 text-center">{t("rbac.assignments.empty", "No assignments yet")}</p>
          )}
        </div>

        <div className="flex items-end gap-2 pt-2 border-t">
          <div className="flex-1 space-y-1">
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger>
                <SelectValue placeholder={t("rbac.assignments.role", "Role")} />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1">
            <ScopeSelect value={scope} onValueChange={setScope} />
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    type="button"
                    disabled={!roleId || !scope || escalationBlocked || createAssignment.isPending}
                    onClick={handleAdd}
                  >
                    {t("rbac.assignments.add", "Add")}
                  </Button>
                </span>
              </TooltipTrigger>
              {escalationBlocked && (
                <TooltipContent>{t("rbac.errors.escalation-refused")}</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </DialogContent>
    </Dialog>
  )
}
