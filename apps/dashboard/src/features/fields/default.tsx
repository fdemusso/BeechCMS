// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Input } from "@/components/ui/input"
import type { FieldDisplayProps, FieldEditProps } from "./types"

/**
 * Display fallback: mostra il valore come stringa o "-" se vuoto.
 * Usato quando il BranchType non è registrato nel registro.
 */
export function DefaultDisplay({ value }: FieldDisplayProps) {
  if (value == null || value === "") {
    return <div className="text-muted-foreground">-</div>
  }
  return <div>{String(value)}</div>
}

/**
 * Edit fallback: input di testo generico.
 * Usato quando il BranchType non è registrato nel registro.
 */
export function DefaultEdit(props: Readonly<FieldEditProps>) {
  const { branch, value, onChange } = props
  const str = value == null ? "" : String(value)
  return (
    <Input
      id={branch.alias}
      type="text"
      value={str}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
