import { useState } from "react"
import { Calendar, ImageIcon, ImageOff } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { TagChips } from "@/components/ui/tag-chips"
import { cn } from "@/lib/utils"

import type { GalleryCardDisplayModel } from "../gallery-card-display"

interface GalleryCardProps {
  readonly model: GalleryCardDisplayModel
  readonly onOpen: (entryId: string) => void
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase().trim()
  if (s === "published") return "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-800/60"
  if (s === "draft") return "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-800/60"
  if (["error", "failed", "rejected", "archived"].includes(s)) return "bg-red-50 text-red-700 border-red-200/80 dark:bg-red-500/10 dark:text-red-400 dark:border-red-800/60"
  return "bg-neutral-100 text-neutral-600 border-neutral-200/80 dark:bg-neutral-800 dark:text-neutral-400"
}

export function GalleryCard({ model, onOpen }: GalleryCardProps) {
  const [imgError, setImgError] = useState(false)
  const showImage = !!model.imageUrl && !imgError

  return (
    <button
      type="button"
      onClick={() => onOpen(model.entryId)}
      aria-label={model.ariaLabel}
      className={cn(
        "group relative h-[340px] w-full overflow-hidden rounded-2xl text-left",
        "border border-neutral-200/80",
        "shadow-[0_1px_3px_0_rgb(0,0,0,0.05),0_1px_2px_-1px_rgb(0,0,0,0.04)]",
        "transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-[0_8px_24px_0_rgb(0,0,0,0.10),0_2px_6px_-1px_rgb(0,0,0,0.06)]",
        "hover:border-neutral-300/80",
        "dark:border-neutral-700/50",
        "dark:hover:border-neutral-600/60 dark:hover:shadow-[0_8px_24px_0_rgb(0,0,0,0.3)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
      )}
    >
      {/* ── Image area — fills the entire card ────────────── */}
      <div className="absolute inset-0">
        {showImage ? (
          <img
            src={model.imageUrl!}
            alt={model.title || "Anteprima"}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-neutral-100 to-neutral-50 dark:from-neutral-800 dark:to-neutral-900">
            {imgError ? (
              <>
                <ImageOff className="size-8 text-neutral-300 dark:text-neutral-600" />
                <span className="text-[10px] text-neutral-400 dark:text-neutral-600">
                  Immagine non disponibile
                </span>
              </>
            ) : (
              <ImageIcon className="size-9 text-neutral-300 dark:text-neutral-600" />
            )}
          </div>
        )}
      </div>

      {/* ── Data shelf — overlays the bottom of the image ─── */}
      <div className={cn(
        "absolute inset-x-0 bottom-0 rounded-t-2xl px-4 py-3",
        "bg-white dark:bg-neutral-900",
        "shadow-[0_-6px_20px_0_rgb(0,0,0,0.07)] dark:shadow-[0_-6px_20px_0_rgb(0,0,0,0.30)]",
      )}>
        {/* Status + tags */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <Badge
            variant="outline"
            className={cn("shrink-0 text-[11px] font-medium", statusBadgeClass(model.status))}
          >
            {model.status}
          </Badge>
          {model.tags.length > 0 && (
            <div className="min-w-0 flex-1">
              <TagChips
                tags={model.tags}
                maxVisible={1}
                chipVariant="outline"
                className="min-w-0 justify-end"
                chipClassName="min-w-0 max-w-24 text-[11px]"
                countBadgeClassName="shrink-0 text-[11px]"
              />
            </div>
          )}
        </div>

        {/* Title */}
        {model.title && (
          <h3 className="line-clamp-1 text-sm font-semibold leading-snug text-foreground">
            {model.title}
          </h3>
        )}

        {/* Excerpt */}
        {model.excerpt && (
          <p className="mt-1 line-clamp-1 text-xs leading-relaxed text-muted-foreground">
            {model.excerpt}
          </p>
        )}

        {/* Date */}
        {model.dateText && (
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="size-3 shrink-0 opacity-60" />
            {model.dateText}
          </div>
        )}
      </div>
    </button>
  )
}
