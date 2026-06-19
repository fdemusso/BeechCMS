// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import React, { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import axios from "axios"
import { Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128

export function ResetPasswordPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token")

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isConfirmVisible, setIsConfirmVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  if (!token) {
    return (
      <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm sm:max-w-md">
          <Card className="overflow-hidden shadow-md">
            <CardContent className="p-6 md:p-8">
              <div className="flex flex-col items-center gap-4 text-center">
                <h1 className="font-heading text-2xl font-semibold">{t("resetPassword.invalidLinkTitle")}</h1>
                <p className="text-muted-foreground text-sm">{t("resetPassword.invalidLink")}</p>
                <Link to="/forgot-password" className="text-sm underline-offset-2 hover:underline">
                  {t("resetPassword.requestNew")}
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
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
      setError(t("resetPassword.mismatch"))
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("resetPassword.tooShort"))
      return
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      setError(t("resetPassword.tooLong"))
      return
    }
    setError(null)
    setIsLoading(true)
    try {
      await axios.post("/auth/reset-password", { token, password, locale: i18n.language })
      toast.success(t("resetPassword.success"))
      navigate("/login", { replace: true })
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        setError(t("resetPassword.invalidToken"))
      } else {
        setError(t("resetPassword.genericError"))
      }
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-sm sm:max-w-md">
        <Card className="overflow-hidden shadow-md">
          <CardContent className="p-6 md:p-8">
            <form onSubmit={handleSubmit} noValidate>
              <FieldGroup>
                <div className="flex flex-col items-center gap-2 text-center">
                  <h1 className="font-heading text-2xl font-semibold">{t("resetPassword.title")}</h1>
                  <p className="text-muted-foreground text-balance text-sm">
                    {t("resetPassword.desc")}
                  </p>
                </div>
                <Field>
                  <FieldLabel htmlFor="rp-password">{t("resetPassword.newPassword")}</FieldLabel>
                  <div className="relative">
                    <Input
                      id="rp-password"
                      type={isPasswordVisible ? "text" : "password"}
                      autoComplete="new-password"
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
                      <span className="inline-flex origin-center animate-[icon-swap_0.15s_ease-out]">
                        {isPasswordVisible ? (
                          <EyeOff className="text-muted-foreground size-4" />
                        ) : (
                          <Eye className="text-muted-foreground size-4" />
                        )}
                      </span>
                    </Button>
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="rp-confirm">{t("resetPassword.confirmPassword")}</FieldLabel>
                  <div className="relative">
                    <Input
                      id="rp-confirm"
                      type={isConfirmVisible ? "text" : "password"}
                      autoComplete="new-password"
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
                      <span className="inline-flex origin-center animate-[icon-swap_0.15s_ease-out]">
                        {isConfirmVisible ? (
                          <EyeOff className="text-muted-foreground size-4" />
                        ) : (
                          <Eye className="text-muted-foreground size-4" />
                        )}
                      </span>
                    </Button>
                  </div>
                  {error && <FieldError>{error}</FieldError>}
                </Field>
                <Field>
                  <Button
                    type="submit"
                    disabled={!isFormValid || isLoading}
                  >
                    {isLoading ? t("resetPassword.resetting") : t("resetPassword.reset")}
                  </Button>
                </Field>
                <div className="text-center">
                  <Link to="/login" className="text-sm underline-offset-2 hover:underline">
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
