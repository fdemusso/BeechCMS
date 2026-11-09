// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/** One choice out of a few, always on screen: a `radiogroup` the arrow keys move through. */
function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root data-slot="radio-group" className={cn("grid gap-3", className)} {...props} />
}

/**
 * One choice, drawn as a card: the whole card is the radio, so the target is as large as what the eye sees.
 * Whatever is passed as children is the card's content; the checked card takes the primary border.
 */
function RadioGroupItem({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "flex cursor-pointer items-center justify-center rounded-lg border-2 border-border p-3 text-sm font-medium outline-hidden transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:border-primary data-[state=checked]:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { RadioGroup, RadioGroupItem }
