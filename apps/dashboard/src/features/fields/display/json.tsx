// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { ExpandableCell } from "@/components/ui/expandable-cell"
import { TagChips } from "@/components/ui/tag-chips"
import { extractTagChips } from "@/lib/tags-utils"
import type { FieldDisplayProps } from "../types"

const DEFAULT_JSON_MAX_LENGTH = 40

export function JsonDisplay({ branch, value, options }: FieldDisplayProps) {
  if (value == null || value === "") {
    return <div className="text-muted-foreground">-</div>
  }

  let parsed: unknown = value
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value)
    } catch {
      return <div className="text-muted-foreground">Invalid JSON</div>
    }
  }

  /** Euristica: alias contenente "tag" → render con Badge colorati collassabili */
  const isTagsField = branch.alias.toLowerCase().includes("tag")

  try {
    if (isTagsField && typeof parsed === "object" && !Array.isArray(parsed)) {
      const tags = extractTagChips(parsed)

      return (
        <TagChips
          tags={tags}
          maxVisible={1}
          enableToggle
          className="min-w-[10rem]"
        />
      )
    }

    if (isTagsField && Array.isArray(parsed)) {
      return <TagChips tags={extractTagChips(parsed)} />
    }

    const str = JSON.stringify(parsed, null, 2)
    const maxLength = options?.maxLength ?? DEFAULT_JSON_MAX_LENGTH
    return (
      <ExpandableCell
        content={str}
        maxLength={maxLength}
        className="font-mono text-xs text-muted-foreground"
      />
    )
  } catch {
    return <div className="text-muted-foreground">Invalid JSON</div>
  }
}
