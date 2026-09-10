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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { usePermissions } from "@/features/shared"
import { useCreateInvitation, useRbacRoles } from "../hooks/use-rbac"
import { ScopeSelect } from "./scope-select"
import { rbacErrorCode, RBAC_ERROR_CODES } from "../constants"

export interface InviteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InviteDialog({ open, onOpenChange }: InviteDialogProps) {
  const { t } = useTranslation()
  const { can } = usePermissions()
  const { data: roles = [] } = useRbacRoles()
  const createInvitation = useCreateInvitation()

  const [email, setEmail] = React.useState("")
  const [roleId, setRoleId] = React.useState("")
  const [scope, setScope] = React.useState<Scope | undefined>(undefined)
  const [error, setError] = React.useState<string | null>(null)

  const selectedRole = roles.find((r) => r.id === roleId)
  const escalationBlocked =
    !!selectedRole && !!scope && !selectedRole.permissions.every((p) => can(p, scope))

  const reset = () => { setEmail(""); setRoleId(""); setScope(undefined); setError(null) }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!roleId || !scope) return
    setError(null)
    try {
      await createInvitation.mutateAsync({ email, roleId, scope })
      toast.success(t("rbac.invitations.emailSent", "Invitation emailed"))
      reset()
      onOpenChange(false)
    } catch (err) {
      const code = rbacErrorCode(err)
      if (code === RBAC_ERROR_CODES.ESCALATION_REFUSED) {
        setError(t("rbac.errors.escalation-refused"))
      } else if (code === RBAC_ERROR_CODES.EMAIL_UNAVAILABLE) {
        setError(t("rbac.errors.email-unavailable"))
      } else {
        setError(t("rbac.errors.generic"))
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("rbac.invitations.invite", "Invite")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="inv-email">{t("rbac.users.email", "Email")}</FieldLabel>
              <Input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="inv-role">{t("rbac.assignments.role", "Role")}</FieldLabel>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger id="inv-role">
                  <SelectValue placeholder={t("rbac.assignments.role", "Role")} />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="inv-scope">{t("rbac.assignments.scope", "Scope")}</FieldLabel>
              <ScopeSelect id="inv-scope" value={scope} onValueChange={setScope} />
            </Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button type="submit" disabled={!email || !roleId || !scope || escalationBlocked || createInvitation.isPending}>
                      {t("rbac.invitations.invite", "Invite")}
                    </Button>
                  </span>
                </TooltipTrigger>
                {escalationBlocked && <TooltipContent>{t("rbac.errors.escalation-refused")}</TooltipContent>}
              </Tooltip>
            </TooltipProvider>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
