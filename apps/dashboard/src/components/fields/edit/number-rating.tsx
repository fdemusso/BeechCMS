import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FieldEditProps } from "../types"
import { useState } from "react"

export function NumberRating({ branch, value, onChange }: FieldEditProps) {
  const raw = value as number | undefined
  const opts = branch.numberOptions
  
  const max = opts?.max ?? 5
  // Support half steps if step is <= 0.5
  const allowHalf = opts?.step !== undefined && opts.step <= 0.5
  
  const current = raw ?? 0
  const [hoverValue, setHoverValue] = useState<number | null>(null)

  const displayValue = hoverValue !== null ? hoverValue : current

  return (
    <div className="flex items-center space-x-1" id={branch.alias}>
      {Array.from({ length: max }).map((_, i) => {
        const starValue = i + 1
        const isFull = displayValue >= starValue
        const isHalf = allowHalf && displayValue >= starValue - 0.5 && displayValue < starValue

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
                    onMouseEnter={() => setHoverValue(starValue - 0.5)}
                    onClick={() => onChange(starValue - 0.5)}
                  />
                  <div 
                    className="h-full w-1/2"
                    onMouseEnter={() => setHoverValue(starValue)}
                    onClick={() => onChange(starValue)}
                  />
                </>
              ) : (
                <div 
                  className="h-full w-full"
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
