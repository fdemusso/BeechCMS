// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Plus, ShieldCheck } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { SettingsList, SettingsListItem, SettingsSection } from "@/components/ui/settings-section"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useMe } from "@/features/shared"
import { useRbacUsers, useRbacRoles, useSetUserActive } from "../hooks/use-rbac"
import { UserFormDialog } from "./user-form-dialog"
import { AssignmentsDialog } from "./assignments-dialog"
import { RoleBadgeGroup } from "./role-badge"
import { rbacErrorCode, RBAC_ERROR_CODES } from "../constants"
import type { AccountView } from "../types/rbac.types"

/**
 * Everyone who can sign in, one person per row: who they are on the left; the roles they hold, a button to change
 * them and the on/off switch of the account on the right. The caller comes first and cannot switch themself off.
 */
export function UsersSection() {
  const { t } = useTranslation()
  const { data: currentUser } = useMe()
  const { data: users = [], isLoading } = useRbacUsers()
  const { data: roles = [] } = useRbacRoles()
  const setUserActive = useSetUserActive()

  const roleById = React.useMemo(
    () => new Map(roles.map((role) => [role.id, role])),
    [roles]
  )

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
    <SettingsSection
      id="users"
      title={t("rbac.users.title", "Users")}
      description={t("rbac.users.description")}
      action={
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden className="size-4" />
          {t("rbac.users.create", "Create account")}
        </Button>
      }
    >
      {isLoading ? (
        <div role="status" className="space-y-3 py-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          <span className="sr-only">{t("common.loading")}</span>
        </div>
      ) : (
        <TooltipProvider delayDuration={100} disableHoverableContent>
          <SettingsList label={t("rbac.users.title", "Users")}>
            {sortedUsers.map((accountUser) => {
              const isSelf = currentUser?.id === accountUser.id
              const fullName = [accountUser.name, accountUser.surname].filter(Boolean).join(" ")
              const uniqueRoles = new Map(
                accountUser.assignments
                  .map((assignment) => roleById.get(assignment.roleId))
                  .filter((role): role is NonNullable<typeof role> => !!role)
                  .map((role) => [role.id, role])
              )
              const selfHintId = `user-${accountUser.id}-self-hint`
              return (
                <SettingsListItem key={accountUser.id}>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <span className="truncate">{accountUser.email}</span>
                      {isSelf && <Badge variant="secondary" className="shrink-0">{t("rbac.users.you", "You")}</Badge>}
                      {!accountUser.isActive && <Badge variant="outline" className="shrink-0">{t("rbac.users.inactive")}</Badge>}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{fullName || "—"}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-4">
                    {uniqueRoles.size === 0 ? (
                      <span className="text-sm text-muted-foreground">{t("rbac.users.noAccess")}</span>
                    ) : (
                      <RoleBadgeGroup roles={[...uniqueRoles.values()]} max={3} />
                    )}

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setAssignmentsUser(accountUser)}
                          aria-label={t("rbac.users.manageRolesOf", { email: accountUser.email })}
                        >
                          <ShieldCheck aria-hidden className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">{t("rbac.users.manageRoles", "Manage roles")}</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Switch
                            checked={accountUser.isActive}
                            disabled={isSelf || setUserActive.isPending}
                            onCheckedChange={() => handleToggleActive(accountUser)}
                            aria-label={t("rbac.users.statusFor", { email: accountUser.email })}
                            aria-describedby={isSelf ? selfHintId : undefined}
                          />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {isSelf
                          ? t("rbac.users.cannotDeactivateSelf", "You cannot deactivate your own account")
                          : t("rbac.users.status", "Status")}
                      </TooltipContent>
                    </Tooltip>
                    {/* The tooltip is for the mouse; this is why the switch is disabled, for everyone else. */}
                    {isSelf && <span id={selfHintId} className="sr-only">{t("rbac.users.cannotDeactivateSelf")}</span>}
                  </div>
                </SettingsListItem>
              )
            })}
          </SettingsList>
        </TooltipProvider>
      )}

      <UserFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <AssignmentsDialog
        open={!!assignmentsUser}
        onOpenChange={(next) => { if (!next) setAssignmentsUser(null) }}
        userId={assignmentsUser?.id ?? null}
        userEmail={assignmentsUser?.email}
      />
    </SettingsSection>
  )
}
