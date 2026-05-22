import { useState } from "react"
import { Calendar, ImageIcon, ImageOff } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { TagChips } from "@/components/ui/tag-chips"
import { pendingDraftBadgeClass } from "@/lib/pending-draft"
import { cn } from "@/lib/utils"

import type { GalleryCardDisplayModel } from "../gallery-card-display"

interface GalleryCardProps {
  readonly model: GalleryCardDisplayModel
  readonly onOpen: (entryId: string) => void
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase().trim()
  if (s === "published") return "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-700/50"
  if (s === "draft") return "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-700/50"
  if (["error", "failed", "rejected", "archived"].includes(s)) return "bg-red-50 text-red-700 border-red-200/80 dark:bg-red-500/15 dark:text-red-400 dark:border-red-700/50"
  return "bg-white/90 text-neutral-600 border-neutral-200/80 dark:bg-neutral-800/90 dark:text-neutral-400 dark:border-neutral-600/50"
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
        "group flex w-full flex-col overflow-hidden rounded-2xl text-left",
        "bg-card border border-neutral-200/80 dark:border-neutral-700/50",
        "shadow-[0_1px_3px_0_rgb(0,0,0,0.05),0_1px_2px_-1px_rgb(0,0,0,0.04)]",
        "transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-[0_8px_24px_0_rgb(0,0,0,0.10),0_2px_6px_-1px_rgb(0,0,0,0.06)]",
        "hover:border-neutral-300/80",
        "dark:hover:border-neutral-600/60 dark:hover:shadow-[0_8px_24px_0_rgb(0,0,0,0.3)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
      )}
    >
      {/* ── Image area ── */}
      <div className="relative h-44 w-full shrink-0 overflow-hidden bg-gradient-to-br from-neutral-100 to-neutral-50 dark:from-neutral-800 dark:to-neutral-900">
        {showImage ? (
          <img
            src={model.imageUrl!}
            alt={model.title || "Anteprima"}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2">
            {imgError ? (
              <>
                <ImageOff className="size-7 text-neutral-300 dark:text-neutral-600" />
                <span className="text-[10px] text-neutral-400 dark:text-neutral-600">
                  Immagine non disponibile
                </span>
              </>
            ) : (
              <ImageIcon className="size-8 text-neutral-300 dark:text-neutral-600" />
            )}
          </div>
        )}

        {/* Status badges overlaid top-left */}
        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] font-semibold tracking-wide backdrop-blur-sm",
              statusBadgeClass(model.status),
            )}
          >
            {model.status}
          </Badge>
          {model.hasPendingDraft && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] font-semibold tracking-wide backdrop-blur-sm",
                pendingDraftBadgeClass,
              )}
            >
              Bozza in sospeso
            </Badge>
          )}
        </div>
      </div>

      {/* ── Content area ── */}
      <div className="flex flex-1 flex-col gap-2 px-4 py-3">
        {/* Title */}
        <h3 className={cn(
          "line-clamp-2 text-sm font-semibold leading-snug text-foreground",
          !model.title && "text-muted-foreground italic",
        )}>
          {model.title || "Senza titolo"}
        </h3>

        {/* Excerpt */}
        {model.excerpt && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {model.excerpt}
          </p>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-1">
          <Separator />

          {/* Tags + date */}
          <div className="flex items-center justify-between gap-2">
            {model.dateText ? (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Calendar className="size-3 shrink-0 opacity-60" />
                {model.dateText}
              </div>
            ) : (
              <span />
            )}

            {model.tags.length > 0 && (
              <TagChips
                tags={model.tags}
                maxVisible={2}
                chipVariant="outline"
                className="min-w-0 justify-end"
                chipClassName="min-w-0 max-w-20 text-[10px]"
                countBadgeClassName="shrink-0 text-[10px]"
              />
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
