import { useState } from "react"
import type { NumberFieldOptions } from "@beechcms/core"

export function useNumberRating(opts: NumberFieldOptions | undefined, value: unknown) {
  const max = opts?.max ?? 5
  // Support half steps if step is <= 0.5
  const allowHalf = opts?.step !== undefined && opts.step <= 0.5
  
  const raw = value as number | undefined
  const current = raw ?? 0
  const [hoverValue, setHoverValue] = useState<number | null>(null)

  const displayValue = hoverValue !== null ? hoverValue : current

  const getStarState = (starValue: number) => {
    const isFull = displayValue >= starValue
    const isHalf = allowHalf && displayValue >= starValue - 0.5 && displayValue < starValue
    return { isFull, isHalf, starValue }
  }

  return {
    max,
    allowHalf,
    setHoverValue,
    getStarState
  }
}
