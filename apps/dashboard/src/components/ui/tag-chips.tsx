// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type { VariantProps } from "class-variance-authority"

import { useTranslation } from "react-i18next"

import { Badge, badgeVariants } from "@/components/ui/badge"
import type { TagChipData } from "@/lib/tags-utils"
import { cn } from "@/lib/utils"

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"]

export interface TagChipProps {
  readonly chip: TagChipData
  /** Badge variant for "free" chips; "option" chips are filled with their color, "obsolete" chips are always outline. */
  readonly variant?: BadgeVariant
  readonly className?: string
}

/**
 * A single tag chip drawn by tone: filled with the option color, neutral for free tags,
 * dashed outline for values no longer among the options.
 */
export function TagChip({ chip, variant = "secondary", className }: TagChipProps) {
  const { t } = useTranslation()

  if (chip.tone === "obsolete") {
    const notInOptions = t("fields.tags.notInOptions", { value: chip.label })
    return (
      <Badge
        variant="outline"
        className={cn("min-w-0 max-w-full border-dashed text-muted-foreground", className)}
        title={notInOptions}
        aria-label={notInOptions}
      >
        <span className="block min-w-0 max-w-[260px] truncate" title={chip.label}>{chip.label}</span>
      </Badge>
    )
  }

  return (
    <Badge
      variant={variant}
      className={cn("min-w-0 max-w-full", className)}
      title={chip.label}
      style={
        chip.tone === "option" && chip.color
          ? { backgroundColor: chip.color, color: "#fff", borderColor: chip.color }
          : undefined
      }
    >
      <span className="block min-w-0 max-w-[260px] truncate" title={chip.label}>{chip.label}</span>
    </Badge>
  )
}

interface TagChipsProps {
  readonly tags: readonly TagChipData[]
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
  const normalizedTags = tags
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
    <div className={cn("flex min-w-0 max-w-full flex-wrap items-center gap-1.5", className)}>
      {visibleTags.map((tag, index) => (
        <TagChip
          key={`${tag.label}-${index}`}
          chip={tag}
          variant={chipVariant}
          className={chipClassName}
        />
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
