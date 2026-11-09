// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from 'react'
import { useTheme, type Theme } from '@/lib/theme'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Monitor, Moon, Sun } from '@/components/icons'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SettingsRow, SettingsSection } from '@/components/ui/settings-section'

const ROWS_KEY = 'beech_rows_per_page'
const THEME_LABEL_ID = 'appearance-theme-label'

/**
 * How the dashboard looks and how much of a list it shows: the colour scheme (three cards that are one choice, so a
 * radio group) and the number of rows per page. Both apply at once and are kept in this browser.
 */
export function AppearanceTab() {
  const { theme, setTheme } = useTheme()
  const { t } = useTranslation()
  const [rows, setRows] = React.useState(() => localStorage.getItem(ROWS_KEY) ?? '20')

  const THEME_OPTIONS = [
    { value: 'light', label: t('settings.interface.themeLight'), icon: Sun },
    { value: 'dark', label: t('settings.interface.themeDark'), icon: Moon },
    { value: 'system', label: t('settings.interface.themeSystem'), icon: Monitor },
  ] as const

  const ROWS_OPTIONS = [
    { value: '10', label: t('settings.interface.rows10') },
    { value: '20', label: t('settings.interface.rows20') },
    { value: '50', label: t('settings.interface.rows50') },
    { value: '100', label: t('settings.interface.rows100') },
  ]

  const handleRowsChange = (value: string) => {
    setRows(value)
    localStorage.setItem(ROWS_KEY, value)
    toast.success(t('settings.interface.rowsSaved'))
  }

  return (
    <div className="space-y-10">
      <SettingsSection id="theme" title={t('settings.interface.themeTitle')} description={t('settings.interface.themeDesc')}>
        <SettingsRow label={t('settings.interface.themeRowLabel')} labelId={THEME_LABEL_ID} controlClassName="sm:w-96">
          <RadioGroup
            aria-labelledby={THEME_LABEL_ID}
            value={theme}
            onValueChange={(value) => setTheme(value as Theme)}
            className="grid-cols-3"
          >
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <RadioGroupItem key={value} value={value} className="flex-col gap-2 p-4">
                <Icon aria-hidden className="size-5 text-muted-foreground" />
                <span>{label}</span>
              </RadioGroupItem>
            ))}
          </RadioGroup>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection id="lists" title={t('settings.interface.rowsTitle')} description={t('settings.interface.rowsDesc')}>
        <SettingsRow label={t('settings.interface.rowsLabel')} htmlFor="rows-per-page">
          <Select value={rows} onValueChange={handleRowsChange}>
            <SelectTrigger id="rows-per-page" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROWS_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsSection>
    </div>
  )
}
