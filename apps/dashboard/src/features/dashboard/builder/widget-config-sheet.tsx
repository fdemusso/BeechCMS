// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { useTranslation } from 'react-i18next'
import { Trash2 } from 'reicon-react'
import type { DashboardWidgetInstance } from '@beechcms/core'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import { TextField } from './config-fields'
import { getWidgetDefinition } from '../registry/widget-registry'

export interface WidgetConfigSheetProps {
  readonly widget: DashboardWidgetInstance | null
  readonly onOpenChange: (open: boolean) => void
  readonly onTitleChange: (title: string | undefined) => void
  readonly onConfigChange: (config: Record<string, unknown>) => void
  readonly onRemove: () => void
}

export function WidgetConfigSheet({
  widget,
  onOpenChange,
  onTitleChange,
  onConfigChange,
  onRemove,
}: WidgetConfigSheetProps) {
  const { t } = useTranslation()
  const def = widget ? getWidgetDefinition(widget.type) : undefined
  const ConfigPanel = def?.ConfigPanel

  return (
    <Sheet open={widget !== null} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {def ? t(def.labelKey) : widget?.type}
          </SheetTitle>
        </SheetHeader>
        {widget && (
          <div className="px-4 pb-4 space-y-4">
            <TextField
              label={t('dashboard.builder.config.title')}
              value={widget.title}
              onChange={(v) => onTitleChange(v || undefined)}
              placeholder={def ? t(def.labelKey) : undefined}
            />

            {ConfigPanel ? (
              <ConfigPanel
                config={widget.config}
                onChange={(next) => onConfigChange(next as Record<string, unknown>)}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                {t('dashboard.builder.config.noOptions')}
              </p>
            )}
          </div>
        )}
        <SheetFooter>
          <Button type="button" variant="destructive" onClick={onRemove}>
            <Trash2 className="size-3.5 mr-2" />
            {t('dashboard.builder.widget.remove')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
