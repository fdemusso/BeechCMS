// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Eye, EyeOff } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type">

/**
 * A password field with the eye of the login page: the toggle reveals what was typed and swaps its icon with
 * the same short animation. Everything else is a plain Input (it never takes `type`).
 */
export function PasswordInput({ className, ...props }: Readonly<PasswordInputProps>) {
  const { t } = useTranslation()
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pr-10", className)} />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute right-1 top-1/2 -translate-y-1/2 hover:bg-transparent"
        onClick={() => setVisible((prev) => !prev)}
        aria-label={visible ? t("login.hidePassword") : t("login.showPassword")}
      >
        <span
          key={visible ? "visible" : "hidden"}
          className="inline-flex origin-center animate-[icon-swap_0.15s_ease-out]"
        >
          {visible ? <EyeOff className="size-4 text-muted-foreground" /> : <Eye className="size-4 text-muted-foreground" />}
        </span>
      </Button>
    </div>
  )
}
