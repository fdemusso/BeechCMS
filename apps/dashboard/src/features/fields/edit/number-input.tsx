// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Input } from "@/components/ui/input"
import type { FieldEditProps } from "../types"

export function NumberInput({ branch, value, onChange }: FieldEditProps) {
  const raw = value as number | undefined
  const displayValue = raw !== undefined && raw !== null ? raw : ""
  const opts = branch.numberOptions

  return (
    <div className="relative flex items-center">
      {opts?.prefix && (
        <span className="absolute left-3 text-muted-foreground select-none pointer-events-none text-sm">
          {opts.prefix}
        </span>
      )}
      <Input
        id={branch.alias}
        type="number"
        step={opts?.step ?? "any"}
        min={opts?.min}
        max={opts?.max}
        value={displayValue}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
        style={{
          paddingLeft: opts?.prefix ? `calc(1rem + ${opts.prefix.length + 1}ch)` : undefined,
          paddingRight: opts?.suffix ? `calc(1rem + ${opts.suffix.length + 1}ch)` : undefined,
        }}
      />
      {opts?.suffix && (
        <span className="absolute right-3 text-muted-foreground select-none pointer-events-none text-sm">
          {opts.suffix}
        </span>
      )}
    </div>
  )
}
