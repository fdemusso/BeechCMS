// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { FolderStyle, Seed } from "@beechcms/core"
import { Edit, Folder } from 'reicon-react'
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

import type { GalleryCategoryGroup } from "../group-by-category"
import { FOLDER_COLOR_CLASSES, FOLDER_ICON_COMPONENTS } from "../folder-style"
import { GALLERY_CARD_SURFACE_CLASS } from "./gallery-card-surface"
import { formatItemCount } from "./format-item-count"

const MAX_PREVIEWS = 3

interface GalleryFolderCardProps {
  readonly seed: Pick<Seed, "label" | "labelPlural">
  readonly group: GalleryCategoryGroup
  readonly onOpen: (key: string | null) => void
  /** Custom look of this folder; absent → default look. */
  readonly style?: FolderStyle
  /** When set, a pencil appears on hover to edit the folder. */
  readonly onEdit?: () => void
}

export function GalleryFolderCard({ seed, group, onOpen, style, onEdit }: GalleryFolderCardProps) {
  const { t } = useTranslation()
  const label = style?.label || group.label || t("gallery.folders.uncategorized")
  const colors = style?.color ? FOLDER_COLOR_CLASSES[style.color] : undefined
  const FolderIcon = (style?.icon && FOLDER_ICON_COMPONENTS[style.icon]) || Folder
  const previews = group.models
    .filter((model): model is typeof model & { imageUrl: string } => !!model.imageUrl)
    .slice(0, MAX_PREVIEWS)

  return (
    <div className="group/folder relative flex">
      <button
        type="button"
        onClick={() => onOpen(group.key)}
        aria-label={t("gallery.folders.openAriaLabel", { label, count: formatItemCount(t, group.models.length, seed) })}
        className={GALLERY_CARD_SURFACE_CLASS}
      >
        <div className={cn("flex h-36 w-full items-center justify-center bg-gradient-to-br", colors?.banner ?? "from-muted/40 to-muted/80")}>
          {previews.length > 0 ? (
            <div className="flex -space-x-4">
              {previews.map((model) => (
                <img
                  key={model.entryId}
                  src={model.imageUrl}
                  alt=""
                  loading="lazy"
                  onError={(event) => { event.currentTarget.style.display = "none" }}
                  className="size-20 rounded-lg border-2 border-card object-cover shadow-md transition-transform duration-200 group-hover:-translate-y-1"
                />
              ))}
            </div>
          ) : (
            <FolderIcon className={cn("size-12", colors?.icon ?? "text-muted-foreground/40")} />
          )}
        </div>
        <div className="flex items-center gap-3 p-4">
          <FolderIcon className={cn("size-5 shrink-0", colors?.icon ?? "text-muted-foreground")} />
          <div className="min-w-0 flex-1">
            <h3 className="font-heading truncate text-base font-semibold">{label}</h3>
            <p className="text-sm text-muted-foreground">{formatItemCount(t, group.models.length, seed)}</p>
            {style?.description && <p className="truncate text-xs text-muted-foreground">{style.description}</p>}
          </div>
        </div>
      </button>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={t("gallery.folders.edit.openAriaLabel", { label })}
          className="absolute right-2 top-2 flex size-7 cursor-pointer items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/folder:opacity-100"
        >
          <Edit className="size-3.5" />
        </button>
      )}
    </div>
  )
}
