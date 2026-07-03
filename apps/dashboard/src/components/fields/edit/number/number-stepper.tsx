// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Minus, Plus } from "lucide-react"
import type { FieldEditProps } from "../types"
import { useNumberStepper } from "./use-number-stepper"

/**
 * `number` field control with explicit +/- buttons flanking the input
 * (`control: "stepper"`). Buttons are disabled once `min`/`max` would be
 * exceeded (via `useNumberStepper`); the input still accepts free typing.
 */
export function NumberStepper({ branch, value, onChange }: FieldEditProps) {
  const { 
    displayValue, 
    step, 
    min, 
    max, 
    canDecrement, 
    canIncrement, 
    handleDecrement, 
    handleIncrement, 
    parseInput 
  } = useNumberStepper(branch.numberOptions, value)

  return (
    <div className="flex items-center space-x-2">
      <Button 
        variant="outline" 
        size="icon" 
        type="button" 
        onClick={() => handleDecrement(onChange)}
        disabled={!canDecrement}
        aria-label="Riduci valore"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        id={branch.alias}
        type="number"
        step={step}
        min={min}
        max={max}
        value={displayValue}
        onChange={(e) => onChange(parseInput(e.target.value))}
        className="w-24 text-center"
      />
      <Button 
        variant="outline" 
        size="icon" 
        type="button" 
        onClick={() => handleIncrement(onChange)}
        disabled={!canIncrement}
        aria-label="Aumenta valore"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  )
}
