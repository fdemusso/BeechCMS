import { ImageIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { TagChips } from "@/components/ui/tag-chips"

import type { GalleryCardDisplayModel } from "../gallery-card-display"

interface GalleryCardProps {
  readonly model: GalleryCardDisplayModel
  readonly onOpen: (entryId: string) => void
}

export function GalleryCard({ model, onOpen }: GalleryCardProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(model.entryId)}
      className="group bg-card border-border hover:border-foreground/70 focus-visible:ring-ring flex h-[320px] w-full flex-col overflow-hidden rounded-xl border text-left transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
      aria-label={model.ariaLabel}
    >
      <div className="bg-muted relative h-[140px] w-full shrink-0">
        {model.imageUrl ? (
          <img
            src={model.imageUrl}
            alt={model.title || "Anteprima"}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="text-muted-foreground flex h-full w-full items-center justify-center">
            <ImageIcon className="size-8" />
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className="mb-2 flex items-start justify-between gap-2">
          <Badge variant={model.statusVariant} className="shrink-0">
            {model.status}
          </Badge>
          {model.tags.length > 0 && (
            <div className="min-w-0 flex-1">
              <TagChips
                tags={model.tags}
                maxVisible={1}
                chipVariant="outline"
                className="min-w-0 justify-end"
                chipClassName="min-w-0 max-w-24"
                countBadgeClassName="shrink-0"
              />
            </div>
          )}
        </div>

        {model.title && (
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{model.title}</h3>
        )}

        {model.excerpt && (
          <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">{model.excerpt}</p>
        )}

        {model.dateText && (
          <div className="text-muted-foreground mt-auto pt-3 text-xs">
            {model.dateText}
          </div>
        )}
      </div>
    </button>
  )
}
