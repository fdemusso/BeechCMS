// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X, Plus } from 'lucide-react'
import type { Branch } from '@beechcms/core'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import type { UseLayoutBuilderResult } from './use-layout-builder'

interface ColumnCardProps {
  tabId: string
  sectionId: string
  columnId: string
  field: { branchId: string } | null
  branchById: Record<string, Branch>
  availableBranches: Branch[]
  ops: UseLayoutBuilderResult
  dragId: string
}

export function ColumnCard({
  tabId,
  sectionId,
  columnId,
  field,
  branchById,
  availableBranches,
  ops,
  dragId,
}: ColumnCardProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dragId,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  if (field == null) {
    return (
      <div ref={setNodeRef} style={style} className="min-h-[48px]">
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center text-muted-foreground border-dashed h-10"
            >
              <Plus className="size-4 mr-2" />
              {t('layoutBuilder.addField')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="p-0 w-64" align="start">
            <Command>
              <CommandInput placeholder={t('layoutBuilder.searchFields')} />
              <CommandList>
                <CommandEmpty>{t('layoutBuilder.noFields')}</CommandEmpty>
                {availableBranches.map((b) => (
                  <CommandItem
                    key={b.id}
                    value={b.label}
                    onSelect={() => {
                      const ok = ops.assignField(tabId, sectionId, columnId, b.id)
                      if (ok) setOpen(false)
                    }}
                  >
                    <span>{b.label}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{b.type}</span>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  const branch = branchById[field.branchId]
  if (!branch) return null

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center justify-between rounded border bg-card px-3 py-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            className="cursor-grab text-muted-foreground hover:text-foreground flex-shrink-0"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
          <span className="text-sm truncate">{branch.label}</span>
          <span className="text-xs text-muted-foreground flex-shrink-0">{branch.type}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 flex-shrink-0"
          onClick={() => ops.clearField(tabId, sectionId, columnId)}
        >
          <X className="size-3" />
        </Button>
      </div>
    </div>
  )
}
