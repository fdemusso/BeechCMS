// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from 'react-i18next'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { SettingsRow, SettingsSection } from '@/components/ui/settings-section'
import { DASHBOARD_LANGUAGES, useDashboardLanguage } from '../hooks/use-dashboard-language'

const LANG_LABEL_ID = 'language-interface-label'

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
      <SettingsRow label={t('settings.interface.langRow.label')} labelId={LANG_LABEL_ID} controlClassName="sm:w-64">
        <RadioGroup
          aria-labelledby={LANG_LABEL_ID}
          value={language}
          onValueChange={handleLangChange}
          className="grid-cols-2"
        >
          {/* Each language is named in itself and marked with its own `lang`, so a screen reader reads "Italiano" in Italian. */}
          {DASHBOARD_LANGUAGES.map(({ value, label }) => (
            <RadioGroupItem key={value} value={value} lang={value}>
              {label}
            </RadioGroupItem>
          ))}
        </RadioGroup>
      </SettingsRow>
    </SettingsSection>
  )
}
