// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { NumberFieldOptions } from "@beechcms/core"

/**
 * State/derivation for the +/- stepper control ({@link NumberStepper}).
 *
 * `canDecrement`/`canIncrement` are computed against the *next* stepped
 * value (`current ± step`), not the current value, so a button disables
 * itself before a click would push the value out of `min`/`max` bounds.
 * `parseInput` treats an empty string as `null` (clears the field) rather
 * than `0`, distinguishing "no value" from "value is zero".
 *
 * @param opts - Number field options (`min`, `max`, `step`) from the schema branch.
 * @param value - Current committed numeric value.
 * @returns Display/bound values plus `handleIncrement`/`handleDecrement`
 *   (each takes the field's `onChange` and no-ops when disallowed) and
 *   `parseInput` for wiring the raw text input's `onChange`.
 */
export function useNumberStepper(opts: NumberFieldOptions | undefined, value: unknown) {
  const min = opts?.min
  const max = opts?.max
  const step = opts?.step ?? 1
  
  const raw = value as number | undefined
  const displayValue = raw !== undefined && raw !== null ? raw : ""
  const current = raw ?? 0

  const canDecrement = min === undefined || current - step >= min
  const canIncrement = max === undefined || current + step <= max

  const handleDecrement = (onChange: (val: unknown) => void) => {
    if (!canDecrement) return
    onChange(current - step)
  }

  const handleIncrement = (onChange: (val: unknown) => void) => {
    if (!canIncrement) return
    onChange(current + step)
  }

  const parseInput = (str: string) => str === "" ? null : Number(str)

  return { 
    displayValue, 
    step, 
    min, 
    max, 
    canDecrement, 
    canIncrement, 
    handleDecrement, 
    handleIncrement, 
    parseInput 
  }
}
