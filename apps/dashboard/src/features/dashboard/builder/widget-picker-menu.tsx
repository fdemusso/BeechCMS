// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Box } from '@/components/icons'
import { resolveIcon } from '@/lib/icon-registry'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { isWidgetDisabled, listWidgetDefinitions } from '../registry/widget-registry'
import type { WidgetDefinition } from '../registry/widget-definition'

const CATEGORY_ORDER: WidgetDefinition['category'][] = ['stats', 'charts', 'content', 'system', 'custom']

export interface WidgetPickerMenuProps {
  /** The element that opens the list (a button). */
  readonly children: React.ReactElement
  readonly onSelect: (type: string) => void
}

/** A searchable list of the widget catalogue, grouped by category: the builder's "Add widget". */
export function WidgetPickerMenu({ children, onSelect }: WidgetPickerMenuProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  // cmdk keeps the last highlighted item once the pointer leaves it; the highlight is cleared on leave.
  const [highlighted, setHighlighted] = React.useState('')

  const groups = React.useMemo(() => {
    const byCategory = new Map<WidgetDefinition['category'], WidgetDefinition[]>()
    for (const def of listWidgetDefinitions()) {
      byCategory.set(def.category, [...(byCategory.get(def.category) ?? []), def])
    }
    return CATEGORY_ORDER.filter((category) => byCategory.has(category)).map((category) => ({
      category,
      defs: byCategory.get(category) ?? [],
    }))
  }, [])

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent className="w-72 p-0" align="start">
        <Command value={highlighted} onValueChange={setHighlighted}>
          <CommandInput placeholder={t('dashboard.builder.widget.searchPlaceholder')} />
          <CommandList className="max-h-72" onMouseLeave={() => setHighlighted('')}>
            <CommandEmpty>{t('dashboard.builder.widget.noResults')}</CommandEmpty>
            {groups.map(({ category, defs }) => (
              <CommandGroup key={category} heading={t(`dashboard.builder.picker.categories.${category}`)}>
                {defs.map((def) => {
                  const Icon = resolveIcon(def.icon ?? '') ?? Box
                  const label = t(def.labelKey)
                  const disabled = isWidgetDisabled(def.type)
                  return (
                    <CommandItem
                      key={def.type}
                      value={`${label} ${def.type}`}
                      disabled={disabled}
                      title={disabled ? t('dashboard.widgetRegistry.disabled') : undefined}
                      // The item's built-in check mark is unused here.
                      className="[&>svg:last-child]:hidden"
                      onSelect={() => {
                        setOpen(false)
                        onSelect(def.type)
                      }}
                    >
                      <Icon className="size-4 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
