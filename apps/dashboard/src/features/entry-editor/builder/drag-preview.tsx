// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { useTranslation } from 'react-i18next'
import type { Branch } from '@beechcms/core'
import { More as MoreHorizontal } from '@/components/icons'
import { Badge } from '@/components/ui/badge'
import { GripDots } from '@/components/ui/grip-dots'
import { FieldBlock } from './field-block'
import type { DragPreviewInfo } from './use-builder-dnd'

/** One field exactly as the column draws it — handle strip, label, ghost — minus the hover-only controls. */
function FieldPreview({ branch }: { readonly branch: Branch }) {
  return (
    <div className="flex items-start gap-1 rounded-lg p-1.5">
      <div className="flex w-6 shrink-0 items-center justify-center self-stretch text-muted-foreground/60">
        <GripDots className="size-4" />
      </div>
      <FieldBlock branch={branch} />
    </div>
  )
}

/** The section as the builder draws it: header (handle, name, field count, menu) and every column's fields. */
function SectionPreview({ info }: { readonly info: DragPreviewInfo }) {
  const { t } = useTranslation()
  const columns = info.columns ?? []
  const fieldCount = columns.reduce((sum, fields) => sum + fields.length, 0)
  return (
    <div className="rounded-lg border bg-background">
      <div className="flex items-center gap-2 px-3 py-2">
        <GripDots className="size-4 text-muted-foreground/60" />
        <span className={`flex-1 text-sm font-medium ${info.label ? '' : 'italic text-muted-foreground'}`}>
          {info.label || t('layoutBuilder.noLabel')}
        </span>
        <Badge variant="secondary" className="text-xs">
          {t('layoutBuilder.fieldCount', { count: fieldCount })}
        </Badge>
        <MoreHorizontal className="size-4 text-muted-foreground" />
      </div>
      <div
        className="grid gap-3 px-3 pb-3"
        style={{ gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(0, 1fr))` }}
      >
        {columns.map((fields, index) => (
          <div
            key={index}
            className={`flex min-h-[48px] min-w-0 flex-col gap-0.5 rounded-lg ${fields.length === 0 ? 'border border-dashed' : ''}`}
          >
            {fields.map((branch) => (
              <FieldPreview key={branch.id} branch={branch} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * The item in flight, drawn by the drag overlay at the width of the element that was grabbed. Fields,
 * columns and sections show their real content (a column is its fields stacked, a section its header and
 * columns); only a tab is a chip with its name.
 */
export function DragPreview({ info }: { readonly info: DragPreviewInfo }) {
  const width = info.width || undefined

  if (info.kind === 'section') {
    return (
      <div style={{ width }} className="cursor-grabbing rounded-lg shadow-xl">
        <SectionPreview info={info} />
      </div>
    )
  }

  if (info.kind === 'field' && info.branch) {
    return (
      <div style={{ width }} className="cursor-grabbing rounded-lg bg-background shadow-xl ring-1 ring-border">
        <FieldPreview branch={info.branch} />
      </div>
    )
  }

  if (info.kind === 'column') {
    return (
      <div style={{ width }} className="cursor-grabbing rounded-lg bg-background shadow-xl ring-1 ring-border">
        {(info.fields ?? []).map((branch) => (
          <FieldPreview key={branch.id} branch={branch} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex cursor-grabbing items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium shadow-xl">
      <GripDots className="size-4 text-muted-foreground" />
      {info.label}
    </div>
  )
}
