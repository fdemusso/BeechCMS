// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import React, { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import { Eye, EyeOff } from 'reicon-react'
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { PasswordStrengthIndicator } from "@/components/ui/password-strength-indicator"
import { GLOBAL_SCOPE } from "@beechcms/core"

const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128

interface InvitationPreview {
  email: string
  roleName: string
  scope: string
}

export function AcceptInvitePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token")

  const [name, setName] = useState("")
  const [surname, setSurname] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isConfirmVisible, setIsConfirmVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: preview, isError, isLoading } = useQuery<InvitationPreview>({
    queryKey: ["invitation-preview", token],
    queryFn: async () => (await axios.get(`/auth/invitations/${token}`)).data,
    enabled: !!token,
    retry: false,
  })

  const invalidCard = (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm sm:max-w-md">
        <Card className="overflow-hidden shadow-md">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <h1 className="font-heading text-2xl font-semibold">{t("acceptInvite.title")}</h1>
              <p className="text-muted-foreground text-sm">{t("acceptInvite.invalidOrExpired")}</p>
              <Link to="/login" className="text-sm hover:opacity-80 transition-opacity">
                {t("forgotPassword.backToLogin")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )

  if (!token) return invalidCard
  if (isError) return invalidCard
  if (isLoading || !preview) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  const isFormValid =
    password.length >= MIN_PASSWORD_LENGTH &&
    password.length <= MAX_PASSWORD_LENGTH &&
    password === confirm

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (password !== confirm) {
      setError(t("acceptInvite.mismatch"))
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("acceptInvite.tooShort"))
      return
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      setError(t("acceptInvite.tooLong"))
      return
    }
    setError(null)
    setIsSubmitting(true)
    try {
      await axios.post("/auth/invitations/accept", { token, password, name, surname })
      toast.success(t("acceptInvite.success"))
      navigate("/login", { replace: true })
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const type = err.response?.data?.type as string | undefined
        const code = type?.split("/").pop()
        if (code === "invitation-invalid" || code === "invitation-revoked") {
          setError(t("acceptInvite.invalidOrExpired"))
        } else if (code === "email-taken") {
          setError(t("acceptInvite.accountExists"))
        } else if (code === "validation-failed") {
          setError(t("acceptInvite.tooShort"))
        } else {
          setError(t("acceptInvite.genericError"))
        }
      } else {
        setError(t("acceptInvite.genericError"))
      }
      setIsSubmitting(false)
    }
  }

  const scopeLabel = preview.scope === GLOBAL_SCOPE ? t("rbac.scope.global", "All seeds (global)") : preview.scope

  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-sm sm:max-w-md">
        <Card className="overflow-hidden shadow-md">
          <CardContent className="p-6 md:p-8">
            <form onSubmit={handleSubmit} noValidate>
              <FieldGroup>
                <div className="flex flex-col items-center gap-2 text-center">
                  <h1 className="font-heading text-2xl font-semibold">{t("acceptInvite.title")}</h1>
                  <p className="text-muted-foreground text-balance text-sm">
                    {t("acceptInvite.invitedAs", { role: preview.roleName })}
                    {" "}
                    {t("acceptInvite.onScope", { scope: scopeLabel })}
                  </p>
                </div>
                <Field>
                  <FieldLabel htmlFor="ai-email">{t("rbac.users.email", "Email")}</FieldLabel>
                  <Input id="ai-email" type="email" value={preview.email} readOnly disabled />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ai-name">{t("rbac.users.name", "Name")}</FieldLabel>
                  <Input id="ai-name" value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ai-surname">{t("rbac.users.surname", "Surname")}</FieldLabel>
                  <Input id="ai-surname" value={surname} onChange={(e) => setSurname(e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ai-password">{t("acceptInvite.password")}</FieldLabel>
                  <div className="relative">
                    <Input
                      id="ai-password"
                      type={isPasswordVisible ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder={t("acceptInvite.passwordPlaceholder", { defaultValue: t("setup.passwordPlaceholder") })}
                      value={password}
                      className={cn("pr-10", error ? "border-destructive" : "")}
                      onChange={(e) => { setPassword(e.target.value); setError(null) }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 hover:bg-transparent"
                      onClick={() => setIsPasswordVisible((p) => !p)}
                      aria-label={isPasswordVisible ? t("login.hidePassword") : t("login.showPassword")}
                    >
                      {isPasswordVisible ? (
                        <EyeOff className="text-muted-foreground size-4" />
                      ) : (
                        <Eye className="text-muted-foreground size-4" />
                      )}
                    </Button>
                  </div>
                  <PasswordStrengthIndicator
                    password={password}
                    name={name}
                    surname={surname}
                    email={preview.email}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ai-confirm">{t("acceptInvite.confirm")}</FieldLabel>
                  <div className="relative">
                    <Input
                      id="ai-confirm"
                      type={isConfirmVisible ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder={t("acceptInvite.confirmPlaceholder", { defaultValue: t("setup.confirmPlaceholder") })}
                      value={confirm}
                      className={cn("pr-10", error ? "border-destructive" : "")}
                      onChange={(e) => { setConfirm(e.target.value); setError(null) }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 hover:bg-transparent"
                      onClick={() => setIsConfirmVisible((p) => !p)}
                      aria-label={isConfirmVisible ? t("login.hidePassword") : t("login.showPassword")}
                    >
                      {isConfirmVisible ? (
                        <EyeOff className="text-muted-foreground size-4" />
                      ) : (
                        <Eye className="text-muted-foreground size-4" />
                      )}
                    </Button>
                  </div>
                  {error && <FieldError>{error}</FieldError>}
                </Field>
                <Field>
                  <Button type="submit" disabled={!isFormValid || isSubmitting}>
                    {isSubmitting ? t("acceptInvite.submit") : t("acceptInvite.submit")}
                  </Button>
                </Field>
                <div className="text-center">
                  <Link to="/login" className="text-sm hover:opacity-80 transition-opacity">
                    {t("forgotPassword.backToLogin")}
                  </Link>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
