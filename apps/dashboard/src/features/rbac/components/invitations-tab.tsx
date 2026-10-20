// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Plus, Refresh as RefreshCw, Trash2, Copy } from "reicon-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
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
import { useInvitations, useRbacRoles, useRegenerateInvitation, useRevokeInvitation } from "../hooks/use-rbac"
import { InviteDialog } from "./invite-dialog"
import { ScopeBadge } from "./permission-badge"
import { RoleBadge } from "./role-badge"
import { rbacErrorCode, RBAC_ERROR_CODES } from "../constants"

export function InvitationsTab() {
  const { t } = useTranslation()
  const { data: invitations = [], isLoading } = useInvitations()
  const { data: roles = [] } = useRbacRoles()
  const roleById = React.useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles])
  const regenerate = useRegenerateInvitation()
  const revoke = useRevokeInvitation()
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [pendingLinks, setPendingLinks] = React.useState<Record<string, string>>({})

  const handleRegenerate = async (invitationId: string) => {
    try {
      const result = await regenerate.mutateAsync(invitationId)
      setPendingLinks((prev) => ({ ...prev, [invitationId]: result.inviteUrl }))
      toast.success(t("rbac.invitations.emailSent", "Invitation emailed"))
    } catch (err) {
      const code = rbacErrorCode(err)
      if (code === RBAC_ERROR_CODES.INVITATION_ALREADY_USED) {
        toast.error(t("rbac.errors.invitation-already-used"))
      } else {
        toast.error(t("rbac.errors.generic"))
      }
    }
  }

  const handleCopyLink = async (invitationId: string) => {
    const url = pendingLinks[invitationId]
    if (!url) return
    await navigator.clipboard.writeText(url)
    toast.success(t("rbac.invitations.linkCopied", "Invite link copied"))
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
          <TooltipProvider delayDuration={100} disableHoverableContent>
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
                  <TableCell>
                    <RoleBadge
                      role={roleById.get(invitation.roleId) ?? { id: invitation.roleId, name: invitation.roleName ?? invitation.roleId }}
                    />
                  </TableCell>
                  <TableCell><ScopeBadge scope={invitation.scope} /></TableCell>
                  <TableCell>
                    <Badge variant={invitation.status === "pending" ? "default" : "outline"}>
                      {t(`rbac.invitations.statuses.${invitation.status}`, invitation.status)}
                    </Badge>
                  </TableCell>
                  <TableCell><RelativeTime value={invitation.expiresAt} /></TableCell>
                  <TableCell className="text-right space-x-2">
                    {pendingLinks[invitation.id] && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => handleCopyLink(invitation.id)}>
                            <Copy className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">{t("rbac.invitations.copyLink", "Copy invite link")}</TooltipContent>
                      </Tooltip>
                    )}
                    {invitation.status !== "accepted" && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => handleRegenerate(invitation.id)}>
                            <RefreshCw className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">{t("rbac.invitations.regenerate", "Regenerate")}</TooltipContent>
                      </Tooltip>
                    )}
                    <AlertDialog>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8 text-destructive">
                              <Trash2 className="size-4" />
                            </Button>
                          </AlertDialogTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="top">{t("rbac.invitations.revoke", "Revoke")}</TooltipContent>
                      </Tooltip>
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
          </TooltipProvider>
        )}
      </CardContent>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={(id, inviteUrl) => setPendingLinks((prev) => ({ ...prev, [id]: inviteUrl }))}
      />
    </Card>
  )
}
