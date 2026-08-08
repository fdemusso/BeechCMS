// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { ChevronDown, ChevronUp } from 'reicon-react'
import { Input } from "@/components/ui/input"
import type { FieldEditProps } from "../../types"

/**
 * Default `number` field control: a native numeric `Input` with custom
 * increment/decrement chevrons (the browser's own spinner is hidden via
 * CSS) and optional `prefix`/`suffix` decoration from `branch.numberOptions`.
 * Increment/decrement are clamped to `min`/`max`; the input itself only
 * enforces `min`/`max` via native attributes, so out-of-range typed values
 * are not corrected until the user blurs or uses the chevrons.
 */
export function NumberInput({ branch, value, onChange }: FieldEditProps) {
  const raw = value as number | undefined
  const displayValue = raw !== undefined && raw !== null ? raw : ""
  const opts = branch.numberOptions
  const step = typeof opts?.step === "number" ? opts.step : 1

  const current = typeof raw === "number" ? raw : 0
  const min = opts?.min === undefined ? -Infinity : Number(opts.min)
  const max = opts?.max === undefined ? Infinity : Number(opts.max)

  const increment = () => {
    const next = current + step
    if (next <= max) onChange(next)
  }

  const decrement = () => {
    const next = current - step
    if (next >= min) onChange(next)
  }

  const suffixWidth = opts?.suffix ? `calc(1rem + ${opts.suffix.length + 1}ch + 1.5rem)` : "1.75rem"

  return (
    <div className="relative flex items-center">
      {opts?.prefix && (
        <span className="absolute left-3 text-muted-foreground select-none pointer-events-none text-sm z-10">
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
        className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        style={{
          paddingLeft: opts?.prefix ? `calc(1rem + ${opts.prefix.length + 1}ch)` : undefined,
          paddingRight: suffixWidth,
        }}
      />
      {opts?.suffix && (
        <span
          className="absolute text-muted-foreground select-none pointer-events-none text-sm"
          style={{ right: "1.75rem" }}
        >
          {opts.suffix}
        </span>
      )}
      <div className="absolute right-0 inset-y-0 flex flex-col border-l border-input">
        <button
          type="button"
          tabIndex={-1}
          onClick={increment}
          className="flex-1 flex items-center justify-center pl-0.5 pr-2 text-muted-foreground hover:text-foreground transition-colors rounded-tr-md"
        >
          <ChevronUp className="size-3" />
        </button>
        <div className="border-t border-input" />
        <button
          type="button"
          tabIndex={-1}
          onClick={decrement}
          className="flex-1 flex items-center justify-center pl-0.5 pr-2 text-muted-foreground hover:text-foreground transition-colors rounded-br-md"
        >
          <ChevronDown className="size-3" />
        </button>
      </div>
    </div>
  )
}
