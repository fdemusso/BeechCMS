// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { TagChips } from "@/components/ui/tag-chips"
import { parseTagsValue, resolveTagChips } from "@/lib/tags-utils"
import type { FieldDisplayProps } from "../types"

/**
 * Renders a `tags` value as chips colored only from the branch options.
 * A non-JSON string (such as the masked placeholder) is shown as muted text.
 */
export function TagsDisplay({ branch, value }: FieldDisplayProps) {
  if (value == null || value === "") {
    return <div className="text-muted-foreground">-</div>
  }

  const parsed = parseTagsValue(value)
  if (typeof parsed === "string") {
    return <div className="text-muted-foreground">{parsed}</div>
  }

  return <TagChips tags={resolveTagChips(parsed, branch)} className="min-w-0 max-w-full gap-1.5" />
}
