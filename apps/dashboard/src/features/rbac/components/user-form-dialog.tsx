// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { useCreateUser } from "../hooks/use-rbac"
import { rbacErrorCode, RBAC_ERROR_CODES } from "../constants"

export interface UserFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserFormDialog({ open, onOpenChange }: UserFormDialogProps) {
  const { t } = useTranslation()
  const createUser = useCreateUser()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [name, setName] = React.useState("")
  const [surname, setSurname] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  const reset = () => {
    setEmail(""); setPassword(""); setName(""); setSurname(""); setError(null)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    try {
      await createUser.mutateAsync({ email, password, name: name || null, surname: surname || null })
      toast.success(t("rbac.users.createSuccess", "Account created"))
      reset()
      onOpenChange(false)
    } catch (err) {
      const code = rbacErrorCode(err)
      if (code === RBAC_ERROR_CODES.EMAIL_TAKEN) {
        setError(t("rbac.errors.email-taken"))
      } else {
        setError(t("rbac.errors.generic"))
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("rbac.users.create", "Create account")}</DialogTitle>
          <DialogDescription>{t("rbac.users.zeroTrustHint", "The account is created with no role and no access until assigned.")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="uf-email">{t("rbac.users.email", "Email")}</FieldLabel>
              <Input id="uf-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="uf-password">{t("rbac.users.password", "Password")}</FieldLabel>
              <Input id="uf-password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="uf-name">{t("rbac.users.name", "Name")}</FieldLabel>
              <Input id="uf-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="uf-surname">{t("rbac.users.surname", "Surname")}</FieldLabel>
              <Input id="uf-surname" value={surname} onChange={(e) => setSurname(e.target.value)} />
            </Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={!email || !password || createUser.isPending}>
              {t("rbac.users.create", "Create account")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
