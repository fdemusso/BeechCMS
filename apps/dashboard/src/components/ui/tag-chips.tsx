// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type { VariantProps } from "class-variance-authority"

import { Badge, badgeVariants } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"]

type TagChip = {
  readonly label: string
  readonly color?: string
}

type TagValue = string | TagChip

interface TagChipsProps {
  readonly tags: readonly TagValue[]
  readonly className?: string
  readonly chipClassName?: string
  readonly chipVariant?: BadgeVariant
  readonly countBadgeClassName?: string
  readonly countBadgeVariant?: BadgeVariant
  readonly maxVisible?: number
  readonly enableToggle?: boolean
  readonly showCollapseBadge?: boolean
  readonly expanded?: boolean
  readonly defaultExpanded?: boolean
  readonly onExpandedChange?: (expanded: boolean) => void
  readonly emptyState?: React.ReactNode
  readonly renderMoreTrigger?: (
    hiddenCount: number,
    onExpand: () => void,
  ) => React.ReactNode
}

function normalizeTags(tags: readonly TagValue[]): TagChip[] {
  return tags
    .map((tag) => {
      if (typeof tag === "string") {
        return { label: tag.trim() }
      }
      return { label: tag.label.trim(), color: tag.color }
    })
    .filter((tag) => tag.label.length > 0)
}

export function TagChips({
  tags,
  className,
  chipClassName,
  chipVariant = "secondary",
  countBadgeClassName,
  countBadgeVariant = "outline",
  maxVisible,
  enableToggle = false,
  showCollapseBadge = true,
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  emptyState = <div className="text-muted-foreground">-</div>,
  renderMoreTrigger,
}: TagChipsProps) {
  const normalizedTags = React.useMemo(() => normalizeTags(tags), [tags])
  const safeMaxVisible = Math.max(1, maxVisible ?? normalizedTags.length)
  const hasOverflow = normalizedTags.length > safeMaxVisible

  const [internalExpanded, setInternalExpanded] = React.useState(defaultExpanded)
  const isExpanded = expanded ?? internalExpanded

  const setExpanded = React.useCallback(
    (next: boolean) => {
      if (expanded === undefined) {
        setInternalExpanded(next)
      }
      onExpandedChange?.(next)
    },
    [expanded, onExpandedChange],
  )

  if (normalizedTags.length === 0) {
    return <>{emptyState}</>
  }

  const visibleTags =
    hasOverflow && !isExpanded
      ? normalizedTags.slice(0, safeMaxVisible)
      : normalizedTags
  const hiddenCount = normalizedTags.length - safeMaxVisible

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}>
      {visibleTags.map((tag, index) => (
        <Badge
          key={`${tag.label}-${index}`}
          variant={chipVariant}
          className={cn("min-w-0 max-w-full", chipClassName)}
          style={
            tag.color
              ? {
                  backgroundColor: tag.color,
                  color: "#fff",
                  borderColor: tag.color,
                }
              : undefined
          }
        >
          <span className="block min-w-0 max-w-full truncate">{tag.label}</span>
        </Badge>
      ))}

      {hasOverflow && !isExpanded && (
        <>
          {renderMoreTrigger ? (
            renderMoreTrigger(hiddenCount, () => setExpanded(true))
          ) : (
            <Badge
              variant={countBadgeVariant}
              className={cn(
                "shrink-0",
                enableToggle && "cursor-pointer hover:bg-muted transition-colors",
                countBadgeClassName,
              )}
              onClick={
                enableToggle
                  ? (event) => {
                      event.stopPropagation()
                      setExpanded(true)
                    }
                  : undefined
              }
            >
              +{hiddenCount}
            </Badge>
          )}
        </>
      )}

      {hasOverflow && isExpanded && enableToggle && showCollapseBadge && (
        <Badge
          variant={countBadgeVariant}
          className={cn(
            "cursor-pointer hover:bg-muted transition-colors",
            countBadgeClassName,
          )}
          onClick={(event) => {
            event.stopPropagation()
            setExpanded(false)
          }}
        >
          -
        </Badge>
      )}
    </div>
  )
}
