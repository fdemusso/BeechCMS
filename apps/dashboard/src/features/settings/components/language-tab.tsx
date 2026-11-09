// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { SettingsRow, SettingsSection } from '@/components/ui/settings-section'

const LANG_LABEL_ID = 'language-interface-label'

/** Each language is named in itself and marked with its own `lang`, so a screen reader reads "Italiano" in Italian. */
const LANG_OPTIONS = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'English' },
] as const

/** The language of the dashboard itself (not of the content): one choice, applied the moment it is made. */
export function LanguageTab() {
  const { t, i18n } = useTranslation()

  const handleLangChange = (lang: string) => {
    void i18n.changeLanguage(lang)
    toast.success(lang === 'it' ? t('settings.interface.langChangedIt') : t('settings.interface.langChangedEn'))
  }

  return (
    <SettingsSection id="language" title={t('settings.interface.langTitle')} description={t('settings.interface.langDesc')}>
      <SettingsRow label={t('settings.interface.langRowLabel')} labelId={LANG_LABEL_ID} controlClassName="sm:w-64">
        <RadioGroup
          aria-labelledby={LANG_LABEL_ID}
          value={i18n.resolvedLanguage ?? i18n.language}
          onValueChange={handleLangChange}
          className="grid-cols-2"
        >
          {LANG_OPTIONS.map(({ value, label }) => (
            <RadioGroupItem key={value} value={value} lang={value}>
              {label}
            </RadioGroupItem>
          ))}
        </RadioGroup>
      </SettingsRow>
    </SettingsSection>
  )
}
