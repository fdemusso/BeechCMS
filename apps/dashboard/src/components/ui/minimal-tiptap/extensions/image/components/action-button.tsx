// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface ActionButtonProps extends React.ComponentProps<"button"> {
  icon: React.ReactNode
  tooltip: string
}

export const ActionButton = ({
  icon,
  tooltip,
  className,
  ...props
}: ActionButtonProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant="ghost"
        className={cn(
          "text-muted-foreground hover:text-foreground relative flex h-7 w-7 flex-row rounded-none p-0",
          "bg-transparent hover:bg-transparent",
          className
        )}
        {...props}
      >
        {icon}
      </Button>
    </TooltipTrigger>
    <TooltipContent side="bottom">{tooltip}</TooltipContent>
  </Tooltip>
)

ActionButton.displayName = "ActionButton"
