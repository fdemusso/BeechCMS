// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'reicon-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { useGeneralSettings } from '@/features/settings'
import { ACTION_TYPES, DEFAULT_ACTION_ITEM } from '../../schema/automation.schema'
import type { ActionFormItem } from '../../schema/automation.schema'

interface ActionSelectorProps {
  onAdd: (action: ActionFormItem) => void
}

export function ActionSelector({ onAdd }: ActionSelectorProps) {
  const { t } = useTranslation()
  const { data: settings } = useGeneralSettings()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const availableTypes = ACTION_TYPES.filter((type) => {
    if (type === 'send_mail' && settings?.features?.email === false) {
      return false
    }
    return true
  })

  const filtered = availableTypes.filter((type) =>
    t(`automations.actions.${type}`).toLowerCase().includes(search.toLowerCase())
  )

  function handleSelect(type: ActionFormItem['type']) {
    onAdd({ ...DEFAULT_ACTION_ITEM, type } as ActionFormItem)
    setOpen(false)
    setSearch('')
  }

  return (
    <DropdownMenu open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch('') }}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 w-full text-sm justify-between">
          <span>{t('automations.editor.addAction')}</span>
          <ChevronDown className="size-3.5 opacity-60 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-2">
        <DropdownMenuLabel className="px-0 pb-2 pt-0 text-xs font-medium text-muted-foreground">
          {t('automations.editor.actionsLabel')}
        </DropdownMenuLabel>
        <Input
          placeholder={t('automations.editor.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm mb-1"
        />
        <DropdownMenuSeparator className="my-1" />
        <div className="flex flex-col gap-0.5">
          {filtered.map((type) => (
            <Button
              key={type}
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 justify-start px-2 text-xs"
              onClick={() => handleSelect(type)}
            >
              {t(`automations.actions.${type}`)}
            </Button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
