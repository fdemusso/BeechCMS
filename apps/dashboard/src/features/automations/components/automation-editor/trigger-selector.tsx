// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import type { AutomationTriggerEvent } from '@beechcms/core'
import { TRIGGER_EVENTS } from '../../schema/automation.schema'

interface TriggerSelectorProps {
  value: AutomationTriggerEvent | ''
  onChange: (event: AutomationTriggerEvent) => void
  allowedEvents?: AutomationTriggerEvent[]
}

export function TriggerSelector({ value, onChange, allowedEvents }: TriggerSelectorProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const pool = allowedEvents ?? TRIGGER_EVENTS
  const filtered = pool.filter((e) =>
    t(`automations.triggers.${e}`).toLowerCase().includes(search.toLowerCase())
  )

  return (
    <DropdownMenu open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch('') }}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 justify-between w-full text-sm">
          <span className="truncate">
            {value ? t(`automations.triggers.${value}`) : t('automations.editor.triggerSelectPlaceholder')}
          </span>
          <ChevronDown className="size-3.5 opacity-60 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-2">
        <DropdownMenuLabel className="px-0 pb-2 pt-0 text-xs font-medium text-muted-foreground">
          {t('automations.editor.triggerLabel')}
        </DropdownMenuLabel>
        <Input
          placeholder={t('automations.editor.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm mb-1"
        />
        <DropdownMenuSeparator className="my-1" />
        <div className="flex flex-col gap-0.5">
          {filtered.map((ev) => (
            <Button
              key={ev}
              type="button"
              variant={value === ev ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 justify-start px-2 text-xs"
              onClick={() => { onChange(ev); setOpen(false) }}
            >
              {t(`automations.triggers.${ev}`)}
            </Button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
