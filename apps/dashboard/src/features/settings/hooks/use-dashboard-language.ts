// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

/** Dashboard UI languages, each named in itself; `value` is the locale code of its file in `src/locales`. */
export const DASHBOARD_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'it', label: 'Italiano' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
] as const

export type DashboardLanguage = (typeof DASHBOARD_LANGUAGES)[number]['value']

export interface DashboardLanguageControl {
  /** `i18n.resolvedLanguage`, else `i18n.language`. */
  readonly language: string
  /** The Language tab's path: switches i18next, then shows the tab's confirmation toast. */
  readonly setLanguage: (language: DashboardLanguage) => void
}

/** The dashboard language and its setter, shared by the Language tab and the command palette. */
export function useDashboardLanguage(): DashboardLanguageControl {
  const { t, i18n } = useTranslation()

  const setLanguage = useCallback(
    (lang: DashboardLanguage) => {
      void i18n.changeLanguage(lang)
      const { label } = DASHBOARD_LANGUAGES.find((candidate) => candidate.value === lang)!
      // `lng` words the toast in the language just chosen: `t` is still bound to the one being left.
      toast.success(t('settings.interface.langChanged', { lng: lang, language: label }))
    },
    [i18n, t],
  )

  return { language: i18n.resolvedLanguage ?? i18n.language, setLanguage }
}
