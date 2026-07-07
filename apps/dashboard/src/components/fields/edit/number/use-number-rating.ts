// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState } from "react"
import type { NumberFieldOptions } from "@beechcms/core"

/**
 * State/derivation for the star-rating control ({@link NumberRating}).
 *
 * `max` defaults to 5 stars when unset. Half-star support is inferred from
 * `step`: any step `<= 0.5` enables half-star rendering and click zones
 * (this is a heuristic, not an explicit "allowHalf" option). Hovering a
 * star previews its value via local `hoverValue` state without touching
 * the committed `value`, so moving the mouse away reverts the display.
 *
 * @param opts - Number field options (`max`, `step`) from the schema branch.
 * @param value - Current committed rating value.
 * @returns `max`, `allowHalf`, a `setHoverValue` setter for hover preview,
 *   and `getStarState(starValue)` which resolves whether a given star
 *   should render full/half based on the current hover-or-committed value.
 */
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
