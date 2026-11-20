// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SettingsRow, SettingsSection } from '@/components/ui/settings-section'
import { DASHBOARD_LANGUAGES, useDashboardLanguage } from '../hooks/use-dashboard-language'

const LANGUAGE_SELECT_ID = 'dashboard-language'

/** The language of the dashboard itself (not of the content): one choice, applied the moment it is made. */
export function LanguageTab() {
  const { t } = useTranslation()
  const { language, setLanguage } = useDashboardLanguage()

  const handleLangChange = (value: string) => {
    const option = DASHBOARD_LANGUAGES.find((candidate) => candidate.value === value)
    if (option) setLanguage(option.value)
  }

  return (
    <SettingsSection id="language" title={t('settings.interface.lang.title')} description={t('settings.interface.langDesc')}>
      <SettingsRow label={t('settings.interface.langRow.label')} htmlFor={LANGUAGE_SELECT_ID}>
        <Select value={language} onValueChange={handleLangChange}>
          <SelectTrigger id={LANGUAGE_SELECT_ID} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {/* Each language is named in itself and marked with its own `lang`, so a screen reader reads "Italiano" in Italian. */}
            {DASHBOARD_LANGUAGES.map(({ value, label }) => (
              <SelectItem key={value} value={value} lang={value}>
                {label} <span className="text-muted-foreground">({value})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>
    </SettingsSection>
  )
}
