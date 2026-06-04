// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X, Plus } from 'lucide-react'
import type { Branch, LayoutField } from '@beechcms/core'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
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
import { FieldEdit } from '@/features/fields'
import type { UseLayoutBuilderResult } from './use-layout-builder'

// ── FieldItem ────────────────────────────────────────────────────────────────

interface FieldItemProps {
  tabId: string
  sectionId: string
  columnId: string
  field: LayoutField
  branch: Branch
  ops: UseLayoutBuilderResult
  dragId: string
}

function emptyValue(branch: Branch): unknown {
  if (branch.type === 'boolean') return false
  if (branch.type === 'richtext') return { type: 'doc', content: [{ type: 'paragraph' }] }
  return ''
}

function FieldItem({ tabId, sectionId, columnId, field, branch, ops, dragId }: FieldItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dragId })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded border group">
      <div className="flex items-start gap-2 p-2">
        <button
          type="button"
          className="mt-1 flex-shrink-0 cursor-grab text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>

        <div className="flex-1 min-w-0 space-y-1.5 pointer-events-none select-none opacity-70">
          <Label className="text-xs font-medium">{branch.label}</Label>
          <FieldEdit branch={branch as any} value={emptyValue(branch)} onChange={() => {}} />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => ops.clearField(tabId, sectionId, columnId, field.branchId)}
        >
          <X className="size-3" />
        </Button>
      </div>
    </div>
  )
}

// ── ColumnCard ───────────────────────────────────────────────────────────────

interface ColumnCardProps {
  tabId: string
  sectionId: string
  columnId: string
  fields: LayoutField[]
  branchById: Record<string, Branch>
  availableBranches: Branch[]
  ops: UseLayoutBuilderResult
  /** drag id for the column itself (used when column is dragged as a whole) */
  dragId: string
}

export function ColumnCard({
  tabId,
  sectionId,
  columnId,
  fields,
  branchById,
  availableBranches,
  ops,
  dragId,
}: ColumnCardProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)

  // The column itself is sortable (for column reordering)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dragId })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const fieldDragIds = fields.map((f) => `field:${tabId}:${sectionId}:${columnId}:${f.branchId}`)

  return (
    <div ref={setNodeRef} style={style} className="rounded border min-h-[48px] flex flex-col gap-1 p-1">
      {/* Column drag handle — top strip */}
      <div className="flex justify-center">
        <button
          type="button"
          className="cursor-grab text-muted-foreground hover:text-foreground rotate-90"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      </div>

      {/* Field items */}
      <SortableContext items={fieldDragIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-1">
          {fields.map((f) => {
            const branch = branchById[f.branchId]
            if (!branch) return null
            const fDragId = `field:${tabId}:${sectionId}:${columnId}:${f.branchId}`
            return (
              <FieldItem
                key={f.branchId}
                tabId={tabId}
                sectionId={sectionId}
                columnId={columnId}
                field={f}
                branch={branch}
                ops={ops}
                dragId={fDragId}
              />
            )
          })}
        </div>
      </SortableContext>

      {/* Add Field */}
      {availableBranches.length > 0 && (
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-center text-muted-foreground border-dashed border h-8 mt-1"
            >
              <Plus className="size-3 mr-1" />
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
      )}
    </div>
  )
}
