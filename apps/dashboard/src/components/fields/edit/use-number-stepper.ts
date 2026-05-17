import type { NumberFieldOptions } from "@beechcms/core"

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
