import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const TAGS_PREVIEW_COUNT = 4

interface GalleryDetailTagsProps {
  readonly tags: string[]
  readonly className?: string
}

export function GalleryDetailTags({ tags, className }: GalleryDetailTagsProps) {
  const [expanded, setExpanded] = React.useState(false)

  if (tags.length === 0) return null

  const hasOverflow = tags.length > TAGS_PREVIEW_COUNT
  const shown = expanded ? tags : tags.slice(0, TAGS_PREVIEW_COUNT)
  const hiddenCount = tags.length - TAGS_PREVIEW_COUNT

  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        Tag
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {shown.map((tag) => (
          <Badge key={tag} variant="secondary" className="max-w-[12rem] truncate font-normal">
            {tag}
          </Badge>
        ))}
        {hasOverflow && !expanded && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 rounded-full px-2.5 text-xs"
            onClick={() => setExpanded(true)}
          >
            +{hiddenCount} altri
          </Button>
        )}
      </div>
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
