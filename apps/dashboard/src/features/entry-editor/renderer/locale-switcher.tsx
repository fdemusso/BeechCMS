// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
 * The Entry Editor's single content-language selector (brief §4: one selector in the header, no per-field tabs).
 * Each option shows how many localized fields hold a value in that language.
 */
export function LocaleSwitcher({ locales, defaultLocale, activeLocale, completion, onLocaleChange }: LocaleSwitcherProps) {
  const { t } = useTranslation()
  return (
    <Select value={activeLocale} onValueChange={onLocaleChange}>
      <SelectTrigger size="sm" className="h-7 text-xs" aria-label={t("content.editor.localization.switcherLabel")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {locales.map((locale) => {
          const { filled, total } = completion[locale] ?? { filled: 0, total: 0 }
          return (
            <SelectItem key={locale} value={locale} className="text-xs">
              <span className="font-medium">{locale.toUpperCase()}</span>
              {locale === defaultLocale && (
                <span className="text-muted-foreground">{t("content.editor.localization.defaultBadge")}</span>
              )}
              <span className={filled === total ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
                {t("content.editor.localization.completion", { filled, total })}
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
