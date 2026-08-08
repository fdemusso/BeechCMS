// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { ExpandableCell } from "@/components/ui/expandable-cell"
import type { FieldDisplayProps } from "../types"

const DEFAULT_MAX_LENGTH = 50
/** Max number of chip items shown before collapsing the rest into a "+N" overflow badge in compact mode. */
const CARD_TAG_CAP = 3

/**
 * Renders a text value, truncated via {@link ExpandableCell}.
 * In `options.compact` mode, arrays and comma-separated strings are instead rendered as a
 * capped row of chip pills (used e.g. for kanban/card views), falling back to the plain
 * truncated string when the value isn't list-like.
 */
export function TextDisplay({ value, options }: FieldDisplayProps) {
  if (value == null) {
    return <div className="text-muted-foreground">-</div>
  }

  if (options?.compact) {
    const items = Array.isArray(value)
      ? value.map(String).filter(Boolean)
      : String(value).includes(',')
        ? String(value).split(',').map(s => s.trim()).filter(Boolean)
        : null
    if (items && items.length > 0) {
      const visible = items.slice(0, CARD_TAG_CAP)
      const overflow = items.length - visible.length
      return (
        <div className="flex flex-wrap items-center gap-1">
          {visible.map((it) => (
            <span key={it} className="rounded bg-muted px-1.5 py-0.5 text-xs truncate max-w-[8rem]">{it}</span>
          ))}
          {overflow > 0 && <span className="text-muted-foreground text-xs">+{overflow}</span>}
        </div>
      )
    }
  }

  const text = String(value)
  const maxLength = options?.maxLength ?? DEFAULT_MAX_LENGTH
  return <ExpandableCell content={text} maxLength={maxLength} />
}
