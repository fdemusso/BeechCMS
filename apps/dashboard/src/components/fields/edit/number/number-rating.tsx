// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FieldEditProps } from "../../types"
import { useNumberRating } from "./use-number-rating"

/**
 * Star-rating control for `number` fields with `control: "rating"`.
 * Renders `max` stars (from `useNumberRating`); when half-steps are allowed
 * each star is split into two click zones (left = `.5`, right = whole).
 * Hover previews the value locally before `onChange` commits a click.
 */
export function NumberRating({ branch, value, onChange }: FieldEditProps) {
  const { max, allowHalf, setHoverValue, getStarState } = useNumberRating(branch.numberOptions, value)

  return (
    <div 
      className="flex items-center space-x-1" 
      id={branch.alias} 
      onMouseLeave={() => setHoverValue(null)}
    >
      {Array.from({ length: max }).map((_, i) => {
        const { isFull, isHalf, starValue } = getStarState(i + 1)

        return (
          <div 
            key={starValue} 
            className="relative cursor-pointer"
          >
            {/* Background outline star */}
            <Star className="h-6 w-6 text-muted-foreground/30" />
            
            {/* Foreground filled star */}
            {(isFull || isHalf) && (
              <div 
                className={cn(
                  "absolute inset-0 overflow-hidden text-yellow-500",
                  isHalf ? "w-1/2" : "w-full"
                )}
              >
                <Star className="h-6 w-6 fill-current" />
              </div>
            )}
            
            {/* Interaction zones */}
            <div className="absolute inset-0 flex">
              {allowHalf ? (
                <>
                  <button 
                    type="button"
                    className="h-full w-1/2 appearance-none bg-transparent border-none p-0 cursor-pointer"
                    aria-label={`Imposta voto ${starValue - 0.5}`}
                    onMouseEnter={() => setHoverValue(starValue - 0.5)}
                    onClick={() => onChange(starValue - 0.5)}
                  />
                  <button 
                    type="button"
                    className="h-full w-1/2 appearance-none bg-transparent border-none p-0 cursor-pointer"
                    aria-label={`Imposta voto ${starValue}`}
                    onMouseEnter={() => setHoverValue(starValue)}
                    onClick={() => onChange(starValue)}
                  />
                </>
              ) : (
                <button 
                  type="button"
                  className="h-full w-full appearance-none bg-transparent border-none p-0 cursor-pointer"
                  aria-label={`Imposta voto ${starValue}`}
                  onMouseEnter={() => setHoverValue(starValue)}
                  onClick={() => onChange(starValue)}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
