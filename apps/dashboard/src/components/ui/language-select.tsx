// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface LanguageSelectProps {
  value: string
  onValueChange: (value: string) => void
  id?: string
}

export function LanguageSelect({ value, onValueChange, id }: LanguageSelectProps) {
  const { t } = useTranslation()

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={t('settings.general.languagePlaceholder')} />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value="it">Italiano</SelectItem>
        <SelectItem value="en">English</SelectItem>
      </SelectContent>
    </Select>
  )
}
