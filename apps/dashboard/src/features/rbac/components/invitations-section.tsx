// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Plus, Refresh as RefreshCw, Trash2, Copy } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  SETTINGS_TABLE_HEAD_REM,
  SETTINGS_TABLE_ROW_CLASS,
  SETTINGS_TABLE_ROW_REM,
  SettingsScroll,
  SettingsSection,
} from "@/components/ui/settings-section"
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

/**
 * The invitations sent, as a table with its columns named: address, role, scope, where it stands, when it expires,
 * and what can still be done to it. An invitation already accepted can only be revoked.
 */
export function InvitationsSection() {
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
    <SettingsSection
      id="invitations"
      title={t("rbac.invitations.title", "Invitations")}
      description={t("rbac.invitations.description")}
      action={
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <Plus aria-hidden className="size-4" />
          {t("rbac.invitations.invite", "Invite")}
        </Button>
      }
    >
      {isLoading ? (
        <div role="status" className="space-y-3 py-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          <span className="sr-only">{t("common.loading")}</span>
        </div>
      ) : invitations.length === 0 ? (
        <p className="border-b border-border py-4 text-sm text-muted-foreground">{t("rbac.invitations.empty")}</p>
      ) : (
        <TooltipProvider delayDuration={100} disableHoverableContent>
          <SettingsScroll label={t("rbac.invitations.title", "Invitations")} rowRem={SETTINGS_TABLE_ROW_REM} headerRem={SETTINGS_TABLE_HEAD_REM}>
          {/* The table must not scroll on its own, or the header could not stay above the rows. */}
          <Table containerClassName="overflow-visible" aria-label={t("rbac.invitations.title", "Invitations")}>
            <TableHeader className="sticky top-0 z-10 bg-[var(--settings-page-bg)]">
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
                <TableRow key={invitation.id} className={SETTINGS_TABLE_ROW_CLASS}>
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
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {pendingLinks[invitation.id] && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => handleCopyLink(invitation.id)}
                              aria-label={t("rbac.invitations.copyLinkFor", { email: invitation.email })}
                            >
                              <Copy aria-hidden className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">{t("rbac.invitations.copyLink", "Copy invite link")}</TooltipContent>
                        </Tooltip>
                      )}
                      {invitation.status !== "accepted" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => handleRegenerate(invitation.id)}
                              aria-label={t("rbac.invitations.regenerateFor", { email: invitation.email })}
                            >
                              <RefreshCw aria-hidden className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">{t("rbac.invitations.regenerate", "Regenerate")}</TooltipContent>
                        </Tooltip>
                      )}
                      <AlertDialog>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-status-danger-foreground"
                                aria-label={t("rbac.invitations.revokeFor", { email: invitation.email })}
                              >
                                <Trash2 aria-hidden className="size-4" />
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
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </SettingsScroll>
        </TooltipProvider>
      )}

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={(id, inviteUrl) => setPendingLinks((prev) => ({ ...prev, [id]: inviteUrl }))}
      />
    </SettingsSection>
  )
}
