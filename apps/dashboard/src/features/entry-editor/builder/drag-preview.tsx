// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import type { Branch } from '@beechcms/core'
import { FieldLabelRow } from '@/components/fields'
import { GripDots } from '@/components/ui/grip-dots'
import { Label } from '@/components/ui/label'
import { FieldGhost } from './field-ghost'
import type { DragPreviewInfo } from './use-builder-dnd'

/** One field exactly as the column draws it — handle strip, label, ghost — minus the hover-only controls. */
function FieldPreview({ branch }: { readonly branch: Branch }) {
  return (
    <div className="flex items-start gap-1 rounded-lg p-1.5">
      <div className="flex w-6 shrink-0 justify-center pt-1 text-muted-foreground">
        <GripDots className="size-4" />
      </div>
      <FieldLabelRow
        className="min-w-0 max-w-full flex-1 space-y-1.5 overflow-hidden opacity-80"
        label={<Label className="text-xs font-medium">{branch.label}</Label>}
      >
        <FieldGhost branch={branch} />
      </FieldLabelRow>
    </div>
  )
}

/**
 * The item in flight, drawn by the drag overlay at the width of the element that was grabbed. A field and
 * a column show their real content (a column is its fields, stacked); tabs and sections show a chip with
 * their name, since their body is not what is being moved.
 */
export function DragPreview({ info }: { readonly info: DragPreviewInfo }) {
  const width = info.width || undefined

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
