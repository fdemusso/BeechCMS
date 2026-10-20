// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { Globe } from "reicon-react"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { LocaleCompletion } from "../lib/localized-form"

/** Properties for the {@link LocaleSwitcher} component. */
export interface LocaleSwitcherProps {
  /** Registered content locales, in project order. */
  readonly locales: readonly string[]
  /** The project default locale (badged in the list). */
  readonly defaultLocale: string
  /** The locale the editor currently shows. */
  readonly activeLocale: string
  /** Per-locale completion of the entry being edited. */
  readonly completion: Readonly<Record<string, LocaleCompletion>>
  /** Fired with the picked locale. */
  readonly onLocaleChange: (locale: string) => void
}

/**
 * The Entry Editor's content-language selector in the header.
 * Displayed as a globe icon button aligned with the editor tools, opening a dropdown
 * where options are colored by translation status (normal if translated, amber if partial, red if untranslated).
 */
export function LocaleSwitcher({ locales, defaultLocale, activeLocale, completion, onLocaleChange }: LocaleSwitcherProps) {
  const { t } = useTranslation()
  const switcherLabel = t("content.editor.localization.switcherLabel")

  return (
    <Select value={activeLocale} onValueChange={onLocaleChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SelectTrigger
            size="icon-sm"
            hideChevron
            aria-label={switcherLabel}
          >
            <Globe className="size-4" />
            <span className="sr-only">{switcherLabel}</span>
          </SelectTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {switcherLabel}
        </TooltipContent>
      </Tooltip>
      <SelectContent align="end" className="w-auto min-w-36">
        {locales.map((locale) => {
          const { filled, total } = completion[locale] ?? { filled: 0, total: 0 }
          const isUntranslated = total > 0 && filled === 0
          const isPartiallyTranslated = total > 0 && filled > 0 && filled < total
          const status = isUntranslated ? "untranslated" : isPartiallyTranslated ? "partial" : "translated"

          return (
            <SelectItem
              key={locale}
              value={locale}
              data-status={status}
              className={cn(
                "text-xs cursor-pointer",
                isUntranslated && "text-destructive focus:text-destructive",
                isPartiallyTranslated && "text-amber-600 dark:text-amber-400 focus:text-amber-600 dark:focus:text-amber-400"
              )}
            >
              <span className="font-semibold">{locale.toUpperCase()}</span>
              {locale === defaultLocale && (
                <span className="text-[10px] opacity-70 font-normal">
                  ({t("content.editor.localization.defaultBadge")})
                </span>
              )}
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
