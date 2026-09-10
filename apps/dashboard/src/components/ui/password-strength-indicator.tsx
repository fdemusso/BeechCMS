// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import {
  passwordStrength,
  getStrengthColor,
  getStrengthLabelKey,
} from "@/lib/password-strength"

export interface PasswordStrengthIndicatorProps {
  password: string
  name?: string
  surname?: string
  email?: string
  className?: string
  translationPrefix?: "setup" | "acceptInvite"
}

export function PasswordStrengthIndicator({
  password,
  name,
  surname,
  email,
  className,
  translationPrefix = "acceptInvite",
}: Readonly<PasswordStrengthIndicatorProps>) {
  const { t } = useTranslation()
  const strength = passwordStrength(password, name, surname, email)
  const strengthColor = getStrengthColor(strength)
  const labelKey = getStrengthLabelKey(strength)
  const strengthLabel = t(`${translationPrefix}.${labelKey}`, {
    defaultValue: t(`setup.${labelKey}`),
  })

  return (
    <div
      className={cn("space-y-1", !password && "invisible", className)}
      data-testid="password-strength-indicator"
      aria-live="polite"
    >
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-300", strengthColor)}
          style={{ width: `${strength}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{strengthLabel}</p>
    </div>
  )
}
