// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { ExpandableCell } from "@/components/ui/expandable-cell"
import type { FieldDisplayProps } from "../types"

const DEFAULT_MAX_LENGTH = 50

/**
 * Extracts plain text directly from TipTap JSON structure without HTML conversion.
 * This avoids bundling heavy dependencies like KaTeX and highlight.js in the table views.
 */
function extractTextFromTiptap(value: unknown): string {
  if (value == null || value === "") return ""
  
  let doc: any = value
  // Support both direct doc and envelope v1
  if (typeof value === "object" && !Array.isArray(value)) {
    if ("doc" in (value as any)) {
      doc = (value as any).doc
    }
  }

  if (!doc || doc.type !== "doc") return ""

  function traverse(node: any): string {
    if (!node) return ""
    if (node.type === "text") return node.text || ""
    if (node.content && Array.isArray(node.content)) {
      return node.content.map(traverse).join(" ")
    }
    return ""
  }

  return traverse(doc).replace(/\s+/g, " ").trim()
}

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
