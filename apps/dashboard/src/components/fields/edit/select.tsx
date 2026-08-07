// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { FieldEditProps } from "../types"

const NONE = "__none__"

/**
 * Editor for single-value `options` dropdown fields:
 * Expands to full container width (`w-full`) to match input fields, with text truncation.
 */
export function SelectEdit({ branch, value, onChange }: FieldEditProps) {
  const options = branch.options ?? []
  const selected = (value as string) || NONE

  return (
    <Select value={selected} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={branch.label} className="truncate" />
      </SelectTrigger>
      <SelectContent>
        {!branch.requiredOnCreate && <SelectItem value={NONE}>—</SelectItem>}
        {options.map((opt) => (
          <SelectItem key={opt} value={opt} className="truncate">{opt}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
