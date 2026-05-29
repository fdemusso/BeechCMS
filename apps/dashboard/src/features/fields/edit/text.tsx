// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Input } from "@/components/ui/input"
import type { FieldEditProps } from "../types"

export function TextEdit({ branch, value, onChange }: FieldEditProps) {
  const str = (value as string) ?? ""
  return (
    <Input
      id={branch.alias}
      type="text"
      value={str}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
