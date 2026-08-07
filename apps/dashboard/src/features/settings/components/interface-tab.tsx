// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from 'react'
import { useTheme } from 'next-themes'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Monitor, Moon, Sun } from 'reicon-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const ROWS_KEY = 'beech_rows_per_page'

export function InterfaceTab() {
  const { theme, setTheme } = useTheme()
  const { t, i18n } = useTranslation()
  const [rows, setRows] = React.useState(() => localStorage.getItem(ROWS_KEY) ?? '20')

  const THEME_OPTIONS = [
    { value: 'light', label: t('settings.interface.themeLight'), icon: Sun },
    { value: 'dark', label: t('settings.interface.themeDark'), icon: Moon },
    { value: 'system', label: t('settings.interface.themeSystem'), icon: Monitor },
  ]

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

  const handleLangChange = (lang: string) => {
    i18n.changeLanguage(lang)
    toast.success(lang === 'it' ? t('settings.interface.langChangedIt') : t('settings.interface.langChangedEn'))
  }

  const LANG_OPTIONS = [
    { value: 'it', label: 'Italiano' },
    { value: 'en', label: 'English' },
  ]

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.interface.langTitle')}</CardTitle>
          <CardDescription>{t('settings.interface.langDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 w-full sm:w-64">
            {LANG_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => handleLangChange(value)}
                className={`flex items-center justify-center rounded-lg border-2 p-3 transition-colors cursor-pointer text-sm font-medium ${
                  i18n.language === value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.interface.themeTitle')}</CardTitle>
          <CardDescription>{t('settings.interface.themeDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors cursor-pointer ${
                  theme === value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <Icon className="size-5 text-muted-foreground" />
                <span className="text-sm font-medium">{label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.interface.rowsTitle')}</CardTitle>
          <CardDescription>{t('settings.interface.rowsDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="rows">{t('settings.interface.rowsLabel')}</Label>
            <Select value={rows} onValueChange={handleRowsChange}>
              <SelectTrigger id="rows" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROWS_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
