import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FieldEditProps } from "../types"
import { useNumberRating } from "./use-number-rating"

export function NumberRating({ branch, value, onChange }: FieldEditProps) {
  const { max, allowHalf, setHoverValue, getStarState, handleKeyDown } = useNumberRating(branch.numberOptions, value)

  return (
    <div className="flex items-center space-x-1" id={branch.alias}>
      {Array.from({ length: max }).map((_, i) => {
        const { isFull, isHalf, starValue } = getStarState(i + 1)

        return (
          <div 
            key={i} 
            className="relative cursor-pointer"
            onMouseLeave={() => setHoverValue(null)}
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
                  <div 
                    className="h-full w-1/2"
                    role="button"
                    tabIndex={0}
                    aria-label={`Imposta voto ${starValue - 0.5}`}
                    onMouseEnter={() => setHoverValue(starValue - 0.5)}
                    onClick={() => onChange(starValue - 0.5)}
                    onKeyDown={(e) => handleKeyDown(e, starValue - 0.5, onChange)}
                  />
                  <div 
                    className="h-full w-1/2"
                    role="button"
                    tabIndex={0}
                    aria-label={`Imposta voto ${starValue}`}
                    onMouseEnter={() => setHoverValue(starValue)}
                    onClick={() => onChange(starValue)}
                    onKeyDown={(e) => handleKeyDown(e, starValue, onChange)}
                  />
                </>
              ) : (
                <div 
                  className="h-full w-full"
                  role="button"
                  tabIndex={0}
                  aria-label={`Imposta voto ${starValue}`}
                  onMouseEnter={() => setHoverValue(starValue)}
                  onClick={() => onChange(starValue)}
                  onKeyDown={(e) => handleKeyDown(e, starValue, onChange)}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
