// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { FieldLabelRow } from '@/components/fields'
import { GripDots } from '@/components/ui/grip-dots'
import { Label } from '@/components/ui/label'
import { FieldGhost } from './field-ghost'
import type { DragPreviewInfo } from './use-builder-dnd'

/**
 * The item in flight, drawn by the drag overlay: a field shows its own ghost (capped in height, so a rich
 * text field does not cover the screen), the others a compact chip with their name.
 */
export function DragPreview({ info }: { readonly info: DragPreviewInfo }) {
  if (info.kind === 'field' && info.branch) {
    return (
      <div
        style={{ width: info.width || undefined }}
        className="max-h-56 cursor-grabbing overflow-hidden rounded-lg bg-background p-1.5 shadow-xl ring-1 ring-border"
      >
        <FieldLabelRow label={<Label className="text-xs font-medium">{info.branch.label}</Label>} className="space-y-1.5 pl-7">
          <FieldGhost branch={info.branch} />
        </FieldLabelRow>
      </div>
    )
  }

  return (
    <div className="flex cursor-grabbing items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium shadow-xl">
      <GripDots className={info.kind === 'column' ? 'size-4 rotate-90 text-muted-foreground' : 'size-4 text-muted-foreground'} />
      {info.label}
    </div>
  )
}
