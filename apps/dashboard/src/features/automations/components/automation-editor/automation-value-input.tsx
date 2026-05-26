// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from 'react-i18next'
import { ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import type { Branch } from '@beechcms/core'

interface AutomationValueInputProps {
  branch: Branch | undefined
  value: string
  onChange: (v: string) => void
  className?: string
}

export function AutomationValueInput({
  branch,
  value,
  onChange,
  className = 'h-7 flex-1 min-w-[60px]',
}: AutomationValueInputProps) {
  const { t } = useTranslation()
  const placeholder = t('automations.when.valuePlaceholder')

  if (!branch) {
    return (
      <Input
        className={`${className} text-xs`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  if (branch.type === 'boolean') {
    const selectValue = value === 'true' ? 'true' : value === 'false' ? 'false' : ''
    return (
      <Select value={selectValue} onValueChange={onChange}>
        <SelectTrigger size="sm" className={`${className} text-xs`}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">{t('automations.when.true')}</SelectItem>
          <SelectItem value="false">{t('automations.when.false')}</SelectItem>
        </SelectContent>
      </Select>
    )
  }

  if (branch.type === 'date') {
    return (
      <DatePickerInput
        id="automation-value-date"
        value={value || null}
        onChange={(v) => onChange(v ?? '')}
        placeholder={t('automations.when.chooseDate')}
      />
    )
  }

  if (branch.type === 'number') {
    return (
      <Input
        type="number"
        className={`${className} text-xs`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  const options = branch.options ?? []

  if (branch.type === 'text' && options.length > 0) {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" className={`${className} text-xs`}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if ((branch.type === 'tags' || branch.type === 'json') && options.length > 0) {
    return (
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`${className} justify-between text-xs`}
          >
            <span className="truncate">{value || t('automations.when.chooseTag')}</span>
            <ArrowUpDown className="size-3.5 opacity-60 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-56 w-48 overflow-y-auto p-1">
          {options.map((opt) => (
            <Button
              key={opt}
              type="button"
              variant={value === opt ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 w-full justify-start px-2 text-xs"
              onClick={() => onChange(opt)}
            >
              {opt}
            </Button>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <Input
      className={`${className} text-xs`}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
