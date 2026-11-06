// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ComponentType } from "react"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useHoverPopover } from "@/hooks/use-hover-popover"
import { cn } from "@/lib/utils"

type BadgeIcon = ComponentType<{ size?: number; className?: string }>

export interface IconBadgeProps {
  readonly icon: BadgeIcon
  /** Accessible name, and the tooltip text. */
  readonly label: string
  readonly className?: string
}

/** A small square badge that shows one icon and names itself on hover. The badge of roles, permissions, scopes, … */
export function IconBadge({ icon: Icon, label, className }: IconBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="secondary"
          className={cn(
            // Badge forces its icons to 12px (`[&>svg]:size-3!`); 16px is where Reicon's 1.5/24 line is exactly 1px wide.
            "transition-colors leading-none size-6 p-0 inline-flex items-center justify-center rounded-md [&>svg]:size-4!",
            className
          )}
          aria-label={label}
        >
          <Icon size={16} className="shrink-0 block" />
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

export interface IconBadgeItem extends IconBadgeProps {
  readonly id: string
}

export interface IconBadgeGroupProps {
  readonly items: readonly IconBadgeItem[]
  /** Maximum visible badge slots (including the +N badge if truncated). Defaults to 3. */
  readonly max?: number
  /** Accessible name of the "+N" badge, given the number of hidden items. */
  readonly moreLabel: (count: number) => string
  readonly className?: string
}

/**
 * Overlapping badges, with a hover popover for the ones that do not fit ("+N"). Renders a dash when empty
 * and centres a lone badge.
 */
export function IconBadgeGroup({ items, max = 3, moreLabel, className }: IconBadgeGroupProps) {
  const { open, onOpenChange, triggerProps } = useHoverPopover()

  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  const shouldTruncate = items.length > max
  const visibleCount = shouldTruncate ? max - 1 : items.length
  const visible = items.slice(0, visibleCount)
  const remaining = items.slice(visibleCount)
  const isSingle = !shouldTruncate && visible.length === 1

  return (
    <div className={cn("flex items-center -space-x-1.5", isSingle && "justify-center", className)}>
      {visible.map(({ id, ...badge }) => (
        <div key={id} className="relative flex ring-1 ring-border rounded-md transition-transform hover:z-10 hover:scale-105">
          <IconBadge {...badge} />
        </div>
      ))}

      {shouldTruncate && (
        <Popover open={open} onOpenChange={onOpenChange}>
          <PopoverTrigger asChild>
            <button
              type="button"
              {...triggerProps}
              className="relative z-0 ring-1 ring-border size-6 rounded-md bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground text-[10px] font-semibold inline-flex items-center justify-center transition-transform hover:z-10 hover:scale-105 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={moreLabel(remaining.length)}
            >
              +{remaining.length}
            </button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            side="top"
            {...triggerProps}
            className="w-auto p-2 shadow-lg border-border/80 bg-popover"
          >
            <div className="flex items-center gap-1.5">
              {remaining.map(({ id, ...badge }) => (
                <IconBadge key={id} {...badge} />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
