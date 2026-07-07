// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Checkbox } from "@/components/ui/checkbox"
import type { FieldEditProps } from "../types"

/**
 * Editor for `boolean` typed fields: a single checkbox bound to a real
 * boolean. Accepts both a boolean `true` and the legacy stringified
 * `"true"` as truthy stored values; `onChange` always emits a boolean.
 */
export function BooleanEdit({ branch, value, onChange }: FieldEditProps) {
  const checked =
    value === true || value === "true"
  return (
    <div className="flex items-center space-x-2">
      <Checkbox
        id={branch.alias}
        checked={checked}
        onCheckedChange={(checked) => onChange(checked === true)}
      />
      <label
        htmlFor={branch.alias}
        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        {branch.label}
      </label>
    </div>
  )
}
