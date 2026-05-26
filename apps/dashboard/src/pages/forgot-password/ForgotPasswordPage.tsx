// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import React, { useState } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import axios from "axios"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function ForgotPasswordPage() {
  const { t, i18n } = useTranslation()
  const [email, setEmail] = useState("")
  const [emailError, setEmailError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) {
      setEmailError(t("forgotPassword.emailRequired"))
      return
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      setEmailError(t("forgotPassword.emailInvalid"))
      return
    }
    setEmailError(null)
    setIsLoading(true)
    try {
      await axios.post("/auth/forgot-password", { email: trimmed, locale: i18n.language })
    } catch {
      // intentionally swallowed — always show success to prevent user enumeration
    }
    setIsLoading(false)
    setSubmitted(true)
  }

  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-sm sm:max-w-md">
        <Card className="overflow-hidden shadow-md">
          <CardContent className="p-6 md:p-8">
            {submitted ? (
              <div className="flex flex-col items-center gap-4 text-center">
                <h1 className="text-2xl font-semibold">{t("forgotPassword.successTitle")}</h1>
                <p className="text-muted-foreground text-balance text-sm">
                  {t("forgotPassword.successDesc")}
                </p>
                <Link
                  to="/login"
                  className="text-sm underline-offset-2 hover:underline"
                >
                  {t("forgotPassword.backToLogin")}
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <FieldGroup>
                  <div className="flex flex-col items-center gap-2 text-center">
                    <h1 className="text-2xl font-semibold">{t("forgotPassword.title")}</h1>
                    <p className="text-muted-foreground text-balance text-sm">
                      {t("forgotPassword.desc")}
                    </p>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="fp-email">Email</FieldLabel>
                    <Input
                      id="fp-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      className={cn(emailError ? "border-destructive" : "")}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        setEmailError(null)
                      }}
                    />
                    {emailError && <FieldError>{emailError}</FieldError>}
                  </Field>
                  <Field>
                    <Button
                      type="submit"
                      disabled={!email.trim() || isLoading}
                      className={cn(
                        "transition-colors duration-200 ease-out disabled:opacity-100",
                        email.trim() && !isLoading
                          ? "bg-accent text-accent-foreground hover:bg-accent/90"
                          : "bg-muted text-muted-foreground cursor-not-allowed"
                      )}
                    >
                      {isLoading ? t("forgotPassword.sending") : t("forgotPassword.send")}
                    </Button>
                  </Field>
                  <div className="text-center">
                    <Link
                      to="/login"
                      className="text-sm underline-offset-2 hover:underline"
                    >
                      {t("forgotPassword.backToLogin")}
                    </Link>
                  </div>
                </FieldGroup>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
