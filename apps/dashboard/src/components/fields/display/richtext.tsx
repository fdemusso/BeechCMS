// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { renderRichText } from "@beechcms/core"
import { ExpandableCell } from "@/components/ui/expandable-cell"
import type { FieldDisplayProps } from "../types"

const DEFAULT_MAX_LENGTH = 50

/** Strips HTML tags and collapses whitespace, producing a plain-text preview of the rendered content. */
function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * Renders rich text as a plain-text, truncated preview (not the actual HTML/markup) —
 * suitable for table cells and compact views. Uses {@link renderRichText} to resolve the
 * stored value to HTML before stripping tags.
 */
export function RichtextDisplay({ value, options }: FieldDisplayProps) {
  if (value == null || value === "") {
    return <div className="text-muted-foreground">-</div>
  }
  const html = renderRichText(value)
  const plain = stripTags(html)
  if (!plain) {
    return <div className="text-muted-foreground">-</div>
  }
  const maxLength = options?.maxLength ?? DEFAULT_MAX_LENGTH
  return <ExpandableCell content={plain} maxLength={maxLength} />
}
