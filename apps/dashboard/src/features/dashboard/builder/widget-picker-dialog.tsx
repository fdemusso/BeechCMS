// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Box } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { listWidgetDefinitions } from '../registry/widget-registry'
import type { WidgetDefinition } from '../registry/widget-definition'

function resolveIcon(name: string | undefined): LucideIcon {
  if (!name) return Box
  const icon = (LucideIcons as unknown as Record<string, LucideIcon>)[name]
  return icon ?? Box
}

export interface WidgetPickerDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onSelect: (type: string) => void
}

const CATEGORY_ORDER: WidgetDefinition['category'][] = ['stats', 'charts', 'content', 'system', 'custom']

export function WidgetPickerDialog({ open, onOpenChange, onSelect }: WidgetPickerDialogProps) {
  const { t } = useTranslation()

  const grouped = React.useMemo(() => {
    const defs = listWidgetDefinitions()
    const map = new Map<WidgetDefinition['category'], WidgetDefinition[]>()
    for (const def of defs) {
      const list = map.get(def.category) ?? []
      list.push(def)
      map.set(def.category, list)
    }
    return map
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('dashboard.builder.picker.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((category) => (
            <div key={category} className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase">
                {t(`dashboard.builder.picker.categories.${category}`)}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {grouped.get(category)?.map((def) => {
                  const Icon = resolveIcon(def.icon)
                  return (
                    <button
                      key={def.type}
                      type="button"
                      className="flex flex-col items-start gap-1 rounded-md border p-3 text-left hover:bg-muted/50 transition-colors"
                      onClick={() => onSelect(def.type)}
                    >
                      <Icon className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{t(def.labelKey)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
