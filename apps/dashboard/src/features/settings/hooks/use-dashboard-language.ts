// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

/** Dashboard UI languages, each named in itself. */
export const DASHBOARD_LANGUAGES = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'English' },
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
      toast.success(lang === 'it' ? t('settings.interface.langChangedIt') : t('settings.interface.langChangedEn'))
    },
    [i18n, t],
  )

  return { language: i18n.resolvedLanguage ?? i18n.language, setLanguage }
}
