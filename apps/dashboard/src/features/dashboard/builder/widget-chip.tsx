// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { GripVertical, MoreHorizontal, Settings2, Trash2, AlertTriangle, ArrowRightLeft, Box } from 'lucide-react'
import type { DashboardWidgetInstance, DashboardPageLayout } from '@beechcms/core'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getWidgetDefinition } from '../registry/widget-registry'

function resolveIcon(name: string | undefined): LucideIcon {
  if (!name) return Box
  const icon = (LucideIcons as unknown as Record<string, LucideIcon>)[name]
  return icon ?? Box
}

function WidgetIcon({ name, className }: { readonly name: string | undefined; readonly className?: string }) {
  return React.createElement(resolveIcon(name), { className })
}

export interface WidgetChipProps {
  readonly widget: DashboardWidgetInstance
  readonly dragId: string
  readonly otherPages: DashboardPageLayout[]
  readonly onConfigure: () => void
  readonly onRemove: () => void
  readonly onMoveToPage: (pageId: string) => void
}

export function WidgetChip({ widget, dragId, otherPages, onConfigure, onRemove, onMoveToPage }: WidgetChipProps) {
  const { t } = useTranslation()
  const def = getWidgetDefinition(widget.type)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dragId })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const seedSlug = typeof widget.config?.seedSlug === 'string' ? widget.config.seedSlug : undefined
  const label = widget.title || (def ? t(def.labelKey) : widget.type)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 group"
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      {!def && <AlertTriangle className="size-4 text-amber-500 shrink-0" />}
      {def && <WidgetIcon name={def.icon} className="size-4 text-muted-foreground shrink-0" />}

      <button type="button" className="flex-1 min-w-0 text-left text-sm truncate" onClick={onConfigure}>
        {label}
      </button>

      {!def && (
        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-400">
          {t('dashboard.builder.widget.unavailable')}
        </Badge>
      )}
      {seedSlug && (
        <Badge variant="secondary" className="text-[10px]">
          {seedSlug}
        </Badge>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="size-6 opacity-0 group-hover:opacity-100">
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onConfigure}>
            <Settings2 className="size-3.5 mr-2" />
            {t('dashboard.builder.widget.configure')}
          </DropdownMenuItem>
          {otherPages.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ArrowRightLeft className="size-3.5 mr-2" />
                {t('dashboard.builder.widget.moveToPage')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {otherPages.map((page) => (
                  <DropdownMenuItem key={page.id} onSelect={() => onMoveToPage(page.id)}>
                    {page.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onSelect={onRemove}>
            <Trash2 className="size-3.5 mr-2" />
            {t('dashboard.builder.widget.remove')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
