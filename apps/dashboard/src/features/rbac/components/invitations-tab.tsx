// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Plus, Refresh as RefreshCw, Trash2 } from "reicon-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RelativeTime } from "@/components/ui/relative-time"
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
import { useInvitations, useRegenerateInvitation, useRevokeInvitation } from "../hooks/use-rbac"
import { InviteDialog } from "./invite-dialog"
import { rbacErrorCode, RBAC_ERROR_CODES } from "../constants"

export function InvitationsTab() {
  const { t } = useTranslation()
  const { data: invitations = [], isLoading } = useInvitations()
  const regenerate = useRegenerateInvitation()
  const revoke = useRevokeInvitation()
  const [inviteOpen, setInviteOpen] = React.useState(false)

  const handleRegenerate = async (invitationId: string) => {
    try {
      await regenerate.mutateAsync(invitationId)
      toast.success(t("rbac.invitations.emailSent", "Invitation emailed"))
    } catch (err) {
      const code = rbacErrorCode(err)
      if (code === RBAC_ERROR_CODES.INVITATION_ALREADY_USED) {
        toast.error(t("rbac.errors.invitation-already-used"))
      } else if (code === RBAC_ERROR_CODES.EMAIL_UNAVAILABLE) {
        toast.error(t("rbac.errors.email-unavailable"))
      } else {
        toast.error(t("rbac.errors.generic"))
      }
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("rbac.invitations.title", "Invitations")}</CardTitle>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <Plus className="size-4" />
          {t("rbac.invitations.invite", "Invite")}
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
                <TableHead>{t("rbac.assignments.role", "Role")}</TableHead>
                <TableHead>{t("rbac.assignments.scope", "Scope")}</TableHead>
                <TableHead>{t("rbac.invitations.status", "Status")}</TableHead>
                <TableHead>{t("rbac.invitations.expires", "Expires")}</TableHead>
                <TableHead className="text-right">{t("common.actions", "Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell className="font-medium">{invitation.email}</TableCell>
                  <TableCell>{invitation.roleName ?? invitation.roleId}</TableCell>
                  <TableCell>{invitation.scope}</TableCell>
                  <TableCell>
                    <Badge variant={invitation.status === "pending" ? "default" : "outline"}>
                      {t(`rbac.invitations.statuses.${invitation.status}`, invitation.status)}
                    </Badge>
                  </TableCell>
                  <TableCell><RelativeTime value={invitation.expiresAt} /></TableCell>
                  <TableCell className="text-right space-x-2">
                    {invitation.status !== "accepted" && (
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => handleRegenerate(invitation.id)}>
                        <RefreshCw className="size-4" />
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8 text-destructive">
                          <Trash2 className="size-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("rbac.invitations.revoke", "Revoke")}</AlertDialogTitle>
                          <AlertDialogDescription>{t("rbac.invitations.revokeWarning", "This invitation link will stop working.")}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => revoke.mutate(invitation.id)}>{t("common.confirm")}</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </Card>
  )
}
