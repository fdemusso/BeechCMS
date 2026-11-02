// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import type { Branch } from '@beechcms/core'
import { FieldLabelRow } from '@/components/fields'
import { Label } from '@/components/ui/label'
import { FieldGhost } from './field-ghost'

/**
 * A field's label and ghost, as drawn in a column and in the drag overlay.
 *
 * Memoised on purpose: while something is dragged, dnd-kit re-renders every sortable (every field, section
 * and column) on every pointer move, and without this each of those renders would rebuild the ghosts —
 * dozens of inputs, toggles and skeletons — for nothing. The `branch` objects come from the seed and keep
 * their identity, so a block re-renders only when its own field changes.
 */
export const FieldBlock = React.memo(function FieldBlock({ branch }: { readonly branch: Branch }) {
  return (
    <FieldLabelRow
      className="min-w-0 max-w-full flex-1 space-y-1.5 overflow-hidden pointer-events-none select-none opacity-80"
      label={<Label className="text-xs font-medium">{branch.label}</Label>}
    >
      <FieldGhost branch={branch} />
    </FieldLabelRow>
  )
})
