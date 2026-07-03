// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Input } from "@/components/ui/input"
import type { FieldEditProps } from "../types"

export function TextEdit({ branch, value, onChange }: FieldEditProps) {
  const str = (value as string) ?? ""
  // `readOnly` is not part of the persisted Branch shape — read via cast, the
  // same pattern the repeater uses for its `repeater` meta. Lets the meta-seed
  // layout (sprint 09) lock the slug field after creation without shell changes.
  const readOnly = (branch as unknown as { readOnly?: boolean }).readOnly ?? false
  return (
    <Input
      id={branch.alias}
      type="text"
      value={str}
      readOnly={readOnly}
      className={readOnly ? "bg-muted text-muted-foreground" : undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
