// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { FieldDisplayProps } from "../types"
import { formatNumber } from "./number-format"

function StarRatingDisplay({ value, max, allowHalf }: { value: number; max: number; allowHalf: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => {
        const starValue = i + 1
        const isFull = value >= starValue
        const isHalf = allowHalf && value >= starValue - 0.5 && value < starValue
        return (
          <div key={starValue} className="relative" aria-hidden="true">
            <Star className="h-4 w-4 text-muted-foreground/30" />
            {(isFull || isHalf) && (
              <div className={cn("absolute inset-0 overflow-hidden text-yellow-500", isHalf ? "w-1/2" : "w-full")}>
                <Star className="h-4 w-4 fill-current" />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PercentageDisplay({ value, formatted }: { value: number; formatted: string }) {
  const pct = Math.min(100, Math.max(0, value > 1 ? value : value * 100))

  const indicatorColor =
    pct < 34
      ? "[&_[data-slot=progress-indicator]]:bg-red-500"
      : pct < 67
        ? "[&_[data-slot=progress-indicator]]:bg-yellow-400"
        : "[&_[data-slot=progress-indicator]]:bg-green-500"

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-1/2 min-w-10 cursor-default">
            <Progress
              value={pct}
              className={cn("h-2", indicatorColor)}
              aria-label={formatted}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">{formatted}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function NumberDisplay({ branch, value }: FieldDisplayProps) {
  if (value == null) {
    return <div className="text-muted-foreground">-</div>
  }
  const num = Number(value)

  if (branch.numberOptions?.control === "rating") {
    const max = branch.numberOptions.max ?? 5
    const allowHalf = branch.numberOptions.step !== undefined && branch.numberOptions.step <= 0.5
    return <StarRatingDisplay value={num} max={max} allowHalf={allowHalf} />
  }

  if (branch.numberOptions?.format === "percentage") {
    const formatted = formatNumber(num, branch.numberOptions)
    return <PercentageDisplay value={num} formatted={formatted} />
  }

  const formatted = formatNumber(num, branch.numberOptions)
  return <div className="font-medium">{formatted}</div>
}
