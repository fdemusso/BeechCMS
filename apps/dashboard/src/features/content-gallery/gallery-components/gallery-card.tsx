// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Calendar, Image as ImageIcon, Image as ImageOff } from '@/components/icons'

import { FieldDisplay } from "@/components/fields"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { TagChips } from "@/components/ui/tag-chips"
import { pendingDraftBadgeClass } from "@/lib/pending-draft"
import { cn } from "@/lib/utils"
import { getConditionalFormatCardClass, getConditionalFormatCellClass } from "@/lib/conditional-format"

import type { GalleryCardDisplayModel } from "../gallery-card-display"
import { GALLERY_CARD_SURFACE_CLASS } from "./gallery-card-surface"

interface GalleryCardProps {
  readonly model: GalleryCardDisplayModel
  readonly onOpen: (entryId: string) => void
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase().trim()
  if (s === "published") return "bg-status-live-soft text-status-live-foreground border-status-live/30"
  if (s === "draft") return "bg-status-warning-soft text-status-warning-foreground border-status-warning/30"
  if (["error", "failed", "rejected", "archived"].includes(s)) return "bg-status-danger-soft text-status-danger-foreground border-status-danger/30"
  return "bg-muted text-muted-foreground border-border/80 dark:border-border/50"
}

type SlotStyle = NonNullable<GalleryCardDisplayModel["slotStyles"]>[keyof NonNullable<GalleryCardDisplayModel["slotStyles"]>]

function slotClass(style: SlotStyle | undefined): string | undefined {
  return style ? getConditionalFormatCellClass(style.tone, style.textStyles) : undefined
}

function GalleryCardImage({ model }: { readonly model: GalleryCardDisplayModel }) {
  const { t } = useTranslation()
  // Remember which URL failed, so a new URL gets a fresh attempt without an effect reset.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const imgError = failedUrl !== null && failedUrl === model.imageUrl
  const showImage = !!model.imageUrl && !imgError

  return (
    <div className="relative h-44 w-full shrink-0 overflow-hidden bg-gradient-to-br from-muted/40 to-muted/80">
      {showImage ? (
        <img
          src={model.imageUrl!}
          alt={model.title || t("gallery.preview")}
          className="h-full w-full object-cover transition-transform ease-out group-hover:scale-[1.04]"
          loading="lazy"
          onError={() => setFailedUrl(model.imageUrl)}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2">
          {imgError ? (
            <>
              <ImageOff className="size-7 text-muted-foreground/30" />
              <span className="text-xs text-muted-foreground/50">
                {t("gallery.imageUnavailable")}
              </span>
            </>
          ) : (
            <ImageIcon className="size-8 text-muted-foreground/30" />
          )}
        </div>
      )}

      {/* Status badges (draft-enabled seeds only) overlaid top-left */}
      {model.showStatus && (
        <div
          className={cn(
            "absolute left-3 top-3 flex flex-col items-start gap-1.5",
            slotClass(model.slotStyles?.status)
          )}
        >
          <Badge
            variant={model.statusVariant}
            className={cn(
              "text-xs font-medium tracking-wide backdrop-blur-sm",
              statusBadgeClass(model.status),
            )}
          >
            {model.status}
          </Badge>
          {model.hasPendingDraft && (
            <Badge
              variant="outline"
              className={cn(
                "text-xs font-medium tracking-wide backdrop-blur-sm",
                pendingDraftBadgeClass,
              )}
            >
              {t("content.table.pendingDraft")}
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}

export function GalleryCard({ model, onOpen }: GalleryCardProps) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      onClick={() => onOpen(model.entryId)}
      aria-label={model.ariaLabel}
      className={cn(
        GALLERY_CARD_SURFACE_CLASS,
        model.elementStyle && getConditionalFormatCardClass(model.elementStyle.tone, model.elementStyle.textStyles)
      )}
    >
      {/* ── Image area ── */}
      <GalleryCardImage model={model} />

      {/* ── Content area ── */}
      <div className="flex flex-1 flex-col gap-2 px-4 py-3">
        {/* Title */}
        <h3 className={cn(
          "font-heading line-clamp-2 text-sm font-bold leading-snug text-foreground",
          !model.title && "text-muted-foreground italic",
          slotClass(model.slotStyles?.title)
        )}>
          {model.title || t("gallery.untitled")}
        </h3>

        {/* Excerpt */}
        {model.excerpt && (
          <p className={cn(
            "line-clamp-2 text-xs leading-relaxed text-muted-foreground",
            slotClass(model.slotStyles?.excerpt)
          )}>
            {model.excerpt}
          </p>
        )}

        {/* Campi extra della card personalizzata */}
        {model.metadata.length > 0 && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {model.metadata.map((item) => (
              <div key={item.branch.id} className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-xs text-muted-foreground">{item.branch.label}</span>
                <span className={cn(
                  "truncate text-xs",
                  item.style && getConditionalFormatCellClass(item.style.tone, item.style.textStyles)
                )}>
                  <FieldDisplay branch={item.branch} value={item.value} options={{ maxLength: 24, compact: true }} />
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-1">
          <Separator />

          {/* Tags + date */}
          <div className="flex items-center justify-between gap-2">
            {model.dateText ? (
              <div className={cn(
                "flex items-center gap-1 text-xs text-muted-foreground",
                slotClass(model.slotStyles?.date)
              )}>
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
                className={cn(
                  "min-w-0 justify-end",
                  slotClass(model.slotStyles?.tags)
                )}
                chipClassName="min-w-0 max-w-20 text-xs"
                countBadgeClassName="shrink-0 text-xs"
              />
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
