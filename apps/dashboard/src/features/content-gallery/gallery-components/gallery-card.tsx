// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Calendar, Image as ImageIcon, Image as ImageOff } from 'reicon-react'

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
  if (s === "published") return "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-700/50"
  if (s === "draft") return "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-700/50"
  if (["error", "failed", "rejected", "archived"].includes(s)) return "bg-red-50 text-red-700 border-red-200/80 dark:bg-red-500/15 dark:text-red-400 dark:border-red-700/50"
  return "bg-muted text-muted-foreground border-border/80 dark:border-border/50"
}

export function GalleryCard({ model, onOpen }: GalleryCardProps) {
  const { t } = useTranslation()
  const [imgError, setImgError] = useState(false)
  const showImage = !!model.imageUrl && !imgError

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
      <div className="relative h-44 w-full shrink-0 overflow-hidden bg-gradient-to-br from-muted/40 to-muted/80">
        {showImage ? (
          <img
            src={model.imageUrl!}
            alt={model.title || t("gallery.preview")}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2">
            {imgError ? (
              <>
                <ImageOff className="size-7 text-muted-foreground/30" />
                <span className="text-[10px] text-muted-foreground/50">
                  {t("gallery.imageUnavailable")}
                </span>
              </>
            ) : (
              <ImageIcon className="size-8 text-muted-foreground/30" />
            )}
          </div>
        )}

        {/* Status badges overlaid top-left */}
        <div
          className={cn(
            "absolute left-3 top-3 flex flex-col items-start gap-1.5",
            model.slotStyles?.status &&
              getConditionalFormatCellClass(model.slotStyles.status.tone, model.slotStyles.status.textStyles)
          )}
        >
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
              {t("content.table.pendingDraft")}
            </Badge>
          )}
        </div>
      </div>

      {/* ── Content area ── */}
      <div className="flex flex-1 flex-col gap-2 px-4 py-3">
        {/* Title */}
        <h3 className={cn(
          "font-heading line-clamp-2 text-sm font-semibold leading-snug text-foreground",
          !model.title && "text-muted-foreground italic",
          model.slotStyles?.title &&
            getConditionalFormatCellClass(model.slotStyles.title.tone, model.slotStyles.title.textStyles)
        )}>
          {model.title || t("gallery.untitled")}
        </h3>

        {/* Excerpt */}
        {model.excerpt && (
          <p className={cn(
            "line-clamp-2 text-xs leading-relaxed text-muted-foreground",
            model.slotStyles?.excerpt &&
              getConditionalFormatCellClass(model.slotStyles.excerpt.tone, model.slotStyles.excerpt.textStyles)
          )}>
            {model.excerpt}
          </p>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-1">
          <Separator />

          {/* Tags + date */}
          <div className="flex items-center justify-between gap-2">
            {model.dateText ? (
              <div className={cn(
                "flex items-center gap-1 text-[11px] text-muted-foreground",
                model.slotStyles?.date &&
                  getConditionalFormatCellClass(model.slotStyles.date.tone, model.slotStyles.date.textStyles)
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
                  model.slotStyles?.tags &&
                    getConditionalFormatCellClass(model.slotStyles.tags.tone, model.slotStyles.tags.textStyles)
                )}
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
