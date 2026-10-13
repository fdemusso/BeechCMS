// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { ExpandableCell } from "@/components/ui/expandable-cell"
import type { FieldDisplayProps } from "../types"

/** Fallback truncation length for the pretty-printed JSON string when `options.maxLength` is not set. */
const DEFAULT_JSON_MAX_LENGTH = 40

/**
 * Renders a JSON value. String values are parsed first (invalid JSON shows an error message).
 * The value is pretty-printed
 * and truncated via {@link ExpandableCell}.
 */
export function JsonDisplay({ value, options }: FieldDisplayProps) {
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

  try {
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
