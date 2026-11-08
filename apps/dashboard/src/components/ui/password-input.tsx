// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Eye, EyeOff } from "@/components/icons"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type">

/**
 * A password field with an eye toggle that reveals what was typed. Everything else is a plain Input (it never
 * takes `type`).
 */
export function PasswordInput({ className, ...props }: Readonly<PasswordInputProps>) {
  const { t } = useTranslation()
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="relative">
      {/* No spellcheck, autocorrect or auto-capitalisation: a password is typed exactly as it is. */}
      <Input
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-10", className)}
      />
      {/* A bare button on purpose: no hover state, and the icon swaps instantly so the eye reads as opening and closing. */}
      <button
        type="button"
        className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setVisible((prev) => !prev)}
        aria-label={visible ? t("login.hidePassword") : t("login.showPassword")}
        aria-controls={props.id}
      >
        {visible ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
      </button>
    </div>
  )
}
