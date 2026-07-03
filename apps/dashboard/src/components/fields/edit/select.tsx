// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { FieldEditProps } from "../types"

// 'select' is a dashboard-only field type (like 'repeater') — a minimal
// single-select-over-`branch.options` renderer. Registered by string cast in
// registry.ts because @beechcms/core has no 'select' BranchType.
//
// Radix's SelectItem rejects an empty-string value, so an explicit "clear"
// option is only offered for non-required fields, backed by a sentinel.
const NONE = "__none__"

/**
 * Editor for the dashboard-only `select` field type: a single-value
 * dropdown over `branch.options`. Uses a `NONE` sentinel internally because
 * Radix `SelectItem` rejects an empty string; `onChange` still receives
 * `""` when cleared. The clear option is hidden when the field is required.
 */
export function SelectEdit({ branch, value, onChange }: FieldEditProps) {
  const options = branch.options ?? []
  const selected = (value as string) || NONE

  return (
    <Select value={selected} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger>
        <SelectValue placeholder={branch.label} />
      </SelectTrigger>
      <SelectContent>
        {!branch.requiredOnCreate && <SelectItem value={NONE}>—</SelectItem>}
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
