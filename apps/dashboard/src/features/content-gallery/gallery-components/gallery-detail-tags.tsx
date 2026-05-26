// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"

import { Button } from "@/components/ui/button"
import { TagChips } from "@/components/ui/tag-chips"
import { cn } from "@/lib/utils"
import type { TagChipData } from "@/lib/tags-utils"

const TAGS_PREVIEW_COUNT = 4

interface GalleryDetailTagsProps {
  readonly tags: TagChipData[]
  readonly className?: string
}

export function GalleryDetailTags({ tags, className }: GalleryDetailTagsProps) {
  const [expanded, setExpanded] = React.useState(false)

  if (tags.length === 0) return null

  const hasOverflow = tags.length > TAGS_PREVIEW_COUNT

  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        Tag
      </p>
      <TagChips
        tags={tags}
        maxVisible={TAGS_PREVIEW_COUNT}
        expanded={expanded}
        onExpandedChange={setExpanded}
        enableToggle
        showCollapseBadge={false}
        className="min-w-0 gap-1.5"
        chipClassName="min-w-0 max-w-[12rem] truncate font-normal"
        renderMoreTrigger={(hiddenCount, onExpand) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 rounded-full px-2.5 text-xs"
            onClick={onExpand}
          >
            +{hiddenCount} altri
          </Button>
        )}
      />
      {hasOverflow && expanded && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => setExpanded(false)}
        >
          Mostra meno
        </Button>
      )}
    </div>
  )
}
