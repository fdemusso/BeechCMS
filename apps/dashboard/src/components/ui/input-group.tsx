// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      className={cn("relative flex w-full items-center", className)}
      {...props}
    />
  )
}

function InputGroupInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input-group-input"
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        "pr-10", // Space for the addon button
        className
      )}
      {...props}
    />
  )
}

function InputGroupAddon({
  className,
  align = "inline-end",
  ...props
}: React.ComponentProps<"div"> & { align?: "inline-start" | "inline-end" }) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        "absolute top-0 bottom-0 flex items-center justify-center",
        align === "inline-start" ? "left-0 pl-3" : "right-0 pr-1",
        className
      )}
      {...props}
    />
  )
}

function InputGroupButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      data-slot="input-group-button"
      className={cn("size-7", className)}
      {...props}
    />
  )
}

export { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton }
