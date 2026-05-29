// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { ExpandableCell } from "@/components/ui/expandable-cell"
import type { FieldDisplayProps } from "../types"

const DEFAULT_MAX_LENGTH = 50

export function TextDisplay({ value, options }: FieldDisplayProps) {
  if (value == null) {
    return <div className="text-muted-foreground">-</div>
  }
  const text = String(value)
  const maxLength = options?.maxLength ?? DEFAULT_MAX_LENGTH
  return <ExpandableCell content={text} maxLength={maxLength} />
}
