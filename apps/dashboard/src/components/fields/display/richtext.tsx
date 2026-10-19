// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { ExpandableCell } from "@/components/ui/expandable-cell"
import type { FieldDisplayProps } from "../types"

const DEFAULT_MAX_LENGTH = 50

import { extractTextFromTiptap, isTipTapDoc } from "./richtext-plain"

export { extractTextFromTiptap, isTipTapDoc }

/**
 * Renders rich text as a plain-text, truncated preview (not the actual HTML/markup) —
 * suitable for table cells and compact views. Uses direct JSON traversal for performance.
 */
export function RichtextDisplay({ value, options }: FieldDisplayProps) {
  if (value == null || value === "") {
    return <div className="text-muted-foreground">-</div>
  }
  
  const plain = extractTextFromTiptap(value)
  
  if (!plain) {
    return <div className="text-muted-foreground">-</div>
  }
  
  const maxLength = options?.maxLength ?? DEFAULT_MAX_LENGTH
  return <ExpandableCell content={plain} maxLength={maxLength} />
}
