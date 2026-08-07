// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { FieldDisplayProps } from "../types"

/**
 * Formats a date value (string or unix epoch timestamp) using the `it-IT` locale (e.g. "7 ago 2026").
 * Falls back to the raw stringified value if the date can't be parsed.
 */
export function DateDisplay({ value }: FieldDisplayProps) {
  if (value == null || value === "") {
    return <div className="text-muted-foreground">-</div>
  }
  try {
    const rawNum = typeof value === "number" ? value : (typeof value === "string" && !isNaN(Number(value)) ? Number(value) : NaN)
    const finalVal = !isNaN(rawNum) && rawNum < 1e11 ? rawNum * 1000 : value
    const date = new Date(finalVal as string | number)
    if (isNaN(date.getTime())) {
      return <div>{String(value)}</div>
    }
    const formatted = date.toLocaleDateString("it-IT", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
    return <div>{formatted}</div>
  } catch {
    return <div>{String(value)}</div>
  }
}
